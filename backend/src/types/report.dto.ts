export type PowerScoreDTO = {
  fundName: string;
  score: number;
  rank?: number;
};

export type LotDTO = {
  fundName: string;
  transactionDate: string; // ISO string
  units: number;
  nav: number;
  amount: number;
};

export type ReportSummaryDTO = {
  totalLots: number;
  totalInvestment: number;
  fundsAnalyzed: number;
};

export type ReportDTO = {
  summary: ReportSummaryDTO;
  powerScores: PowerScoreDTO[];
  lots: LotDTO[];
  generatedAt: string; // ISO string
};

export type PowerScoreSummaryDTO = {
  scores: PowerScoreDTO[];
};
