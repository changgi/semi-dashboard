// ================================================
// Technical Analysis Engine
// 순수 TypeScript, 외부 의존성 없음
// ================================================

/** 단순이동평균 */
export function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/** 지수이동평균 */
export function ema(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let e = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < prices.length; i++) {
    e = prices[i] * k + e * (1 - k);
  }
  return e;
}

/** RSI (14일 기본) */
export function rsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  const recent = changes.slice(-period);
  let avgGain = 0, avgLoss = 0;
  for (const c of recent) {
    if (c > 0) avgGain += c;
    else avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD (12, 26, 9) */
export function macd(prices: number[]): { macd: number; signal: number; histogram: number } | null {
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  if (ema12 === null || ema26 === null) return null;
  const macdVal = ema12 - ema26;
  // 간이 signal: 최근 9개 MACD의 EMA
  const macdSeries: number[] = [];
  for (let i = 26; i <= prices.length; i++) {
    const e12 = ema(prices.slice(0, i), 12)!;
    const e26 = ema(prices.slice(0, i), 26)!;
    macdSeries.push(e12 - e26);
  }
  const signal = ema(macdSeries, 9) ?? macdVal;
  return { macd: macdVal, signal, histogram: macdVal - signal };
}

/** ATR (Average True Range) */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number | null {
  if (highs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return sma(trs, period);
}

/** 변동성 (20일 수익률 표준편차 연환산) */
export function volatility(prices: number[], period = 20): number | null {
  if (prices.length < period + 1) return null;
  const returns: number[] = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // 연환산 %
}

/** 볼린저 밴드 */
export function bollingerBands(
  prices: number[],
  period = 20,
  stdMult = 2
): { upper: number; middle: number; lower: number } | null {
  if (prices.length < period) return null;
  const middle = sma(prices, period)!;
  const slice = prices.slice(-period);
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: middle + std * stdMult,
    middle,
    lower: middle - std * stdMult,
  };
}

/** 피어슨 상관계수 */
export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const aa = a.slice(-n), bb = b.slice(-n);
  const meanA = aa.reduce((s, v) => s + v, 0) / n;
  const meanB = bb.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = aa[i] - meanA, db = bb[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

/** 베타 (vs 벤치마크) */
export function beta(stock: number[], benchmark: number[]): number | null {
  const n = Math.min(stock.length, benchmark.length);
  if (n < 10) return null;
  const sReturns = [], bReturns = [];
  for (let i = 1; i < n; i++) {
    sReturns.push(stock[i] / stock[i - 1] - 1);
    bReturns.push(benchmark[i] / benchmark[i - 1] - 1);
  }
  const corr = correlation(sReturns, bReturns);
  if (corr === null) return null;
  const sVol = Math.sqrt(sReturns.reduce((s, v) => s + v * v, 0) / sReturns.length);
  const bVol = Math.sqrt(bReturns.reduce((s, v) => s + v * v, 0) / bReturns.length);
  return bVol === 0 ? 1 : corr * (sVol / bVol);
}

/** 뉴스 감성 점수 (키워드 기반, 간이) */
const POSITIVE = [
  "surge", "soar", "jump", "rally", "beat", "record", "strong", "growth",
  "bullish", "upgrade", "outperform", "breakthrough", "demand", "profit",
  "boom", "gain", "rise", "high", "exceed", "optimistic", "expand",
];
const NEGATIVE = [
  "crash", "plunge", "drop", "fall", "miss", "weak", "bearish", "downgrade",
  "underperform", "shortage", "loss", "decline", "risk", "crisis", "war",
  "tariff", "sanction", "restrict", "cut", "recession", "fear", "concern",
];

export function sentimentScore(text: string): { score: number; label: string; keywords: string[] } {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let pos = 0, neg = 0;
  const found: string[] = [];
  for (const w of words) {
    if (POSITIVE.some((p) => w.includes(p))) { pos++; found.push(w); }
    if (NEGATIVE.some((n) => w.includes(n))) { neg++; found.push(w); }
  }
  const total = pos + neg;
  if (total === 0) return { score: 0, label: "neutral", keywords: [] };
  const score = (pos - neg) / total; // -1 ~ +1
  const label = score > 0.1 ? "positive" : score < -0.1 ? "negative" : "neutral";
  return { score: Math.round(score * 100) / 100, label, keywords: found.slice(0, 5) };
}
