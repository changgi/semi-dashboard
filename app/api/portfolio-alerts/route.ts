import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// 최근 24시간 내 포트 경보 반환

export async function GET() {
  try {
    const supabase = createAdmin();
    
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: alerts } = await supabase
      .from("research_findings")
      .select("id, created_at, severity, title, summary, data")
      .eq("finding_type", "portfolio_alert")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(20);
    
    // 중복 제거 (같은 symbol + type는 최신만)
    const seen = new Set<string>();
    const deduped = (alerts ?? []).filter((a: any) => {
      const d = a.data as any;
      const key = `${d?.type}:${d?.symbol ?? "global"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    return NextResponse.json({
      success: true,
      count: deduped.length,
      criticalCount: deduped.filter((a: any) => a.severity === "critical").length,
      warningCount: deduped.filter((a: any) => a.severity === "warning").length,
      alerts: deduped,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      alerts: [],
    });
  }
}
