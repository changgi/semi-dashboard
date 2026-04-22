import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Today's Focus API
// 
// 모든 분석을 종합하여 "오늘 딱 하나" 가장 중요한 포커스:
// - 1개 핵심 메시지
// - 1개 핵심 액션
// - 1개 핵심 경계
// - 1개 핵심 기회
// ═══════════════════════════════════════════════════════════

interface TodaysFocus {
  generatedAt: string;
  
  // 한 줄 메시지 
  headline: string;
  headlineEmoji: string;
  severity: "critical" | "action_needed" | "attention" | "calm";
  
  // 단 하나의 가장 중요한 액션
  primaryAction: {
    type: "execute" | "watch" | "wait" | "research";
    title: string;
    why: string;
    how: string;
    urgency: "today" | "this_week" | "monitor";
  };
  
  // 주의해야 할 한 가지
  watchOut: {
    what: string;
    impact: string;
  } | null;
  
  // 놓치면 안 될 기회 (있다면)
  opportunity: {
    symbol: string;
    why: string;
  } | null;
  
  // 컨텍스트 (숫자 3개)
  metrics: {
    portfolioHealth: number;
    lossPct: number;
    nextEventDaysUntil: number | null;
    nextEventTitle: string | null;
  };
}

export async function GET(req: NextRequest) {
  try {
    const baseUrl = new URL(req.url).origin;
    
    // 다른 API들 병렬 호출
    const [diagRes, ideasRes, alertsRes] = await Promise.all([
      fetch(`${baseUrl}/api/portfolio-diagnosis`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/trade-ideas`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/portfolio-alerts`).then(r => r.json()).catch(() => null),
    ]);
    
    if (!diagRes?.success) {
      return NextResponse.json({
        success: false,
        error: "포트 진단 실패",
      });
    }
    
    const summary = diagRes.summary;
    const actions = diagRes.actions ?? [];
    const ideas = ideasRes?.ideas ?? [];
    const alerts = alertsRes?.alerts ?? [];
    
    // ═════════════════════════════════════
    // Severity 결정 로직
    // ═════════════════════════════════════
    const hasTodayAction = ideas.some((i: any) => i.urgency === "today");
    const criticalAlerts = alerts.filter((a: any) => a.severity === "critical").length;
    const health = summary.healthScore;
    const loss = summary.totalGainPct;
    
    let severity: TodaysFocus["severity"];
    let headlineEmoji = "📊";
    let headline = "";
    
    if (health < 30 || loss < -30 || criticalAlerts >= 2) {
      severity = "critical";
      headlineEmoji = "🚨";
      headline = `CRITICAL · 포트 건강도 ${health}/100 · 즉시 리스크 축소 필요`;
    } else if (hasTodayAction) {
      const todayCount = ideas.filter((i: any) => i.urgency === "today").length;
      severity = "action_needed";
      headlineEmoji = "⚡";
      headline = `오늘 ${todayCount}건 긴급 실행 필요 · 최우선 액션 먼저`;
    } else if (criticalAlerts > 0) {
      severity = "attention";
      headlineEmoji = "⚠️";
      headline = `주의 · ${criticalAlerts}건 Critical 경보 · 점검 필요`;
    } else {
      severity = "calm";
      headlineEmoji = "✅";
      headline = `관망 · 현재 긴급 액션 없음 · 모니터링 유지`;
    }
    
    // ═════════════════════════════════════
    // Primary Action 결정 (단 하나!)
    // ═════════════════════════════════════
    let primaryAction: TodaysFocus["primaryAction"];
    
    // 1) 오늘 매도 액션 있으면 최우선
    const todaySellAction = ideas.find((i: any) => i.urgency === "today" && i.action === "SELL");
    if (todaySellAction) {
      primaryAction = {
        type: "execute",
        title: `${todaySellAction.symbol} ${todaySellAction.shares}주 매도`,
        why: todaySellAction.reasoning ?? "",
        how: `증권사 앱 → ${todaySellAction.symbol} → 매도 → 시장가 → 체결 후 Journal 기록`,
        urgency: "today",
      };
    }
    // 2) P1 진단 액션
    else if (actions.length > 0 && actions[0].priority === 1) {
      primaryAction = {
        type: "execute",
        title: actions[0].title,
        why: actions[0].reasoning,
        how: "포트 진단 패널 상세 확인 후 실행",
        urgency: actions[0].urgency === "today" ? "today" : "this_week",
      };
    }
    // 3) 이번주 BUY 아이디어 (기회)
    else {
      const weekBuyAction = ideas.find((i: any) => i.urgency === "this_week" && i.action === "BUY");
      if (weekBuyAction) {
        primaryAction = {
          type: "research",
          title: `${weekBuyAction.symbol} 매수 검토`,
          why: weekBuyAction.reasoning ?? "",
          how: "종목 분석 패널에서 심층 평가 → 적정 시점 판단",
          urgency: "this_week",
        };
      } else {
        primaryAction = {
          type: "wait",
          title: "포지션 점검 + 관찰",
          why: "현재 긴급한 매매 액션 없음. 시장 변화 모니터링 집중.",
          how: "Market Pulse + 실적 D-day 주시",
          urgency: "monitor",
        };
      }
    }
    
    // ═════════════════════════════════════
    // Watch Out (경계 사항)
    // ═════════════════════════════════════
    let watchOut: TodaysFocus["watchOut"] = null;
    const earnings = diagRes.earningsImpact ?? [];
    const imminentEarnings = earnings.find((e: any) => e.daysUntil <= 2 && e.affectedPositions.length > 0);
    
    if (imminentEarnings) {
      watchOut = {
        what: `${imminentEarnings.symbol} 실적 D-${imminentEarnings.daysUntil} (${imminentEarnings.timing})`,
        impact: `포트 영향 $${Math.round(imminentEarnings.totalExposureUsd)} · ${imminentEarnings.affectedPositions.map((p: any) => p.symbol).join(", ")}`,
      };
    } else if (diagRes.concentration?.leveragePct > 70) {
      watchOut = {
        what: `레버리지 비중 ${diagRes.concentration.leveragePct.toFixed(0)}%`,
        impact: "시간 감가로 횡보해도 가치 하락 중",
      };
    } else if (criticalAlerts > 0) {
      const critAlert = alerts.find((a: any) => a.severity === "critical");
      if (critAlert) {
        watchOut = {
          what: critAlert.title.replace(/[🚨🔴⚡📅]/g, "").trim(),
          impact: critAlert.summary.substring(0, 100),
        };
      }
    }
    
    // ═════════════════════════════════════
    // Opportunity (기회, 있다면)
    // ═════════════════════════════════════
    let opportunity: TodaysFocus["opportunity"] = null;
    const buyOpp = ideas.find((i: any) => i.action === "BUY" && i.source === "opportunity");
    if (buyOpp) {
      opportunity = {
        symbol: buyOpp.symbol,
        why: buyOpp.reasoning?.substring(0, 150) ?? "시그널 감지",
      };
    }
    
    // ═════════════════════════════════════
    // 주요 이벤트
    // ═════════════════════════════════════
    let nextEventDaysUntil: number | null = null;
    let nextEventTitle: string | null = null;
    if (earnings.length > 0) {
      const sortedEarnings = [...earnings].sort((a: any, b: any) => a.daysUntil - b.daysUntil);
      const first = sortedEarnings[0];
      nextEventDaysUntil = first.daysUntil;
      nextEventTitle = `${first.symbol} 실적 (${first.timing})`;
    }
    
    const focus: TodaysFocus = {
      generatedAt: new Date().toISOString(),
      headline,
      headlineEmoji,
      severity,
      primaryAction,
      watchOut,
      opportunity,
      metrics: {
        portfolioHealth: health,
        lossPct: loss,
        nextEventDaysUntil,
        nextEventTitle,
      },
    };
    
    return NextResponse.json({
      success: true,
      focus,
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
