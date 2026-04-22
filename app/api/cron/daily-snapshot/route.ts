import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ═══════════════════════════════════════════════════════════
// Daily Snapshot Cron Job
// 
// vercel.json schedule:
//   - "0 0 * * *"  UTC 00:00 = KST 09:00 (morning)
//   - "30 20 * * *" UTC 20:30 = KST 05:30 (evening, US close)
// 
// 수동 호출도 가능: POST /api/cron/daily-snapshot?source=manual
// 
// 스냅샷 수집:
//   - portfolio-diagnosis
//   - trade-ideas
//   - todays-focus
//   - portfolio-alerts
//   - daily-briefing-v2
// 
// 추천 트래킹에도 자동 등록
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  return runSnapshot(req);
}

export async function POST(req: NextRequest) {
  return runSnapshot(req);
}

async function runSnapshot(req: NextRequest) {
  const startTime = Date.now();
  const baseUrl = new URL(req.url).origin;
  const urlParams = new URL(req.url).searchParams;
  const source = urlParams.get("source") ?? "cron";
  
  try {
    const supabase = createAdmin();
    
    // 현재 시간 기반 time_of_day 결정 (KST 기준)
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kst = new Date(now.getTime() + kstOffset - now.getTimezoneOffset() * 60 * 1000);
    const kstHour = kst.getHours();
    
    let timeOfDay: string;
    if (kstHour >= 5 && kstHour < 12) timeOfDay = "morning";
    else if (kstHour >= 12 && kstHour < 17) timeOfDay = "afternoon";
    else if (kstHour >= 17 && kstHour < 22) timeOfDay = "evening";
    else timeOfDay = "night";
    
    if (source === "manual") timeOfDay = "scheduled";
    
    const snapshotDate = kst.toISOString().split("T")[0];
    
    // 이미 오늘 같은 time_of_day 스냅샷 있는지 체크
    const { data: existing } = await supabase
      .from("daily_snapshots")
      .select("id")
      .eq("snapshot_date", snapshotDate)
      .eq("time_of_day", timeOfDay)
      .maybeSingle();
    
    if (existing && source === "cron") {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `${snapshotDate} ${timeOfDay} 스냅샷 이미 존재`,
      });
    }
    
    // 병렬로 모든 API 호출
    const [diagRes, ideasRes, focusRes, alertsRes, briefingRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/portfolio-diagnosis`).then(r => r.json()),
      fetch(`${baseUrl}/api/trade-ideas`).then(r => r.json()),
      fetch(`${baseUrl}/api/todays-focus`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/portfolio-alerts`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/daily-briefing-v2`).then(r => r.json()).catch(() => null),
    ]);
    
    const diag = diagRes.status === "fulfilled" ? diagRes.value : null;
    const ideas = ideasRes.status === "fulfilled" ? ideasRes.value : null;
    const focus = focusRes.status === "fulfilled" ? focusRes.value : null;
    const alerts = alertsRes.status === "fulfilled" ? alertsRes.value : null;
    const briefing = briefingRes.status === "fulfilled" ? briefingRes.value : null;
    
    if (!diag?.success) {
      return NextResponse.json({
        success: false,
        error: "portfolio-diagnosis 실패",
      });
    }
    
    // 핵심 수치 추출
    const summary = diag.summary ?? {};
    const concentration = diag.concentration ?? {};
    const briefingData = briefing?.briefing ?? {};
    const macro = briefingData.macro ?? {};
    const focusData = focus?.focus ?? null;
    
    // 아이디어 요약
    const ideasList = ideas?.ideas ?? [];
    const todayActions = ideasList.filter((i: any) => i.urgency === "today").length;
    const weekActions = ideasList.filter((i: any) => i.urgency === "this_week").length;
    
    // 경보 요약
    const alertsList = alerts?.alerts ?? [];
    const criticalCount = alertsList.filter((a: any) => a.severity === "critical").length;
    const warningCount = alertsList.filter((a: any) => a.severity === "warning").length;
    
    // 스냅샷 삽입
    const { data: inserted, error } = await supabase
      .from("daily_snapshots")
      .upsert({
        snapshot_date: snapshotDate,
        time_of_day: timeOfDay,
        snapshot_time: new Date().toISOString(),
        trigger_source: source,
        
        // 핵심 수치
        portfolio_value_usd: summary.totalValueUsd,
        portfolio_cost_usd: summary.totalCostUsd,
        portfolio_gain_usd: summary.totalGainUsd,
        portfolio_gain_pct: summary.totalGainPct,
        portfolio_health_score: summary.healthScore,
        leverage_pct: concentration.leveragePct,
        position_count: (diag.positions ?? []).length,
        cash_pct: 0,  // TODO
        
        // 시장
        market_vix: macro.vix,
        market_spy_change_pct: macro.spyChange,
        market_qqq_change_pct: macro.qqqChange,
        market_krw: macro.krw,
        market_regime: macro.vixRegime ?? "unknown",
        
        // 액션
        today_action_count: todayActions,
        week_action_count: weekActions,
        critical_alerts: criticalCount,
        warning_alerts: warningCount,
        severity: focusData?.severity ?? null,
        
        // 전체 데이터
        todays_focus_data: focusData,
        trade_ideas_data: ideas,
        portfolio_positions_data: diag.positions ?? [],
        alerts_data: alertsList,
        diagnosis_data: diag,
        market_snapshot_data: macro,
      }, {
        onConflict: "snapshot_date,time_of_day",
      })
      .select()
      .single();
    
    if (error) {
      console.error("스냅샷 저장 실패:", error);
      return NextResponse.json({
        success: false,
        error: error.message,
      });
    }
    
    // 추천 트래킹 등록 (아이디어 당 한 건씩)
    let trackedCount = 0;
    if (ideasList.length > 0 && inserted) {
      const trackingRecords = ideasList.map((idea: any) => ({
        snapshot_id: inserted.id,
        recommendation_date: snapshotDate,
        symbol: idea.symbol,
        action: idea.action,
        recommended_shares: idea.shares,
        recommended_price: idea.currentPrice,
        confidence: idea.confidence,
        source: idea.source,
        urgency: idea.urgency,
        reasoning: idea.reasoning ?? null,
      }));
      
      const { error: trackError } = await supabase
        .from("recommendation_tracking")
        .upsert(trackingRecords, {
          onConflict: "recommendation_date,symbol,action,source",
          ignoreDuplicates: true,
        });
      
      if (!trackError) trackedCount = trackingRecords.length;
    }
    
    return NextResponse.json({
      success: true,
      snapshotId: inserted.id,
      snapshotDate,
      timeOfDay,
      elapsedMs: Date.now() - startTime,
      summary: {
        portfolioValue: summary.totalValueUsd,
        gainPct: summary.totalGainPct,
        healthScore: summary.healthScore,
        todayActions,
        criticalAlerts: criticalCount,
        recommendationsTracked: trackedCount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      elapsedMs: Date.now() - startTime,
    });
  }
}
