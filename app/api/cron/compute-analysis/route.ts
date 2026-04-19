import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { sma, ema, rsi, macd, volatility, correlation, beta, sentimentScore } from "@/lib/analysis";
import { predictAllHorizons } from "@/lib/prediction";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");

  // 인증 조건: (1) Vercel Cron 자동 실행 (2) CRON_SECRET Bearer (3) ?key=CRON_SECRET 쿼리
  const authorized =
    isVercelCron ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    debugKey === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdmin();
  const today = new Date().toISOString().split("T")[0];

  const diagnostics: Record<string, unknown> = {
    started_at: new Date().toISOString(),
  };

  try {
    // 1. 전체 종목
    const { data: tickers, error: tickerErr } = await supabase.from("tickers").select("symbol").eq("is_etf", false);
    if (tickerErr) throw new Error(`Tickers query failed: ${tickerErr.message}`);
    if (!tickers || tickers.length === 0) throw new Error("No tickers in database. Run seed first.");
    diagnostics.tickers_count = tickers.length;

    const symbols = tickers.map((t) => t.symbol);

    // 2. 각 종목 가격 히스토리 (일봉 우선, 최대 500개)
    const priceMap = new Map<string, number[]>();
    const highMap = new Map<string, number[]>();
    const lowMap = new Map<string, number[]>();
    for (const sym of symbols) {
      // 우선 일봉 데이터만 시도
      let { data: hist } = await supabase
        .from("price_history")
        .select("price, day_high, day_low, timestamp")
        .eq("symbol", sym)
        .eq("interval_type", "1day")
        .order("timestamp", { ascending: true })
        .limit(500);

      // 일봉이 너무 적으면 분봉 데이터로 fallback (최신순 → 일별 종가 추출)
      if (!hist || hist.length < 20) {
        const { data: allHist } = await supabase
          .from("price_history")
          .select("price, day_high, day_low, timestamp, interval_type")
          .eq("symbol", sym)
          .order("timestamp", { ascending: true })
          .limit(10000);

        if (allHist && allHist.length > 0) {
          // 일자별 종가 = 해당 날짜의 마지막 레코드
          const dayMap = new Map<string, typeof allHist[0]>();
          for (const h of allHist) {
            const day = h.timestamp.split("T")[0];
            // 늦은 timestamp가 덮어쓰므로 종가 효과
            dayMap.set(day, h);
          }
          hist = Array.from(dayMap.values()).sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
          );
        }
      }

      if (hist && hist.length > 0) {
        const prices = hist.map((h) => h.price).filter((p) => p && p > 0);
        const highs = hist.map((h) => h.day_high ?? h.price ?? 0);
        const lows = hist.map((h) => h.day_low ?? h.price ?? 0);
        if (prices.length > 0) {
          priceMap.set(sym, prices);
          highMap.set(sym, highs);
          lowMap.set(sym, lows);
        }
      }
    }
    diagnostics.symbols_with_prices = priceMap.size;
    diagnostics.total_price_points = Array.from(priceMap.values()).reduce((s, arr) => s + arr.length, 0);

    // 최소 필요량 체크
    if (priceMap.size === 0) {
      throw new Error(
        `No price history found. Run /api/cron/fetch-prices first. ` +
        `Tickers: ${symbols.length}, but price_history is empty.`
      );
    }

    // 3. 벤치마크 (SMH ETF)
    const { data: smhHist } = await supabase
      .from("price_history")
      .select("price, timestamp")
      .eq("symbol", "SMH")
      .order("timestamp", { ascending: true })
      .limit(5000);

    const benchmarkPrices: number[] = smhHist
      ? smhHist.map((h) => h.price).filter((p) => p && p > 0)
      : [];

    // 4. 뉴스 감성 집계
    const sentimentMap = new Map<string, number>();
    const { data: recentNews } = await supabase
      .from("news")
      .select("title, summary, related_symbols, sentiment")
      .gte("published_at", new Date(Date.now() - 7 * 86400000).toISOString());

    if (recentNews) {
      // 감성 점수가 없는 뉴스 업데이트
      for (const n of recentNews) {
        if (n.sentiment === 0 || n.sentiment === null) {
          const text = `${n.title} ${n.summary || ""}`;
          const s = sentimentScore(text);
          await supabase
            .from("news")
            .update({ sentiment: s.score, sentiment_label: s.label, keywords: s.keywords })
            .eq("title", n.title);
          n.sentiment = s.score;
        }
      }

      // 심볼별 평균 감성
      for (const sym of symbols) {
        const related = recentNews.filter(
          (n) => n.related_symbols && n.related_symbols.includes(sym)
        );
        if (related.length > 0) {
          const avg = related.reduce((s, n) => s + (n.sentiment ?? 0), 0) / related.length;
          sentimentMap.set(sym, avg);
        }
      }
    }

    // 5. 분석 스냅샷 & 예측 생성
    const analysisRows = [];
    const predictionRows = [];

    for (const sym of symbols) {
      const prices = priceMap.get(sym);
      if (!prices || prices.length < 2) continue;

      const current = prices[prices.length - 1];
      const prevDay = prices.length >= 2 ? prices[prices.length - 2] : current;
      const changePct = ((current - prevDay) / prevDay) * 100;

      // 기술 지표 계산
      const sma20 = sma(prices, 20);
      const sma50 = sma(prices, 50);
      const ema12 = ema(prices, 12);
      const ema26 = ema(prices, 26);
      const rsiVal = rsi(prices);
      const macdVal = macd(prices);
      const vol20 = volatility(prices, 20);
      const corr = benchmarkPrices.length > 10 ? correlation(prices, benchmarkPrices) : null;
      const betaVal = benchmarkPrices.length > 10 ? beta(prices, benchmarkPrices) : null;
      const sentiment7d = sentimentMap.get(sym) ?? 0;

      // 상대 강도
      const relStrength = sma20 && sma50 ? (sma20 / sma50 - 1) * 100 : null;

      analysisRows.push({
        symbol: sym,
        date: today,
        price: current,
        change_pct: Math.round(changePct * 100) / 100,
        volatility_20d: vol20 ? Math.round(vol20 * 100) / 100 : null,
        rsi_14d: rsiVal ? Math.round(rsiVal * 100) / 100 : null,
        macd: macdVal?.macd ? Math.round(macdVal.macd * 1000) / 1000 : null,
        macd_signal: macdVal?.signal ? Math.round(macdVal.signal * 1000) / 1000 : null,
        sma_20: sma20 ? Math.round(sma20 * 100) / 100 : null,
        sma_50: sma50 ? Math.round(sma50 * 100) / 100 : null,
        ema_12: ema12 ? Math.round(ema12 * 100) / 100 : null,
        ema_26: ema26 ? Math.round(ema26 * 100) / 100 : null,
        sector_correlation: corr ? Math.round(corr * 1000) / 1000 : null,
        sector_beta: betaVal ? Math.round(betaVal * 1000) / 1000 : null,
        relative_strength: relStrength ? Math.round(relStrength * 100) / 100 : null,
        news_sentiment_7d: Math.round(sentiment7d * 100) / 100,
        news_count_7d: (recentNews ?? []).filter(
          (n) => n.related_symbols?.includes(sym)
        ).length,
      });

      // 예측 (CAPM용 beta 전달)
      const preds = predictAllHorizons(prices, sentiment7d, betaVal ?? 1.0);
      for (const p of preds) {
        predictionRows.push({
          symbol: sym,
          horizon: p.horizon,
          predicted_price: p.predicted,
          confidence_low: p.low,
          confidence_high: p.high,
          confidence_pct: p.confidence,
          method: p.method,
          current_price: current,
          predicted_change_pct: p.changePct,
        });
      }
    }

    // 6. DB에 upsert
    if (analysisRows.length > 0) {
      await supabase
        .from("analysis_snapshots")
        .upsert(analysisRows, { onConflict: "symbol,date" });
    }

    // 예측은 매번 새로 삽입 (시계열 기록)
    if (predictionRows.length > 0) {
      // 오늘 이전 예측 삭제 (최신만 유지)
      await supabase
        .from("predictions")
        .delete()
        .lt("computed_at", new Date(Date.now() - 3600000).toISOString());

      await supabase.from("predictions").insert(predictionRows);
    }

    return NextResponse.json({
      success: true,
      analysis: analysisRows.length,
      predictions: predictionRows.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
