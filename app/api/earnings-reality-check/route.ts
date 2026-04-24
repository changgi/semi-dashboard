import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuote, fetchYahooHistory } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 300; // 5분 캐시
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * /api/earnings-reality-check
 *
 * 실적 발표 사후 자동 검증 엔진
 *
 * 기능:
 *   1. 최근 5일 내 실적 발표한 카일 보유 종목 감지
 *   2. 발표 전후 가격 변동 실측
 *   3. 사전 시나리오 (big_beat/beat/in_line/miss/big_miss) 중 어느 것이 실현되었는지 자동 판정
 *   4. 해당 시나리오의 권고 액션과 실제 카일 행동 대조
 *   5. 다음 실적 대비 학습 인사이트 제공
 */

type LeverageMap = Record<string, { underlying: string; leverage: number }>;
const LEVERAGE: LeverageMap = {
  ORCX: { underlying: "ORCL", leverage: 2 },
  ORCU: { underlying: "ORCL", leverage: 2 },
  ORCS: { underlying: "ORCL", leverage: 2 },
  AMZU: { underlying: "AMZN", leverage: 2 },
  TSLL: { underlying: "TSLA", leverage: 2 },
  NVDU: { underlying: "NVDA", leverage: 2 },
  NVDL: { underlying: "NVDA", leverage: 2 },
};

function getUnderlying(symbol: string): string {
  return LEVERAGE[symbol]?.underlying ?? symbol;
}

function getLeverage(symbol: string): number {
  return LEVERAGE[symbol]?.leverage ?? 1;
}

// 기초자산 수익률 기반 시나리오 분류
function classifyScenario(underlyingChangePct: number): {
  id: "big_beat" | "beat" | "in_line" | "miss" | "big_miss";
  label: string;
  emoji: string;
} {
  if (underlyingChangePct >= 10) return { id: "big_beat", label: "BIG BEAT", emoji: "🚀" };
  if (underlyingChangePct >= 3) return { id: "beat", label: "BEAT", emoji: "✅" };
  if (underlyingChangePct >= -3) return { id: "in_line", label: "IN-LINE", emoji: "⚖️" };
  if (underlyingChangePct >= -10) return { id: "miss", label: "MISS", emoji: "⚠️" };
  return { id: "big_miss", label: "BIG MISS", emoji: "🚨" };
}

type EarningsEvent = {
  symbol: string;
  companyName: string;
  earningsDate: string;
  timing: string;
};

async function fetchRecentEarnings(): Promise<EarningsEvent[]> {
  try {
    const supabase = createAdmin();
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { data } = await supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", fiveDaysAgo)
      .lte("earnings_date", tomorrow)
      .order("earnings_date", { ascending: false });

    if (!data) return [];
    return data.map(e => ({
      symbol: e.symbol,
      companyName: e.company_name ?? e.symbol,
      earningsDate: e.earnings_date,
      timing: e.earnings_time ?? "unknown",
    }));
  } catch {
    return [];
  }
}

async function fetchKylePortfolio() {
  try {
    const supabase = createAdmin();
    const { data } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    if (!data) return [];
    return data;
  } catch {
    return [];
  }
}

async function analyzeEarningsImpact(event: EarningsEvent, kylePortfolio: any[]) {
  // 기초자산 주가 데이터
  const underlyingSymbol = event.symbol;
  const history = await fetchYahooHistory(underlyingSymbol, "1mo");
  if (!history || history.length < 3) return null;

  const closes = history.map(b => b.close).filter(v => v != null);
  const dates = history.map(b => b.date);
  
  // 실적일 기준 전날 → 실적일 → 다음날 가격 추출
  const earningsDateStr = event.earningsDate;
  let earningsDayIdx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] === earningsDateStr) {
      earningsDayIdx = i;
      break;
    }
  }
  if (earningsDayIdx === -1) {
    // 가장 가까운 날짜로 근사
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= earningsDateStr) {
        earningsDayIdx = i;
        break;
      }
    }
  }
  if (earningsDayIdx === -1) earningsDayIdx = closes.length - 1;

  const preEarningsPrice = closes[Math.max(0, earningsDayIdx - 1)];
  const postEarningsPrice = closes[Math.min(closes.length - 1, earningsDayIdx + 1)] ?? closes[earningsDayIdx];
  const currentPrice = closes[closes.length - 1];

  const underlyingImmediateChangePct = ((postEarningsPrice / preEarningsPrice) - 1) * 100;
  const underlyingTotalChangePct = ((currentPrice / preEarningsPrice) - 1) * 100;

  // 시나리오 분류
  const scenario = classifyScenario(underlyingImmediateChangePct);

  // 카일 연관 포지션 탐색 (기초자산과 연결된 모든 포지션)
  const relatedPositions = kylePortfolio.filter(p => getUnderlying(p.symbol) === event.symbol);

  const kyleImpact = await Promise.all(relatedPositions.map(async (pos) => {
    const leverage = getLeverage(pos.symbol);
    let currentPosPrice = pos.avg_cost;
    try {
      const q = await fetchYahooQuote(pos.symbol);
      if (q?.price) currentPosPrice = q.price;
    } catch {}

    // 실적 당일 포지션 가격 (기초자산 변동 × 레버리지 근사)
    const estimatedPreEarningsPosPrice = currentPosPrice / (1 + underlyingTotalChangePct / 100 * leverage);
    const estimatedImmediatePosChangePct = underlyingImmediateChangePct * leverage;

    const currentValue = pos.shares * currentPosPrice;
    const costBasis = pos.shares * pos.avg_cost;
    const unrealizedPnl = currentValue - costBasis;
    const unrealizedPnlPct = ((currentPosPrice / pos.avg_cost) - 1) * 100;

    return {
      symbol: pos.symbol,
      underlying: event.symbol,
      leverage,
      shares: pos.shares,
      avgCost: pos.avg_cost,
      currentPrice: currentPosPrice,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
      estimatedPreEarningsPrice: estimatedPreEarningsPosPrice,
      estimatedImmediateChangePct: estimatedImmediatePosChangePct,
    };
  }));

  // 시나리오별 사전 권고 액션 (사전 시나리오 카드와 동일)
  const recommendedActions = getScenarioActions(scenario.id, event.symbol);

  // 사후 학습 인사이트
  const learnings = generateLearnings(scenario, kyleImpact, event);

  return {
    event,
    preEarningsPrice,
    postEarningsPrice,
    currentPrice,
    underlyingImmediateChangePct,
    underlyingTotalChangePct,
    scenario,
    kyleImpact,
    recommendedActions,
    learnings,
  };
}

function getScenarioActions(scenarioId: string, symbol: string): string[] {
  const actions: Record<string, string[]> = {
    big_beat: [
      "레버리지 포지션이 +20% 급등했다면 일부 수익 실현 고려",
      "추격 매수 금지 — 과열 구간",
      "관련 섹터 전반 상승 수혜 확인",
    ],
    beat: [
      "기존 포지션 유지",
      "가이던스 상향 여부 추가 확인",
      "다음 이벤트 (Fed, CPI 등) 대비",
    ],
    in_line: [
      "중립 대응",
      "방향성 추가 재료 대기",
      "변동성 없으면 시간 감가 비용 발생 — 레버리지 ETF 부담",
    ],
    miss: [
      "레버리지 ETF 부분 매도 고려 (낙폭 2배 증폭)",
      "본주는 장기 관점에서 유지 검토",
      "섹터 ETF (SOXX 등)로 분산 고려",
    ],
    big_miss: [
      "🚨 레버리지 포지션 즉시 청산 검토",
      "본주도 부분 매도 검토 (추가 하락 리스크)",
      "패닉 셀 아닌 '리스크 관리'로 인식",
      "현금 확보 후 바닥 확인 대기",
    ],
  };
  return actions[scenarioId] ?? [];
}

function generateLearnings(scenario: any, kyleImpact: any[], event: EarningsEvent): string[] {
  const insights: string[] = [];

  // 카일이 포지션 보유 중이었나
  if (kyleImpact.length === 0) {
    insights.push(`${event.symbol} 포지션 없음 — 이 실적은 카일 포트에 직접 영향 없음`);
    return insights;
  }

  const totalImpactValue = kyleImpact.reduce((s, k) => s + k.currentValue * (k.estimatedImmediateChangePct / 100), 0);
  const totalPositionValue = kyleImpact.reduce((s, k) => s + k.currentValue, 0);
  const impactPct = totalPositionValue > 0 ? (totalImpactValue / totalPositionValue) * 100 : 0;

  insights.push(`${event.symbol} 관련 ${kyleImpact.length}개 포지션에 약 ${impactPct >= 0 ? "+" : ""}${impactPct.toFixed(1)}% 영향 추정`);

  if (scenario.id === "big_miss" || scenario.id === "miss") {
    const levered = kyleImpact.filter(k => k.leverage > 1);
    if (levered.length > 0) {
      const avgLev = levered.reduce((s, k) => s + k.leverage, 0) / levered.length;
      insights.push(`레버리지 ${avgLev.toFixed(0)}x 포지션 ${levered.length}개 보유 — 손실 ${avgLev}배 증폭`);
      insights.push("📚 교훈: 실적 D-2 이내 레버리지 청산 원칙 (원칙 6) 준수 여부 점검");
    }
  }

  if (scenario.id === "big_beat") {
    insights.push("📚 교훈: 결과 대박 ≠ 결정 성공. '만약 매도했다면 기회비용이지만, 리스크 관리는 여전히 옳았다'");
  }

  if (scenario.id === "in_line") {
    const levered = kyleImpact.filter(k => k.leverage > 1);
    if (levered.length > 0) {
      insights.push("📚 교훈: 횡보 시 레버리지 ETF 시간 감가 비용 발생 (decay)");
    }
  }

  return insights;
}

export async function GET(_req: NextRequest) {
  try {
    const [earnings, kylePortfolio] = await Promise.all([
      fetchRecentEarnings(),
      fetchKylePortfolio(),
    ]);

    if (earnings.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        message: "최근 5일 내 실적 발표 이벤트가 없습니다",
      });
    }

    // 카일 보유 기초자산과 관련된 실적만 필터
    const kyleUnderlyings = new Set(kylePortfolio.map(p => getUnderlying(p.symbol)));
    const relevantEarnings = earnings.filter(e => kyleUnderlyings.has(e.symbol));

    if (relevantEarnings.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        message: `최근 실적 발표 ${earnings.length}건 있으나 카일 보유 기초자산과 무관`,
        recentEarnings: earnings.slice(0, 5).map(e => ({ symbol: e.symbol, date: e.earningsDate })),
      });
    }

    // 병렬 분석 (최대 5개)
    const analyses = await Promise.all(
      relevantEarnings.slice(0, 5).map(e => analyzeEarningsImpact(e, kylePortfolio))
    );

    const validAnalyses = analyses.filter(a => a !== null);

    // 종합 요약
    const totalImpact = validAnalyses.reduce((s, a: any) => {
      return s + a.kyleImpact.reduce((ss: number, k: any) =>
        ss + k.currentValue * (k.estimatedImmediateChangePct / 100), 0);
    }, 0);

    const mostImpactful = [...validAnalyses].sort((a: any, b: any) => {
      const aImpact = Math.abs(a.kyleImpact.reduce((s: number, k: any) => s + k.currentValue * (k.estimatedImmediateChangePct / 100), 0));
      const bImpact = Math.abs(b.kyleImpact.reduce((s: number, k: any) => s + k.currentValue * (k.estimatedImmediateChangePct / 100), 0));
      return bImpact - aImpact;
    })[0];

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      summary: {
        totalEarnings: earnings.length,
        relevantEarnings: relevantEarnings.length,
        analyzed: validAnalyses.length,
        totalEstimatedImpact: totalImpact,
        mostImpactfulSymbol: mostImpactful ? (mostImpactful as any).event.symbol : null,
      },
      analyses: validAnalyses,
      philosophy: {
        quote: "결과가 아닌 결정의 질을 평가하라",
        purpose: "실적 발표 결과를 사전 시나리오와 대조해 '무엇을 배울 것인가' 자동 추출",
        note: "Big Beat가 나와도 리스크 관리 결정은 여전히 옳았을 수 있음 — 결과론 경계",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
    }, { status: 200 });
  }
}
