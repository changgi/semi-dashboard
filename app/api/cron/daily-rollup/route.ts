import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");

  const authorized =
    isVercelCron ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    debugKey === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdmin();

  const { data: runRow } = await supabase
    .from("cron_runs")
    .insert({ job_name: "daily-rollup", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    const today = new Date().toISOString().split("T")[0];
    const metrics: Array<{
      name: string;
      value: number;
      warn: number;
      crit: number;
      details?: Record<string, unknown>;
    }> = [];

    // 1. 가격 데이터 커버리지 (종목당 일봉 개수)
    const { data: tickers } = await supabase.from("tickers").select("symbol");
    const symbols = (tickers ?? []).map((t) => t.symbol);

    let totalBars = 0;
    let minBars = Infinity;
    const symbolBars: Record<string, number> = {};
    for (const sym of symbols) {
      const { count } = await supabase
        .from("price_history")
        .select("*", { count: "exact", head: true })
        .eq("symbol", sym)
        .eq("interval_type", "1day");
      const n = count ?? 0;
      totalBars += n;
      if (n < minBars) minBars = n;
      symbolBars[sym] = n;
    }

    metrics.push({
      name: "daily_bars_total",
      value: totalBars,
      warn: symbols.length * 100,
      crit: symbols.length * 30,
      details: { per_symbol_min: minBars === Infinity ? 0 : minBars, symbols: symbols.length },
    });

    metrics.push({
      name: "daily_bars_min_per_symbol",
      value: minBars === Infinity ? 0 : minBars,
      warn: 50,
      crit: 20,
      details: symbolBars,
    });

    // 2. 뉴스 신선도 (24시간 내 뉴스 수)
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: recentNewsCount } = await supabase
      .from("news")
      .select("*", { count: "exact", head: true })
      .gte("published_at", dayAgo);

    metrics.push({
      name: "news_last_24h",
      value: recentNewsCount ?? 0,
      warn: 5,
      crit: 0,
    });

    // 3. 매크로 데이터 신선도 (최근 1시간)
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: recentMacroCount } = await supabase
      .from("macro_history")
      .select("*", { count: "exact", head: true })
      .gte("timestamp", hourAgo);

    metrics.push({
      name: "macro_ticks_last_hour",
      value: recentMacroCount ?? 0,
      warn: 10,
      crit: 1,
    });

    // 4. 에이전트 의견 신선도 (24시간)
    const { count: recentAgentCount } = await supabase
      .from("agent_opinions")
      .select("*", { count: "exact", head: true })
      .gte("timestamp", dayAgo);

    metrics.push({
      name: "agent_opinions_last_24h",
      value: recentAgentCount ?? 0,
      warn: 100,
      crit: 0,
    });

    // 5. Cron 작업 성공률 (최근 24시간)
    const { data: cronRuns } = await supabase
      .from("cron_runs")
      .select("success")
      .gte("started_at", dayAgo);

    const totalRuns = cronRuns?.length ?? 0;
    const successRuns = cronRuns?.filter((r) => r.success).length ?? 0;
    const successRate = totalRuns > 0 ? (successRuns / totalRuns) * 100 : 0;

    metrics.push({
      name: "cron_success_rate_pct",
      value: Math.round(successRate * 10) / 10,
      warn: 95,
      crit: 80,
      details: { total: totalRuns, success: successRuns },
    });

    // 6. 가격 스냅샷 신선도 (5분 내)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: freshQuotesCount } = await supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .gte("updated_at", fiveMinAgo);

    metrics.push({
      name: "fresh_quotes_5min",
      value: freshQuotesCount ?? 0,
      warn: symbols.length * 0.9,
      crit: symbols.length * 0.5,
    });

    // 7. 예측 데이터 커버리지
    const { count: predCount } = await supabase
      .from("predictions")
      .select("*", { count: "exact", head: true });

    metrics.push({
      name: "predictions_total",
      value: predCount ?? 0,
      warn: symbols.length * 9 * 0.8, // 9 horizons per symbol
      crit: symbols.length * 9 * 0.3,
    });

    // 8. 상관관계 커버리지 (오늘)
    const { count: corrCount } = await supabase
      .from("correlation_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("date", today);

    metrics.push({
      name: "correlations_today",
      value: corrCount ?? 0,
      warn: symbols.length * 5 * 0.8, // 5 macros per symbol
      crit: 0,
    });

    // DB 저장: 각 메트릭의 상태 결정
    const qualityRows = metrics.map((m) => {
      let status: string;
      // 일부 메트릭은 "값이 크면 좋음" (bars_total, news 등),
      // 일부는 역방향이 필요할 수 있지만 여기서는 모두 "클수록 좋음"으로 가정
      if (m.value >= m.warn) status = "ok";
      else if (m.value >= m.crit) status = "warning";
      else status = "critical";

      return {
        date: today,
        metric_name: m.name,
        metric_value: m.value,
        threshold_warning: m.warn,
        threshold_critical: m.crit,
        status,
        details: m.details ?? null,
      };
    });

    await supabase
      .from("data_quality_daily")
      .upsert(qualityRows, { onConflict: "date,metric_name" });

    // 7일 이상 된 매크로 분봉 데이터 정리
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { count: cleanedMacro } = await supabase
      .from("macro_history")
      .delete({ count: "exact" })
      .lt("timestamp", sevenDaysAgo);

    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: true,
          records_processed: qualityRows.length,
          metadata: {
            metrics_computed: qualityRows.length,
            macro_cleaned: cleanedMacro ?? 0,
          },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      metrics: qualityRows,
      cleaned_macro_rows: cleanedMacro ?? 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: false,
          error_message: msg,
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
