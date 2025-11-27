import { ParsedLot } from "./pdf-parser";

export interface PowerScore {
  fundName: string;
  score: number;
  rating: "RED" | "YELLOW" | "GREEN";
  /** Human‑readable advice for the user */
  recommendation?: string;
  metrics: {
    rollingReturn: number;
    sharpeRatio: number;
    benchmarkComparison: number;
  };
}

export class PowerScoreCalculator {
  async calculate(userId: string, lots: ParsedLot[]): Promise<PowerScore[]> {
    // Group lots by fund
    const fundGroups = this.groupByFund(lots);

    const powerScores: PowerScore[] = [];

    for (const [fundName, fundLots] of Object.entries(fundGroups)) {
      const score = await this.calculateFundScore(fundName, fundLots);
      powerScores.push(score);
    }

    return powerScores;
  }

  private groupByFund(lots: ParsedLot[]): Record<string, ParsedLot[]> {
    return lots.reduce((groups, lot) => {
      if (!groups[lot.fundName]) {
        groups[lot.fundName] = [];
      }
      groups[lot.fundName].push(lot);
      return groups;
    }, {} as Record<string, ParsedLot[]>);
  }

  private async calculateFundScore(
    fundName: string,
    lots: ParsedLot[]
  ): Promise<PowerScore> {
    // Simplified calculation - in reality, you'd fetch NAV history and calculate properly

    // Calculate total investment and current value
    const totalInvestment = lots.reduce((sum, lot) => sum + lot.amount, 0);
    const currentValue = lots.reduce(
      (sum, lot) => sum + lot.units * lot.nav,
      0
    );

    // Simple return calculation
    const returns = ((currentValue - totalInvestment) / totalInvestment) * 100;

    // Mock Sharpe ratio (in reality, calculate using standard deviation)
    const sharpeRatio = returns / 15; // Simplified

    // Mock benchmark comparison (in reality, compare with index)
    const benchmarkComparison = returns - 12; // Assuming 12% benchmark

    // Calculate Power Score (0-100)
    let score = 50; // Base score
    score += Math.min(Math.max(returns * 2, -30), 30); // Returns contribution
    score += Math.min(Math.max(sharpeRatio * 10, -10), 10); // Sharpe contribution
    score += Math.min(Math.max(benchmarkComparison, -10), 10); // Benchmark contribution

    score = Math.max(0, Math.min(100, score)); // Clamp to 0-100

    // Determine rating
    let rating: "RED" | "YELLOW" | "GREEN";
    if (score >= 70) rating = "GREEN";
    else if (score >= 40) rating = "YELLOW";
    else rating = "RED";

    // Return PowerScore with recommendation
    return {
      fundName,
      score: Math.round(score),
      rating,
      recommendation: this.deriveRecommendation(rating),
      metrics: {
        rollingReturn: parseFloat(returns.toFixed(2)),
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        benchmarkComparison: parseFloat(benchmarkComparison.toFixed(2)),
      },
    };
  }

  /** Very simple rule‑based advice – can be replaced with a richer model later */
  private deriveRecommendation(rating: "RED" | "YELLOW" | "GREEN"): string {
    switch (rating) {
      case "GREEN":
        return "Hold – fund is performing well.";
      case "YELLOW":
        return "Review – moderate performance; consider rebalancing.";
      case "RED":
        return "Consider reducing exposure or switching to a better‑performing fund.";
    }
  }
}
