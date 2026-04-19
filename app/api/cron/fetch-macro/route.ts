import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 매크로 심볼 (macro API와 동일)
const MACRO_SYMBOLS = [
  { symbol: "CL=F",      name: "WTI 원유",           category: "oil" },
  { symbol: "BZ=F",      name: "브렌트유",            category: "oil" },
  { symbol: "USO",       name: "위캔오일 (USO)",     category: "oil" },
  { symbol: "^IXIC",     name: "나스닥종합",         category: "index" },
  { symbol: "^NDX",      name: "나스닥100",           category: "index" },
  { symbol: "^GSPC",     name: "S&P 500",            category: "index" },
  { symbol: "^TNX",      name: "美 10Y 국채",        category: "bond" },
  { symbol: "DX-Y.NYB",  name: "달러 인덱스",        category: "fx" },
  { symbol: "^VIX",      name: "VIX 공포지수",       category: "vol" },
  { symbol: "SOXX",      name: "반도체 ETF (SOXX)", category: "semi" },
  { symbol: "SMH",       name: "반도체 ETF (SMH)",  category: "semi" },
  { symbol: "005930.KS", name: "삼성전자",           category: "korea" },
  { symbol: "000660.KS", name: "SK하이닉스",         category: "korea" },
  { symbol: "^KS11",     name: "코스피",             category: "korea" },
];

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

  // cron_runs 기록 시작
  const { data: runRow } = await supabase
    .from("cron_runs")
    .insert({ job_name: "fetch-macro", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    const symbols = MACRO_SYMBOLS.map((m) => m.symbol);
    const quotes = await fetchYahooQuotes(symbols);

    const rows = MACRO_SYMBOLS.map((m) => {
      const q = quotes.get(m.symbol);
      if (!q) return null;
      return {
        symbol: m.symbol,
        name: m.name,
        category: m.category,
        price: q.price,
        change_value: q.change,
        change_pct: q.changePct,
        prev_close: q.prevClose,
        day_high: q.dayHigh,
        day_low: q.dayLow,
        volume: q.volume,
        market_state: q.marketState,
        currency: q.currency,
        timestamp: new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase
        .from("macro_history")
        .upsert(rows, { onConflict: "symbol,timestamp" });
      if (error) throw error;
      inserted = rows.length;
    }

    const duration = Date.now() - started;

    // cron_runs 완료 기록
    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: true,
          records_processed: inserted,
          metadata: { symbols_fetched: rows.length, symbols_total: symbols.length },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      symbols_fetched: rows.length,
      symbols_total: symbols.length,
      inserted,
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
