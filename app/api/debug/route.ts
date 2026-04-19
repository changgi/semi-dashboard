import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

interface TableStatus {
  table: string;
  exists: boolean;
  count: number | null;
  error: string | null;
  sample?: unknown;
}

export async function GET() {
  const supabase = createAdmin();
  const tables = [
    "tickers",
    "quotes",
    "price_history",
    "news",
    "alerts",
    "predictions",
    "analysis_snapshots",
    "news_sentiment_daily",
    "fetch_log",
  ];

  const results: TableStatus[] = [];

  for (const t of tables) {
    try {
      const { count, error } = await supabase
        .from(t)
        .select("*", { count: "exact", head: true });

      if (error) {
        results.push({
          table: t,
          exists: false,
          count: null,
          error: error.message,
        });
      } else {
        // 샘플 한 줄
        const { data: sample } = await supabase.from(t).select("*").limit(1);
        results.push({
          table: t,
          exists: true,
          count: count ?? 0,
          error: null,
          sample: sample?.[0] ?? null,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        table: t,
        exists: false,
        count: null,
        error: msg,
      });
    }
  }

  // fetch_log 최근 10개
  let recentLogs: unknown[] = [];
  try {
    const { data } = await supabase
      .from("fetch_log")
      .select("*")
      .order("fetched_at", { ascending: false })
      .limit(10);
    recentLogs = data ?? [];
  } catch {
    // ignore
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    tables: results,
    recent_fetch_logs: recentLogs,
    environment: {
      supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      service_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      finnhub_key_set: !!process.env.FINNHUB_API_KEY,
      cron_secret_set: !!process.env.CRON_SECRET,
    },
  });
}
