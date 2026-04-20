import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 900;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Portfolio Rebalance Helper API
// 
// 카일님의 현재 집중된 포트폴리오를 분산하는 구체적 추천
//   1. 이상적 비중 제안 (5가지 시나리오)
//   2. 각 자산의 역할
//   3. 추가 매수 금액
//   4. 예상 리스크 감소 효과
// ═══════════════════════════════════════════════════════════

interface RebalancePlan {
  planName: string;
  description: string;
  targetAllocations: Array<{
    symbol: string;
    name: string;
    targetPct: number;
    role: string;
    currentPct: number;
    actionNeeded: {
      type: "buy" | "sell" | "hold";
      amountUsd: number;
      amountKrw: number;
    };
  }>;
  expectedBenefits: string[];
  risks: string[];
  difficulty: "easy" | "medium" | "hard";
  totalCostKrw: number;
  riskReductionPct: number;
}

// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const supabase = createAdmin();
    
    // 1. 현재 포트폴리오
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    // 2. 관련 종목 시세
    const symbols = [...new Set((holdings ?? []).map((h: any) => h.symbol))];
    const recommendedSymbols = [
      "SMH", "SOXX",     // 반도체 ETF
      "QQQ",             // 나스닥
      "TLT",             // 장기 국채
      "GLD",             // 금
      "VYM",             // 배당주
      "XLU",             // 유틸리티
      "EFA",             // 해외 선진국
      "VWO",             // 신흥국
    ];
    
    const quotes = await fetchYahooQuotes([...symbols, ...recommendedSymbols, "KRW=X"]);
    const usdKrw = quotes.get("KRW=X")?.price ?? 1470;
    
    // 3. 현재 포트폴리오 가치 계산
    let totalValueKrw = 0;
    const currentPositions = (holdings ?? []).map((h: any) => {
      const q = quotes.get(h.symbol);
      const currentPrice = q?.price ?? h.avg_cost;
      const marketValue = currentPrice * h.shares;
      const marketValueKrw = h.currency === "KRW" ? marketValue : marketValue * usdKrw;
      totalValueKrw += marketValueKrw;
      return {
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        marketValueKrw,
      };
    });
    
    // 각 포지션의 현재 비중
    const currentAllocations = new Map<string, number>();
    for (const p of currentPositions) {
      const existing = currentAllocations.get(p.symbol) || 0;
      currentAllocations.set(p.symbol, existing + (p.marketValueKrw / totalValueKrw) * 100);
    }
    
    // 4. 리밸런스 플랜 생성
    const plans: RebalancePlan[] = [];
    
    // ─────────────────────────────────────────────
    // Plan A: 🎯 안정형 (채권 + 배당 추가)
    // ─────────────────────────────────────────────
    const planA_allocations = [
      { symbol: "360750.KS", name: "TIGER S&P500", targetPct: 60, role: "🌍 글로벌 대표 지수 (기존)" },
      { symbol: "TLT", name: "iShares 20+ 국채", targetPct: 15, role: "🛡️ 하락장 방어" },
      { symbol: "VYM", name: "Vanguard 배당주", targetPct: 15, role: "💰 안정적 현금흐름" },
      { symbol: "GLD", name: "SPDR 금", targetPct: 10, role: "🏆 인플레이션 헤지" },
    ];
    
    const planA = buildPlan(
      "🛡️ 안정형 (60/40 변형)",
      "위험자산 60%, 안전자산 40% - 변동성 최소화",
      planA_allocations,
      totalValueKrw,
      currentAllocations,
      usdKrw,
      quotes,
      [
        "🛡️ 주식 하락장에서 -10% 예상 (현재는 -20% 가능)",
        "💰 월 배당 수익 가능 (VYM)",
        "🏆 인플레이션 대응력",
      ],
      [
        "📉 상승장에서 수익 제한적",
        "💸 분산 매수 수수료 발생",
      ],
      "easy"
    );
    plans.push(planA);
    
    // ─────────────────────────────────────────────
    // Plan B: 🚀 성장형 (기술주 추가)
    // ─────────────────────────────────────────────
    const planB_allocations = [
      { symbol: "360750.KS", name: "TIGER S&P500", targetPct: 50, role: "🌍 핵심 포지션 (기존)" },
      { symbol: "QQQ", name: "Invesco 나스닥100", targetPct: 20, role: "🚀 성장주" },
      { symbol: "SMH", name: "반도체 ETF", targetPct: 15, role: "🔥 반도체 성장" },
      { symbol: "GLD", name: "SPDR 금", targetPct: 10, role: "🏆 리스크 헤지" },
      { symbol: "TLT", name: "장기 국채", targetPct: 5, role: "🛡️ 최소 방어" },
    ];
    
    const planB = buildPlan(
      "🚀 성장형 (공격적)",
      "기술주 집중 + 최소 헤지 - 상승 여력 극대화",
      planB_allocations,
      totalValueKrw,
      currentAllocations,
      usdKrw,
      quotes,
      [
        "🚀 AI/반도체 강세 시 +20% 가능",
        "📈 장기 수익률 최대화",
        "💎 TSM Beat로 반도체 낙관",
      ],
      [
        "📉 조정 시 -25% 가능성",
        "🎯 고 변동성 감당 필요",
        "🏛️ FOMC 등 이벤트 민감",
      ],
      "hard"
    );
    plans.push(planB);
    
    // ─────────────────────────────────────────────
    // Plan C: ⚖️ 균형형 (추천!)
    // ─────────────────────────────────────────────
    const planC_allocations = [
      { symbol: "360750.KS", name: "TIGER S&P500", targetPct: 50, role: "🌍 핵심 (기존)" },
      { symbol: "QQQ", name: "나스닥100", targetPct: 15, role: "🚀 기술 성장" },
      { symbol: "SMH", name: "반도체 ETF", targetPct: 10, role: "🔥 반도체 노출" },
      { symbol: "TLT", name: "장기 국채", targetPct: 10, role: "🛡️ 방어" },
      { symbol: "GLD", name: "금 ETF", targetPct: 10, role: "🏆 헤지" },
      { symbol: "VYM", name: "배당주", targetPct: 5, role: "💰 현금흐름" },
    ];
    
    const planC = buildPlan(
      "⚖️ 균형형 ★ 추천",
      "성장 70% + 방어 30% - 이번 주 이벤트 대비에 최적",
      planC_allocations,
      totalValueKrw,
      currentAllocations,
      usdKrw,
      quotes,
      [
        "⚖️ 상승/하락 모두 중간 수준 대응",
        "🎯 6개 종목 분산 = 개별 리스크 최소",
        "🌍 글로벌/기술/방어 모두 노출",
      ],
      [
        "📊 종목 6개 관리 필요",
        "💸 매수 수수료 발생",
      ],
      "medium"
    );
    plans.push(planC);
    
    // ─────────────────────────────────────────────
    // Plan D: 💰 수익 확정형 (차익실현 + 재배분)
    // ─────────────────────────────────────────────
    const planD_allocations = [
      { symbol: "360750.KS", name: "TIGER S&P500", targetPct: 40, role: "🌍 기존 (일부 매도)" },
      { symbol: "CASH", name: "현금/예금", targetPct: 20, role: "💰 기회 대기" },
      { symbol: "TLT", name: "장기 국채", targetPct: 15, role: "🛡️ 방어" },
      { symbol: "GLD", name: "금 ETF", targetPct: 10, role: "🏆 지정학 리스크" },
      { symbol: "VYM", name: "배당주", targetPct: 10, role: "💵 안정 배당" },
      { symbol: "SMH", name: "반도체", targetPct: 5, role: "🔥 소량 노출" },
    ];
    
    const planD = buildPlan(
      "💰 수익 확정형 (방어 우선)",
      "TIGER 일부 매도 + 현금 확보 - FOMC/실적 대비",
      planD_allocations,
      totalValueKrw,
      currentAllocations,
      usdKrw,
      quotes,
      [
        "💰 현금 20% - 급락 시 매수 총알",
        "🛡️ 하락장 충격 최소",
        "📉 조정 시 -5~-8% 제한",
      ],
      [
        "📉 상승장에서 기회 비용",
        "💸 세금 발생 (수익 실현)",
      ],
      "medium"
    );
    plans.push(planD);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      currentPortfolio: {
        totalValueKrw: Math.round(totalValueKrw),
        totalValueUsd: Math.round((totalValueKrw / usdKrw) * 100) / 100,
        positionCount: currentPositions.length,
        currentAllocations: Array.from(currentAllocations.entries()).map(([sym, pct]) => ({
          symbol: sym,
          allocationPct: Math.round(pct * 100) / 100,
        })),
      },
      plans,
      disclaimer: "💡 추천은 참고용. 실제 리밸런싱 전 세금/수수료/개인 상황 고려 필수",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      currentPortfolio: null,
      plans: [],
    });
  }
}

// ───────────────────────────────────────────────────────────
// 플랜 빌더
// ───────────────────────────────────────────────────────────
function buildPlan(
  name: string,
  description: string,
  allocations: Array<{ symbol: string; name: string; targetPct: number; role: string }>,
  totalValueKrw: number,
  currentAllocations: Map<string, number>,
  usdKrw: number,
  quotes: Map<string, any>,
  benefits: string[],
  risks: string[],
  difficulty: "easy" | "medium" | "hard"
): RebalancePlan {
  const targetAllocations = allocations.map(a => {
    const targetValueKrw = (totalValueKrw * a.targetPct) / 100;
    const currentPct = currentAllocations.get(a.symbol) || 0;
    const currentValueKrw = (totalValueKrw * currentPct) / 100;
    const diffKrw = targetValueKrw - currentValueKrw;
    
    const q = quotes.get(a.symbol);
    const priceUsd = q?.price ?? null;
    const priceKrw = priceUsd ? (a.symbol.includes(".KS") ? priceUsd : priceUsd * usdKrw) : 0;
    
    let actionType: "buy" | "sell" | "hold" = "hold";
    if (Math.abs(diffKrw) < 50000) actionType = "hold";
    else if (diffKrw > 0) actionType = "buy";
    else actionType = "sell";
    
    return {
      symbol: a.symbol,
      name: a.name,
      targetPct: a.targetPct,
      role: a.role,
      currentPct: Math.round(currentPct * 100) / 100,
      actionNeeded: {
        type: actionType,
        amountUsd: Math.round((Math.abs(diffKrw) / usdKrw) * 100) / 100,
        amountKrw: Math.round(Math.abs(diffKrw)),
      },
    };
  });
  
  const totalCostKrw = targetAllocations
    .filter(a => a.actionNeeded.type === "buy")
    .reduce((s, a) => s + a.actionNeeded.amountKrw, 0);
  
  // 리스크 감소 예측 (종목 수 대비)
  const posCount = allocations.length;
  const riskReductionPct = Math.min(60, posCount * 12); // 6종목 이상이면 60% 리스크 감소
  
  return {
    planName: name,
    description,
    targetAllocations,
    expectedBenefits: benefits,
    risks,
    difficulty,
    totalCostKrw,
    riskReductionPct,
  };
}
