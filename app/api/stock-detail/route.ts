import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// 종목 상세 종합 API
// /api/stock-detail?symbol=NVDA
// 한 종목에 대한 모든 정보 (가격/차트/AI판단/옵션/뉴스/예측/뉴스감성)
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
    }

    const upperSym = symbol.toUpperCase();
    const supabase = createAdmin();

    // ─────────────────────────────────────────────
    // 병렬 실행으로 속도 최적화
    // ─────────────────────────────────────────────
    const [
      quotesData,
      historyData,
      tickerData,
      analysesData,
      signalsData,
      decisionsData,
      newsData,
      newsSentimentData,
      predictionsData,
      forecastsData,
      accuracyData,
      universeData,
      correlationsData,
      insightsData,
      earningsData,
    ] = await Promise.all([
      // 1. 실시간 시세
      fetchYahooQuotes([upperSym]),
      // 2. 1년 히스토리
      fetchYahooHistory(upperSym, "1y").catch(() => []),
      // 3. 티커 기본 정보
      supabase.from("tickers").select("*").eq("symbol", upperSym).single(),
      // 4. 분석 스냅샷 (sector_beta, sentiment)
      supabase
        .from("analysis_snapshots")
        .select("*")
        .eq("symbol", upperSym)
        .order("date", { ascending: false })
        .limit(1)
        .single(),
      // 5. 트레이딩 시그널
      supabase
        .from("trading_signals")
        .select("*")
        .eq("symbol", upperSym)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single(),
      // 6. 에이전트 합의
      supabase
        .from("portfolio_decisions")
        .select("*")
        .eq("symbol", upperSym)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single(),
      // 7. 최근 뉴스
      supabase
        .from("news_articles")
        .select("*")
        .eq("symbol", upperSym)
        .order("published_at", { ascending: false })
        .limit(10),
      // 8. 뉴스 감성 30일
      supabase
        .from("news_sentiment_daily")
        .select("*")
        .eq("symbol", upperSym)
        .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
        .order("date", { ascending: true }),
      // 9. 기존 predictions
      supabase
        .from("predictions")
        .select("*")
        .eq("symbol", upperSym)
        .order("target_date", { ascending: true })
        .limit(20),
      // 10. 활성 forecasts (매크로와 동일한 프레임워크)
      supabase
        .from("macro_forecasts")
        .select("*")
        .eq("symbol", upperSym)
        .gte("target_date", new Date().toISOString().split("T")[0])
        .order("forecast_date", { ascending: false })
        .limit(30),
      // 11. 예측 정확도 히스토리
      supabase
        .from("forecast_accuracy")
        .select("*")
        .eq("symbol", upperSym)
        .order("target_date", { ascending: true })
        .limit(100),
      // 12. Symbol Universe 메타 (한글명 + 인덱스 + 반도체)
      supabase
        .from("symbol_universe")
        .select("*")
        .eq("symbol", upperSym)
        .maybeSingle(),
      // 13. 상관관계 (이 종목이 포함된 쌍)
      supabase
        .from("correlation_matrix")
        .select("*")
        .or(`symbol_a.eq.${upperSym},symbol_b.eq.${upperSym}`)
        .order("computed_at", { ascending: false })
        .limit(10),
      // 14. 이 종목 관련 인사이트 (research_findings)
      supabase
        .from("research_findings")
        .select("*")
        .contains("symbols", [upperSym])
        .order("created_at", { ascending: false })
        .limit(5),
      // 15. 실적 스케줄
      supabase
        .from("earnings_schedule")
        .select("*")
        .eq("symbol", upperSym)
        .eq("is_active", true)
        .order("earnings_date", { ascending: true }),
    ]);

    const quote = quotesData.get(upperSym);
    if (!quote?.price) {
      return NextResponse.json(
        { success: false, error: "no price data" },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────
    // 가격 히스토리 가공 (여러 기간)
    // ─────────────────────────────────────────────
    const fullHistory = historyData.map((h) => ({
      date: h.date,
      close: h.close,
      open: h.open,
      high: h.high,
      low: h.low,
      volume: h.volume,
    }));

    const history30d = fullHistory.slice(-30);
    const history90d = fullHistory.slice(-90);

    // 52주 고가/저가
    const last52Weeks = fullHistory.slice(-252);
    const high52w = last52Weeks.length > 0 ? Math.max(...last52Weeks.map((h) => h.high || h.close)) : quote.price;
    const low52w = last52Weeks.length > 0 ? Math.min(...last52Weeks.map((h) => h.low || h.close)) : quote.price;

    // 기간별 수익률
    const returns: Record<string, number | null> = {
      day: quote.changePct ?? null,
      week: fullHistory.length >= 5 ? ((quote.price - fullHistory[fullHistory.length - 5].close) / fullHistory[fullHistory.length - 5].close) * 100 : null,
      month: fullHistory.length >= 20 ? ((quote.price - fullHistory[fullHistory.length - 20].close) / fullHistory[fullHistory.length - 20].close) * 100 : null,
      quarter: fullHistory.length >= 60 ? ((quote.price - fullHistory[fullHistory.length - 60].close) / fullHistory[fullHistory.length - 60].close) * 100 : null,
      year: fullHistory.length >= 250 ? ((quote.price - fullHistory[fullHistory.length - 250].close) / fullHistory[fullHistory.length - 250].close) * 100 : null,
      ytd: (() => {
        const yearStart = new Date(new Date().getFullYear(), 0, 1);
        const ytdStart = fullHistory.find((h) => new Date(h.date) >= yearStart);
        return ytdStart ? ((quote.price - ytdStart.close) / ytdStart.close) * 100 : null;
      })(),
    };

    // ─────────────────────────────────────────────
    // 기술적 지표
    // ─────────────────────────────────────────────
    const closes = fullHistory.map((h) => h.close).filter((p) => p > 0);

    // SMA 20일
    const sma20 = closes.length >= 20
      ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20
      : null;

    // SMA 50일
    const sma50 = closes.length >= 50
      ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50
      : null;

    // SMA 200일
    const sma200 = closes.length >= 200
      ? closes.slice(-200).reduce((s, v) => s + v, 0) / 200
      : null;

    // RSI 14일
    let rsi: number | null = null;
    if (closes.length >= 15) {
      const gains: number[] = [];
      const losses: number[] = [];
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains.push(diff);
        else losses.push(Math.abs(diff));
      }
      const avgGain = gains.length > 0 ? gains.reduce((s, v) => s + v, 0) / 14 : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, v) => s + v, 0) / 14 : 0;
      if (avgLoss > 0) {
        const rs = avgGain / avgLoss;
        rsi = 100 - 100 / (1 + rs);
      }
    }

    // 20일 역사적 변동성 (annualized)
    let volatility: number | null = null;
    if (closes.length >= 21) {
      const returns20: number[] = [];
      for (let i = closes.length - 20; i < closes.length; i++) {
        if (closes[i - 1] > 0) {
          returns20.push(Math.log(closes[i] / closes[i - 1]));
        }
      }
      const mean = returns20.reduce((s, v) => s + v, 0) / returns20.length;
      const variance =
        returns20.reduce((s, v) => s + (v - mean) ** 2, 0) / returns20.length;
      volatility = Math.sqrt(variance * 252) * 100;
    }

    // ─────────────────────────────────────────────
    // 옵션 시장 요약 (CBOE에서 실시간)
    // ─────────────────────────────────────────────
    let optionsSummary: {
      available: boolean;
      totalOptions: number;
      atmCallIV: number;
      atmPutIV: number;
      putCallRatio: number;
      sentiment: string;
      expectedMovePct: number;
    } | null = null;

    try {
      const optRes = await fetch(
        `https://cdn.cboe.com/api/global/delayed_quotes/options/${upperSym}.json`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (optRes.ok) {
        const optData = await optRes.json();
        const options = optData.data.options ?? [];
        const currentPrice = optData.data.current_price;

        // 30일 근접 만기 찾기
        const today = new Date().toISOString().split("T")[0];
        const expirySet = new Set<string>();
        for (const opt of options) {
          const m = opt.option.match(/^[A-Z]+(\d{2})(\d{2})(\d{2})[CP]\d{8}$/);
          if (m) {
            const expiry = `20${m[1]}-${m[2]}-${m[3]}`;
            if (expiry >= today) expirySet.add(expiry);
          }
        }
        const expiries = Array.from(expirySet).sort();
        if (expiries.length > 0) {
          const target = expiries.reduce((best, e) => {
            const days = (new Date(e).getTime() - Date.now()) / (1000 * 3600 * 24);
            const bestDays = (new Date(best).getTime() - Date.now()) / (1000 * 3600 * 24);
            return Math.abs(days - 30) < Math.abs(bestDays - 30) ? e : best;
          });

          let callOI = 0, putOI = 0;
          let atmCallIV = 0, atmPutIV = 0;
          let atmCallPrice = 0, atmPutPrice = 0;

          for (const opt of options) {
            const m = opt.option.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
            if (!m) continue;
            const expiry = `20${m[2]}-${m[3]}-${m[4]}`;
            if (expiry !== target) continue;

            const strike = parseInt(m[6]) / 1000;
            const isCall = m[5] === "C";

            if (isCall) {
              callOI += opt.open_interest || 0;
              if (Math.abs(strike - currentPrice) < currentPrice * 0.015) {
                atmCallIV = opt.iv || 0;
                atmCallPrice = (opt.bid + opt.ask) / 2;
              }
            } else {
              putOI += opt.open_interest || 0;
              if (Math.abs(strike - currentPrice) < currentPrice * 0.015) {
                atmPutIV = opt.iv || 0;
                atmPutPrice = (opt.bid + opt.ask) / 2;
              }
            }
          }

          const putCallRatio = callOI > 0 ? putOI / callOI : 1;
          const expectedMove = atmCallPrice + atmPutPrice;
          const expectedMovePct = currentPrice > 0 ? (expectedMove / currentPrice) * 100 : 0;

          let sentiment: string;
          if (putCallRatio < 0.4) sentiment = "강세 (콜 OI 압도)";
          else if (putCallRatio < 0.6) sentiment = "매수 우위";
          else if (putCallRatio < 0.9) sentiment = "중립";
          else if (putCallRatio < 1.3) sentiment = "매도 우위";
          else sentiment = "약세 (풋 OI 압도)";

          optionsSummary = {
            available: true,
            totalOptions: options.length,
            atmCallIV: Math.round(atmCallIV * 10000) / 100,
            atmPutIV: Math.round(atmPutIV * 10000) / 100,
            putCallRatio: Math.round(putCallRatio * 1000) / 1000,
            sentiment,
            expectedMovePct: Math.round(expectedMovePct * 100) / 100,
          };
        }
      }
    } catch {
      // 옵션 데이터 없어도 계속 진행
    }

    // ─────────────────────────────────────────────
    // 응답 구성
    // ─────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      symbol: upperSym,
      quote: {
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        prevClose: quote.prevClose,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        volume: quote.volume,
        marketState: quote.marketState,
      },
      info: {
        // 이름 우선: Symbol Universe 한글 → tickers 이름 → 심볼
        name: universeData.data?.name_ko || universeData.data?.name_en || tickerData.data?.name || upperSym,
        nameKo: universeData.data?.name_ko ?? null,
        nameEn: universeData.data?.name_en ?? null,
        segment: tickerData.data?.segment ?? null,
        country: universeData.data?.country ?? tickerData.data?.country ?? null,
        currency: universeData.data?.currency ?? null,
        exchange: universeData.data?.exchange ?? null,
        // 인덱스 멤버십
        inSp500: universeData.data?.in_sp500 ?? false,
        inNasdaq100: universeData.data?.in_nasdaq100 ?? false,
        inKospi100: universeData.data?.in_kospi100 ?? false,
        isSemi: universeData.data?.is_semi ?? false,
        semiCategory: universeData.data?.semi_category ?? null,
        gicsSector: universeData.data?.gics_sector ?? null,
        gicsIndustry: universeData.data?.gics_industry ?? null,
        isEtf: universeData.data?.is_etf ?? false,
        marketCapTier: universeData.data?.market_cap_tier ?? null,
      },
      // Warehouse 데이터
      warehouse: {
        correlations: (correlationsData.data ?? []).map((c: any) => ({
          otherSymbol: c.symbol_a === upperSym ? c.symbol_b : c.symbol_a,
          correlation: c.correlation,
          lookbackDays: c.lookback_days,
          computedDate: c.computed_date,
          sampleSize: c.sample_size,
        })),
        insights: (insightsData.data ?? []).map((i: any) => ({
          date: i.observation_date,
          category: i.category,
          title: i.title,
          insight: i.insight,
          confidence: i.confidence,
          tags: i.tags ?? [],
        })),
        upcomingEarnings: (earningsData.data ?? []).map((e: any) => ({
          date: e.earnings_date,
          quarter: e.quarter,
          importance: e.importance,
          time: e.earnings_time,
          notes: e.notes,
          affectedEtfs: e.affected_etfs ?? [],
        })),
      },
      returns,
      technicals: {
        sma20,
        sma50,
        sma200,
        rsi,
        volatility,
        high52w,
        low52w,
        position52wPct: high52w > low52w ? ((quote.price - low52w) / (high52w - low52w)) * 100 : null,
      },
      priceHistory: {
        "30d": history30d,
        "90d": history90d,
        "1y": fullHistory,
      },
      analysis: analysesData.data ?? null,
      signals: signalsData.data ?? null,
      agentConsensus: decisionsData.data ?? null,
      news: newsData.data ?? [],
      newsSentiment: newsSentimentData.data ?? [],
      predictions: predictionsData.data ?? [],
      forecasts: forecastsData.data ?? [],
      forecastAccuracy: accuracyData.data ?? [],
      options: optionsSummary,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      symbol: null,
      quote: null,
      info: null,
      returns: {},
      technicals: {},
      warehouse: { correlations: [], insights: [], upcomingEarnings: [] },
    });
  }
}
