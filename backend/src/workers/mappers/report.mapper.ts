import {
  ReportDTO,
  PowerScoreDTO,
  LotDTO,
  PowerScoreSummaryDTO,
} from "../../types/report.dto";

/**
 * Map power scores to DTO format (JSON-safe)
 */
export function mapPowerScoresToDTO(powerScores: any[]): PowerScoreDTO[] {
  return (powerScores || []).map((ps) => ({
    fundName: String(ps.fundName),
    score: Number(ps.score) || 0,
    rank: ps.rank !== undefined ? Number(ps.rank) : undefined,
  }));
}

/**
 * Map lots to DTO format (JSON-safe)
 */
export function mapLotsToDTO(lots: any[]): LotDTO[] {
  return (lots || []).map((lot) => ({
    fundName: String(lot.fundName),
    transactionDate:
      lot.transactionDate instanceof Date
        ? lot.transactionDate.toISOString()
        : String(lot.transactionDate),
    units: Number(lot.units) || 0,
    nav: Number(lot.nav) || 0,
    amount: Number(lot.amount) || 0,
  }));
}

/**
 * Build complete report DTO
 */
export function buildReportDTO(lots: any[], powerScores: any[]): ReportDTO {
  const lotsDto = mapLotsToDTO(lots);
  const powerScoresDto = mapPowerScoresToDTO(powerScores);

  const summary = {
    totalLots: lotsDto.length,
    totalInvestment: lotsDto.reduce((s, l) => s + (l.amount || 0), 0),
    fundsAnalyzed: [...new Set(lotsDto.map((l) => l.fundName))].length,
  };

  const report: ReportDTO = {
    summary,
    powerScores: powerScoresDto,
    lots: lotsDto,
    generatedAt: new Date().toISOString(),
  };

  return report;
}

/**
 * Build power score summary DTO
 */
export function buildPowerScoreSummaryDTO(
  powerScores: any[]
): PowerScoreSummaryDTO {
  return { scores: mapPowerScoresToDTO(powerScores) };
}
