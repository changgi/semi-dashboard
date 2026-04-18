import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { generateTradingSignal } from "@/lib/signals";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const supabase = createAdmin();

  try {
    // 1. 전체 종목
    const { data: tickers } = await supabase.from("tickers").select("symbol").eq("is_etf", false);
    if (!tickers || tickers.length === 0) throw new Error("No tickers");

    // 2. 뉴스 감성 집계
    const sentimentMap = new Map<string, number>();
    const { data: recentNews } = await supabase
      .from("news")
      .select("related_symbols, sentiment")
      .gte("published_at", new Date(Date.now() - 7 * 86400000).toISOString());

    for (const sym of tickers.map((t) => t.symbol)) {
      const related = (recentNews ?? []).filter((n) => n.related_symbols?.includes(sym));
      if (related.length > 0) {
        const avg = related.reduce((s, n) => s + (n.sentiment ?? 0), 0) / related.length;
        sentimentMap.set(sym, avg);
      }
    }

    // 3. 각 종목 시그널 계산
    const signalRows = [];
    for (const { symbol } of tickers) {
      // 일봉 우선 조회
      let { data: hist } = await supabase
        .from("price_history")
        .select("price, day_high, day_low, timestamp")
        .eq("symbol", symbol)
        .eq("interval_type", "1day")
        .order("timestamp", { ascending: true })
        .limit(500);

      // 일봉 너무 적으면 fallback (일별 종가)
      if (!hist || hist.length < 20) {
        const { data: allHist } = await supabase
          .from("price_history")
          .select("price, day_high, day_low, timestamp")
          .eq("symbol", symbol)
          .order("timestamp", { ascending: true })
          .limit(10000);

        if (allHist && allHist.length > 0) {
          const dayMap = new Map<string, typeof allHist[0]>();
          for (const h of allHist) {
            const day = h.timestamp.split("T")[0];
            dayMap.set(day, h); // 덮어쓰기 = 종가
          }
          hist = Array.from(dayMap.values()).sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
          );
        }
      }

      if (!hist || hist.length < 20) continue;

      const prices = hist.map((h) => h.price).filter((p) => p && p > 0);
      const highs = hist.map((h, i) => h.day_high ?? prices[i] ?? 0);
      const lows = hist.map((h, i) => h.day_low ?? prices[i] ?? 0);
      const sentiment = sentimentMap.get(symbol) ?? 0;

      const sig = generateTradingSignal(prices, highs, lows, sentiment, symbol);
      if (!sig) continue;

      signalRows.push({
        symbol: sig.symbol,
        signal: sig.signal,
        score: sig.score,
        confidence: sig.confidence,
        current_price: sig.currentPrice,
        buy_entry: sig.buyEntry,
        buy_target_1: sig.buyTarget1,
        buy_target_2: sig.buyTarget2,
        buy_stop_loss: sig.buyStopLoss,
        buy_risk_reward: sig.buyRiskReward,
        sell_entry: sig.sellEntry,
        sell_target: sig.sellTarget,
        sell_stop_loss: sig.sellStopLoss,
        reasons: sig.reasons,
        timeframe: sig.timeframe,
        rsi: sig.indicators.rsi,
        macd: sig.indicators.macd,
        sma_20: sig.indicators.sma20,
        sma_50: sig.indicators.sma50,
        bb_position: sig.indicators.bbPosition,
        trend: sig.indicators.trend,
      });
    }

    // 4. 이전 시그널 정리 (1시간 이상 지난 것 삭제)
    await supabase
      .from("trading_signals")
      .delete()
      .lt("computed_at", new Date(Date.now() - 3600000).toISOString());

    // 5. 새 시그널 저장
    if (signalRows.length > 0) {
      await supabase.from("trading_signals").insert(signalRows);
    }

    return NextResponse.json({
      success: true,
      signals: signalRows.length,
      summary: {
        strong_buy: signalRows.filter((r) => r.signal === "STRONG_BUY").length,
        buy: signalRows.filter((r) => r.signal === "BUY").length,
        hold: signalRows.filter((r) => r.signal === "HOLD").length,
        sell: signalRows.filter((r) => r.signal === "SELL").length,
        strong_sell: signalRows.filter((r) => r.signal === "STRONG_SELL").length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
