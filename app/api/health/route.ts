import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdmin();
    const today = new Date().toISOString().split("T")[0];

    // 1. 오늘의 데이터 품질 메트릭
    const { data: metrics } = await supabase
      .from("data_quality_daily")
      .select("*")
      .eq("date", today)
      .order("metric_name");

    // 2. 최근 cron 실행 상태 (system_health view)
    const { data: cronStatus } = await supabase
      .from("system_health")
      .select("*");

    // 3. 심볼별 데이터 완결성
    const { data: completeness } = await supabase
      .from("symbol_data_completeness")
      .select("*");

    // 4. 최근 cron 실행 이력 (최근 50건)
    const { data: recentRuns } = await supabase
      .from("cron_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    // 5. 테이블별 레코드 수
    const tables = [
      "tickers",
      "quotes",
      "price_history",
      "news",
      "alerts",
      "predictions",
      "analysis_snapshots",
      "trading_signals",
      "macro_history",
      "agent_opinions",
      "portfolio_decisions",
      "correlation_snapshots",
      "fundamentals",
      "cron_runs",
    ];

    const tableCounts: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
      tableCounts[t] = count ?? 0;
    }

    // 6. 요약 헬스 점수 (0~100)
    const totalMetrics = metrics?.length ?? 0;
    const okMetrics = metrics?.filter((m) => m.status === "ok").length ?? 0;
    const warningMetrics = metrics?.filter((m) => m.status === "warning").length ?? 0;
    const criticalMetrics = metrics?.filter((m) => m.status === "critical").length ?? 0;
    const healthScore =
      totalMetrics > 0
        ? Math.round(
            ((okMetrics + warningMetrics * 0.5) / totalMetrics) * 100
          )
        : 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      health_score: healthScore,
      summary: {
        ok: okMetrics,
        warning: warningMetrics,
        critical: criticalMetrics,
        total: totalMetrics,
      },
      metrics: metrics ?? [],
      cron_status: cronStatus ?? [],
      symbol_completeness: completeness ?? [],
      recent_runs: (recentRuns ?? []).slice(0, 20),
      table_counts: tableCounts,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
