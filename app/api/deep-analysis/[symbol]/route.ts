import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/deep-analysis/[symbol]
 *
 * 단일 종목 통합 분석 엔진.
 * - 차트 데이터 (1년 일봉)
 * - 기술 지표 (RSI, MACD, SMA, 볼린저)
 * - 기본 정보 (PER, 성장률)
 * - 시황 컨텍스트 (SPY/QQQ/VIX/섹터)
 * - 카일 포트폴리오 내 위치
 * - 진단 (강점/약점/리스크)
 * - 예측 (3시나리오 + 가격 레인지)
 * - 이유 체인 (왜/언제/어떻게/얼마)
 * - 액션 추천
 */

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Technical = {
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bollUpper: number | null;
  bollMid: number | null;
  bollLower: number | null;
  bollPosition: number | null; // 0-1 범위 내 위치
  atr14: number | null;
  vol20: number | null; // 20일 일간 표준편차 %
  week52High: number;
  week52Low: number;
  week52Position: number; // 0-1
  trend: "uptrend" | "downtrend" | "sideways";
  momentum5d: number;
  momentum20d: number;
};

function sma(arr: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += arr[j];
    out.push(sum / period);
  }
  return out;
}

function ema(arr: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) { out.push(prev); continue; }
    if (prev == null) {
      if (i < period - 1) { out.push(null); continue; }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += arr[j];
      prev = sum / period;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function rsi(arr: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let gains = 0, losses = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { out.push(null); continue; }
    const diff = arr[i] - arr[i - 1];
    if (i <= period) {
      if (diff > 0) gains += diff; else losses -= diff;
      if (i === period) {
        const avgG = gains / period, avgL = losses / period;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        out.push(100 - 100 / (1 + rs));
      } else out.push(null);
    } else {
      const g = diff > 0 ? diff : 0;
      const l = diff < 0 ? -diff : 0;
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  for (let i = 1; i < candles.length; i++) {
    if (i < period) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period; j < i; j++) sum += trs[j];
    out.push(sum / period);
  }
  return out;
}

function stdev(arr: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += arr[j];
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (arr[j] - mean) ** 2;
    out.push(Math.sqrt(sq / period));
  }
  return out;
}

async function fetchCandles(symbol: string): Promise<Candle[]> {
  const bars = await fetchYahooHistory(symbol, "2y");
  return bars.map(b => ({
    date: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  })).filter(c => c.close != null);
}

function computeTechnical(candles: Candle[]): Technical {
  const closes = candles.map(c => c.close);
  const sma20Arr = sma(closes, 20);
  const sma50Arr = sma(closes, 50);
  const sma200Arr = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => {
    const a = ema12[i], b = ema26[i];
    return a != null && b != null ? a - b : null;
  });
  const macdValidIdx: number[] = [];
  const macdValidVals: number[] = [];
  macdLine.forEach((v, i) => { if (v != null) { macdValidIdx.push(i); macdValidVals.push(v); } });
  const signalRaw = ema(macdValidVals, 9);
  const macdSignal: (number | null)[] = new Array(closes.length).fill(null);
  macdValidIdx.forEach((realIdx, i) => { if (signalRaw[i] != null) macdSignal[realIdx] = signalRaw[i]; });
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(candles, 14);
  const stdArr = stdev(closes, 20);
  const last = closes.length - 1;
  const bollMid = sma20Arr[last];
  const bollStd = stdArr[last];
  const bollUpper = bollMid != null && bollStd != null ? bollMid + 2 * bollStd : null;
  const bollLower = bollMid != null && bollStd != null ? bollMid - 2 * bollStd : null;
  const bollPos = bollUpper != null && bollLower != null
    ? (closes[last] - bollLower) / (bollUpper - bollLower)
    : null;

  const pct252 = Math.min(252, closes.length);
  const last252 = closes.slice(-pct252);
  const week52High = Math.max(...last252);
  const week52Low = Math.min(...last252);
  const week52Pos = (closes[last] - week52Low) / (week52High - week52Low);

  const sma20 = sma20Arr[last], sma50 = sma50Arr[last], sma200 = sma200Arr[last];
  let trend: "uptrend" | "downtrend" | "sideways" = "sideways";
  if (sma20 != null && sma50 != null && sma200 != null) {
    if (sma20 > sma50 && sma50 > sma200 && closes[last] > sma20) trend = "uptrend";
    else if (sma20 < sma50 && sma50 < sma200 && closes[last] < sma20) trend = "downtrend";
  }

  const mom5 = closes.length >= 6 ? (closes[last] / closes[last - 5] - 1) * 100 : 0;
  const mom20 = closes.length >= 21 ? (closes[last] / closes[last - 20] - 1) * 100 : 0;

  const vol20 = stdArr[last] != null && closes[last] ? (stdArr[last]! / closes[last]) * 100 : null;

  return {
    rsi14: rsiArr[last],
    sma20, sma50, sma200,
    macd: macdLine[last],
    macdSignal: macdSignal[last],
    macdHist: macdLine[last] != null && macdSignal[last] != null ? macdLine[last]! - macdSignal[last]! : null,
    bollUpper, bollMid, bollLower, bollPosition: bollPos,
    atr14: atrArr[last],
    vol20,
    week52High, week52Low, week52Position: week52Pos,
    trend,
    momentum5d: mom5,
    momentum20d: mom20,
  };
}

// 시황 컨텍스트 (간략)
async function fetchMarketContext() {
  try {
    const results = await Promise.all(
      ["SPY", "QQQ", "^VIX", "XLK", "XLE"].map(async (s) => {
        try {
          const q = await fetchYahooQuote(s);
          return {
            symbol: s,
            price: q?.price ?? null,
            changePct: q?.changePct ?? null,
          };
        } catch { return { symbol: s, price: null, changePct: null }; }
      })
    );
    return results.reduce((acc, r) => { acc[r.symbol] = r; return acc; }, {} as Record<string, any>);
  } catch {
    return {};
  }
}

// 카일 포트폴리오 내 위치
async function fetchPortfolioContext(symbol: string) {
  try {
    const supabase = createAdmin();
    const { data } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true)
      .eq("symbol", symbol)
      .maybeSingle();
    if (!data) return null;
    // 레버리지는 심볼 기반 추론
    const LEVERAGE_BY_SYMBOL: Record<string, number> = {
      ORCX: 2, ORCU: 2, ORCS: 2, AMZU: 2, TSLL: 2,
      NVDU: 2, NVDL: 2, TQQQ: 3, SOXL: 3, TNA: 3,
    };
    const leverage = LEVERAGE_BY_SYMBOL[symbol] ?? 1;
    const cost = data.shares * data.avg_cost;
    return {
      held: true,
      shares: data.shares,
      avgCost: data.avg_cost,
      costBasis: cost,
      leverage,
      notes: data.notes ?? null,
    };
  } catch {
    return null;
  }
}

// 진단 엔진
function diagnose(tech: Technical, price: number, portfolioCtx: any) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];

  if (tech.trend === "uptrend") strengths.push("20·50·200일선 정배열 (장기 상승 추세)");
  if (tech.trend === "downtrend") weaknesses.push("20·50·200일선 역배열 (장기 하락 추세)");
  if (tech.rsi14 != null) {
    if (tech.rsi14 < 30) strengths.push(`RSI ${tech.rsi14.toFixed(1)} — 과매도 구간, 반등 기대`);
    else if (tech.rsi14 > 70) weaknesses.push(`RSI ${tech.rsi14.toFixed(1)} — 과매수 구간, 조정 임박`);
  }
  if (tech.macdHist != null && tech.macdHist > 0) strengths.push("MACD 히스토그램 양전환 (모멘텀 개선)");
  if (tech.macdHist != null && tech.macdHist < 0) weaknesses.push("MACD 히스토그램 음수 (모멘텀 약화)");
  if (tech.week52Position > 0.85) weaknesses.push(`52주 고점 근접 (${(tech.week52Position * 100).toFixed(0)}%), 추격 매수 주의`);
  if (tech.week52Position < 0.2) strengths.push(`52주 저점 근접 (${(tech.week52Position * 100).toFixed(0)}%), 가치 매력`);
  if (tech.momentum20d > 10) strengths.push(`20일 +${tech.momentum20d.toFixed(1)}% 강한 상승 모멘텀`);
  if (tech.momentum20d < -10) weaknesses.push(`20일 ${tech.momentum20d.toFixed(1)}% 약세 모멘텀`);
  if (tech.vol20 != null && tech.vol20 > 5) risks.push(`20일 변동성 ${tech.vol20.toFixed(1)}% — 높은 변동성`);
  if (tech.bollPosition != null) {
    if (tech.bollPosition > 0.95) weaknesses.push("볼린저 상단 돌파 — 과열");
    else if (tech.bollPosition < 0.05) strengths.push("볼린저 하단 터치 — 반등 포인트");
  }

  if (portfolioCtx?.held) {
    const pnlPct = (price / portfolioCtx.avgCost - 1) * 100;
    if (pnlPct < -20 && portfolioCtx.leverage >= 2) risks.push(`레버리지 ETF ${pnlPct.toFixed(1)}% 손실 — 시간 감가 누적 위험`);
    if (pnlPct < -30) risks.push(`심각한 손실 (${pnlPct.toFixed(1)}%) — 본전 회귀보다 현 시점 최적화 우선`);
  }

  return { strengths, weaknesses, risks };
}

// 예측 엔진 (ATR 기반 간단 몬테카를로)
function forecast(tech: Technical, price: number, horizonDays: number) {
  const sigma = (tech.vol20 ?? 3) / 100; // 일간 변동성
  const daily = sigma;
  const horSigma = daily * Math.sqrt(horizonDays);

  // 추세 바이어스
  let drift = 0;
  if (tech.trend === "uptrend") drift = 0.002; // 일 +0.2%
  else if (tech.trend === "downtrend") drift = -0.002;
  if (tech.rsi14 != null && tech.rsi14 < 30) drift += 0.001;
  if (tech.rsi14 != null && tech.rsi14 > 70) drift -= 0.001;

  const horDrift = drift * horizonDays;

  // Bull (+1σ), Base, Bear (-1σ)
  const bull = price * Math.exp(horDrift + horSigma);
  const base = price * Math.exp(horDrift);
  const bear = price * Math.exp(horDrift - horSigma);

  // 확률 추정 (매우 거친 추정)
  let pBull = 0.33, pBase = 0.34, pBear = 0.33;
  if (tech.trend === "uptrend") { pBull = 0.45; pBase = 0.35; pBear = 0.20; }
  else if (tech.trend === "downtrend") { pBear = 0.45; pBase = 0.35; pBull = 0.20; }

  return {
    horizonDays,
    bull: { price: +bull.toFixed(2), pct: +((bull / price - 1) * 100).toFixed(1), probability: pBull },
    base: { price: +base.toFixed(2), pct: +((base / price - 1) * 100).toFixed(1), probability: pBase },
    bear: { price: +bear.toFixed(2), pct: +((bear / price - 1) * 100).toFixed(1), probability: pBear },
    expectedPct: +((pBull * (bull / price - 1) + pBase * (base / price - 1) + pBear * (bear / price - 1)) * 100).toFixed(2),
  };
}

// 이유 체인 (Why / When / How / How much)
function reasoning(
  symbol: string,
  tech: Technical,
  price: number,
  portfolioCtx: any,
  diag: ReturnType<typeof diagnose>,
  fc30: ReturnType<typeof forecast>
) {
  const why: string[] = [];
  const when: string[] = [];
  const howWrong: string[] = [];
  const howMuch: string[] = [];

  // 왜 주목하는가
  if (diag.strengths.length >= diag.weaknesses.length) {
    why.push(`강점 ${diag.strengths.length}개 > 약점 ${diag.weaknesses.length}개로 긍정 요인 우세`);
  } else {
    why.push(`약점 ${diag.weaknesses.length}개 > 강점 ${diag.strengths.length}개로 경계 필요`);
  }
  if (tech.week52Position < 0.3 && tech.trend !== "downtrend") {
    why.push("52주 저점권 + 하락추세 아님 = 가치 매수 구간");
  }
  if (tech.trend === "uptrend" && tech.momentum20d > 5) {
    why.push("장기 정배열 + 단기 모멘텀 = 추세 추종 적합");
  }
  if (portfolioCtx?.held) {
    why.push(`이미 보유 중 (${portfolioCtx.shares}주, 비용 $${(portfolioCtx.avgCost).toFixed(2)}) → 관리 전략 필요`);
  }

  // 언제 (타이밍)
  if (tech.rsi14 != null && tech.rsi14 < 35) when.push(`RSI ${tech.rsi14.toFixed(0)} — 현재가 기술적 매수 타이밍`);
  if (tech.rsi14 != null && tech.rsi14 > 65) when.push(`RSI ${tech.rsi14.toFixed(0)} — 현재가 기술적 매도 타이밍`);
  if (tech.macdHist != null && tech.macdHist > 0 && tech.trend === "uptrend") when.push("MACD 양전환 + 정배열 = 진입 적기");
  if (tech.bollPosition != null && tech.bollPosition < 0.1) when.push("볼린저 하단 = 단기 반등 기대 구간");

  // 어떻게 틀릴 수 있나
  howWrong.push(`Bear 시나리오: $${fc30.bear.price} (${fc30.bear.pct}%), 확률 ${(fc30.bear.probability * 100).toFixed(0)}%`);
  if (tech.vol20 != null && tech.vol20 > 4) howWrong.push(`고변동성 (일 ${tech.vol20.toFixed(1)}%)으로 예측 오차 큼`);
  if (diag.risks.length > 0) {
    diag.risks.forEach(r => howWrong.push(r));
  }
  howWrong.push("거시 이벤트 (금리, 지정학, 실적 서프라이즈) 시 예측 무효");

  // 얼마나 벌 수 있나
  howMuch.push(`30일 기대수익률: ${fc30.expectedPct}% (Bull ${fc30.bull.pct}% × ${(fc30.bull.probability * 100).toFixed(0)}% + Base ${fc30.base.pct}% × ${(fc30.base.probability * 100).toFixed(0)}% + Bear ${fc30.bear.pct}% × ${(fc30.bear.probability * 100).toFixed(0)}%)`);
  howMuch.push(`Bull 달성 시 $${fc30.bull.price} (현재 $${price.toFixed(2)} 대비 +${fc30.bull.pct}%)`);
  howMuch.push(`리스크 대비 보상 (R/R): Bull ${fc30.bull.pct}% vs Bear ${fc30.bear.pct}% = ${Math.abs(fc30.bull.pct / fc30.bear.pct).toFixed(2)}:1`);

  return { why, when, howWrong, howMuch };
}

// 액션 추천
function recommend(
  tech: Technical,
  diag: ReturnType<typeof diagnose>,
  fc30: ReturnType<typeof forecast>,
  portfolioCtx: any
) {
  let action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL" = "HOLD";
  let confidence = 50;

  const strengthScore = diag.strengths.length;
  const weaknessScore = diag.weaknesses.length;
  const net = strengthScore - weaknessScore;
  const expectedReturn = fc30.expectedPct;

  if (net >= 3 && expectedReturn > 5) { action = "STRONG_BUY"; confidence = 75; }
  else if (net >= 1 && expectedReturn > 2) { action = "BUY"; confidence = 65; }
  else if (net <= -3 || expectedReturn < -5) { action = "STRONG_SELL"; confidence = 70; }
  else if (net <= -1 || expectedReturn < -2) { action = "SELL"; confidence = 60; }

  if (portfolioCtx?.held && portfolioCtx.leverage >= 2) {
    if (action === "STRONG_BUY") action = "BUY"; // 레버리지는 조심
    if (action === "HOLD" && weaknessScore >= 2) action = "SELL";
  }
  if (diag.risks.length >= 2 && action.includes("BUY")) {
    action = "HOLD";
    confidence = Math.max(40, confidence - 15);
  }

  return { action, confidence };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();

    const candles = await fetchCandles(upper);
    if (candles.length < 50) throw new Error("데이터 부족");

    const last = candles[candles.length - 1];
    const price = last.close;

    const tech = computeTechnical(candles);
    const [market, portfolioCtx] = await Promise.all([
      fetchMarketContext(),
      fetchPortfolioContext(upper),
    ]);

    const diag = diagnose(tech, price, portfolioCtx);
    const fc30 = forecast(tech, price, 30);
    const fc5 = forecast(tech, price, 5);
    const fc90 = forecast(tech, price, 90);
    const reasons = reasoning(upper, tech, price, portfolioCtx, diag, fc30);
    const rec = recommend(tech, diag, fc30, portfolioCtx);

    // 차트용 최근 120일
    const chartSlice = candles.slice(-120);
    const closes120 = chartSlice.map(c => c.close);
    const sma20Arr = sma(closes120, 20);
    const sma50Arr = sma(closes120, 50);
    const rsiArr = rsi(closes120, 14);

    const chart = chartSlice.map((c, i) => ({
      date: c.date,
      close: c.close,
      volume: c.volume,
      sma20: sma20Arr[i],
      sma50: sma50Arr[i],
      rsi: rsiArr[i],
    }));

    return NextResponse.json({
      success: true,
      symbol: upper,
      price,
      asOf: last.date,
      technical: tech,
      market,
      portfolio: portfolioCtx,
      diagnosis: diag,
      forecast: { days5: fc5, days30: fc30, days90: fc90 },
      reasoning: reasons,
      recommendation: rec,
      chart,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true }, { status: 200 });
  }
}
