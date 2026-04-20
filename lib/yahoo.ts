// ================================================
// Yahoo Finance (비공식 API) - 과거 데이터용
// 무제한이지만 프로덕션에서는 rate limit 조심
// ================================================

export interface YahooBar {
  date: string; // YYYY-MM-DD
  timestamp: number; // unix
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 과거 일봉 데이터 조회
 * @param symbol 종목 심볼
 * @param range "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y"
 */
export async function fetchYahooHistory(
  symbol: string,
  range: string = "1y"
): Promise<YahooBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      // 10초 타임아웃
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = q.open ?? [];
    const highs: (number | null)[] = q.high ?? [];
    const lows: (number | null)[] = q.low ?? [];
    const closes: (number | null)[] = q.close ?? [];
    const volumes: (number | null)[] = q.volume ?? [];

    const bars: YahooBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close === null || close === undefined) continue;

      const ts = timestamps[i];
      const date = new Date(ts * 1000).toISOString().split("T")[0];
      bars.push({
        date,
        timestamp: ts * 1000,
        open: opens[i] ?? close,
        high: highs[i] ?? close,
        low: lows[i] ?? close,
        close,
        volume: volumes[i] ?? 0,
      });
    }

    return bars.sort((a, b) => a.timestamp - b.timestamp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Yahoo fetch failed for ${symbol}: ${msg}`);
  }
}

/**
 * 현재 시세 조회 (실시간)
 * meta 정보와 최근 1분봉에서 현재가 추출
 */
export interface YahooQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  currency?: string;
  marketState?: string; // REGULAR, CLOSED, PRE, POST
}

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.meta) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      price,
      change,
      changePct,
      prevClose,
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      currency: meta.currency,
      marketState: meta.marketState,
    };
  } catch (e) {
    return null;
  }
}

/**
 * 여러 심볼 동시 조회
 */
export async function fetchYahooQuotes(
  symbols: string[]
): Promise<Map<string, YahooQuote>> {
  const results = await Promise.all(symbols.map((s) => fetchYahooQuote(s)));
  const map = new Map<string, YahooQuote>();
  results.forEach((q, i) => {
    if (q) map.set(symbols[i], q);
  });
  return map;
}

// ═══════════════════════════════════════════════════════════
// 종목명 조회 (Chart API meta 기반)
// ═══════════════════════════════════════════════════════════

export interface YahooSymbolInfo {
  symbol: string;
  shortName: string | null;
  longName: string | null;
  exchangeName: string | null;
  currency: string | null;
  instrumentType: string | null;
}

/**
 * 단일 심볼의 이름/거래소/통화 정보 조회
 */
export async function fetchYahooSymbolInfo(
  symbol: string
): Promise<YahooSymbolInfo | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    return {
      symbol: meta.symbol ?? symbol,
      shortName: meta.shortName ?? null,
      longName: meta.longName ?? null,
      exchangeName: meta.exchangeName ?? null,
      currency: meta.currency ?? null,
      instrumentType: meta.instrumentType ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * 여러 심볼 동시 이름 조회
 */
export async function fetchYahooSymbolInfos(
  symbols: string[]
): Promise<Map<string, YahooSymbolInfo>> {
  const results = await Promise.all(symbols.map((s) => fetchYahooSymbolInfo(s)));
  const map = new Map<string, YahooSymbolInfo>();
  results.forEach((info, i) => {
    if (info) map.set(symbols[i], info);
  });
  return map;
}
