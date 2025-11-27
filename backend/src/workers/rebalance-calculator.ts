import { ParsedLot } from "./pdf-parser";
import { RebalanceAction, RebalanceDTO } from "../types/report.dto";

export const TARGET_ALLOCATION = {
  equity: 0.70,
  debt: 0.30,
  hybrid: 0.0,
};

/** Classify a fund name into an asset class */
export function classifyFund(fundName: string): "equity" | "debt" | "hybrid" {
  const name = fundName.toLowerCase();
  if (
    name.includes("equity") ||
    name.includes("bluechip") ||
    name.includes("small cap") ||
    name.includes("mid cap") ||
    name.includes("large cap") ||
    name.includes("index") ||
    name.includes("growth")
  ) {
    return "equity";
  }
  if (
    name.includes("debt") ||
    name.includes("liquid") ||
    name.includes("income") ||
    name.includes("bond") ||
    name.includes("gilt")
  ) {
    return "debt";
  }
  return "hybrid";
}

/** Main function – returns the rebalance DTO */
export function calculateRebalance(lots: ParsedLot[]): RebalanceDTO {
  // ---- STEP 3 – Aggregate current values per bucket ----
  const totals = { equity: 0, debt: 0, hybrid: 0 };
  for (const lot of lots) {
    const bucket = classifyFund(lot.fundName);
    totals[bucket] += lot.amount;
  }

  // ---- STEP 4 – Compute current allocation ----
  const portfolioValue = totals.equity + totals.debt + totals.hybrid;
  
  // Handle empty portfolio case
  if (portfolioValue === 0) {
    return {
      targetAllocation: TARGET_ALLOCATION,
      currentAllocation: { equity: 0, debt: 0, hybrid: 0 },
      actions: [],
    };
  }

  const current = {
    equity: totals.equity / portfolioValue,
    debt: totals.debt / portfolioValue,
    hybrid: totals.hybrid / portfolioValue,
  };

  // ---- STEP 5 – Determine required shifts ----
  const actions: RebalanceAction[] = [];

  // Helper to push BUY/SELL actions for a given bucket
  const pushAction = (bucket: keyof typeof totals, diff: number) => {
    // Only suggest action if diff is significant (e.g., > 1 currency unit)
    if (Math.abs(diff) < 1) return;

    if (diff > 0) {
      actions.push({ action: "BUY", assetClass: bucket, amount: Math.round(diff) });
    } else if (diff < 0) {
      actions.push({ action: "SELL", assetClass: bucket, amount: Math.round(Math.abs(diff)) });
    }
  };

  // Equity
  const targetEquity = TARGET_ALLOCATION.equity * portfolioValue;
  pushAction("equity", targetEquity - totals.equity);

  // Debt
  const targetDebt = TARGET_ALLOCATION.debt * portfolioValue;
  pushAction("debt", targetDebt - totals.debt);

  // Hybrid (optional – currently zero target)
  const targetHybrid = TARGET_ALLOCATION.hybrid * portfolioValue;
  pushAction("hybrid", targetHybrid - totals.hybrid);

  return {
    targetAllocation: TARGET_ALLOCATION,
    currentAllocation: {
        equity: parseFloat(current.equity.toFixed(4)),
        debt: parseFloat(current.debt.toFixed(4)),
        hybrid: parseFloat(current.hybrid.toFixed(4)),
    },
    actions,
  };
}
