import pdf from "pdf-parse";

export interface ParsedLot {
  userId: string;
  jobId: string;
  fundName: string;
  folioNumber: string | null;
  transactionDate: Date;
  transactionType: string;
  units: number;
  nav: number;
  amount: number;
  isLongTerm: boolean;
}

export class PDFParser {
  async parseCAS(
    fileBuffer: Buffer,
    userId: string,
    jobId: string
  ): Promise<ParsedLot[]> {
    try {
      const header = fileBuffer.subarray(0, 20).toString();
      console.log(`[PDFParser] File header (first 20 bytes): ${header}`);
      console.log(`[PDFParser] File header (hex): ${fileBuffer.subarray(0, 20).toString('hex')}`);

      const data = await pdf(fileBuffer);
      let text = data.text || "";

      console.log(`[PDFParser] Extracted text length: ${text.length} chars`);
      console.log(`[PDFParser] First 500 chars: ${text.substring(0, 500)}`);

      // Preprocess text: replace non-breaking, special bullets, convert multiple spaces/tabs to single tab,
      // and normalize common PDF extraction artifacts.
      text = text.replace(/\u00A0/g, " ")
                 .replace(/■/g, " ")
                 .replace(/·/g, " ")
                 .replace(/\r\n?/g, "\n")
                 .replace(/[ \t]{2,}/g, "\t")
                 .trim();

      // Split into lines but also consider that some PDF extractors put table columns separated by multiple spaces.
      // Normalize lines by replacing sequences of tabs/spaces with a single tab, then split.
      const rawLines = text.split("\n").map(l => l.replace(/[ \t]{2,}/g, "\t").trim());

      const lots = this.extractLots(rawLines, userId, jobId);
      return lots;
    } catch (error: any) {
      console.error("PDF parsing error:", error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  private extractLots(
    rawLines: string[],
    userId: string,
    jobId: string
  ): ParsedLot[] {
    const lots: ParsedLot[] = [];

    let currentFund: string | null = null;
    let currentFolio: string | null = null;

    // Helper: try to parse a combined row that may contain columns separated by tabs or spaces
    const normalizeLine = (line: string) => line.replace(/\t+/g, " ").replace(/\s{2,}/g, " ").trim();

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      if (!line) continue;

      // Normalize and remove invisible chars
      line = normalizeLine(line);

      // If the line contains common section headers, skip
      if (/statement of transactions|consolidated account statement|folio no|scheme name/i.test(line)) {
        continue;
      }

      // Try to capture fund name: more flexible now - allow Title Case or ALL CAPS and allow short noise
      if (!currentFund && this.likelyFundName(line)) {
        currentFund = line.trim();
        // If the immediate next line looks like Folio, consume it
        if (i + 1 < rawLines.length) {
          const next = rawLines[i + 1].trim();
          const folioMatchNext = next.match(/Folio\s*[:\s]*([A-Za-z0-9\-\/]+)/i);
          if (folioMatchNext) {
            currentFolio = folioMatchNext[1];
            i++;
          }
        }
        continue;
      }

      // Folio detection anywhere
      const folioMatch = line.match(/Folio\s*[:\s]*([A-Za-z0-9\-\/]+)/i);
      if (folioMatch) {
        currentFolio = folioMatch[1];
        continue;
      }

      // Many CAS PDFs put fund name separately and then a table block. If a line is short and is likely a fund name, update it.
      if (this.likelyFundName(line)) {
        currentFund = line.trim();
        continue;
      }

      // Transaction patterns: try multiple tolerant regexes.
      // Pattern A: DD-MM-YYYY or DD/MM/YYYY  TYPE  UNITS  NAV  AMOUNT  (commas allowed)
      const patA = /(\d{2}[-\/]\d{2}[-\/]\d{4})\s+([A-Za-z]+)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/;

      // Pattern B: DD-MMM-YY or DD-MMM-YYYY  <asset?> TYPE UNITS NAV AMOUNT
      const patB = /(\d{2}[-\/]?[A-Za-z]{3}[-\/]?\d{2,4})\s+([A-Za-z &\-\(\)]+?)\s+([A-Za-z]+)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/;

      // Pattern C: when columns use tabs/spaces; attempt to split into columns and match by column count
      const cols = line.split(/\s+/);
      let matched = false;

      const tryPushLot = (fundName: string|null, folio: string|null, dateStr: string, type: string, unitsStr: string, navStr: string, amountStr: string) => {
        try {
          const txDate = this.parseDate(dateStr);
          const lot: ParsedLot = {
            userId,
            jobId,
            fundName: (fundName || "UNKNOWN FUND").trim(),
            folioNumber: folio,
            transactionDate: txDate,
            transactionType: type.toUpperCase(),
            units: parseFloat(unitsStr.replace(/,/g, "")) || 0,
            nav: parseFloat(navStr.replace(/,/g, "")) || 0,
            amount: parseFloat(amountStr.replace(/,/g, "")) || 0,
            isLongTerm: this.isLongTermHolding(txDate),
          };
          lots.push(lot);
          matched = true;
        } catch (e) {
          // ignore parse errors for this row
        }
      };

      const mA = line.match(patA);
      if (mA) {
        const [, dateStr, type, unitsStr, navStr, amountStr] = mA;
        tryPushLot(currentFund, currentFolio, dateStr, type, unitsStr, navStr, amountStr);
        if (matched) continue;
      }

      const mB = line.match(patB);
      if (mB) {
        const [, dateStr, assetStr, type, unitsStr, navStr, amountStr] = mB;
        // If assetStr looks like a fund name and currentFund is null, use it
        const fundUsed = currentFund || assetStr.trim();
        tryPushLot(fundUsed, currentFolio, dateStr, type, unitsStr, navStr, amountStr);
        if (matched) continue;
      }

      // Column-based heuristic: last 3 columns are units, nav, amount (numbers)
      if (cols.length >= 5) {
        // Attempt to find a date in first column
        const dateCandidate = cols[0];
        if (/^\d{2}[-\/]/.test(dateCandidate)) {
          const type = cols[1];
          const units = cols[cols.length - 3];
          const nav = cols[cols.length - 2];
          const amount = cols[cols.length - 1];
          tryPushLot(currentFund, currentFolio, dateCandidate, type, units, nav, amount);
          if (matched) continue;
        }
      }

      // Reset fund context when encountering blank line or section separator
      if (/^[-]{3,}$/.test(line) || line.trim() === "") {
        currentFund = null;
        currentFolio = null;
      }
    }

    if (lots.length === 0) {
      throw new Error("No transaction lots found in CAS file");
    }

    return lots;
  }

  private likelyFundName(line: string): boolean {
    if (!line) return false;
    const keywords = ["FUND", "GROWTH", "EQUITY", "DEBT", "LIQUID", "BALANCED", "DIRECT", "PLAN", "DIVIDEND"];
    const hasKeyword = keywords.some(kw => line.toUpperCase().includes(kw));
    // Accept title case or all caps fund names, length constraints relaxed
    const isReasonableLength = line.length >= 6 && line.length <= 200;
    // Reject if line starts with a date
    if (/^\d{2}[-\/]/.test(line)) return false;
    return hasKeyword && isReasonableLength;
  }

  private parseDate(dateStr: string): Date {
    // Handle formats: DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YY, DD-MMM-YYYY, DD-MMM-YY (05-Apr-24)
    const cleaned = dateStr.replace(/\./g, "-").replace(/\s+/g, "");
    const parts = cleaned.split(/[-\/]/);
    if (parts.length === 3) {
      let [dayStr, monthStr, yearStr] = parts;
      const day = parseInt(dayStr, 10);
      let month: number;
      if (/^\d+$/.test(monthStr)) {
        month = parseInt(monthStr, 10) - 1;
      } else {
        const mon = monthStr.slice(0, 3).toLowerCase();
        const map: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
        if (map[mon] === undefined) throw new Error(`Invalid month in date: ${dateStr}`);
        month = map[mon];
      }
      let year = parseInt(yearStr, 10);
      if (yearStr.length === 2) year = 2000 + year;
      return new Date(year, month, day);
    }
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  private isLongTermHolding(transactionDate: Date): boolean {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return transactionDate < oneYearAgo;
  }
}
