import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// CBOE 실제 옵션 데이터 API
// https://cdn.cboe.com/api/global/delayed_quotes/options/{SYMBOL}.json
// 실시간 지연 호가 + IV + Greeks + OI + Volume
// ═══════════════════════════════════════════════════════════

// 옵션 심볼 파싱: NVDA260417C00005000
// = 티커(NVDA) + 년(26) + 월(04) + 일(17) + 타입(C/P) + 행사가×1000(00005000)
function parseOptionSymbol(sym: string): {
  ticker: string;
  expiry: string;
  type: "call" | "put";
  strike: number;
} | null {
  const match = sym.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;
  const [, ticker, yy, mm, dd, type, strikeRaw] = match;
  return {
    ticker,
    expiry: `20${yy}-${mm}-${dd}`,
    type: type === "C" ? "call" : "put",
    strike: parseInt(strikeRaw) / 1000,
  };
}

interface CboeOption {
  option: string;
  bid: number;
  bid_size: number;
  ask: number;
  ask_size: number;
  iv: number;
  open_interest: number;
  volume: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  theo: number;
  last_trade_price: number;
  last_trade_time: string;
  percent_change: number;
  prev_day_close: number;
}

interface CboeResponse {
  data: {
    current_price: number;
    bid: number;
    ask: number;
    price_change: number;
    open: number;
    close: number;
    high: number;
    low: number;
    options: CboeOption[];
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
    }

    const upperSym = symbol.toUpperCase();
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${upperSym}.json`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `CBOE returned ${res.status}`, symbol: upperSym },
        { status: res.status }
      );
    }

    const raw: CboeResponse = await res.json();
    const currentPrice = raw.data.current_price;
    const allOptions = raw.data.options ?? [];

    // 만기별로 그룹화
    const byExpiry = new Map<string, { call?: CboeOption & { strike: number }; put?: CboeOption & { strike: number } }[]>();
    const expiryDataByDate = new Map<
      string,
      Map<number, { call?: CboeOption & { strike: number }; put?: CboeOption & { strike: number } }>
    >();

    for (const opt of allOptions) {
      const parsed = parseOptionSymbol(opt.option);
      if (!parsed) continue;

      if (!expiryDataByDate.has(parsed.expiry)) {
        expiryDataByDate.set(parsed.expiry, new Map());
      }
      const strikeMap = expiryDataByDate.get(parsed.expiry)!;
      const key = parsed.strike;
      const existing = strikeMap.get(key) ?? {};
      const optWithStrike = { ...opt, strike: parsed.strike };
      if (parsed.type === "call") existing.call = optWithStrike;
      else existing.put = optWithStrike;
      strikeMap.set(key, existing);
    }

    // 현재 시점 이후 만기만 필터링, 정렬
    const today = new Date().toISOString().split("T")[0];
    const futureExpiries = Array.from(expiryDataByDate.keys())
      .filter((e) => e >= today)
      .sort();

    if (futureExpiries.length === 0) {
      return NextResponse.json({
        success: false,
        error: "no future expiries",
        symbol: upperSym,
      });
    }

    // 주요 만기 선별 (최대 8개: 가까운 4개 + 멀리 4개 분포)
    const selectedExpiries = selectKeyExpiries(futureExpiries);

    const optionChains = selectedExpiries.map((expiry) => {
      const strikeMap = expiryDataByDate.get(expiry)!;
      const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);

      // 현재가 ±30% 범위만 (모든 행사가는 너무 많음)
      const relevantStrikes = strikes.filter(
        (k) => k >= currentPrice * 0.7 && k <= currentPrice * 1.3
      );

      // 만기까지 일수
      const expDate = new Date(expiry);
      const daysToExpiry = Math.round(
        (expDate.getTime() - Date.now()) / (1000 * 3600 * 24)
      );

      const chain = relevantStrikes.map((strike) => {
        const entry = strikeMap.get(strike)!;
        const moneyness = (currentPrice - strike) / strike;
        let status: "ITM" | "ATM" | "OTM";
        const moneyPct = moneyness * 100;
        if (Math.abs(moneyPct) < 1.5) status = "ATM";
        else if (moneyPct > 0) status = "ITM";
        else status = "OTM";

        const formatOpt = (o?: CboeOption & { strike: number }) => {
          if (!o) return null;
          return {
            bid: o.bid || 0,
            ask: o.ask || 0,
            last: o.last_trade_price || 0,
            mid: (o.bid + o.ask) / 2 || o.theo || 0,
            iv: o.iv || 0,
            volume: o.volume || 0,
            openInterest: o.open_interest || 0,
            delta: o.delta || 0,
            gamma: o.gamma || 0,
            theta: o.theta || 0,
            vega: o.vega || 0,
            rho: o.rho || 0,
            theo: o.theo || 0,
            changePct: o.percent_change || 0,
          };
        };

        return {
          strike,
          moneynessPct: Math.round(moneyness * 10000) / 100,
          status,
          call: formatOpt(entry.call),
          put: formatOpt(entry.put),
        };
      });

      // ATM 행사가 찾기 (현재가와 가장 가까운 행사가)
      const atmStrike = relevantStrikes.reduce((closest, k) =>
        Math.abs(k - currentPrice) < Math.abs(closest - currentPrice) ? k : closest
      );

      return {
        expiry,
        daysToExpiry,
        chain,
        atmStrike,
      };
    });

    // 주요 지표: 30일 근접 만기의 ATM 데이터
    const target30d = selectedExpiries.reduce((best, e) => {
      const days = Math.round(
        (new Date(e).getTime() - Date.now()) / (1000 * 3600 * 24)
      );
      const bestDays = Math.round(
        (new Date(best).getTime() - Date.now()) / (1000 * 3600 * 24)
      );
      return Math.abs(days - 30) < Math.abs(bestDays - 30) ? e : best;
    });

    const chain30 = optionChains.find((c) => c.expiry === target30d);
    const atmEntry = chain30?.chain.find((c) => c.strike === chain30.atmStrike);

    // Put/Call Ratio 계산 (전체 OI 기준)
    let totalCallOI = 0;
    let totalPutOI = 0;
    let totalCallVol = 0;
    let totalPutVol = 0;
    let atmCallIV = 0;
    let atmPutIV = 0;

    for (const opt of allOptions) {
      const parsed = parseOptionSymbol(opt.option);
      if (!parsed || parsed.expiry !== target30d) continue;
      if (parsed.type === "call") {
        totalCallOI += opt.open_interest || 0;
        totalCallVol += opt.volume || 0;
        if (Math.abs(parsed.strike - currentPrice) < currentPrice * 0.02 && opt.iv > 0) {
          atmCallIV = opt.iv;
        }
      } else {
        totalPutOI += opt.open_interest || 0;
        totalPutVol += opt.volume || 0;
        if (Math.abs(parsed.strike - currentPrice) < currentPrice * 0.02 && opt.iv > 0) {
          atmPutIV = opt.iv;
        }
      }
    }

    const putCallRatioOI = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;
    const putCallRatioVol = totalCallVol > 0 ? totalPutVol / totalCallVol : 1;

    // 센티먼트 (풋/콜 비율 기반)
    let sentiment: string;
    if (putCallRatioOI > 0.9) sentiment = "약세 (풋 OI가 콜을 압도)";
    else if (putCallRatioOI > 0.7) sentiment = "약보합 (풋 수요 증가)";
    else if (putCallRatioOI > 0.5) sentiment = "중립";
    else if (putCallRatioOI > 0.3) sentiment = "강보합 (콜 수요 증가)";
    else sentiment = "강세 (콜 OI가 압도적)";

    return NextResponse.json({
      success: true,
      symbol: upperSym,
      currentPrice,
      priceChange: raw.data.price_change,
      open: raw.data.open,
      high: raw.data.high,
      low: raw.data.low,
      bid: raw.data.bid,
      ask: raw.data.ask,
      optionChains,
      nearTermExpiry: target30d,
      atmEntry,
      atmCallIV: atmCallIV * 100, // to %
      atmPutIV: atmPutIV * 100,
      ivSkew: (atmPutIV - atmCallIV) * 100, // 풋 IV가 높으면 양수 (downside 보호 수요)
      putCallRatioOI: Math.round(putCallRatioOI * 1000) / 1000,
      putCallRatioVol: Math.round(putCallRatioVol * 1000) / 1000,
      totalCallOI,
      totalPutOI,
      totalCallVol,
      totalPutVol,
      sentiment,
      totalOptions: allOptions.length,
      expiryCount: futureExpiries.length,
      dataSource: "CBOE (15-min delayed)",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────
// 주요 만기 선별 (8개: 가까운 편중)
// ───────────────────────────────────────────────────────────
function selectKeyExpiries(expiries: string[]): string[] {
  if (expiries.length <= 8) return expiries;

  const selected: string[] = [];
  const now = Date.now();

  // 각 범위에서 1개씩 뽑기
  const ranges = [
    { minDays: 0,   maxDays: 7 },    // 1주
    { minDays: 7,   maxDays: 14 },   // 2주
    { minDays: 14,  maxDays: 30 },   // 1개월
    { minDays: 30,  maxDays: 60 },   // 2개월
    { minDays: 60,  maxDays: 90 },   // 3개월
    { minDays: 90,  maxDays: 180 },  // 6개월
    { minDays: 180, maxDays: 365 },  // 1년
    { minDays: 365, maxDays: 9999 }, // LEAPS
  ];

  for (const r of ranges) {
    const found = expiries.find((e) => {
      if (selected.includes(e)) return false;
      const days = (new Date(e).getTime() - now) / (1000 * 3600 * 24);
      return days >= r.minDays && days <= r.maxDays;
    });
    if (found) selected.push(found);
  }

  return selected.length > 0 ? selected : expiries.slice(0, 6);
}
