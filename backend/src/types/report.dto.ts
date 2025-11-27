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

export type RebalanceAction = {
  action: "BUY" | "SELL";
  assetClass: "equity" | "debt" | "hybrid";
  amount: number;
};

export type RebalanceDTO = {
  targetAllocation: { equity: number; debt: number; hybrid?: number };
  currentAllocation: { equity: number; debt: number; hybrid?: number };
  actions: RebalanceAction[];
};

export type ReportDTO = {
  summary: ReportSummaryDTO;
  powerScores: PowerScoreDTO[];
  lots: LotDTO[];
  generatedAt: string; // ISO string
  rebalance?: RebalanceDTO;
};

export type PowerScoreSummaryDTO = {
  scores: PowerScoreDTO[];
};
