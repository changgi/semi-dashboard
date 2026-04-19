import { NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// 전체 반도체 종목 옵션 시장 스캐너
// 각 종목의 옵션 시장 센티먼트를 한번에 비교
// ═══════════════════════════════════════════════════════════

const SCAN_SYMBOLS = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "LRCX", "KLAC", "INTC", "ARM", "QCOM", "MRVL", "AMAT", "TXN"];

// ═══════════════════════════════════════════════════════════
// 메모리 캐시 (5분)
// ═══════════════════════════════════════════════════════════
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseOptionSymbol(sym: string) {
  const match = sym.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;
  const [, , yy, mm, dd, type, strikeRaw] = match;
  return {
    expiry: `20${yy}-${mm}-${dd}`,
    type: type === "C" ? "call" : "put",
    strike: parseInt(strikeRaw) / 1000,
  };
}

async function fetchSymbolMetrics(symbol: string) {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const currentPrice = data.data.current_price;
    const options = data.data.options ?? [];

    // 가장 가까운 30일 만기 찾기
    const today = new Date().toISOString().split("T")[0];
    const expirySet = new Set<string>();
    for (const opt of options) {
      const p = parseOptionSymbol(opt.option);
      if (p && p.expiry >= today) expirySet.add(p.expiry);
    }
    const expiries = Array.from(expirySet).sort();
    if (expiries.length === 0) return null;

    const target = expiries.reduce((best, e) => {
      const days = (new Date(e).getTime() - Date.now()) / (1000 * 3600 * 24);
      const bestDays = (new Date(best).getTime() - Date.now()) / (1000 * 3600 * 24);
      return Math.abs(days - 30) < Math.abs(bestDays - 30) ? e : best;
    });

    const targetDays = Math.round(
      (new Date(target).getTime() - Date.now()) / (1000 * 3600 * 24)
    );

    // 타겟 만기 옵션만 분석
    let callOI = 0, putOI = 0, callVol = 0, putVol = 0;
    let atmCallIV = 0, atmPutIV = 0;
    let atmCallPrice = 0, atmPutPrice = 0;
    let atmStrike = 0;
    const ivsC: number[] = [];
    const ivsP: number[] = [];

    for (const opt of options) {
      const p = parseOptionSymbol(opt.option);
      if (!p || p.expiry !== target) continue;
      if (p.type === "call") {
        callOI += opt.open_interest || 0;
        callVol += opt.volume || 0;
        if (opt.iv > 0) ivsC.push(opt.iv);
        if (Math.abs(p.strike - currentPrice) < currentPrice * 0.015) {
          atmCallIV = opt.iv;
          atmCallPrice = (opt.bid + opt.ask) / 2;
          atmStrike = p.strike;
        }
      } else {
        putOI += opt.open_interest || 0;
        putVol += opt.volume || 0;
        if (opt.iv > 0) ivsP.push(opt.iv);
        if (Math.abs(p.strike - currentPrice) < currentPrice * 0.015) {
          atmPutIV = opt.iv;
          atmPutPrice = (opt.bid + opt.ask) / 2;
        }
      }
    }

    // 평균 IV (전체 만기 가중치 아닌 단순 평균)
    const avgCallIV = ivsC.length > 0 ? ivsC.reduce((s, v) => s + v, 0) / ivsC.length : 0;
    const avgPutIV = ivsP.length > 0 ? ivsP.reduce((s, v) => s + v, 0) / ivsP.length : 0;

    const putCallOI = callOI > 0 ? putOI / callOI : 1;
    const putCallVol = callVol > 0 ? putVol / callVol : 1;

    // IV 스큐 (풋 - 콜)
    const ivSkew = (atmPutIV - atmCallIV) * 100;

    // 예상 움직임 범위 (ATM 옵션 straddle 가격 = ±1σ 가격 변동 기대치)
    const expectedMove = atmCallPrice + atmPutPrice;
    const expectedMovePct = currentPrice > 0 ? (expectedMove / currentPrice) * 100 : 0;

    // 센티먼트 분류
    let sentiment: "strong_bullish" | "bullish" | "neutral" | "bearish" | "strong_bearish";
    if (putCallOI < 0.4) sentiment = "strong_bullish";
    else if (putCallOI < 0.6) sentiment = "bullish";
    else if (putCallOI < 0.9) sentiment = "neutral";
    else if (putCallOI < 1.3) sentiment = "bearish";
    else sentiment = "strong_bearish";

    return {
      symbol,
      currentPrice,
      expiry: target,
      daysToExpiry: targetDays,
      atmStrike,
      atmCallIV: atmCallIV * 100,
      atmPutIV: atmPutIV * 100,
      avgCallIV: avgCallIV * 100,
      avgPutIV: avgPutIV * 100,
      ivSkew: Math.round(ivSkew * 100) / 100,
      putCallOI: Math.round(putCallOI * 1000) / 1000,
      putCallVol: Math.round(putCallVol * 1000) / 1000,
      callOI,
      putOI,
      callVol,
      putVol,
      expectedMove: Math.round(expectedMove * 100) / 100,
      expectedMovePct: Math.round(expectedMovePct * 100) / 100,
      sentiment,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // 캐시 체크
    const cacheKey = "scanner:all";
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        ...(cached.data as object),
        _cache: "hit",
      });
    }

    // 병렬로 모든 종목 스캔
    const results = await Promise.all(SCAN_SYMBOLS.map(fetchSymbolMetrics));
    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);

    // IV 높은 순 / 낮은 순
    const sortedByIV = [...valid].sort((a, b) => b.atmCallIV - a.atmCallIV);
    const sortedByPutCall = [...valid].sort((a, b) => a.putCallOI - b.putCallOI);
    const sortedByExpectedMove = [...valid].sort(
      (a, b) => b.expectedMovePct - a.expectedMovePct
    );

    // 전체 평균
    const avgIV = valid.reduce((s, v) => s + v.atmCallIV, 0) / valid.length;
    const avgPutCall = valid.reduce((s, v) => s + v.putCallOI, 0) / valid.length;
    const avgExpectedMove = valid.reduce((s, v) => s + v.expectedMovePct, 0) / valid.length;

    // 극단 케이스 찾기
    const mostBullish = valid.filter((v) => v.putCallOI < 0.5).sort((a, b) => a.putCallOI - b.putCallOI).slice(0, 3);
    const mostBearish = valid.filter((v) => v.putCallOI > 1.0).sort((a, b) => b.putCallOI - a.putCallOI).slice(0, 3);
    const highestIV = valid.filter((v) => v.atmCallIV > 40).sort((a, b) => b.atmCallIV - a.atmCallIV).slice(0, 5);
    const extremeMove = valid.filter((v) => v.expectedMovePct > 8).slice(0, 5);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      totalSymbols: valid.length,
      skipped: SCAN_SYMBOLS.length - valid.length,
      summary: {
        avgIV: Math.round(avgIV * 10) / 10,
        avgPutCall: Math.round(avgPutCall * 1000) / 1000,
        avgExpectedMovePct: Math.round(avgExpectedMove * 100) / 100,
      },
      rankings: {
        highestIV: sortedByIV.slice(0, 10),
        mostBullish: sortedByPutCall.slice(0, 10),
        expectedMove: sortedByExpectedMove.slice(0, 10),
      },
      highlights: {
        mostBullish,
        mostBearish,
        highestIV,
        extremeMove,
      },
      all: valid,
    };

    CACHE.set(cacheKey, { data: response, timestamp: Date.now() });

    return NextResponse.json({ ...response, _cache: "miss" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
