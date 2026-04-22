import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * /api/rebalancing-engine
 *
 * 리밸런싱 엔진 — "매도 후 현금을 어디에 재배치할지"까지 포함한 완전 사이클.
 *
 * 전략 모드:
 * 1. kyle_principles: 카일님 7가지 원칙 준수 (기초자산 25%↓, 레버리지 30%↓)
 * 2. equal_weight: 균등 비중
 * 3. risk_parity: 리스크 기여도 균등
 * 4. conservative_recovery: 복구 플랜 (저변동성 자산 중심)
 *
 * 출력:
 * - 현재 비중 vs 목표 비중 격차
 * - 단계별 실행 플랜 (매도 → 현금 → 매수)
 * - 재투자 후보 (TIGER S&P500 등)
 * - 구체적 수량/금액
 */

type Position = {
  symbol: string;
  shares: number;
  avgCost: number;
  leverage: number;
  underlying: string;
  currentPrice: number;
  marketValue: number;
  weight: number;
};

const LEVERAGE_MAP: Record<string, string> = {
  ORCX: "ORCL", ORCU: "ORCL", ORCS: "ORCL",
  AMZU: "AMZN", TSLL: "TSLA",
  NVDU: "NVDA", NVDL: "NVDA",
  TQQQ: "QQQ", SOXL: "SOXX", TNA: "IWM",
};

// 재투자 후보 풀 — 카테고리별 분산 목적
const REINVESTMENT_CANDIDATES = [
  // 광범위 분산 (저변동성)
  { symbol: "SPY", category: "broad_market", expectedVol: 15, description: "S&P500 ETF, 미국 대형주 500", tier: "core" },
  { symbol: "VOO", category: "broad_market", expectedVol: 15, description: "Vanguard S&P500, 낮은 수수료", tier: "core" },
  { symbol: "SCHD", category: "dividend", expectedVol: 14, description: "고배당 ETF, 방어형", tier: "defensive" },
  // Korean equivalents (for Korean investors)
  { symbol: "360750.KS", category: "broad_market_kr", expectedVol: 16, description: "TIGER S&P500 (원화 표시)", tier: "core", koreanFriendly: true },
  { symbol: "133690.KS", category: "tech_kr", expectedVol: 20, description: "TIGER 미국나스닥100 (원화)", tier: "growth", koreanFriendly: true },
  // 방어형
  { symbol: "SPLV", category: "low_vol", expectedVol: 11, description: "Invesco 저변동성 ETF", tier: "defensive" },
  { symbol: "USMV", category: "low_vol", expectedVol: 12, description: "iShares 최소분산 ETF", tier: "defensive" },
  // 채권
  { symbol: "BIL", category: "cash_like", expectedVol: 1, description: "1-3개월 단기 국채 (현금성)", tier: "cash" },
  { symbol: "SHV", category: "cash_like", expectedVol: 1, description: "단기 국채 (1년 미만)", tier: "cash" },
  // 대안적 성장 (레버리지 아닌 본주)
  { symbol: "MSFT", category: "tech_large", expectedVol: 25, description: "Microsoft 본주 — AI + 클라우드", tier: "growth" },
  { symbol: "GOOGL", category: "tech_large", expectedVol: 28, description: "Alphabet 본주 — AI + 검색", tier: "growth" },
  { symbol: "AAPL", category: "tech_large", expectedVol: 26, description: "Apple 본주 — 서비스 성장", tier: "growth" },
];

async function fetchPortfolio(): Promise<{ positions: Position[]; cash: number }> {
  const supabase = createAdmin();
  const { data } = await supabase.from("portfolio").select("*");
  if (!data || data.length === 0) return { positions: [], cash: 0 };

  const positions: Position[] = [];
  for (const row of data) {
    const sym = row.symbol;
    const underlying = LEVERAGE_MAP[sym] ?? sym;
    let currentPrice = row.avg_cost;
    try {
      const q = await fetchYahooQuote(sym);
      if (q?.price) currentPrice = q.price;
    } catch {}
    const marketValue = currentPrice * row.shares;
    positions.push({
      symbol: sym,
      shares: row.shares,
      avgCost: row.avg_cost,
      leverage: row.leverage ?? 1,
      underlying,
      currentPrice,
      marketValue,
      weight: 0,
    });
  }
  const total = positions.reduce((s, p) => s + p.marketValue, 0);
  positions.forEach(p => { p.weight = total === 0 ? 0 : p.marketValue / total; });
  return { positions, cash: 0 };
}

// 전략 1: 카일님 7가지 원칙 기반 목표 비중
function targetKylePrinciples(positions: Position[]): { targetWeights: Record<string, number>; rationale: string[] } {
  const rationale: string[] = [];
  const targetWeights: Record<string, number> = {};
  const underlyingGroups = new Map<string, Position[]>();
  positions.forEach(p => {
    if (!underlyingGroups.has(p.underlying)) underlyingGroups.set(p.underlying, []);
    underlyingGroups.get(p.underlying)!.push(p);
  });

  // 원칙 1: 하나의 기초자산 ≤ 25%
  // 원칙 2: 레버리지 ETF 전체 ≤ 30%
  const leverageCap = 0.30;
  const underlyingCap = 0.25;

  // 먼저 레버리지 ETF 총합 계산
  const levPositions = positions.filter(p => p.leverage > 1);
  const levTotalWeight = levPositions.reduce((s, p) => s + p.weight, 0);
  const levScale = levTotalWeight > leverageCap ? leverageCap / levTotalWeight : 1;
  if (levTotalWeight > leverageCap) {
    rationale.push(`레버리지 ETF 총합 ${(levTotalWeight * 100).toFixed(0)}% → 30%로 축소 (원칙 2)`);
  }

  // 각 기초자산 그룹 내에서 25% 제한 적용
  underlyingGroups.forEach((group, underlying) => {
    const groupWeight = group.reduce((s, p) => s + p.weight, 0);
    const scale = groupWeight > underlyingCap ? underlyingCap / groupWeight : 1;
    if (groupWeight > underlyingCap) {
      rationale.push(`${underlying} 계열 총합 ${(groupWeight * 100).toFixed(0)}% → 25%로 축소 (원칙 1)`);
    }
    group.forEach(p => {
      let target = p.weight * scale;
      if (p.leverage > 1) target = target * levScale;
      targetWeights[p.symbol] = target;
    });
  });

  // 재투자 대상에 남은 비중 할당
  const sumTarget = Object.values(targetWeights).reduce((s, w) => s + w, 0);
  const remaining = Math.max(0, 1 - sumTarget);
  if (remaining > 0.05) {
    rationale.push(`남은 ${(remaining * 100).toFixed(0)}%는 저변동성 자산으로 재배치 (원칙 5: 손실 종목 물타기 금지)`);
    targetWeights["_REINVEST_CORE"] = remaining * 0.6; // 60% 코어
    targetWeights["_REINVEST_DEFENSIVE"] = remaining * 0.4; // 40% 방어
  }

  return { targetWeights, rationale };
}

// 전략 2: 균등 비중
function targetEqualWeight(positions: Position[]): { targetWeights: Record<string, number>; rationale: string[] } {
  const n = positions.length;
  const targetWeights: Record<string, number> = {};
  const equalWeight = 1 / n;
  positions.forEach(p => { targetWeights[p.symbol] = equalWeight; });
  return {
    targetWeights,
    rationale: [`${n}개 종목 균등 비중 ${(equalWeight * 100).toFixed(1)}%`],
  };
}

// 전략 3: 보수적 복구 (손실 종목 비중 축소 + 저변동성 대폭 편입)
function targetConservativeRecovery(positions: Position[]): { targetWeights: Record<string, number>; rationale: string[] } {
  const targetWeights: Record<string, number> = {};
  const rationale: string[] = [];

  // 레버리지 ETF는 전부 10%로 축소
  // 본주는 현재 비중의 0.7배로
  // 나머지 대부분은 재투자

  let currentAllocated = 0;
  positions.forEach(p => {
    let target: number;
    if (p.leverage > 1) {
      target = Math.min(p.weight * 0.3, 0.05); // 레버리지는 각 최대 5%
      if (p.weight > 0.05) rationale.push(`${p.symbol} 레버리지 ${(p.weight * 100).toFixed(0)}% → 5% (대폭 축소)`);
    } else {
      target = p.weight * 0.7;
      if (p.weight > 0.15) rationale.push(`${p.symbol} 본주 ${(p.weight * 100).toFixed(0)}% → ${(target * 100).toFixed(0)}% (소폭 축소)`);
    }
    targetWeights[p.symbol] = target;
    currentAllocated += target;
  });

  const remaining = Math.max(0, 1 - currentAllocated);
  targetWeights["_REINVEST_CORE"] = remaining * 0.5;
  targetWeights["_REINVEST_DEFENSIVE"] = remaining * 0.3;
  targetWeights["_REINVEST_CASH"] = remaining * 0.2;
  rationale.push(`재투자 ${(remaining * 100).toFixed(0)}%: 코어 50% + 방어 30% + 현금성 20%`);

  return { targetWeights, rationale };
}

// 격차 분석 → 매수/매도 액션
function buildActions(
  positions: Position[],
  targetWeights: Record<string, number>,
  totalValue: number,
  regimeHint?: string
): any[] {
  const actions: any[] = [];

  // 매도 액션
  positions.forEach(p => {
    const target = targetWeights[p.symbol] ?? 0;
    const targetValue = target * totalValue;
    const diff = p.marketValue - targetValue;
    if (diff > totalValue * 0.01) { // 1% 이상 차이
      const sellShares = Math.floor(diff / p.currentPrice);
      if (sellShares > 0) {
        actions.push({
          type: "SELL",
          symbol: p.symbol,
          currentWeight: p.weight,
          targetWeight: target,
          currentShares: p.shares,
          sellShares,
          sellValue: sellShares * p.currentPrice,
          currentPrice: p.currentPrice,
          reason: p.leverage > 1 ? `레버리지 ${p.leverage}x 비중 축소` : "목표 비중 초과",
          priority: p.leverage > 1 ? "high" : "medium",
        });
      }
    }
  });

  // 매수 액션 (재투자)
  const reinvestCore = targetWeights["_REINVEST_CORE"] ?? 0;
  const reinvestDefensive = targetWeights["_REINVEST_DEFENSIVE"] ?? 0;
  const reinvestCash = targetWeights["_REINVEST_CASH"] ?? 0;

  if (reinvestCore > 0) {
    const coreValue = reinvestCore * totalValue;
    const candidate = REINVESTMENT_CANDIDATES.find(c => c.tier === "core" && c.koreanFriendly);
    if (candidate) {
      actions.push({
        type: "BUY",
        symbol: candidate.symbol,
        description: candidate.description,
        targetValue: coreValue,
        targetWeight: reinvestCore,
        category: "core",
        reason: "광범위 분산 코어 포지션",
        priority: "high",
      });
    }
  }

  if (reinvestDefensive > 0) {
    const defValue = reinvestDefensive * totalValue;
    const candidate = REINVESTMENT_CANDIDATES.find(c => c.tier === "defensive");
    if (candidate) {
      actions.push({
        type: "BUY",
        symbol: candidate.symbol,
        description: candidate.description,
        targetValue: defValue,
        targetWeight: reinvestDefensive,
        category: "defensive",
        reason: "저변동성 방어 포지션",
        priority: "medium",
      });
    }
  }

  if (reinvestCash > 0) {
    const cashValue = reinvestCash * totalValue;
    const candidate = REINVESTMENT_CANDIDATES.find(c => c.tier === "cash");
    if (candidate) {
      actions.push({
        type: "BUY",
        symbol: candidate.symbol,
        description: candidate.description,
        targetValue: cashValue,
        targetWeight: reinvestCash,
        category: "cash",
        reason: "현금성 자산 (기회 대기)",
        priority: "low",
      });
    }
  }

  // 매수 매도 매칭 — 순서 최적화
  actions.sort((a, b) => {
    // 매도 먼저, 매수 나중
    if (a.type !== b.type) return a.type === "SELL" ? -1 : 1;
    // 같은 타입이면 우선순위
    const priOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return priOrder[a.priority] - priOrder[b.priority];
  });

  return actions;
}

// 전후 비교 예측
function compareBeforeAfter(positions: Position[], actions: any[], totalValue: number): {
  before: { leverageRatio: number; concentration: number; leveragedValue: number };
  after: { leverageRatio: number; concentration: number; leveragedValue: number };
} {
  // 현재
  const before = {
    leverageRatio: positions.filter(p => p.leverage > 1).reduce((s, p) => s + p.weight, 0),
    concentration: Math.max(...positions.map(p => p.weight)),
    leveragedValue: positions.filter(p => p.leverage > 1).reduce((s, p) => s + p.marketValue, 0),
  };

  // After (간략 추정)
  const sellMap = new Map<string, number>();
  actions.filter(a => a.type === "SELL").forEach(a => {
    sellMap.set(a.symbol, (sellMap.get(a.symbol) ?? 0) + a.sellValue);
  });

  let afterLevValue = 0;
  let afterTotal = 0;
  const afterWeights: number[] = [];
  positions.forEach(p => {
    const newValue = p.marketValue - (sellMap.get(p.symbol) ?? 0);
    if (newValue > 0) {
      afterTotal += newValue;
      if (p.leverage > 1) afterLevValue += newValue;
    }
  });
  // 재투자 금액 추가
  actions.filter(a => a.type === "BUY").forEach(a => {
    afterTotal += a.targetValue;
  });
  positions.forEach(p => {
    const newValue = p.marketValue - (sellMap.get(p.symbol) ?? 0);
    if (newValue > 0 && afterTotal > 0) afterWeights.push(newValue / afterTotal);
  });
  actions.filter(a => a.type === "BUY").forEach(a => {
    if (afterTotal > 0) afterWeights.push(a.targetValue / afterTotal);
  });

  const after = {
    leverageRatio: afterTotal === 0 ? 0 : afterLevValue / afterTotal,
    concentration: afterWeights.length === 0 ? 0 : Math.max(...afterWeights),
    leveragedValue: afterLevValue,
  };

  return { before, after };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const strategy = searchParams.get("strategy") ?? "kyle_principles";

    const { positions } = await fetchPortfolio();
    if (positions.length === 0) {
      return NextResponse.json({ success: true, empty: true });
    }

    const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);

    let result;
    if (strategy === "equal_weight") {
      result = targetEqualWeight(positions);
    } else if (strategy === "conservative_recovery") {
      result = targetConservativeRecovery(positions);
    } else {
      result = targetKylePrinciples(positions);
    }

    const actions = buildActions(positions, result.targetWeights, totalValue);
    const beforeAfter = compareBeforeAfter(positions, actions, totalValue);

    // 실행 플랜 (단계별)
    const sellActions = actions.filter(a => a.type === "SELL");
    const buyActions = actions.filter(a => a.type === "BUY");
    const totalCashFromSells = sellActions.reduce((s, a) => s + a.sellValue, 0);
    const totalBuyAmount = buyActions.reduce((s, a) => s + a.targetValue, 0);

    const executionPlan = {
      phase1_sell: {
        title: "1단계: 매도 실행",
        actions: sellActions,
        totalCash: totalCashFromSells,
        timing: "즉시 실행 가능한 종목부터",
      },
      phase2_wait: {
        title: "2단계: 현금 대기 (1~3일)",
        description: "매도 체결 확인 + 시장 안정 대기",
        duration: "1~3 영업일",
      },
      phase3_buy: {
        title: "3단계: 재투자 실행",
        actions: buyActions,
        totalBuy: totalBuyAmount,
        timing: "분할 매수 권장 (3일 분할)",
      },
    };

    // 종합 요약
    const summary = {
      strategy,
      currentLeverage: `${(beforeAfter.before.leverageRatio * 100).toFixed(1)}%`,
      targetLeverage: `${(beforeAfter.after.leverageRatio * 100).toFixed(1)}%`,
      leverageReduction: `${((beforeAfter.before.leverageRatio - beforeAfter.after.leverageRatio) * 100).toFixed(1)}%p`,
      currentConcentration: `${(beforeAfter.before.concentration * 100).toFixed(1)}%`,
      targetConcentration: `${(beforeAfter.after.concentration * 100).toFixed(1)}%`,
      totalActions: actions.length,
      estimatedExecutionDays: 3 + Math.ceil(buyActions.length / 2),
    };

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      strategy,
      positions: positions.map(p => ({
        ...p,
        targetWeight: result.targetWeights[p.symbol] ?? 0,
        gap: (result.targetWeights[p.symbol] ?? 0) - p.weight,
      })),
      rationale: result.rationale,
      actions,
      executionPlan,
      beforeAfter,
      summary,
      candidates: REINVESTMENT_CANDIDATES,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true }, { status: 200 });
  }
}
