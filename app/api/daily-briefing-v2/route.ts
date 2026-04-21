import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Daily Briefing API
// 
// "오늘 5분 안에 다 파악"
// 
// 모든 시스템 분석을 하나의 간결한 브리핑으로:
// 1. 오늘의 한 마디 (Market Mood)
// 2. 포트 건강도 (한 숫자)
// 3. 오늘 반드시 해야 할 일 3개
// 4. 시장의 핵심 이벤트 3개
// 5. 관심 종목 오늘의 반응
// ═══════════════════════════════════════════════════════════

interface DailyBriefing {
  generatedAt: string;
  marketMood: {
    mood: "bullish" | "bearish" | "neutral" | "volatile" | "transition";
    label: string;
    emoji: string;
    reasoning: string;
  };
  portfolio: {
    healthScore: number;
    healthGrade: string;
    totalValueUsd: number;
    totalGainPct: number;
    dayChangeUsd: number;
    topWinnerToday: { symbol: string; name: string; changePct: number } | null;
    topLoserToday: { symbol: string; name: string; changePct: number } | null;
    urgentAlert: string | null;
  };
  todayActions: Array<{
    rank: number;
    action: "BUY" | "SELL" | "WATCH";
    symbol: string;
    name: string;
    reason: string;
    urgency: string;
    confidence: number;
  }>;
  marketEvents: Array<{
    type: "earnings" | "macro" | "news";
    date: string;
    daysUntil: number;
    title: string;
    impact: "high" | "medium" | "low";
    affectsPortfolio: boolean;
  }>;
  watchlist: Array<{
    symbol: string;
    name: string;
    currentPrice: number;
    dayChangePct: number;
    sentiment: "up" | "down" | "flat";
  }>;
  advice: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    
    // 1. 포트폴리오 진단 + 매매 아이디어 (내부 API)
    const [diagRes, ideasRes] = await Promise.all([
      fetch(new URL("/api/portfolio-diagnosis", req.url)),
      fetch(new URL("/api/trade-ideas", req.url)),
    ]);
    const diagnosis = await diagRes.json();
    const ideas = await ideasRes.json();
    
    // 2. 매크로 지표 로드
    const macroQuotes = await fetchYahooQuotes(["^VIX", "^TNX", "SPY", "QQQ", "KRW=X"]);
    const vix = macroQuotes.get("^VIX")?.price ?? 0;
    const spy = macroQuotes.get("SPY")?.price ?? 0;
    const spyChange = macroQuotes.get("SPY")?.changePct ?? 0;
    const qqqChange = macroQuotes.get("QQQ")?.changePct ?? 0;
    
    // 3. 시장 무드 판정
    let marketMood: DailyBriefing["marketMood"];
    if (vix > 30) {
      marketMood = {
        mood: "volatile",
        label: "극도 변동성",
        emoji: "⚡",
        reasoning: `VIX ${vix.toFixed(1)} · 시장 공포 상승. 신규 진입 신중, 기존 포지션 헷지 고려.`,
      };
    } else if (vix > 22 && spyChange < -1) {
      marketMood = {
        mood: "bearish",
        label: "약세 흐름",
        emoji: "🐻",
        reasoning: `VIX ${vix.toFixed(1)} · S&P 전일 ${spyChange.toFixed(2)}%. 리스크 관리 최우선.`,
      };
    } else if (vix < 15 && spyChange > 0.5) {
      marketMood = {
        mood: "bullish",
        label: "강세 흐름",
        emoji: "🐂",
        reasoning: `VIX ${vix.toFixed(1)} · S&P +${spyChange.toFixed(2)}%. 리스크 선호 환경, 성장주 유리.`,
      };
    } else if (Math.abs(spyChange) > 1.5 || Math.abs(qqqChange) > 2) {
      marketMood = {
        mood: "volatile",
        label: "방향성 탐색",
        emoji: "🌀",
        reasoning: `S&P ${spyChange.toFixed(2)}%, NDX ${qqqChange.toFixed(2)}%. 큰 움직임, 방향 설정 중.`,
      };
    } else if (vix > 18 && vix < 22) {
      marketMood = {
        mood: "transition",
        label: "전환 국면",
        emoji: "🔄",
        reasoning: `VIX ${vix.toFixed(1)} · 중간 영역. 실적 시즌 반응 살피며 점진적 포지션 조정.`,
      };
    } else {
      marketMood = {
        mood: "neutral",
        label: "중립 횡보",
        emoji: "⚖️",
        reasoning: `VIX ${vix.toFixed(1)} · S&P ${spyChange.toFixed(2)}%. 특별한 신호 없이 관망.`,
      };
    }
    
    // 4. 포트폴리오 요약
    const positions = diagnosis.positions ?? [];
    const winners = positions.filter((p: any) => (p.dayChangePct ?? 0) > 0)
      .sort((a: any, b: any) => b.dayChangePct - a.dayChangePct);
    const losers = positions.filter((p: any) => (p.dayChangePct ?? 0) < 0)
      .sort((a: any, b: any) => a.dayChangePct - b.dayChangePct);
    
    const dayChangeUsd = positions.reduce((sum: number, p: any) => {
      const prevValue = p.marketValueUsd / (1 + (p.dayChangePct ?? 0) / 100);
      return sum + (p.marketValueUsd - prevValue);
    }, 0);
    
    // 긴급 경고
    let urgentAlert: string | null = null;
    if (diagnosis.summary?.healthScore < 40) {
      urgentAlert = `🚨 건강 점수 ${diagnosis.summary.healthScore}/100 CRITICAL. 즉시 리스크 축소 필요`;
    } else if (diagnosis.concentration?.leveragePct > 70) {
      urgentAlert = `⚡ 레버리지 비중 ${diagnosis.concentration.leveragePct.toFixed(0)}% · 시간 감가 누적 중`;
    } else if (positions.some((p: any) => p.gainPct < -40)) {
      const worst = positions.find((p: any) => p.gainPct < -40);
      urgentAlert = `🔴 ${worst.symbol} ${worst.gainPct.toFixed(1)}% 큰 손실 · 판단 필요`;
    }
    
    // 5. 오늘 반드시 해야 할 일 (Trade Ideas 기반)
    const todayActions = (ideas.ideas ?? [])
      .filter((i: any) => i.urgency === "today" || (i.urgency === "this_week" && i.confidence >= 75))
      .slice(0, 3)
      .map((i: any, idx: number) => {
        const reasonText = i.reasoning ?? "";
        return {
          rank: idx + 1,
          action: i.action,
          symbol: i.symbol,
          name: i.name,
          reason: reasonText.substring(0, 100) + (reasonText.length > 100 ? "..." : ""),
          urgency: i.urgencyLabel ?? "",
          confidence: i.confidence ?? 50,
        };
      });
    
    // 6. 시장 이벤트 (다음 7일)
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    
    const { data: earnings } = await supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", today)
      .lte("earnings_date", nextWeek)
      .order("earnings_date", { ascending: true })
      .limit(10);
    
    const portfolioSymbols = new Set(positions.map((p: any) => p.symbol));
    const underlyingAssets = new Set(positions.map((p: any) => p.underlyingAsset));
    
    const marketEvents: DailyBriefing["marketEvents"] = (earnings ?? []).slice(0, 5).map(e => {
      const daysUntil = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
      const affectsPortfolio = portfolioSymbols.has(e.symbol) || underlyingAssets.has(e.symbol);
      return {
        type: "earnings" as const,
        date: e.earnings_date,
        daysUntil,
        title: `${e.symbol} ${e.company_name} 실적 (${e.timing})`,
        impact: e.importance >= 5 ? "high" as const : e.importance >= 3 ? "medium" as const : "low" as const,
        affectsPortfolio,
      };
    });
    
    // 7. 관심 종목 (포트 + 상위 기회)
    const watchlist = positions.slice(0, 5).map((p: any) => ({
      symbol: p.symbol,
      name: p.name,
      currentPrice: p.currentPrice,
      dayChangePct: p.dayChangePct ?? 0,
      sentiment: ((p.dayChangePct ?? 0) > 0.5 ? "up" : (p.dayChangePct ?? 0) < -0.5 ? "down" : "flat") as "up" | "down" | "flat",
    }));
    
    // 8. AI 종합 조언
    let advice = "";
    const leveragePct = diagnosis.concentration?.leveragePct ?? 0;
    const healthScore = diagnosis.summary?.healthScore ?? 100;
    const totalGainPct = diagnosis.summary?.totalGainPct ?? 0;
    
    if (healthScore < 50 && totalGainPct < -25) {
      advice = `포트가 심각한 손실 상태(${totalGainPct.toFixed(1)}%)입니다. 오늘은 ${todayActions.length > 0 ? '우선순위 1번 액션부터 실행' : '복구 경로 검토'}하고, 감정적 매매를 피하세요. 레버리지 ${leveragePct.toFixed(0)}% 비중 축소가 핵심입니다.`;
    } else if (marketMood.mood === "volatile") {
      advice = `변동성 높은 시장(${marketMood.label})입니다. 신규 대형 포지션보다 기존 포지션 관리와 리스크 조정에 집중하세요. ${todayActions.filter((a: any) => a.action === "SELL").length > 0 ? '매도 액션부터 우선 처리' : '현재 포지션 점검'}을 권장합니다.`;
    } else if (marketMood.mood === "bullish" && healthScore > 60) {
      advice = `양호한 환경(${marketMood.label})에서 건강한 포트를 유지하고 있습니다. 기회 탐지기의 상위 종목 검토를 통해 수익 확대 기회를 노려볼 수 있습니다.`;
    } else if (todayActions.length === 0) {
      advice = `오늘은 특별한 긴급 액션이 없습니다. 포지션 점검과 시장 관찰에 집중하세요. ${marketEvents.length > 0 ? `${marketEvents[0].daysUntil}일 후 ${marketEvents[0].title}` : '다음 이벤트 대비'}를 염두에 두세요.`;
    } else {
      advice = `${todayActions.length}건의 실행 아이디어가 있습니다. 신뢰도 높은 것부터 하나씩 판단하시고, 확신이 없으면 시뮬레이터로 시나리오를 먼저 돌려보세요.`;
    }
    
    const briefing: DailyBriefing = {
      generatedAt: new Date().toISOString(),
      marketMood,
      portfolio: {
        healthScore: diagnosis.summary?.healthScore ?? 0,
        healthGrade: diagnosis.summary?.healthGrade ?? "unknown",
        totalValueUsd: diagnosis.summary?.totalValueUsd ?? 0,
        totalGainPct: diagnosis.summary?.totalGainPct ?? 0,
        dayChangeUsd: Math.round(dayChangeUsd * 100) / 100,
        topWinnerToday: winners[0] ? {
          symbol: winners[0].symbol,
          name: winners[0].name,
          changePct: winners[0].dayChangePct,
        } : null,
        topLoserToday: losers[0] ? {
          symbol: losers[0].symbol,
          name: losers[0].name,
          changePct: losers[0].dayChangePct,
        } : null,
        urgentAlert,
      },
      todayActions,
      marketEvents,
      watchlist,
      advice,
    };
    
    return NextResponse.json({
      success: true,
      briefing,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
    });
  }
}
