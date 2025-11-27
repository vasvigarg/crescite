/**
 * Financial Math Utilities
 */

export function calculateCAGR(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  const cagr = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return parseFloat(cagr.toFixed(2));
}

export function calculateVolatility(navHistory: number[]): number {
  if (navHistory.length < 2) return 0;

  // 1. Calculate daily returns
  const dailyReturns: number[] = [];
  for (let i = 1; i < navHistory.length; i++) {
    const prev = navHistory[i - 1];
    const curr = navHistory[i];
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  if (dailyReturns.length === 0) return 0;

  // 2. Calculate mean daily return
  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

  // 3. Calculate variance
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);

  // 4. Calculate daily standard deviation
  const dailyStdDev = Math.sqrt(variance);

  // 5. Annualize (multiply by sqrt(252) assuming 252 trading days)
  const annualizedVol = dailyStdDev * Math.sqrt(252) * 100;

  return parseFloat(annualizedVol.toFixed(2));
}

export function calculateSharpeRatio(
  returnRate: number,
  volatility: number,
  riskFreeRate: number = 6.0
): number {
  if (volatility === 0) return 0;
  const sharpe = (returnRate - riskFreeRate) / volatility;
  return parseFloat(sharpe.toFixed(2));
}
