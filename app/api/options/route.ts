import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Black-Scholes 옵션 가격 모델 (Merton 1973, Scholes 1973 Nobel)
// ═══════════════════════════════════════════════════════════

const RISK_FREE_RATE = 0.0425; // 현재 10Y 국채 수익률 4.25%

// 표준 정규분포 CDF (Hart 알고리즘 근사)
function normalCDF(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// 표준 정규분포 PDF
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ───────────────────────────────────────────────────────────
// Black-Scholes 콜옵션 가격 + Greeks
// S: 기초자산 현재가
// K: 행사가
// T: 만기까지 기간 (년 단위)
// r: 무위험 이자율
// sigma: 내재변동성 (연율)
// ───────────────────────────────────────────────────────────
function blackScholes(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return {
      price: Math.max(0, isCall ? S - K : K - S),
      delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      intrinsic: Math.max(0, isCall ? S - K : K - S),
      timeValue: 0,
    };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const N_d1 = normalCDF(d1);
  const N_d2 = normalCDF(d2);
  const N_minus_d1 = normalCDF(-d1);
  const N_minus_d2 = normalCDF(-d2);
  const n_d1 = normalPDF(d1);

  const discount = Math.exp(-r * T);

  let price: number, delta: number, rho: number;
  if (isCall) {
    price = S * N_d1 - K * discount * N_d2;
    delta = N_d1;
    rho = K * T * discount * N_d2 / 100; // per 1% rate change
  } else {
    price = K * discount * N_minus_d2 - S * N_minus_d1;
    delta = -N_minus_d1;
    rho = -K * T * discount * N_minus_d2 / 100;
  }

  // 공통 Greeks
  const gamma = n_d1 / (S * sigma * Math.sqrt(T));
  const theta = isCall
    ? (-S * n_d1 * sigma / (2 * Math.sqrt(T)) - r * K * discount * N_d2) / 365 // per day
    : (-S * n_d1 * sigma / (2 * Math.sqrt(T)) + r * K * discount * N_minus_d2) / 365;
  const vega = S * n_d1 * Math.sqrt(T) / 100; // per 1% vol change

  const intrinsic = Math.max(0, isCall ? S - K : K - S);
  const timeValue = price - intrinsic;

  return {
    price: Math.max(0, price),
    delta,
    gamma,
    theta,
    vega,
    rho,
    intrinsic,
    timeValue: Math.max(0, timeValue),
  };
}

// ───────────────────────────────────────────────────────────
// 내재변동성 계산 (역사 변동성 기반 - 실측 시장 IV 대체)
// 20일 로그수익률의 표준편차 × √252
// ───────────────────────────────────────────────────────────
function historicalVolatility(prices: number[], period = 20): number {
  if (prices.length < period + 1) return 0.30; // 기본값
  const returns: number[] = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance * 252);
}

// ───────────────────────────────────────────────────────────
// 옵션 체인 구성 (현재가 기준 ±20% 행사가 9개)
// ───────────────────────────────────────────────────────────
function buildOptionChain(currentPrice: number, iv: number, daysToExpiry: number) {
  const T = daysToExpiry / 365;
  const r = RISK_FREE_RATE;

  // 현재가 ±20% 범위 9개 행사가
  const strikes: number[] = [];
  const step = currentPrice * 0.05; // 5% 간격
  for (let i = -4; i <= 4; i++) {
    strikes.push(Math.round((currentPrice + i * step) * 100) / 100);
  }

  const chain = strikes.map((K) => {
    const call = blackScholes(currentPrice, K, T, r, iv, true);
    const put = blackScholes(currentPrice, K, T, r, iv, false);
    const moneyness = (currentPrice - K) / K;
    let status: "ITM" | "ATM" | "OTM";
    const moneyPct = moneyness * 100;
    if (Math.abs(moneyPct) < 1) status = "ATM";
    else if (moneyPct > 0) status = "ITM";
    else status = "OTM";

    return {
      strike: K,
      moneynessPct: Math.round(moneyness * 10000) / 100,
      status,
      call: {
        price: Math.round(call.price * 100) / 100,
        delta: Math.round(call.delta * 1000) / 1000,
        gamma: Math.round(call.gamma * 10000) / 10000,
        theta: Math.round(call.theta * 100) / 100,
        vega: Math.round(call.vega * 100) / 100,
        intrinsic: Math.round(call.intrinsic * 100) / 100,
        timeValue: Math.round(call.timeValue * 100) / 100,
      },
      put: {
        price: Math.round(put.price * 100) / 100,
        delta: Math.round(put.delta * 1000) / 1000,
        gamma: Math.round(put.gamma * 10000) / 10000,
        theta: Math.round(put.theta * 100) / 100,
        vega: Math.round(put.vega * 100) / 100,
        intrinsic: Math.round(put.intrinsic * 100) / 100,
        timeValue: Math.round(put.timeValue * 100) / 100,
      },
    };
  });

  return chain;
}

// ═══════════════════════════════════════════════════════════
// API 핸들러
// ═══════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
    }

    const supabase = createAdmin();

    // 1. 현재가 조회
    const { data: quote } = await supabase
      .from("quotes")
      .select("symbol, price, day_high, day_low, change_pct, updated_at")
      .eq("symbol", symbol.toUpperCase())
      .single();

    if (!quote?.price) {
      return NextResponse.json({ success: false, error: "no price data" }, { status: 404 });
    }

    // 2. 히스토리 데이터 조회 (내재변동성 계산용)
    const { data: hist } = await supabase
      .from("price_history")
      .select("price, timestamp")
      .eq("symbol", symbol.toUpperCase())
      .eq("interval_type", "1day")
      .order("timestamp", { ascending: true })
      .limit(60);

    const prices = (hist ?? []).map((h) => h.price).filter((p) => p && p > 0);
    const hv20 = historicalVolatility(prices, 20);
    const hv60 = historicalVolatility(prices, 60);

    // 3. 여러 만기에 대한 옵션 체인
    const expiries = [
      { days: 7,   label: "1주일" },
      { days: 30,  label: "1개월" },
      { days: 60,  label: "2개월" },
      { days: 90,  label: "3개월" },
      { days: 180, label: "6개월" },
    ];

    const optionChains = expiries.map((exp) => ({
      daysToExpiry: exp.days,
      label: exp.label,
      expiryDate: new Date(Date.now() + exp.days * 24 * 3600 * 1000).toISOString().split("T")[0],
      chain: buildOptionChain(quote.price, hv20, exp.days),
    }));

    // 4. 주요 지표 (ATM 30일 옵션 기준)
    const atm30 = optionChains[1].chain.find((c) => c.status === "ATM") ??
                  optionChains[1].chain[Math.floor(optionChains[1].chain.length / 2)];

    // Put/Call Ratio (ATM 기준 이론값)
    const putCallRatio = atm30 ? atm30.put.price / (atm30.call.price + atm30.put.price) : 0.5;

    // 해석
    let sentiment: string;
    if (putCallRatio > 0.55) sentiment = "약세 (풋 프리미엄 상대적 높음)";
    else if (putCallRatio < 0.45) sentiment = "강세 (콜 프리미엄 상대적 높음)";
    else sentiment = "중립";

    return NextResponse.json({
      success: true,
      symbol: symbol.toUpperCase(),
      currentPrice: quote.price,
      changePct: quote.change_pct,
      volatility: {
        hv20: Math.round(hv20 * 10000) / 100, // 20일 역사 변동성 %
        hv60: Math.round(hv60 * 10000) / 100,
        iv: Math.round(hv20 * 10000) / 100,   // IV 근사로 사용 (시장 IV API 없어서)
      },
      riskFreeRate: RISK_FREE_RATE * 100,
      optionChains,
      atm30,
      putCallRatio: Math.round(putCallRatio * 1000) / 1000,
      sentiment,
      model: "Black-Scholes-Merton (1973)",
      disclaimer: "계산된 이론값입니다. 실제 시장 호가와 차이 있을 수 있음",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
