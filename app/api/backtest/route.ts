import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// 매크로 점수 기반 백테스트 API
// "과거에 Daniel Yoo 점수가 X일 때 N일 보유했다면?"
// ═══════════════════════════════════════════════════════════

// 매크로 점수 계산 (실제 daily-summary와 동일 로직)
function calcMacroScore(tnx: number, vix: number, dxy: number, oil: number, ndxChange: number, soxxChange: number): number {
  let score = 0;

  // 10Y 금리 (35점 만점)
  if (tnx < 3.5) score += 20;
  else if (tnx < 4.0) score += 15;
  else if (tnx < 4.5) score += 8;

  // VIX (20점)
  if (vix < 15) score += 5;
  else if (vix < 20) score += 15;
  else if (vix < 25) score += 10;
  else if (vix < 30) score += 5;

  // DXY (20점)
  if (dxy < 100) score += 15;
  else if (dxy < 102) score += 12;
  else if (dxy < 105) score += 6;

  // 원유 (15점)
  if (oil >= 70 && oil <= 85) score += 12;
  else if (oil >= 65 && oil <= 95) score += 6;

  // 모멘텀 (10점)
  if (ndxChange > 0.5 && soxxChange > 0.5) score += 10;
  else if (ndxChange > 0 || soxxChange > 0) score += 5;

  return score;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? "SMH";
    const holdingDays = parseInt(searchParams.get("holding") ?? "30");
    const scoreThreshold = parseInt(searchParams.get("threshold") ?? "50");
    const range = searchParams.get("range") ?? "1y"; // 1y, 2y

    // 1년 또는 2년 과거 데이터 병렬 fetch
    const [tnxBars, vixBars, dxyBars, oilBars, ndxBars, soxxBars, targetBars] = await Promise.all([
      fetchYahooHistory("^TNX", range),
      fetchYahooHistory("^VIX", range),
      fetchYahooHistory("DX-Y.NYB", range),
      fetchYahooHistory("CL=F", range),
      fetchYahooHistory("^NDX", range),
      fetchYahooHistory("SOXX", range),
      fetchYahooHistory(symbol, range),
    ]);

    // 날짜별 맵 구축
    const tnxMap = new Map(tnxBars.map((b) => [b.date, b.close]));
    const vixMap = new Map(vixBars.map((b) => [b.date, b.close]));
    const dxyMap = new Map(dxyBars.map((b) => [b.date, b.close]));
    const oilMap = new Map(oilBars.map((b) => [b.date, b.close]));
    const ndxMap = new Map(ndxBars.map((b) => [b.date, b.close]));
    const soxxMap = new Map(soxxBars.map((b) => [b.date, b.close]));

    // 전일 대비 변동률 계산용 (NDX, SOXX)
    const ndxChanges = new Map<string, number>();
    for (let i = 1; i < ndxBars.length; i++) {
      const prev = ndxBars[i - 1].close;
      const curr = ndxBars[i].close;
      if (prev > 0) {
        ndxChanges.set(ndxBars[i].date, ((curr - prev) / prev) * 100);
      }
    }
    const soxxChanges = new Map<string, number>();
    for (let i = 1; i < soxxBars.length; i++) {
      const prev = soxxBars[i - 1].close;
      const curr = soxxBars[i].close;
      if (prev > 0) {
        soxxChanges.set(soxxBars[i].date, ((curr - prev) / prev) * 100);
      }
    }

    // 각 거래일별 점수와 N일 후 수익률 계산
    const entries: Array<{
      date: string;
      score: number;
      entryPrice: number;
      exitDate: string;
      exitPrice: number;
      returnPct: number;
      macroSnapshot: {
        tnx: number;
        vix: number;
        dxy: number;
        oil: number;
      };
    }> = [];

    for (let i = 0; i < targetBars.length - holdingDays; i++) {
      const entryBar = targetBars[i];
      const exitBar = targetBars[i + holdingDays];

      const tnx = tnxMap.get(entryBar.date);
      const vix = vixMap.get(entryBar.date);
      const dxy = dxyMap.get(entryBar.date);
      const oil = oilMap.get(entryBar.date);
      const ndxCh = ndxChanges.get(entryBar.date) ?? 0;
      const soxxCh = soxxChanges.get(entryBar.date) ?? 0;

      if (!tnx || !vix || !dxy || !oil) continue;

      const score = calcMacroScore(tnx, vix, dxy, oil, ndxCh, soxxCh);
      const returnPct = ((exitBar.close - entryBar.close) / entryBar.close) * 100;

      entries.push({
        date: entryBar.date,
        score,
        entryPrice: entryBar.close,
        exitDate: exitBar.date,
        exitPrice: exitBar.close,
        returnPct: Math.round(returnPct * 100) / 100,
        macroSnapshot: { tnx, vix, dxy, oil },
      });
    }

    // ═══════════════════════════════════════════════
    // 구간별 성과 분석
    // ═══════════════════════════════════════════════
    const buckets = [
      { name: "매우 우호", description: "점수 70+ (강력 매수)", min: 70, max: 100 },
      { name: "우호", description: "점수 50-70 (매수)", min: 50, max: 70 },
      { name: "중립", description: "점수 30-50 (관망)", min: 30, max: 50 },
      { name: "부정", description: "점수 0-30 (매도/회피)", min: 0, max: 30 },
    ];

    const bucketResults = buckets.map((bucket) => {
      const subset = entries.filter(
        (e) => e.score >= bucket.min && e.score < bucket.max
      );
      if (subset.length === 0) {
        return {
          ...bucket,
          sampleCount: 0,
          avgReturn: null,
          winRate: null,
          maxGain: null,
          maxLoss: null,
          sharpe: null,
        };
      }
      const returns = subset.map((s) => s.returnPct);
      const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
      const winRate = (returns.filter((r) => r > 0).length / returns.length) * 100;
      const stdDev = Math.sqrt(
        returns.reduce((s, v) => s + (v - avg) ** 2, 0) / returns.length
      );
      // 연율화 샤프 비율 (주간 승률 → 연율)
      const annualizedReturn = avg * (252 / holdingDays);
      const annualizedStd = stdDev * Math.sqrt(252 / holdingDays);
      const sharpe = annualizedStd > 0 ? annualizedReturn / annualizedStd : 0;

      return {
        ...bucket,
        sampleCount: subset.length,
        avgReturn: Math.round(avg * 100) / 100,
        winRate: Math.round(winRate),
        maxGain: Math.round(Math.max(...returns) * 100) / 100,
        maxLoss: Math.round(Math.min(...returns) * 100) / 100,
        sharpe: Math.round(sharpe * 100) / 100,
        annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      };
    });

    // ═══════════════════════════════════════════════
    // 전체 벤치마크 (buy-and-hold)
    // ═══════════════════════════════════════════════
    const totalReturn =
      targetBars.length > 0
        ? ((targetBars[targetBars.length - 1].close - targetBars[0].close) /
            targetBars[0].close) *
          100
        : 0;

    const allReturns = entries.map((e) => e.returnPct);
    const benchmark = {
      buyHoldReturn: Math.round(totalReturn * 100) / 100,
      avgReturn:
        allReturns.length > 0
          ? Math.round(
              (allReturns.reduce((s, v) => s + v, 0) / allReturns.length) * 100
            ) / 100
          : 0,
      winRate:
        allReturns.length > 0
          ? Math.round((allReturns.filter((r) => r > 0).length / allReturns.length) * 100)
          : 0,
      sampleCount: allReturns.length,
    };

    // ═══════════════════════════════════════════════
    // 전략 결과 (임계치 기준)
    // ═══════════════════════════════════════════════
    const strategyEntries = entries.filter((e) => e.score >= scoreThreshold);
    const skippedDays = entries.length - strategyEntries.length;
    let strategyReturn = 0;
    let strategyWinRate = 0;
    let strategyMaxDrawdown = 0;

    if (strategyEntries.length > 0) {
      const returns = strategyEntries.map((s) => s.returnPct);
      strategyReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
      strategyWinRate = (returns.filter((r) => r > 0).length / returns.length) * 100;
      strategyMaxDrawdown = Math.min(...returns);
    }

    // ═══════════════════════════════════════════════
    // 시계열 데이터 (차트용, 매 5일 샘플링)
    // ═══════════════════════════════════════════════
    const timeSeries = entries
      .filter((_, i) => i % 5 === 0)
      .map((e) => ({
        date: e.date,
        score: e.score,
        returnPct: e.returnPct,
        entryPrice: e.entryPrice,
      }));

    return NextResponse.json({
      success: true,
      symbol,
      holdingDays,
      scoreThreshold,
      range,
      totalTradingDays: entries.length,
      benchmark,
      bucketResults,
      strategy: {
        threshold: scoreThreshold,
        entriesTriggered: strategyEntries.length,
        skippedDays,
        triggerRate: Math.round((strategyEntries.length / entries.length) * 1000) / 10,
        avgReturn: Math.round(strategyReturn * 100) / 100,
        winRate: Math.round(strategyWinRate),
        maxDrawdown: Math.round(strategyMaxDrawdown * 100) / 100,
        outperformance: Math.round((strategyReturn - benchmark.avgReturn) * 100) / 100,
      },
      timeSeries,
      methodology:
        "점수 = 10Y금리(35) + VIX(20) + DXY(20) + 원유(15) + 모멘텀(10) = 100점 만점. 각 거래일 진입 후 N일 후 청산 가정.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
