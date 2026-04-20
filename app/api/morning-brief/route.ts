import { NextResponse } from "next/server";

export const revalidate = 300; // 5분
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Morning Executive Brief API
// 
// 카일님이 아침에 3분 안에 오늘 전체를 파악할 수 있도록
// 모든 데이터를 딱 필요한 만큼만 압축:
//   - 포트폴리오 한 줄 요약
//   - 오늘의 TOP 3 액션
//   - 시장 TLDR
//   - D-Day 체크
//   - 환율 체크
// ═══════════════════════════════════════════════════════════

async function fetchInternal(path: string, req?: Request): Promise<any> {
  try {
    let baseUrl = "";
    if (req) {
      const host = req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      baseUrl = host ? `${proto}://${host}` : "";
    }
    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    }
    if (!baseUrl) baseUrl = "http://localhost:3000";
    
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    // 모든 데이터 병렬 수집
    const [portfolio, posGuide, korea, news, calendar, earnings] = await Promise.all([
      fetchInternal("/api/portfolio", req),
      fetchInternal("/api/position-guide", req),
      fetchInternal("/api/korea-lens", req),
      fetchInternal("/api/news-sentiment", req),
      fetchInternal("/api/economic-calendar", req),
      fetchInternal("/api/earnings-monitor", req),
    ]);

    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const dayName = ["일", "월", "화", "수", "목", "금", "토"][today.getDay()];

    // ─────────────────────────────────────────────
    // 1. 포트폴리오 한 줄 요약
    // ─────────────────────────────────────────────
    const holdings = portfolio?.holdings ?? [];
    const totalValue = portfolio?.summary?.totalValue ?? 0;
    const totalGainPct = portfolio?.summary?.totalGainPct ?? 0;
    
    // 대박 종목 찾기
    const bigWinner = holdings.find((h: any) => h.gainPct > 50);
    
    const portfolioHeadline = `💼 $${totalValue.toFixed(0)} (${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(2)}%)` +
      (bigWinner ? ` · 💎 ${bigWinner.symbol} +${bigWinner.gainPct.toFixed(0)}%` : "");

    // 환차익
    const fxImpact = korea?.portfolioAnalysis?.fxImpactKrw ?? 0;
    const fxSign = korea?.portfolioAnalysis?.fxImpact === "positive" ? "+" : korea?.portfolioAnalysis?.fxImpact === "negative" ? "-" : "";
    const fxHeadline = fxImpact > 0 
      ? `💱 환차익 ${fxSign}₩${fxImpact.toLocaleString()} (${(korea?.portfolioAnalysis?.fxImpactPct ?? 0).toFixed(1)}%)`
      : "";

    // ─────────────────────────────────────────────
    // 2. 오늘의 TOP 3 액션 (우선순위순)
    // ─────────────────────────────────────────────
    const top3Actions: Array<{ icon: string; title: string; action: string; urgency: string }> = [];
    
    const guides = posGuide?.guides ?? [];
    for (const g of guides.slice(0, 3)) {
      top3Actions.push({
        icon: g.icon,
        title: g.title,
        action: g.action,
        urgency: g.urgency,
      });
    }

    // ─────────────────────────────────────────────
    // 3. 시장 TLDR
    // ─────────────────────────────────────────────
    const vix = posGuide?.contextSummary?.vix;
    const tnx = posGuide?.contextSummary?.tnx;
    const krw = posGuide?.contextSummary?.krw;
    const newsScore = news?.avgScore ?? 0;
    const sentiment = news?.overallSentiment ?? "neutral";
    
    const marketMood = 
      vix && vix > 25 ? "😱 공포" :
      vix && vix < 13 ? "😴 과열" :
      sentiment === "bullish" ? "🟢 강세" :
      sentiment === "bearish" ? "🔴 약세" :
      "😐 평상";
    
    const marketTldr = `${marketMood} · VIX ${vix?.toFixed(1) ?? "-"} · 10Y ${tnx?.toFixed(2) ?? "-"}%`;

    // 고영향 뉴스 3개
    const bigNews: Array<{ symbol: string; title: string; score: number; sentiment: string }> = [];
    for (const n of (news?.highImpact ?? []).slice(0, 3)) {
      bigNews.push({
        symbol: n.symbol,
        title: n.title?.slice(0, 80) ?? "",
        score: n.score,
        sentiment: n.sentiment,
      });
    }

    // ─────────────────────────────────────────────
    // 4. D-Day 이벤트
    // ─────────────────────────────────────────────
    const urgentEvents: Array<{ title: string; daysUntil: number; importance: number; impact: string }> = [];
    for (const e of (calendar?.allEvents ?? [])) {
      if (e.daysUntil >= 0 && e.daysUntil <= 5 && e.importance >= 4) {
        urgentEvents.push({
          title: e.title,
          daysUntil: e.daysUntil,
          importance: e.importance,
          impact: e.expectedImpact?.slice(0, 60) ?? "",
        });
      }
    }

    // ─────────────────────────────────────────────
    // 5. 이번 주 실적
    // ─────────────────────────────────────────────
    const thisWeekEarnings: Array<{ symbol: string; daysUntil: number; impact: string }> = [];
    for (const w of (earnings?.thisWeek ?? []).slice(0, 5)) {
      thisWeekEarnings.push({
        symbol: w.symbol,
        daysUntil: w.daysUntil,
        impact: w.portfolioImpact,
      });
    }

    // ─────────────────────────────────────────────
    // 6. 한 줄 결론
    // ─────────────────────────────────────────────
    let conclusion = "";
    const hasImmediate = guides.filter((g: any) => g.urgency === "immediate").length > 0;
    const hasTodayAction = guides.filter((g: any) => g.urgency === "today").length > 0;
    
    if (hasImmediate) {
      conclusion = `🚨 즉시 대응 필요 - Position Guide 확인하고 주문 실행`;
    } else if (hasTodayAction) {
      conclusion = `⚡ 오늘 내 대응 권장 - Order Slip에서 주문 복사`;
    } else if (urgentEvents.length > 0) {
      conclusion = `⏰ ${urgentEvents.length}건 이벤트 대기 중 - Weekly Strategy에서 시나리오 확인`;
    } else {
      conclusion = `✅ 평상 유지 - 정기 모니터링만 진행`;
    }

    // ─────────────────────────────────────────────
    // 7. 카일님 맞춤 조언
    // ─────────────────────────────────────────────
    const personalizedTips: string[] = [];
    
    if (bigWinner) {
      personalizedTips.push(`💎 ${bigWinner.symbol} +${bigWinner.gainPct.toFixed(0)}% - 일부 차익실현 Order Slip #1 확인`);
    }
    if (holdings.length <= 2) {
      personalizedTips.push(`🎯 2종목 집중 - 3-5종목으로 분산 권장`);
    }
    if (fxImpact > 100000) {
      personalizedTips.push(`💱 환차익 ${fxSign}₩${fxImpact.toLocaleString()} - Korea Lens에서 환전 실익 확인`);
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      date: dateStr,
      dayName,
      
      // 한 줄 상태
      portfolioHeadline,
      fxHeadline,
      marketTldr,
      conclusion,
      
      // TOP 3 액션
      top3Actions,
      
      // 뉴스/이벤트
      bigNews,
      urgentEvents,
      thisWeekEarnings,
      
      // 맞춤 조언
      personalizedTips,
      
      // 원시 데이터 (UI에서 활용)
      rawData: {
        totalValue,
        totalGainPct,
        holdingsCount: holdings.length,
        vix,
        tnx,
        krw,
        newsScore,
        sentiment,
        fxImpact: korea?.portfolioAnalysis?.fxImpactKrw ?? null,
        fxImpactPct: korea?.portfolioAnalysis?.fxImpactPct ?? null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      portfolioHeadline: "",
      fxHeadline: "",
      marketTldr: "",
      conclusion: "데이터 수집 중...",
      top3Actions: [],
      bigNews: [],
      urgentEvents: [],
      thisWeekEarnings: [],
      personalizedTips: [],
      rawData: {},
    });
  }
}
