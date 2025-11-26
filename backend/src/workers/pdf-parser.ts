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
      // Parse PDF to extract text
      const data = await pdf(fileBuffer);
      const text = data.text;

      console.log(`[PDFParser] Extracted text length: ${text.length} chars`);
      console.log(`[PDFParser] First 500 chars: ${text.substring(0, 500)}`);

      // Parse the CAS text to extract transaction lots
      const lots = this.extractLots(text, userId, jobId);

      return lots;
    } catch (error: any) {
      console.error("PDF parsing error:", error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  private extractLots(
    text: string,
    userId: string,
    jobId: string
  ): ParsedLot[] {
    const lots: ParsedLot[] = [];

    // Split text into lines
    const lines = text.split("\n");

    let currentFund: string | null = null;
    let currentFolio: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      // Normalize line: remove special markers and collapse spaces
      let line = lines[i]
        .replace(/\u00A0/g, " ")
        .replace(/■/g, " ")
        .trim();
      line = line.replace(/\s+/g, " ");

      // Pattern 1: Detect fund name (usually in capital letters)
      if (this.isFundName(line)) {
        currentFund = line;
        continue;
      }

      // Pattern 2: Detect folio number
      const folioMatch = line.match(/Folio\s*[:\s]*(\d+\/\d+)/i);
      if (folioMatch) {
        currentFolio = folioMatch[1];
        continue;
      }

      // Pattern 3: Detect transaction line
      // Old Format: Date  Type  Units  NAV  Amount  (e.g., 01-01-2024 BUY 100 12.34 1,234)
      const transactionMatch = line.match(
        /(\d{2}[-\/]\d{2}[-\/]\d{4})\s+(\w+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/
      );

      // New Format: Date with month name and 2-digit year, e.g. 05-Apr-24  Equity  Buy  5  980  4,900
      const transactionMatch2 = line.match(
        /(\d{2}[-\/]?[A-Za-z]{3}[-\/]?\d{2,4})\s+([A-Za-z &]+)\s+([A-Za-z]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+\.?\d*)/
      );

      if (transactionMatch && currentFund) {
        const [, dateStr, type, unitsStr, navStr, amountStr] = transactionMatch;

        const lot: ParsedLot = {
          userId,
          jobId,
          fundName: currentFund,
          folioNumber: currentFolio,
          transactionDate: this.parseDate(dateStr),
          transactionType: type.toUpperCase(),
          units: parseFloat(unitsStr.replace(/,/g, "")),
          nav: parseFloat(navStr.replace(/,/g, "")),
          amount: parseFloat(amountStr.replace(/,/g, "")),
          isLongTerm: this.isLongTermHolding(this.parseDate(dateStr)),
        };

        lots.push(lot);
      } else if (transactionMatch2) {
        const [, dateStr, assetStr, type, unitsStr, priceStr, amountStr] =
          transactionMatch2;

        const lot: ParsedLot = {
          userId,
          jobId,
          fundName: assetStr.trim(),
          folioNumber: currentFolio,
          transactionDate: this.parseDate(dateStr),
          transactionType: type.toUpperCase(),
          units: parseFloat(unitsStr.replace(/,/g, "")),
          nav: parseFloat(priceStr.replace(/,/g, "")),
          amount: parseFloat(amountStr.replace(/,/g, "")),
          isLongTerm: this.isLongTermHolding(this.parseDate(dateStr)),
        };

        lots.push(lot);
      }
    }

    if (lots.length === 0) {
      throw new Error("No transaction lots found in CAS file");
    }

    return lots;
  }

  private isFundName(line: string): boolean {
    // Fund names are typically in all caps and contain keywords
    const keywords = ["FUND", "GROWTH", "EQUITY", "DEBT", "LIQUID", "BALANCED"];
    const isAllCaps = line === line.toUpperCase();
    const hasKeyword = keywords.some((kw) => line.includes(kw));

    return isAllCaps && hasKeyword && line.length > 10 && line.length < 100;
  }

  private parseDate(dateStr: string): Date {
    // Handle different date formats: DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YY
    const parts = dateStr.split(/[-\/]/);
    if (parts.length === 3) {
      let [dayStr, monthStr, yearStr] = parts;

      const day = parseInt(dayStr);

      // Month can be numeric or abbreviated name
      let month: number;
      if (/^\d+$/.test(monthStr)) {
        month = parseInt(monthStr) - 1;
      } else {
        const mon = monthStr.slice(0, 3).toLowerCase();
        const map: Record<string, number> = {
          jan: 0,
          feb: 1,
          mar: 2,
          apr: 3,
          may: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          nov: 10,
          dec: 11,
        };
        if (map[mon] === undefined) {
          throw new Error(`Invalid month in date: ${dateStr}`);
        }
        month = map[mon];
      }

      let year = parseInt(yearStr);
      if (yearStr.length === 2) {
        // two-digit year -> assume 2000s
        year = 2000 + year;
      }

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
