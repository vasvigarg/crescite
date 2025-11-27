import { ParsedLot } from "./pdf-parser";
import { NavService } from "../services/nav.service";
import { calculateCAGR, calculateVolatility, calculateSharpeRatio } from "../utils/financial-math";

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
  private navService: NavService;

  constructor() {
    this.navService = new NavService();
  }

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
    let rollingReturn = 0;
    let sharpeRatio = 0;
    let benchmarkComparison = 0;
    let navUsed = 0;

    // 1. Try to find real scheme code
    const schemeCode = await this.navService.findSchemeCode(fundName);

    if (schemeCode) {
      // 2. Fetch real NAV history
      const history = await this.navService.getNavHistory(schemeCode);
      
      if (history.length > 0) {
        // Parse NAVs to numbers (history[0] is latest)
        const navValues = history.map(h => parseFloat(h.nav)).reverse(); // Sort ascending for math utils
        const latestNav = navValues[navValues.length - 1];
        navUsed = latestNav;

        // 3. Calculate Real Metrics
        // CAGR (1 year)
        // Find NAV ~1 year ago (252 trading days)
        const oneYearAgoIndex = navValues.length - 252;
        if (oneYearAgoIndex >= 0) {
          const startNav = navValues[oneYearAgoIndex];
          rollingReturn = calculateCAGR(startNav, latestNav, 1);
        } else {
          // If less than 1 year data, calculate CAGR for available period
          const years = navValues.length / 252;
          rollingReturn = calculateCAGR(navValues[0], latestNav, years);
        }

        // Volatility & Sharpe
        const volatility = calculateVolatility(navValues.slice(-252)); // Last 1 year vol
        sharpeRatio = calculateSharpeRatio(rollingReturn, volatility);
        
        // Benchmark (Mock for now, assume Nifty gives ~12%)
        benchmarkComparison = rollingReturn - 12;
      }
    }

    // Fallback if no API data or failed
    if (rollingReturn === 0 && sharpeRatio === 0) {
        // Use the old simplified logic as fallback
        const totalInvestment = lots.reduce((sum, lot) => sum + lot.amount, 0);
        const currentValue = lots.reduce(
          (sum, lot) => sum + lot.units * (navUsed || lot.nav),
          0
        );
        const simpleReturn = ((currentValue - totalInvestment) / totalInvestment) * 100;
        rollingReturn = simpleReturn;
        sharpeRatio = simpleReturn / 15;
        benchmarkComparison = simpleReturn - 12;
    }

    // Calculate Power Score (0-100)
    let score = 50; // Base score
    score += Math.min(Math.max(rollingReturn * 2, -30), 30); // Returns contribution
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
        rollingReturn: parseFloat(rollingReturn.toFixed(2)),
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
