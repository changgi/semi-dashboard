import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Trade Ideas API
// 
// 지금 바로 실행 가능한 매매 아이디어 3-5개 생성:
// 여러 소스를 통합하여 TOP 액션 추출
// - 포트 진단 (P1 액션)
// - 기회 탐지 (TOP 시그널)
// - 복구 경로 (AI 추천 전략의 매매)
// - 실적 임박 포지션
// 
// 각 아이디어는 "BUY/SELL + 심볼 + 주수/금액 + 이유 + 예상 효과"
// ═══════════════════════════════════════════════════════════

interface TradeIdea {
  id: string;
  action: "BUY" | "SELL";
  symbol: string;
  name: string;
  shares?: number;
  estimatedAmount: number;
  currentPrice: number;
  source: "diagnosis" | "opportunity" | "recovery" | "earnings";
  sourceLabel: string;
  urgency: "today" | "this_week" | "next_week";
  urgencyLabel: string;
  confidence: number;  // 0-100
  reasoning: string;
  expectedImpact: string;
  risks: string[];
  rank: number;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    
    // 내부 API들 호출 (병렬)
    const [diagRes, oppRes, recRes] = await Promise.all([
      fetch(new URL("/api/portfolio-diagnosis", req.url)),
      fetch(new URL("/api/opportunities?mode=recovery&limit=10", req.url)),
      fetch(new URL("/api/recovery-path", req.url)),
    ]);
    
    const diagnosis = await diagRes.json();
    const opportunities = await oppRes.json();
    const recovery = await recRes.json();
    
    const ideas: TradeIdea[] = [];
    let idCounter = 1;
    
    // ─────────────────────────────────────────────
    // 1. 진단 P1 액션들 → SELL 아이디어
    // ─────────────────────────────────────────────
    if (diagnosis.success && diagnosis.actions) {
      for (const action of diagnosis.actions.slice(0, 2)) {
        if (action.actionType === "sell_full" || action.actionType === "sell_partial") {
          const pos = diagnosis.positions.find((p: any) => p.symbol === action.symbol);
          if (!pos) continue;
          
          const urgencyMap: Record<string, { label: string; color: string }> = {
            today: { label: "🚨 오늘", color: "#ff3860" },
            this_week: { label: "⚠️ 이번주", color: "#ffd93d" },
            next_week: { label: "📅 다음주", color: "#7ec8ff" },
          };
          const urgency = urgencyMap[action.urgency] ?? urgencyMap["this_week"];
          
          ideas.push({
            id: `D${idCounter++}`,
            action: "SELL",
            symbol: action.symbol,
            name: pos.name,
            shares: action.shares,
            estimatedAmount: action.expectedCashUsd ?? 0,
            currentPrice: pos.currentPrice,
            source: "diagnosis",
            sourceLabel: "🩺 포트 진단",
            urgency: action.urgency,
            urgencyLabel: urgency.label,
            confidence: action.priority === 1 ? 90 : action.priority === 2 ? 75 : 60,
            reasoning: action.reasoning,
            expectedImpact: `리스크 축소 + $${action.expectedCashUsd?.toFixed(0) ?? 0} 현금 확보`,
            risks: [
              action.lossRealized !== undefined && action.lossRealized < 0 
                ? `손실 확정 $${Math.abs(action.lossRealized).toFixed(0)}` 
                : "확정 손익 발생",
              "반등 시 수익 기회 포기",
            ],
            rank: action.priority,
          });
        }
      }
    }
    
    // ─────────────────────────────────────────────
    // 2. 기회 탐지 TOP 3 → BUY 아이디어 (미보유만)
    // ─────────────────────────────────────────────
    if (opportunities.success && opportunities.opportunities) {
      const topOpps = opportunities.opportunities
        .filter((o: any) => !o.inPortfolio && o.totalScore >= 55)
        .slice(0, 3);
      
      for (const opp of topOpps) {
        const topSignal = opp.signals[0];
        const urgency = topSignal.type === "breakout" || topSignal.type === "pre_earnings" ? "today"
                      : topSignal.type === "momentum" ? "this_week"
                      : "next_week";
        
        const urgencyMap: Record<string, string> = {
          today: "🚨 오늘",
          this_week: "⚠️ 이번주",
          next_week: "📅 다음주",
        };
        
        // 매수 금액: 현재 총 포트의 5-10% 권장
        const totalPortValue = diagnosis.summary?.totalValueUsd ?? 10000;
        const suggestedAmount = Math.round(totalPortValue * 0.06);  // 6%
        const suggestedShares = Math.floor(suggestedAmount / opp.currentPrice);
        
        ideas.push({
          id: `O${idCounter++}`,
          action: "BUY",
          symbol: opp.symbol,
          name: opp.name,
          shares: suggestedShares,
          estimatedAmount: suggestedShares * opp.currentPrice,
          currentPrice: opp.currentPrice,
          source: "opportunity",
          sourceLabel: "🎯 기회 탐지",
          urgency,
          urgencyLabel: urgencyMap[urgency],
          confidence: Math.min(85, opp.totalScore),
          reasoning: `${opp.recommendation}. ${topSignal.description}. 스코어 ${opp.totalScore}/100, 52주 고가 대비 -${opp.distanceFromHigh.toFixed(1)}%.`,
          expectedImpact: opp.riskLevel === "low" ? "안정적 수익 기대 (변동성 낮음)"
                        : opp.riskLevel === "medium" ? "중간 위험 · 중간 수익 기대"
                        : "고변동성 · 고수익 가능성",
          risks: [
            `변동성 ${opp.volatility30d}% (${opp.riskLevel})`,
            `RSI ${opp.rsi14} ${opp.rsi14 > 70 ? "과매수 주의" : opp.rsi14 < 30 ? "과매도" : "중립"}`,
            opp.priceChange5d > 15 ? `5일 +${opp.priceChange5d.toFixed(1)}% 급등 → 단기 조정 가능` : "",
          ].filter(Boolean) as string[],
          rank: 3,
        });
      }
    }
    
    // ─────────────────────────────────────────────
    // 3. 복구 경로 AI 추천 → 핵심 매매
    // ─────────────────────────────────────────────
    if (recovery.success && recovery.recommendedPath && recovery.paths) {
      const recommended = recovery.paths.find((p: any) => p.strategy === recovery.recommendedPath);
      if (recommended?.keyTrades) {
        for (const trade of recommended.keyTrades.slice(0, 2)) {
          // 진단에서 이미 처리된 매도는 스킵
          if (trade.action === "SELL" && ideas.some(i => i.symbol === trade.symbol && i.action === "SELL")) {
            continue;
          }
          
          ideas.push({
            id: `R${idCounter++}`,
            action: trade.action as "BUY" | "SELL",
            symbol: trade.symbol,
            name: trade.name,
            shares: trade.shares,
            estimatedAmount: trade.estimatedAmount ?? trade.estimatedCash ?? 0,
            currentPrice: trade.shares ? (trade.estimatedCash ?? trade.estimatedAmount ?? 0) / (trade.shares || 1) : 0,
            source: "recovery",
            sourceLabel: `🔄 복구 (${recommended.nameShort})`,
            urgency: "this_week",
            urgencyLabel: "⚠️ 이번주",
            confidence: recommended.successProbability,
            reasoning: trade.rationale,
            expectedImpact: `${recommended.name.replace(/^.\s*PATH \d · /, "")} 전략 실행 · 예상 회복 ${recommended.estimatedMonths}개월`,
            risks: recommended.cons.slice(0, 2),
            rank: 2,
          });
        }
      }
    }
    
    // ─────────────────────────────────────────────
    // 정렬: rank → confidence → urgency
    // ─────────────────────────────────────────────
    const urgencyOrder: Record<string, number> = { today: 0, this_week: 1, next_week: 2 };
    ideas.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.urgency !== b.urgency) return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      return b.confidence - a.confidence;
    });
    
    // 중복 심볼 제거 (같은 심볼의 가장 우선 아이디어만 유지)
    const seen = new Set<string>();
    const deduped = ideas.filter(i => {
      const key = `${i.symbol}:${i.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    // ─────────────────────────────────────────────
    // 종합 요약
    // ─────────────────────────────────────────────
    const topIdeas = deduped.slice(0, 5);
    const sellCount = topIdeas.filter(i => i.action === "SELL").length;
    const buyCount = topIdeas.filter(i => i.action === "BUY").length;
    const totalSellCash = topIdeas.filter(i => i.action === "SELL").reduce((s, i) => s + i.estimatedAmount, 0);
    const totalBuyCost = topIdeas.filter(i => i.action === "BUY").reduce((s, i) => s + i.estimatedAmount, 0);
    const netCashFlow = totalSellCash - totalBuyCost;
    
    // 오늘 당장 해야할 것
    const todayIdeas = topIdeas.filter(i => i.urgency === "today");
    const thisWeekIdeas = topIdeas.filter(i => i.urgency === "this_week");
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalIdeas: topIdeas.length,
        sellCount,
        buyCount,
        todayCount: todayIdeas.length,
        thisWeekCount: thisWeekIdeas.length,
        totalSellCash: Math.round(totalSellCash),
        totalBuyCost: Math.round(totalBuyCost),
        netCashFlow: Math.round(netCashFlow),
      },
      ideas: topIdeas,
      executionSummary: todayIdeas.length > 0 
        ? `🚨 오늘 ${todayIdeas.length}건 긴급 실행 필요` 
        : thisWeekIdeas.length > 0
        ? `⚠️ 이번주 ${thisWeekIdeas.length}건 실행 권장`
        : "📅 여유를 가지고 검토 가능",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      ideas: [],
    });
  }
}
