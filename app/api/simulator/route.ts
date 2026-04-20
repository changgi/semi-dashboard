import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Portfolio Simulator API
// 
// 3가지 모드:
//   1. DCA (Dollar Cost Averaging) - 매월 정기 적립
//   2. Lump Sum - 한 번에 전액 매수
//   3. Compare - 여러 전략 비교
// 
// POST body: { mode, symbols, startDate, amount, frequency? }
// ═══════════════════════════════════════════════════════════

interface SimulationInput {
  mode: "dca" | "lumpsum" | "compare";
  symbols: string[];              // ["SPY", "QQQ", "SMH"]
  startDate: string;              // "2025-04-20"
  endDate?: string;               // 생략 시 오늘
  totalAmount?: number;           // lumpsum용 (USD)
  monthlyAmount?: number;         // dca용 (USD)
  weights?: Record<string, number>; // { SPY: 60, QQQ: 40 } (percentage)
}

interface SimulationResult {
  symbol: string;
  mode: string;
  totalInvested: number;
  finalValue: number;
  totalReturn: number;
  totalReturnPct: number;
  cagr: number;              // 연환산 수익률
  maxDrawdown: number;       // 최대 낙폭
  sharpe: number;            // 간이 샤프 (일간 수익률 기준)
  volatility: number;        // 일간 변동성
  bestMonth: { date: string; returnPct: number };
  worstMonth: { date: string; returnPct: number };
  trades: Array<{ date: string; price: number; shares: number; amount: number }>;
  dailyValues: Array<{ date: string; value: number; cost: number; gain: number }>;
}

// ───────────────────────────────────────────────────────────
// DCA 시뮬레이션 (매월 정해진 금액 적립)
// ───────────────────────────────────────────────────────────
async function simulateDCA(
  symbol: string,
  startDate: string,
  endDate: string,
  monthlyAmount: number
): Promise<SimulationResult | null> {
  try {
    // 시작 날짜가 3년 초과면 3년으로 제한 (API 제한)
    const history = await fetchYahooHistory(symbol, "5y");
    if (!history || history.length === 0) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 시작일 이후 이력만
    const relevant = history.filter((h) => {
      const d = new Date(h.date);
      return d >= start && d <= end;
    });
    if (relevant.length === 0) return null;

    // 각 월의 첫 거래일에 매수
    const trades: SimulationResult["trades"] = [];
    let totalShares = 0;
    let totalInvested = 0;
    let lastMonth = -1;

    for (const h of relevant) {
      const d = new Date(h.date);
      const monthKey = d.getFullYear() * 12 + d.getMonth();
      if (monthKey !== lastMonth) {
        // 매달 첫 거래일에 매수
        const shares = monthlyAmount / h.close;
        totalShares += shares;
        totalInvested += monthlyAmount;
        trades.push({
          date: h.date,
          price: h.close,
          shares: Math.round(shares * 1000) / 1000,
          amount: monthlyAmount,
        });
        lastMonth = monthKey;
      }
    }

    if (trades.length === 0) return null;

    // 일별 포트폴리오 가치 (매달 누적)
    const dailyValues: SimulationResult["dailyValues"] = [];
    let sharesOwned = 0;
    let cumCost = 0;
    let tradeIdx = 0;

    for (const h of relevant) {
      // 해당 날짜까지 체결된 거래 반영
      while (tradeIdx < trades.length && trades[tradeIdx].date <= h.date) {
        sharesOwned += trades[tradeIdx].shares;
        cumCost += trades[tradeIdx].amount;
        tradeIdx++;
      }
      const value = sharesOwned * h.close;
      dailyValues.push({
        date: h.date,
        value: Math.round(value * 100) / 100,
        cost: Math.round(cumCost * 100) / 100,
        gain: Math.round((value - cumCost) * 100) / 100,
      });
    }

    // 최종 결과
    const finalPrice = relevant[relevant.length - 1].close;
    const finalValue = totalShares * finalPrice;
    const totalReturn = finalValue - totalInvested;
    const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

    // CAGR
    const years = (end.getTime() - start.getTime()) / (365.25 * 86400000);
    const cagr = years > 0 ? (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100 : 0;

    // Max Drawdown
    let peak = 0;
    let maxDD = 0;
    for (const dv of dailyValues) {
      if (dv.value > peak) peak = dv.value;
      const dd = peak > 0 ? ((dv.value - peak) / peak) * 100 : 0;
      if (dd < maxDD) maxDD = dd;
    }

    // Volatility (일간 수익률 표준편차)
    const dailyReturns: number[] = [];
    for (let i = 1; i < dailyValues.length; i++) {
      if (dailyValues[i - 1].value > 0) {
        dailyReturns.push((dailyValues[i].value - dailyValues[i - 1].value) / dailyValues[i - 1].value);
      }
    }
    const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

    // Sharpe (무위험 수익률 4% 가정)
    const annualReturn = cagr;
    const sharpe = volatility > 0 ? (annualReturn - 4) / volatility : 0;

    // Best/Worst Month
    const monthlyReturns: Record<string, { start: number; end: number }> = {};
    for (const dv of dailyValues) {
      const monthKey = dv.date.slice(0, 7); // YYYY-MM
      if (!monthlyReturns[monthKey]) {
        monthlyReturns[monthKey] = { start: dv.value, end: dv.value };
      } else {
        monthlyReturns[monthKey].end = dv.value;
      }
    }
    const monthlyList = Object.entries(monthlyReturns).map(([m, v]) => ({
      date: m,
      returnPct: v.start > 0 ? ((v.end - v.start) / v.start) * 100 : 0,
    }));
    const bestMonth = monthlyList.sort((a, b) => b.returnPct - a.returnPct)[0] || { date: "-", returnPct: 0 };
    const worstMonth = monthlyList.sort((a, b) => a.returnPct - b.returnPct)[0] || { date: "-", returnPct: 0 };

    return {
      symbol,
      mode: "dca",
      totalInvested: Math.round(totalInvested * 100) / 100,
      finalValue: Math.round(finalValue * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      totalReturnPct: Math.round(totalReturnPct * 100) / 100,
      cagr: Math.round(cagr * 100) / 100,
      maxDrawdown: Math.round(maxDD * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      bestMonth: { date: bestMonth.date, returnPct: Math.round(bestMonth.returnPct * 100) / 100 },
      worstMonth: { date: worstMonth.date, returnPct: Math.round(worstMonth.returnPct * 100) / 100 },
      trades: trades.slice(-24), // 최근 24개월만
      dailyValues: dailyValues.filter((_, i) => i % 5 === 0), // 5일마다 샘플링
    };
  } catch (e) {
    console.error(`[simulate DCA ${symbol}]`, e);
    return null;
  }
}

// ───────────────────────────────────────────────────────────
// Lump Sum 시뮬레이션 (한 번에 전액)
// ───────────────────────────────────────────────────────────
async function simulateLumpSum(
  symbol: string,
  startDate: string,
  endDate: string,
  amount: number
): Promise<SimulationResult | null> {
  try {
    const history = await fetchYahooHistory(symbol, "5y");
    if (!history || history.length === 0) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const relevant = history.filter((h) => {
      const d = new Date(h.date);
      return d >= start && d <= end;
    });
    if (relevant.length === 0) return null;

    const entryPrice = relevant[0].close;
    const shares = amount / entryPrice;
    const finalPrice = relevant[relevant.length - 1].close;
    const finalValue = shares * finalPrice;
    const totalReturn = finalValue - amount;
    const totalReturnPct = (totalReturn / amount) * 100;

    // 일별 값
    const dailyValues = relevant.map((h) => ({
      date: h.date,
      value: Math.round(shares * h.close * 100) / 100,
      cost: amount,
      gain: Math.round((shares * h.close - amount) * 100) / 100,
    }));

    // CAGR
    const years = (end.getTime() - start.getTime()) / (365.25 * 86400000);
    const cagr = years > 0 ? (Math.pow(finalValue / amount, 1 / years) - 1) * 100 : 0;

    // Max DD
    let peak = 0;
    let maxDD = 0;
    for (const dv of dailyValues) {
      if (dv.value > peak) peak = dv.value;
      const dd = peak > 0 ? ((dv.value - peak) / peak) * 100 : 0;
      if (dd < maxDD) maxDD = dd;
    }

    // Volatility
    const dailyReturns: number[] = [];
    for (let i = 1; i < dailyValues.length; i++) {
      if (dailyValues[i - 1].value > 0) {
        dailyReturns.push((dailyValues[i].value - dailyValues[i - 1].value) / dailyValues[i - 1].value);
      }
    }
    const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / (dailyReturns.length || 1);
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length || 1);
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    const sharpe = volatility > 0 ? (cagr - 4) / volatility : 0;

    // Best/Worst month
    const monthlyReturns: Record<string, { start: number; end: number }> = {};
    for (const dv of dailyValues) {
      const m = dv.date.slice(0, 7);
      if (!monthlyReturns[m]) monthlyReturns[m] = { start: dv.value, end: dv.value };
      else monthlyReturns[m].end = dv.value;
    }
    const monthlyList = Object.entries(monthlyReturns).map(([m, v]) => ({
      date: m,
      returnPct: v.start > 0 ? ((v.end - v.start) / v.start) * 100 : 0,
    }));
    const bestMonth = monthlyList.sort((a, b) => b.returnPct - a.returnPct)[0] || { date: "-", returnPct: 0 };
    const worstMonth = monthlyList.sort((a, b) => a.returnPct - b.returnPct)[0] || { date: "-", returnPct: 0 };

    return {
      symbol,
      mode: "lumpsum",
      totalInvested: amount,
      finalValue: Math.round(finalValue * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      totalReturnPct: Math.round(totalReturnPct * 100) / 100,
      cagr: Math.round(cagr * 100) / 100,
      maxDrawdown: Math.round(maxDD * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      bestMonth: { date: bestMonth.date, returnPct: Math.round(bestMonth.returnPct * 100) / 100 },
      worstMonth: { date: worstMonth.date, returnPct: Math.round(worstMonth.returnPct * 100) / 100 },
      trades: [{ date: relevant[0].date, price: entryPrice, shares: Math.round(shares * 1000) / 1000, amount }],
      dailyValues: dailyValues.filter((_, i) => i % 5 === 0),
    };
  } catch (e) {
    console.error(`[simulate LumpSum ${symbol}]`, e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// POST
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SimulationInput;
    const {
      mode = "dca",
      symbols = ["SPY"],
      startDate,
      endDate = new Date().toISOString().split("T")[0],
      totalAmount = 10000,
      monthlyAmount = 500,
    } = body;

    if (!startDate) {
      return NextResponse.json({ success: false, error: "startDate required" });
    }

    // 각 심볼 병렬 시뮬레이션
    const results: SimulationResult[] = [];
    await Promise.all(
      symbols.slice(0, 5).map(async (sym) => {
        let r: SimulationResult | null = null;
        if (mode === "dca") {
          r = await simulateDCA(sym, startDate, endDate, monthlyAmount);
        } else {
          r = await simulateLumpSum(sym, startDate, endDate, totalAmount);
        }
        if (r) results.push(r);
      })
    );

    if (results.length === 0) {
      return NextResponse.json({
        success: false,
        error: "시뮬레이션 결과 생성 실패 - 날짜/심볼 확인",
      });
    }

    // 비교 지표
    const best = results.reduce((a, b) => (a.totalReturnPct > b.totalReturnPct ? a : b));
    const worst = results.reduce((a, b) => (a.totalReturnPct < b.totalReturnPct ? a : b));
    const lowestRisk = results.reduce((a, b) => (a.volatility < b.volatility ? a : b));
    const bestSharpe = results.reduce((a, b) => (a.sharpe > b.sharpe ? a : b));

    // 인사이트
    const insights: string[] = [];
    if (best.symbol !== worst.symbol) {
      const diff = best.totalReturnPct - worst.totalReturnPct;
      insights.push(
        `🏆 최고 수익: ${best.symbol} (+${best.totalReturnPct}%) · 최저: ${worst.symbol} (${worst.totalReturnPct >= 0 ? "+" : ""}${worst.totalReturnPct}%) · 차이 ${diff.toFixed(1)}%p`
      );
    }
    if (bestSharpe.symbol) {
      insights.push(
        `📊 위험조정수익률(Sharpe) 최고: ${bestSharpe.symbol} (${bestSharpe.sharpe}) - 가장 효율적`
      );
    }
    if (lowestRisk.symbol) {
      insights.push(
        `🛡️ 가장 안정적: ${lowestRisk.symbol} (변동성 ${lowestRisk.volatility}%)`
      );
    }
    const avgReturn = results.reduce((s, r) => s + r.totalReturnPct, 0) / results.length;
    if (avgReturn > 20) {
      insights.push(`💎 기간 평균 수익 +${avgReturn.toFixed(1)}% - 강세장 성과`);
    } else if (avgReturn < 0) {
      insights.push(`⚠️ 기간 평균 손실 ${avgReturn.toFixed(1)}% - 약세장 경험`);
    }

    // DCA 특수 인사이트
    if (mode === "dca") {
      const totalInvestedList = results.map(r => r.totalInvested);
      const avgInvested = totalInvestedList[0];
      insights.push(
        `💰 DCA: ${Math.round(avgInvested)}$ 누적 투자 (매월 $${monthlyAmount} × ${results[0].trades.length}개월)`
      );
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      input: { mode, symbols, startDate, endDate, totalAmount, monthlyAmount },
      results,
      best: { symbol: best.symbol, returnPct: best.totalReturnPct },
      worst: { symbol: worst.symbol, returnPct: worst.totalReturnPct },
      lowestRisk: { symbol: lowestRisk.symbol, volatility: lowestRisk.volatility },
      bestSharpe: { symbol: bestSharpe.symbol, sharpe: bestSharpe.sharpe },
      insights,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      results: [],
      insights: [],
    });
  }
}
