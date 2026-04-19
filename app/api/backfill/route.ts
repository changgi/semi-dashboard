import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 전체 종목의 과거 일봉 데이터를 Yahoo Finance에서 가져와
 * price_history에 저장합니다 (interval_type='1day').
 *
 * 전략: 기존 일봉 데이터만 삭제 후 insert (분봉은 보존)
 *
 * 사용법:
 *   GET /api/backfill?key=CRON_SECRET           (1년치)
 *   GET /api/backfill?key=CRON_SECRET&range=2y
 *   GET /api/backfill?key=CRON_SECRET&symbol=NVDA
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");
  const authHeader = req.headers.get("authorization");

  const authorized =
    debugKey === process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = searchParams.get("range") ?? "1y";
  const singleSymbol = searchParams.get("symbol");
  const supabase = createAdmin();

  try {
    // 1. 종목 리스트
    let tickersQuery = supabase.from("tickers").select("symbol");
    if (singleSymbol) {
      tickersQuery = tickersQuery.eq("symbol", singleSymbol.toUpperCase());
    }
    const { data: tickers, error: te } = await tickersQuery;
    if (te) throw new Error(`Tickers query: ${te.message}`);
    if (!tickers || tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: "No tickers found" },
        { status: 400 }
      );
    }

    const results: Array<{
      symbol: string;
      source: string;
      fetched: number;
      deleted: number;
      inserted: number;
      error?: string;
    }> = [];

    for (const { symbol } of tickers) {
      try {
        // Yahoo에서 일봉 가져오기
        const bars = await fetchYahooHistory(symbol, range);

        if (bars.length === 0) {
          results.push({ symbol, source: "yahoo", fetched: 0, deleted: 0, inserted: 0, error: "no data" });
          continue;
        }

        // 1. 해당 종목의 기존 일봉만 삭제 (분봉은 보존)
        const { count: deletedCount, error: delErr } = await supabase
          .from("price_history")
          .delete({ count: "exact" })
          .eq("symbol", symbol)
          .eq("interval_type", "1day");

        if (delErr) throw new Error(`delete: ${delErr.message}`);

        // 2. 새 일봉 insert
        const rows = bars.map((b) => ({
          symbol,
          price: b.close,
          day_high: b.high,
          day_low: b.low,
          volume: b.volume,
          interval_type: "1day",
          timestamp: new Date(b.timestamp).toISOString(),
        }));

        const { data: insertedData, error: insErr } = await supabase
          .from("price_history")
          .insert(rows)
          .select("id");

        if (insErr) throw new Error(`insert: ${insErr.message}`);

        results.push({
          symbol,
          source: "yahoo",
          fetched: bars.length,
          deleted: deletedCount ?? 0,
          inserted: insertedData?.length ?? 0,
        });

        // Rate limit 대응
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ symbol, source: "error", fetched: 0, deleted: 0, inserted: 0, error: msg });
      }
    }

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
    const succeeded = results.filter((r) => r.inserted > 0).length;
    const failed = results.filter((r) => r.error).length;

    return NextResponse.json({
      success: true,
      range,
      total_symbols: tickers.length,
      succeeded,
      failed,
      total_deleted: totalDeleted,
      total_inserted: totalInserted,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
