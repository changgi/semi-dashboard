import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { runAllAgents, AgentContext, MacroContext } from "@/lib/agents";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// 메모리 캐시 (Lambda 컨테이너 생명주기 동안 유지)
// 전체 분석 결과를 5분간 캐시 → 6.4초 → 0.1초
// ═══════════════════════════════════════════════════════════
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

function getCached(key: string): unknown | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  CACHE.set(key, { data, timestamp: Date.now() });
  // 캐시 크기 제한 (최대 50개 키)
  if (CACHE.size > 50) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) CACHE.delete(oldest[0]);
  }
}

// ───────────────────────────────────────────────────────────────
// 반도체 종목 Fundamentals (정적 데이터 - 최신 분기 기준)
// 실제 운영에서는 Finnhub/Alpha Vantage 등에서 가져올 수 있음
// ───────────────────────────────────────────────────────────────
const FUNDAMENTALS: Record<
  string,
  {
    peRatio?: number;
    pbRatio?: number;
    dividendYield?: number;
    revenueGrowth?: number;
    profitMargin?: number;
    debtToEquity?: number;
    roe?: number;
    marketCap?: number;
    segment?: string;
  }
> = {
  NVDA: { peRatio: 32, pbRatio: 22, dividendYield: 0.03, revenueGrowth: 78, profitMargin: 52, debtToEquity: 0.4, roe: 115, marketCap: 4800, segment: "fabless" },
  AMD:  { peRatio: 45, pbRatio: 3.2, dividendYield: 0, revenueGrowth: 24, profitMargin: 11, debtToEquity: 0.1, roe: 8, marketCap: 220, segment: "fabless" },
  AVGO: { peRatio: 28, pbRatio: 9.1, dividendYield: 1.2, revenueGrowth: 44, profitMargin: 38, debtToEquity: 1.3, roe: 45, marketCap: 1500, segment: "fabless" },
  QCOM: { peRatio: 18, pbRatio: 6.5, dividendYield: 2.1, revenueGrowth: 9, profitMargin: 26, debtToEquity: 0.7, roe: 42, marketCap: 200, segment: "fabless" },
  ARM:  { peRatio: 82, pbRatio: 18, dividendYield: 0, revenueGrowth: 23, profitMargin: 22, debtToEquity: 0.1, roe: 12, marketCap: 145, segment: "fabless" },
  MRVL: { peRatio: 38, pbRatio: 4.2, dividendYield: 0.3, revenueGrowth: 49, profitMargin: 15, debtToEquity: 0.4, roe: 11, marketCap: 90, segment: "fabless" },
  TSM:  { peRatio: 22, pbRatio: 6.8, dividendYield: 1.4, revenueGrowth: 32, profitMargin: 41, debtToEquity: 0.3, roe: 29, marketCap: 900, segment: "foundry" },
  MU:   { peRatio: 12, pbRatio: 2.8, dividendYield: 0.5, revenueGrowth: 68, profitMargin: 22, debtToEquity: 0.3, roe: 24, marketCap: 130, segment: "memory" },
  ASML: { peRatio: 35, pbRatio: 20, dividendYield: 0.8, revenueGrowth: 28, profitMargin: 31, debtToEquity: 0.3, roe: 56, marketCap: 290, segment: "equipment" },
  AMAT: { peRatio: 22, pbRatio: 9.5, dividendYield: 0.9, revenueGrowth: 8, profitMargin: 26, debtToEquity: 0.5, roe: 47, marketCap: 170, segment: "equipment" },
  LRCX: { peRatio: 24, pbRatio: 12, dividendYield: 1.1, revenueGrowth: 23, profitMargin: 27, debtToEquity: 0.5, roe: 58, marketCap: 130, segment: "equipment" },
  KLAC: { peRatio: 26, pbRatio: 16, dividendYield: 0.7, revenueGrowth: 15, profitMargin: 29, debtToEquity: 0.8, roe: 72, marketCap: 100, segment: "equipment" },
  INTC: { peRatio: 48, pbRatio: 1.3, dividendYield: 1.5, revenueGrowth: 3, profitMargin: 7, debtToEquity: 0.5, roe: 3, marketCap: 130, segment: "foundry" },
  TXN:  { peRatio: 29, pbRatio: 10, dividendYield: 2.9, revenueGrowth: -4, profitMargin: 36, debtToEquity: 0.9, roe: 35, marketCap: 170, segment: "fabless" },
  ADI:  { peRatio: 30, pbRatio: 3.5, dividendYield: 1.8, revenueGrowth: -2, profitMargin: 26, debtToEquity: 0.3, roe: 12, marketCap: 110, segment: "fabless" },
  SMH:  { marketCap: 25, segment: "etf" },
  SOXX: { marketCap: 12, segment: "etf" },
  SMHX: { marketCap: 0.3, segment: "etf" },
  SOXL: { marketCap: 8, segment: "etf-3x-leveraged" },
  SOXS: { marketCap: 1, segment: "etf-3x-inverse" },
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const noCache = searchParams.get("nocache") === "1";

    // 캐시 체크 (심볼별로 분리 캐시)
    const cacheKey = symbol ? `agent:${symbol.toUpperCase()}` : "agent:all";
    if (!noCache) {
      const cached = getCached(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...(cached as object),
          _cache: "hit",
        });
      }
    }

    const supabase = createAdmin();

    // 분석할 종목 목록
    let symbols: string[];
    if (symbol) {
      symbols = [symbol.toUpperCase()];
    } else {
      const { data: tickers } = await supabase.from("tickers").select("symbol");
      symbols = (tickers ?? []).map((t) => t.symbol);
    }

    if (symbols.length === 0) {
      return NextResponse.json({ success: false, error: "No symbols" }, { status: 400 });
    }

    // ★ 매크로 데이터 병렬 fetch (모든 에이전트에 공통 전달)
    const macroSymbols = ["CL=F", "^TNX", "^VIX", "DX-Y.NYB", "^NDX", "SOXX"];
    const macroQuotes = await fetchYahooQuotes(macroSymbols).catch(() => new Map());
    const macro: MacroContext = {
      oilPrice: macroQuotes.get("CL=F")?.price,
      yield10Y: macroQuotes.get("^TNX")?.price,
      vix: macroQuotes.get("^VIX")?.price,
      dxy: macroQuotes.get("DX-Y.NYB")?.price,
      ndxChangePct: macroQuotes.get("^NDX")?.changePct,
      soxxChangePct: macroQuotes.get("SOXX")?.changePct,
    };

    // 최신 분석 스냅샷 로드 (sentiment, beta 용)
    const { data: analyses } = await supabase
      .from("analysis_snapshots")
      .select("symbol, sector_beta, news_sentiment_7d, price")
      .in("symbol", symbols)
      .order("date", { ascending: false });

    const analysisMap = new Map<string, typeof analyses extends (infer T)[] | null ? T : never>();
    for (const a of analyses ?? []) {
      if (!analysisMap.has(a.symbol)) analysisMap.set(a.symbol, a);
    }

    const results = [];

    for (const sym of symbols) {
      // 일봉 우선 조회
      let { data: hist } = await supabase
        .from("price_history")
        .select("price, day_high, day_low, timestamp")
        .eq("symbol", sym)
        .eq("interval_type", "1day")
        .order("timestamp", { ascending: true })
        .limit(1000);

      // 부족시 fallback (일별 종가)
      if (!hist || hist.length < 20) {
        const { data: allHist } = await supabase
          .from("price_history")
          .select("price, day_high, day_low, timestamp")
          .eq("symbol", sym)
          .order("timestamp", { ascending: true })
          .limit(10000);

        if (allHist && allHist.length > 0) {
          const dayMap = new Map<string, typeof allHist[0]>();
          for (const h of allHist) {
            const day = h.timestamp.split("T")[0];
            dayMap.set(day, h);
          }
          hist = Array.from(dayMap.values()).sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
          );
        }
      }

      if (!hist || hist.length < 10) {
        results.push({ symbol: sym, error: "insufficient data" });
        continue;
      }

      const prices = hist.map((h) => h.price).filter((p) => p && p > 0);
      const highs = hist.map((h, i) => h.day_high ?? prices[i] ?? 0);
      const lows = hist.map((h, i) => h.day_low ?? prices[i] ?? 0);

      const snap = analysisMap.get(sym);
      const fund = FUNDAMENTALS[sym] ?? {};

      const ctx: AgentContext = {
        symbol: sym,
        prices,
        highs,
        lows,
        currentPrice: prices[prices.length - 1],
        beta: snap?.sector_beta ?? 1.0,
        sentiment: snap?.news_sentiment_7d ?? 0,
        marketCap: fund.marketCap,
        segment: fund.segment,
        fundamentals: {
          peRatio: fund.peRatio,
          pbRatio: fund.pbRatio,
          dividendYield: fund.dividendYield,
          revenueGrowth: fund.revenueGrowth,
          profitMargin: fund.profitMargin,
          debtToEquity: fund.debtToEquity,
          roe: fund.roe,
        },
        macro, // ★ 모든 에이전트에 매크로 환경 전달
      };

      const { opinions, decision } = runAllAgents(ctx);

      results.push({
        symbol: sym,
        currentPrice: ctx.currentPrice,
        opinions,
        decision,
      });
    }

    const response = {
      success: true,
      count: results.length,
      macro, // 대시보드 표시용
      results,
    };

    // 캐시 저장
    setCached(cacheKey, response);

    return NextResponse.json({ ...response, _cache: "miss" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
