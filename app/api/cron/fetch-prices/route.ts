import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { getFinnhubClient } from "@/lib/finnhub";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby: 60s, Pro: 300s

export async function GET(req: NextRequest) {
  // Vercel Cron 인증
  const authHeader = req.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdmin();

  try {
    // 1. 전체 종목 목록 조회
    const { data: tickers, error: tickerErr } = await supabase
      .from("tickers")
      .select("symbol");

    if (tickerErr) throw tickerErr;
    if (!tickers || tickers.length === 0) {
      throw new Error("No tickers found");
    }

    const symbols = tickers.map((t) => t.symbol);

    // 2. Finnhub에서 가격 가져오기
    const client = getFinnhubClient();
    const quotes = await client.getQuotes(symbols);

    // 3. quotes 테이블 upsert
    const quoteRows = Array.from(quotes.entries()).map(([symbol, q]) => ({
      symbol,
      price: q.c,
      change: q.d,
      change_percent: q.dp,
      day_high: q.h,
      day_low: q.l,
      prev_close: q.pc,
      volume: null, // Finnhub free tier에는 없음
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from("quotes")
      .upsert(quoteRows, { onConflict: "symbol" });

    if (upsertErr) throw upsertErr;

    // 4. price_history에 추가 (차트용)
    const historyRows = Array.from(quotes.entries()).map(([symbol, q]) => ({
      symbol,
      price: q.c,
      timestamp: new Date().toISOString(),
      interval_type: "1min",
    }));

    await supabase.from("price_history").insert(historyRows);

    // 5. 로그 기록
    const duration = Date.now() - started;
    await supabase.from("fetch_log").insert({
      source: "finnhub",
      symbols_count: quotes.size,
      success: true,
      duration_ms: duration,
    });

    return NextResponse.json({
      success: true,
      fetched: quotes.size,
      total: symbols.length,
      duration_ms: duration,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - started;

    await supabase.from("fetch_log").insert({
      source: "finnhub",
      symbols_count: 0,
      success: false,
      error_message: msg,
      duration_ms: duration,
    });

    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
