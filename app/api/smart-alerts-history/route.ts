import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Smart Alerts History API
// GET: 과거 경보 이력 + 빈도 분석
// PATCH: 사용자 확인 처리
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    const url = new URL(req.url);
    const days = Math.min(Number(url.searchParams.get("days") ?? "30"), 90);
    const category = url.searchParams.get("category");
    const severity = url.searchParams.get("severity");
    const onlyResolved = url.searchParams.get("resolved") === "true";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    
    let query = supabase
      .from("smart_alerts_history")
      .select("*")
      .gte("first_seen_at", new Date(Date.now() - days * 86400000).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(limit);
    
    if (category) query = query.eq("category", category);
    if (severity) query = query.eq("severity", severity);
    if (onlyResolved) query = query.eq("is_resolved", true);
    
    const { data: history, error } = await query;
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }
    
    const records = history ?? [];
    
    // 통계
    const total = records.length;
    const resolved = records.filter(r => r.is_resolved).length;
    const active = records.filter(r => !r.is_resolved).length;
    const acknowledged = records.filter(r => r.acknowledged_by_user).length;
    
    // 심각도별
    const bySeverity = {
      critical: records.filter(r => r.severity === "critical").length,
      warning: records.filter(r => r.severity === "warning").length,
      opportunity: records.filter(r => r.severity === "opportunity").length,
      info: records.filter(r => r.severity === "info").length,
    };
    
    // 카테고리별
    const byCategory: Record<string, number> = {};
    for (const r of records) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    }
    
    // 가장 자주 발생한 알림 Top 5
    const alertCounts: Record<string, { title: string; count: number; severity: string; lastSeen: string }> = {};
    for (const r of records) {
      if (!alertCounts[r.alert_id]) {
        alertCounts[r.alert_id] = {
          title: r.title,
          count: 0,
          severity: r.severity,
          lastSeen: r.last_seen_at,
        };
      }
      alertCounts[r.alert_id].count += r.occurrence_count ?? 1;
    }
    const topFrequent = Object.values(alertCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    return NextResponse.json({
      success: true,
      period: `최근 ${days}일`,
      count: records.length,
      records,
      stats: {
        total,
        resolved,
        active,
        acknowledged,
        resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
        ackRate: total > 0 ? (acknowledged / total) * 100 : 0,
        bySeverity,
        byCategory,
      },
      topFrequent,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      records: [],
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createAdmin();
    
    if (!body.id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }
    
    const updates: any = {
      acknowledged_by_user: true,
      acknowledged_at: new Date().toISOString(),
    };
    if (body.user_action_taken) updates.user_action_taken = body.user_action_taken;
    
    const { error } = await supabase
      .from("smart_alerts_history")
      .update(updates)
      .eq("id", body.id);
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }
    
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg });
  }
}
