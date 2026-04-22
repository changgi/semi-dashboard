import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Snapshot Archive API
// 
// GET ?date=YYYY-MM-DD&time=morning : 특정 스냅샷 상세
// GET ?mode=list&days=30 : 기간 리스트 (요약만)
// GET ?mode=trend : 30일 트렌드 차트 데이터
// GET ?mode=performance : 추천 따름률 + 성과 분석
// GET ?mode=insights : 자기 객관화 인사이트
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "detail";
    
    // ─────────────────────────────────────────
    // 모드 1: 특정 스냅샷 상세 조회
    // ─────────────────────────────────────────
    if (mode === "detail") {
      const date = url.searchParams.get("date");
      const timeOfDay = url.searchParams.get("time") ?? "morning";
      
      if (!date) {
        return NextResponse.json({ success: false, error: "date 필수" }, { status: 400 });
      }
      
      const { data: snapshot } = await supabase
        .from("daily_snapshots")
        .select("*")
        .eq("snapshot_date", date)
        .eq("time_of_day", timeOfDay)
        .maybeSingle();
      
      if (!snapshot) {
        return NextResponse.json({
          success: true,
          exists: false,
          message: `${date} ${timeOfDay} 스냅샷 없음`,
        });
      }
      
      return NextResponse.json({
        success: true,
        exists: true,
        snapshot,
      });
    }
    
    // ─────────────────────────────────────────
    // 모드 2: 리스트 조회 (요약만)
    // ─────────────────────────────────────────
    if (mode === "list") {
      const days = Math.min(Number(url.searchParams.get("days") ?? "30"), 90);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data: snapshots } = await supabase
        .from("daily_snapshots")
        .select(`
          id, snapshot_date, time_of_day, snapshot_time,
          portfolio_value_usd, portfolio_gain_pct, portfolio_health_score,
          leverage_pct, today_action_count, critical_alerts, severity,
          market_vix, market_spy_change_pct, market_regime
        `)
        .gte("snapshot_date", startDate.toISOString().split("T")[0])
        .order("snapshot_date", { ascending: false })
        .order("snapshot_time", { ascending: false })
        .limit(100);
      
      return NextResponse.json({
        success: true,
        count: snapshots?.length ?? 0,
        snapshots: snapshots ?? [],
      });
    }
    
    // ─────────────────────────────────────────
    // 모드 3: 30일 트렌드 차트 데이터
    // ─────────────────────────────────────────
    if (mode === "trend") {
      const days = Math.min(Number(url.searchParams.get("days") ?? "30"), 90);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data: trend } = await supabase
        .from("daily_snapshots")
        .select(`
          snapshot_date, portfolio_value_usd, portfolio_gain_pct,
          portfolio_health_score, leverage_pct, market_vix
        `)
        .gte("snapshot_date", startDate.toISOString().split("T")[0])
        .eq("time_of_day", "morning")  // 하루 1개만 (아침 기준)
        .order("snapshot_date", { ascending: true });
      
      if (!trend || trend.length === 0) {
        return NextResponse.json({
          success: true,
          hasData: false,
          message: "트렌드 데이터 없음",
          trendPoints: [],
        });
      }
      
      // 변화량 계산
      const trendPoints = trend.map((t, i) => {
        const prev = i > 0 ? trend[i - 1] : null;
        return {
          date: t.snapshot_date,
          portfolioValue: t.portfolio_value_usd,
          gainPct: t.portfolio_gain_pct,
          healthScore: t.portfolio_health_score,
          leveragePct: t.leverage_pct,
          vix: t.market_vix,
          healthChange: prev && t.portfolio_health_score != null && prev.portfolio_health_score != null
            ? t.portfolio_health_score - prev.portfolio_health_score
            : 0,
        };
      });
      
      const first = trendPoints[0];
      const last = trendPoints[trendPoints.length - 1];
      
      return NextResponse.json({
        success: true,
        hasData: true,
        dataPoints: trendPoints.length,
        trendPoints,
        summary: {
          startDate: first.date,
          endDate: last.date,
          startValue: first.portfolioValue,
          endValue: last.portfolioValue,
          totalChangeUsd: (last.portfolioValue ?? 0) - (first.portfolioValue ?? 0),
          totalChangePct: first.portfolioValue 
            ? ((last.portfolioValue ?? 0) - first.portfolioValue) / first.portfolioValue * 100 
            : 0,
          startHealth: first.healthScore,
          endHealth: last.healthScore,
          healthChange: (last.healthScore ?? 0) - (first.healthScore ?? 0),
          startLeverage: first.leveragePct,
          endLeverage: last.leveragePct,
          leverageChange: (last.leveragePct ?? 0) - (first.leveragePct ?? 0),
        },
      });
    }
    
    // ─────────────────────────────────────────
    // 모드 4: 추천 성과 분석
    // ─────────────────────────────────────────
    if (mode === "performance") {
      const { data: tracking } = await supabase
        .from("recommendation_tracking")
        .select("*")
        .gte("recommendation_date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0])
        .order("recommendation_date", { ascending: false });
      
      const records = tracking ?? [];
      
      if (records.length === 0) {
        return NextResponse.json({
          success: true,
          hasData: false,
          message: "추적된 추천 없음",
        });
      }
      
      // 소스별 분석
      const bySource: Record<string, any> = {};
      for (const r of records) {
        const src = r.source ?? "unknown";
        if (!bySource[src]) {
          bySource[src] = {
            source: src,
            total: 0,
            executed: 0,
            skipped: 0,
            correct: 0,
            incorrect: 0,
            avgConfidence: 0,
            totalConfidence: 0,
            avgIfFollowedPnlPct: 0,
            totalIfFollowedPnlPct: 0,
            pnlCount: 0,
          };
        }
        const s = bySource[src];
        s.total++;
        s.totalConfidence += r.confidence ?? 0;
        if (r.was_executed) s.executed++;
        else s.skipped++;
        if (r.was_correct === true) s.correct++;
        if (r.was_correct === false) s.incorrect++;
        if (r.if_followed_pnl_pct != null) {
          s.totalIfFollowedPnlPct += r.if_followed_pnl_pct;
          s.pnlCount++;
        }
      }
      
      // 정리
      const sourceStats = Object.values(bySource).map((s: any) => ({
        source: s.source,
        total: s.total,
        executionRate: s.total > 0 ? (s.executed / s.total) * 100 : 0,
        accuracy: (s.correct + s.incorrect) > 0 
          ? (s.correct / (s.correct + s.incorrect)) * 100 
          : null,
        avgConfidence: s.total > 0 ? s.totalConfidence / s.total : 0,
        avgIfFollowedPnlPct: s.pnlCount > 0 ? s.totalIfFollowedPnlPct / s.pnlCount : null,
      }));
      
      // 전체 성과
      const totalRecommendations = records.length;
      const totalExecuted = records.filter((r: any) => r.was_executed).length;
      const totalCorrect = records.filter((r: any) => r.was_correct === true).length;
      const totalIncorrect = records.filter((r: any) => r.was_correct === false).length;
      
      return NextResponse.json({
        success: true,
        hasData: true,
        overall: {
          totalRecommendations,
          totalExecuted,
          executionRate: totalRecommendations > 0 ? (totalExecuted / totalRecommendations) * 100 : 0,
          accuracy: (totalCorrect + totalIncorrect) > 0 
            ? (totalCorrect / (totalCorrect + totalIncorrect)) * 100 
            : null,
          correctCount: totalCorrect,
          incorrectCount: totalIncorrect,
        },
        bySource: sourceStats.sort((a: any, b: any) => b.total - a.total),
      });
    }
    
    // ─────────────────────────────────────────
    // 모드 5: 자기 객관화 인사이트
    // ─────────────────────────────────────────
    if (mode === "insights") {
      const { data: recent30 } = await supabase
        .from("daily_snapshots")
        .select(`
          snapshot_date, portfolio_health_score, leverage_pct,
          today_action_count, critical_alerts, severity
        `)
        .gte("snapshot_date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
        .eq("time_of_day", "morning");
      
      const { data: tracking } = await supabase
        .from("recommendation_tracking")
        .select("was_executed, was_correct, source, confidence")
        .gte("recommendation_date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]);
      
      const snapshots = recent30 ?? [];
      const recs = tracking ?? [];
      
      const insights: Array<{ type: string; icon: string; label: string; detail: string; severity: string }> = [];
      
      // 인사이트 1: 건강도 트렌드
      if (snapshots.length >= 7) {
        const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const diff = (last.portfolio_health_score ?? 0) - (first.portfolio_health_score ?? 0);
        
        if (diff > 5) {
          insights.push({
            type: "health_improvement",
            icon: "📈",
            label: "건강도 개선 중",
            detail: `${sorted.length}일간 +${diff}점 상승 (${first.portfolio_health_score} → ${last.portfolio_health_score})`,
            severity: "positive",
          });
        } else if (diff < -5) {
          insights.push({
            type: "health_decline",
            icon: "📉",
            label: "건강도 하락 주의",
            detail: `${sorted.length}일간 ${diff}점 하락 (${first.portfolio_health_score} → ${last.portfolio_health_score})`,
            severity: "warning",
          });
        } else {
          insights.push({
            type: "health_stable",
            icon: "➡️",
            label: "건강도 안정",
            detail: `최근 ${sorted.length}일 변동 ±5 이내`,
            severity: "neutral",
          });
        }
      }
      
      // 인사이트 2: 추천 실행률
      if (recs.length >= 5) {
        const executed = recs.filter((r: any) => r.was_executed).length;
        const rate = (executed / recs.length) * 100;
        if (rate < 30) {
          insights.push({
            type: "low_execution",
            icon: "⏸",
            label: "추천 실행률 낮음",
            detail: `30일간 ${recs.length}건 중 ${executed}건 실행 (${rate.toFixed(0)}%). 더 적극적 결단 필요.`,
            severity: "warning",
          });
        } else if (rate > 70) {
          insights.push({
            type: "high_execution",
            icon: "⚡",
            label: "실행력 양호",
            detail: `30일간 ${recs.length}건 중 ${executed}건 실행 (${rate.toFixed(0)}%). 결단력 있음.`,
            severity: "positive",
          });
        }
      }
      
      // 인사이트 3: Critical 경보 빈도
      const criticalDays = snapshots.filter(s => (s.critical_alerts ?? 0) > 0).length;
      if (criticalDays > 0) {
        insights.push({
          type: "critical_frequency",
          icon: "🚨",
          label: "Critical 경보 일수",
          detail: `30일 중 ${criticalDays}일 (${Math.round((criticalDays / snapshots.length) * 100)}%). ${criticalDays > 10 ? "포트 관리 전면 재점검 필요" : "관리 가능 수준"}`,
          severity: criticalDays > 10 ? "warning" : "neutral",
        });
      }
      
      // 인사이트 4: 레버리지 트렌드
      if (snapshots.length >= 7) {
        const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
        const firstLev = sorted[0].leverage_pct ?? 0;
        const lastLev = sorted[sorted.length - 1].leverage_pct ?? 0;
        const diff = lastLev - firstLev;
        if (Math.abs(diff) > 10) {
          insights.push({
            type: "leverage_change",
            icon: diff > 0 ? "📈" : "📉",
            label: diff > 0 ? "레버리지 비중 증가" : "레버리지 축소",
            detail: `${firstLev.toFixed(0)}% → ${lastLev.toFixed(0)}% (${diff > 0 ? "+" : ""}${diff.toFixed(0)}%p)`,
            severity: diff < 0 ? "positive" : "warning",
          });
        }
      }
      
      return NextResponse.json({
        success: true,
        hasData: snapshots.length > 0,
        period: `최근 ${snapshots.length}일`,
        insights,
      });
    }
    
    return NextResponse.json({ success: false, error: "잘못된 mode" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
    });
  }
}
