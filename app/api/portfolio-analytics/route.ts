import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/portfolio-analytics
 *
 * 포트폴리오 레벨 분석 엔진.
 * - 상관행렬 (60일 일간 수익률 기반)
 * - 리스크 기여도 (각 종목이 전체 분산에 기여하는 비율)
 * - 30일 몬테카를로 시뮬레이션 (5000회)
 * - What-If 시나리오 (매도 시 리스크/수익 변화)
 * - 집중도 점수 (HHI)
 * - 레버리지 가중 익스포저
 */

type Position = {
  symbol: string;
  shares: number;
  avgCost: number;
  leverage: number;
  costBasis: number;
  currentPrice: number | null;
  marketValue: number;
  weight: number;
  pnl: number;
  pnlPct: number;
  underlying: string; // 레버리지 ETF의 기초자산
};

type ReturnSeries = {
  symbol: string;
  returns: number[]; // 일간 수익률
  dailyVol: number; // 일간 표준편차
};

function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const sa = a.slice(-n), sb = b.slice(-n);
  const ma = sa.reduce((s, x) => s + x, 0) / n;
  const mb = sb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = sa[i] - ma;
    const xb = sb[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  let sq = 0;
  for (const v of arr) sq += (v - mean) ** 2;
  return Math.sqrt(sq / (arr.length - 1));
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, x) => s + x, 0) / arr.length;
}

// Box-Muller 정규분포 생성
function randn(): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Cholesky 분해 (포트폴리오 상관을 반영한 다변량 정규)
function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = val > 0 ? Math.sqrt(val) : 0;
      } else {
        L[i][j] = L[j][j] === 0 ? 0 : (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

// 레버리지 ETF → 기초자산 매핑 (상관 계산용)
const LEVERAGE_MAP: Record<string, string> = {
  ORCX: "ORCL",
  ORCU: "ORCL",
  ORCS: "ORCL",
  AMZU: "AMZN",
  TSLL: "TSLA",
  NVDU: "NVDA",
  NVDL: "NVDA",
  TQQQ: "QQQ",
  SOXL: "SOXX",
  TNA: "IWM",
};

async function fetchPortfolio(): Promise<Position[]> {
  const supabase = createAdmin();
  const { data, error } = await supabase.from("portfolio").select("*");
  if (error) throw error;
  if (!data) return [];

  const positions: Position[] = [];
  for (const row of data) {
    const sym = row.symbol;
    const underlying = LEVERAGE_MAP[sym] ?? sym;
    let currentPrice: number | null = null;
    try {
      const bars = await fetchYahooHistory(sym, "5d");
      if (bars.length > 0) currentPrice = bars[bars.length - 1].close;
    } catch {}
    const price = currentPrice ?? row.avg_cost;
    const marketValue = price * row.shares;
    const costBasis = row.avg_cost * row.shares;
    positions.push({
      symbol: sym,
      shares: row.shares,
      avgCost: row.avg_cost,
      leverage: row.leverage ?? 1,
      costBasis,
      currentPrice,
      marketValue,
      weight: 0, // 나중에 계산
      pnl: marketValue - costBasis,
      pnlPct: ((price / row.avg_cost) - 1) * 100,
      underlying,
    });
  }

  const totalMV = positions.reduce((s, p) => s + p.marketValue, 0);
  positions.forEach(p => { p.weight = totalMV === 0 ? 0 : p.marketValue / totalMV; });
  return positions;
}

async function fetchReturnsFor(symbols: string[], days = 60): Promise<Map<string, ReturnSeries>> {
  const map = new Map<string, ReturnSeries>();
  const results = await Promise.all(symbols.map(async s => {
    try {
      const bars = await fetchYahooHistory(s, "3mo");
      const closes = bars.map(b => b.close).filter(v => v != null);
      const recent = closes.slice(-Math.min(days + 1, closes.length));
      const rets = dailyReturns(recent);
      return { symbol: s, returns: rets, dailyVol: stdev(rets) };
    } catch {
      return { symbol: s, returns: [], dailyVol: 0 };
    }
  }));
  results.forEach(r => map.set(r.symbol, r));
  return map;
}

// 상관행렬 구축 (레버리지 ETF는 기초자산 상관 + 자체 변동성 사용)
function buildCorrelationMatrix(positions: Position[], returns: Map<string, ReturnSeries>): number[][] {
  const n = positions.length;
  const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { mat[i][j] = 1; continue; }
      if (i > j) { mat[i][j] = mat[j][i]; continue; }

      // 동일 기초자산 → 거의 1 (레버리지 비율만 다름)
      if (positions[i].underlying === positions[j].underlying) {
        mat[i][j] = 0.98;
        continue;
      }

      // 기초자산 간 상관
      const a = returns.get(positions[i].underlying) ?? returns.get(positions[i].symbol);
      const b = returns.get(positions[j].underlying) ?? returns.get(positions[j].symbol);
      if (!a?.returns.length || !b?.returns.length) { mat[i][j] = 0.3; continue; } // 기본
      mat[i][j] = correlation(a.returns, b.returns);
    }
  }
  return mat;
}

// 포트폴리오 변동성 = sqrt(w^T * Σ * w), Σ_ij = ρ_ij * σ_i * σ_j
function portfolioVolatility(
  weights: number[],
  dailyVols: number[],
  corrMatrix: number[][]
): number {
  const n = weights.length;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cov = corrMatrix[i][j] * dailyVols[i] * dailyVols[j];
      variance += weights[i] * weights[j] * cov;
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

// 각 종목의 marginal risk contribution
function riskContribution(
  weights: number[],
  dailyVols: number[],
  corrMatrix: number[][]
): { marginal: number[]; contribution: number[]; pctContribution: number[] } {
  const n = weights.length;
  const portVol = portfolioVolatility(weights, dailyVols, corrMatrix);
  if (portVol === 0) return { marginal: new Array(n).fill(0), contribution: new Array(n).fill(0), pctContribution: new Array(n).fill(0) };
  // ∂σ_p/∂w_i = (Σ * w)_i / σ_p
  const marginal = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += corrMatrix[i][j] * dailyVols[i] * dailyVols[j] * weights[j];
    }
    marginal[i] = sum / portVol;
  }
  const contribution = marginal.map((m, i) => m * weights[i]);
  const totalContrib = contribution.reduce((s, x) => s + x, 0);
  const pctContribution = contribution.map(c => totalContrib === 0 ? 0 : c / totalContrib);
  return { marginal, contribution, pctContribution };
}

// 몬테카를로: 30일 후 포트폴리오 가치 분포
function monteCarlo(
  positions: Position[],
  dailyVols: number[],
  dailyMeans: number[],
  corrMatrix: number[][],
  horizon = 30,
  sims = 3000
): {
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  expectedValue: number;
  currentValue: number;
  probProfit: number;
  probLoss10: number;
  histogramBins: { value: number; count: number }[];
} {
  const n = positions.length;
  const currentValue = positions.reduce((s, p) => s + p.marketValue, 0);
  if (n === 0 || currentValue === 0) {
    return {
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      expectedValue: 0, currentValue: 0, probProfit: 0, probLoss10: 0,
      histogramBins: [],
    };
  }

  const L = cholesky(corrMatrix);
  const finals: number[] = [];
  for (let sim = 0; sim < sims; sim++) {
    const prices = positions.map(p => p.currentPrice ?? p.avgCost);
    for (let d = 0; d < horizon; d++) {
      // 독립 정규
      const z = new Array(n).fill(0).map(() => randn());
      // 상관을 반영한 쇼크
      const shocks: number[] = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
        shocks[i] = s;
      }
      for (let i = 0; i < n; i++) {
        const lev = positions[i].leverage;
        // 레버리지 효과: 레버리지 × 기초자산 변동 (간이)
        const baseDrift = dailyMeans[i];
        const baseVol = dailyVols[i];
        const dailyReturn = baseDrift * lev + baseVol * shocks[i] * lev;
        prices[i] = prices[i] * Math.exp(dailyReturn);
      }
    }
    const totalValue = positions.reduce((s, p, i) => s + prices[i] * p.shares, 0);
    finals.push(totalValue);
  }
  finals.sort((a, b) => a - b);
  const pct = (p: number) => finals[Math.floor(p * finals.length)];
  const expectedValue = finals.reduce((s, x) => s + x, 0) / finals.length;
  const probProfit = finals.filter(v => v > currentValue).length / finals.length;
  const probLoss10 = finals.filter(v => v < currentValue * 0.9).length / finals.length;

  // 히스토그램
  const minV = finals[0], maxV = finals[finals.length - 1];
  const bins = 20;
  const binSize = (maxV - minV) / bins;
  const hist: { value: number; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = minV + i * binSize;
    const hi = lo + binSize;
    const cnt = finals.filter(v => v >= lo && v < hi).length;
    hist.push({ value: (lo + hi) / 2, count: cnt });
  }

  return {
    percentiles: { p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
    expectedValue,
    currentValue,
    probProfit,
    probLoss10,
    histogramBins: hist,
  };
}

// What-If: 특정 종목 매도 시 포트폴리오 변화
function whatIfRemove(
  positions: Position[],
  dailyVols: number[],
  dailyMeans: number[],
  corrMatrix: number[][],
  symbolsToRemove: string[]
) {
  const keep = positions.map((p, i) => ({ pos: p, idx: i })).filter(x => !symbolsToRemove.includes(x.pos.symbol));
  if (keep.length === 0) return null;
  const keepIdx = keep.map(x => x.idx);
  const keepPos = keep.map(x => x.pos);
  const newVols = keepIdx.map(i => dailyVols[i]);
  const newMeans = keepIdx.map(i => dailyMeans[i]);
  const newMat = keepIdx.map(i => keepIdx.map(j => corrMatrix[i][j]));
  const newTotal = keepPos.reduce((s, p) => s + p.marketValue, 0);
  const newWeights = keepPos.map(p => newTotal === 0 ? 0 : p.marketValue / newTotal);
  const newVol = portfolioVolatility(newWeights, newVols, newMat) * Math.sqrt(252); // 연환산
  const mc = monteCarlo(keepPos, newVols, newMeans, newMat, 30, 2000);
  return {
    newPositions: keepPos.map(p => p.symbol),
    newTotalValue: newTotal,
    annualVol: newVol * 100,
    monteCarlo: mc,
    concentrationHHI: keepPos.reduce((s, p) => {
      const w = newTotal === 0 ? 0 : p.marketValue / newTotal;
      return s + w * w;
    }, 0),
  };
}

export async function GET(_req: NextRequest) {
  try {
    const positions = await fetchPortfolio();
    if (positions.length === 0) {
      return NextResponse.json({ success: true, empty: true, message: "포트폴리오가 비어있습니다" });
    }

    // 기초자산 + 실제 종목 모두 수익률 수집
    const allSymbols = Array.from(new Set([
      ...positions.map(p => p.symbol),
      ...positions.map(p => p.underlying),
    ]));
    const returns = await fetchReturnsFor(allSymbols, 60);

    // 각 종목의 일간 변동성과 평균
    const dailyVols = positions.map(p => {
      const r = returns.get(p.symbol) ?? returns.get(p.underlying);
      const base = r?.dailyVol ?? 0.02;
      return base * p.leverage;
    });
    const dailyMeans = positions.map(p => {
      const r = returns.get(p.symbol) ?? returns.get(p.underlying);
      return mean(r?.returns ?? []);
    });
    const weights = positions.map(p => p.weight);

    // 상관행렬
    const corrMatrix = buildCorrelationMatrix(positions, returns);

    // 포트 변동성
    const dailyPortVol = portfolioVolatility(weights, dailyVols, corrMatrix);
    const annualPortVol = dailyPortVol * Math.sqrt(252) * 100;

    // 리스크 기여도
    const risk = riskContribution(weights, dailyVols, corrMatrix);

    // 집중도 (Herfindahl-Hirschman Index)
    const hhi = weights.reduce((s, w) => s + w * w, 0);

    // 레버리지 가중 익스포저
    const leveragedExposure = positions.reduce((s, p) => s + p.weight * p.leverage, 0);

    // 몬테카를로
    const mc = monteCarlo(positions, dailyVols, dailyMeans, corrMatrix, 30, 3000);

    // What-If: TSLL 매도 / TSLL+ORCU 매도 / 모든 레버리지 매도
    const levSymbols = positions.filter(p => p.leverage > 1).map(p => p.symbol);
    const whatIfs = [
      {
        label: "TSLL 매도",
        remove: ["TSLL"],
        result: whatIfRemove(positions, dailyVols, dailyMeans, corrMatrix, ["TSLL"]),
      },
      {
        label: "TSLL + ORCU 매도 (오늘 밤 계획)",
        remove: ["TSLL", "ORCU"],
        result: whatIfRemove(positions, dailyVols, dailyMeans, corrMatrix, ["TSLL", "ORCU"]),
      },
      {
        label: "TSLL + ORCU + ORCX 매도 (공격적 복구)",
        remove: ["TSLL", "ORCU", "ORCX"],
        result: whatIfRemove(positions, dailyVols, dailyMeans, corrMatrix, ["TSLL", "ORCU", "ORCX"]),
      },
      {
        label: "모든 레버리지 ETF 매도",
        remove: levSymbols,
        result: whatIfRemove(positions, dailyVols, dailyMeans, corrMatrix, levSymbols),
      },
    ].filter(w => w.result !== null);

    // 종합 진단
    const diagnosis: string[] = [];
    if (hhi > 0.4) diagnosis.push(`집중도 높음 (HHI ${(hhi * 100).toFixed(1)}) — 분산 필요`);
    if (leveragedExposure > 1.5) diagnosis.push(`레버리지 가중 익스포저 ${leveragedExposure.toFixed(2)}x — 실질 노출도 매우 높음`);
    if (annualPortVol > 40) diagnosis.push(`연환산 변동성 ${annualPortVol.toFixed(1)}% — 고위험 수준`);
    if (mc.probLoss10 > 0.25) diagnosis.push(`30일 내 -10% 이상 손실 확률 ${(mc.probLoss10 * 100).toFixed(0)}% — 경고`);
    
    // 가장 위험한 종목
    const rcData = positions.map((p, i) => ({
      symbol: p.symbol,
      pctContribution: risk.pctContribution[i],
    })).sort((a, b) => b.pctContribution - a.pctContribution);
    if (rcData[0].pctContribution > 0.4) {
      diagnosis.push(`${rcData[0].symbol} 리스크 기여도 ${(rcData[0].pctContribution * 100).toFixed(0)}% — 단일 리스크 집중`);
    }

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      positions: positions.map((p, i) => ({
        ...p,
        dailyVol: dailyVols[i] * 100,
        annualVol: dailyVols[i] * Math.sqrt(252) * 100,
        riskContribution: risk.pctContribution[i],
      })),
      portfolio: {
        totalValue: positions.reduce((s, p) => s + p.marketValue, 0),
        totalCost: positions.reduce((s, p) => s + p.costBasis, 0),
        totalPnl: positions.reduce((s, p) => s + p.pnl, 0),
        dailyVol: dailyPortVol * 100,
        annualVol: annualPortVol,
        hhi,
        leveragedExposure,
      },
      correlationMatrix: {
        symbols: positions.map(p => p.symbol),
        matrix: corrMatrix.map(row => row.map(v => Math.round(v * 100) / 100)),
      },
      monteCarlo: mc,
      whatIfScenarios: whatIfs,
      diagnosis,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true }, { status: 200 });
  }
}
