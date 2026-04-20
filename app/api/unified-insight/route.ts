import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Unified Insight API
// 
// 모든 데이터를 하나의 차트에 통합:
//   - 과거 30일 + 예측 60일 가격 시계열
//   - 주요 이벤트 마커 (OpEx, 쿼드 위칭)
//   - 옵션 레벨 (Gamma Walls, Max Pain, Flip)
//   - 매매 시그널 (날짜 + 가격 + 액션)
//   - 종합 결정 박스 (지금 무엇을 할지)
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// 날짜 유틸
// ───────────────────────────────────────────────────────────
function getThirdFriday(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstFriday = firstDay.getDay() <= 5
    ? firstDay.getDate() + (5 - firstDay.getDay())
    : firstDay.getDate() + (12 - firstDay.getDay());
  return new Date(year, month, firstFriday + 14);
}

function formatDate(d: Date): string { return d.toISOString().split("T")[0]; }

function isQuadWitching(d: Date): boolean {
  const m = d.getMonth();
  if (![2, 5, 8, 11].includes(m)) return false;
  return d.toDateString() === getThirdFriday(d.getFullYear(), m).toDateString();
}

function isMonthlyOpEx(d: Date): boolean {
  return d.toDateString() === getThirdFriday(d.getFullYear(), d.getMonth()).toDateString();
}

function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function isFriday(d: Date): boolean { return d.getDay() === 5; }

// ───────────────────────────────────────────────────────────
// CBOE 옵션
// ───────────────────────────────────────────────────────────
async function fetchCboe(symbol: string): Promise<{ currentPrice: number; options: any[] } | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return { currentPrice: d.data.current_price, options: d.data.options ?? [] };
  } catch { return null; }
}

interface ParsedOpt {
  expiry: string;
  type: "C" | "P";
  strike: number;
  iv: number;
  oi: number;
  volume: number;
  gamma: number;
  delta: number;
}

function parseOpt(o: any): ParsedOpt | null {
  const m = o.option?.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    expiry: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5] as "C" | "P",
    strike: parseInt(m[6]) / 1000,
    iv: o.iv || 0,
    oi: o.open_interest || 0,
    volume: o.volume || 0,
    gamma: o.gamma || 0,
    delta: o.delta || 0,
  };
}

// ───────────────────────────────────────────────────────────
// Max Pain
// ───────────────────────────────────────────────────────────
function calcMaxPain(options: ParsedOpt[], expiry: string): number | null {
  const f = options.filter(o => o.expiry === expiry);
  if (f.length === 0) return null;
  const strikes = [...new Set(f.map(o => o.strike))].sort((a, b) => a - b);
  let minPain = Infinity, result = strikes[0];
  for (const t of strikes) {
    let pain = 0;
    for (const o of f) {
      if (o.type === "C" && t > o.strike) pain += (t - o.strike) * o.oi * 100;
      else if (o.type === "P" && t < o.strike) pain += (o.strike - t) * o.oi * 100;
    }
    if (pain < minPain) { minPain = pain; result = t; }
  }
  return result;
}

// ───────────────────────────────────────────────────────────
// Walls (Gamma 기반 지지/저항)
// ───────────────────────────────────────────────────────────
function findWalls(options: ParsedOpt[], currentPrice: number): Array<{
  strike: number;
  type: "call_wall" | "put_wall";
  gex: number;
}> {
  const map = new Map<number, { call: number; put: number }>();
  for (const o of options) {
    const existing = map.get(o.strike) ?? { call: 0, put: 0 };
    const gex = o.gamma * o.oi * 100 * currentPrice * currentPrice * 0.01;
    if (o.type === "C") existing.call += gex;
    else existing.put += gex;
    map.set(o.strike, existing);
  }
  const walls: Array<{ strike: number; type: "call_wall" | "put_wall"; gex: number }> = [];
  for (const [strike, g] of map.entries()) {
    if (strike > currentPrice && g.call > 5e7) {
      walls.push({ strike, type: "call_wall", gex: g.call });
    } else if (strike < currentPrice && g.put > 5e7) {
      walls.push({ strike, type: "put_wall", gex: g.put });
    }
  }
  return walls.sort((a, b) => b.gex - a.gex).slice(0, 4);
}

// ───────────────────────────────────────────────────────────
// Gamma Flip
// ───────────────────────────────────────────────────────────
function normPdf(x: number): number { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }

function calcGamma(spot: number, strike: number, iv: number, days: number): number {
  if (iv <= 0 || days <= 0) return 0;
  const T = days / 365;
  const d1 = (Math.log(spot / strike) + (0.045 + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  return normPdf(d1) / (spot * iv * Math.sqrt(T));
}

function findGammaFlip(options: ParsedOpt[], currentPrice: number): number | null {
  const today = new Date();
  const active = options.filter(o => {
    const days = (new Date(o.expiry).getTime() - today.getTime()) / 86400000;
    return days > 0 && days < 90 && o.oi > 0 && o.iv > 0;
  });

  const minP = currentPrice * 0.85;
  const maxP = currentPrice * 1.15;
  const steps = 30;

  let prev: { price: number; gex: number } | null = null;
  for (let i = 0; i <= steps; i++) {
    const spot = minP + (maxP - minP) * i / steps;
    let totalGex = 0;
    for (const o of active) {
      const days = Math.max(1, (new Date(o.expiry).getTime() - today.getTime()) / 86400000);
      const g = calcGamma(spot, o.strike, o.iv, days);
      const gex = g * o.oi * 100 * spot * spot * 0.01;
      totalGex += o.type === "C" ? gex : -gex;
    }
    if (prev && (prev.gex >= 0) !== (totalGex >= 0)) {
      const r = Math.abs(prev.gex) / (Math.abs(prev.gex) + Math.abs(totalGex));
      return Math.round((prev.price + r * (spot - prev.price)) * 100) / 100;
    }
    prev = { price: spot, gex: totalGex };
  }
  return null;
}

// ───────────────────────────────────────────────────────────
// 가격 예측 (단순 + 옵션 가이드)
// ───────────────────────────────────────────────────────────
function predictPricePath(
  history: Array<{ date: string; close: number }>,
  currentPrice: number,
  maxPain: number | null,
  gammaFlip: number | null,
  walls: Array<{ strike: number; type: string; gex: number }>,
  daysAhead: number
): Array<{ date: string; forecast: number; upperBand: number; lowerBand: number }> {
  // 최근 20일 변동성 계산
  const recent = history.slice(-20);
  if (recent.length < 5) return [];

  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push(Math.log(recent[i].close / recent[i - 1].close));
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const dailyVol = Math.sqrt(variance);

  // 최근 트렌드 (20일 기울기)
  const oldestPrice = recent[0].close;
  const newestPrice = recent[recent.length - 1].close;
  const trendDaily = (newestPrice - oldestPrice) / oldestPrice / recent.length;

  const predictions: Array<{ date: string; forecast: number; upperBand: number; lowerBand: number }> = [];
  const today = new Date();
  let price = currentPrice;

  for (let d = 1; d <= daysAhead; d++) {
    const date = addDays(today, d);
    // 주말 스킵
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    // 드리프트: 기본 트렌드 + Max Pain 끌림 + Wall 반발
    let drift = trendDaily * 0.4; // 트렌드 감쇠

    if (maxPain !== null) {
      const painDiff = (maxPain - price) / price;
      drift += painDiff * 0.05; // 약한 끌림
    }

    // Wall 영향
    for (const w of walls) {
      const dist = (w.strike - price) / price;
      if (Math.abs(dist) < 0.02) {
        if (w.type === "call_wall") drift -= 0.003;
        else drift += 0.003;
      }
    }

    price = price * (1 + drift);
    const stdev = dailyVol * Math.sqrt(d);
    predictions.push({
      date: formatDate(date),
      forecast: Math.round(price * 100) / 100,
      upperBand: Math.round(price * (1 + stdev) * 100) / 100,
      lowerBand: Math.round(price * (1 - stdev) * 100) / 100,
    });
  }

  return predictions;
}

// ───────────────────────────────────────────────────────────
// 매매 시그널 생성
// ───────────────────────────────────────────────────────────
interface Signal {
  date: string;
  targetPrice: number;
  action: "buy" | "sell" | "hold" | "hedge" | "wait";
  actionLabel: string;
  icon: string;
  color: string;
  confidence: number;
  reason: string;
  urgency: "now" | "soon" | "watch";
}

function generateSignals(params: {
  currentPrice: number;
  maxPain: number | null;
  gammaFlip: number | null;
  walls: Array<{ strike: number; type: string; gex: number }>;
  rsi: number | null;
  priceVsSMA20: number;
  daysAhead: number;
}): Signal[] {
  const { currentPrice, maxPain, gammaFlip, walls, rsi, priceVsSMA20, daysAhead } = params;
  const signals: Signal[] = [];
  const today = new Date();

  // ─────────────────────────────────────────────
  // 1. OpEx 만기 주기 기반 시그널
  // ─────────────────────────────────────────────
  for (let d = 0; d <= daysAhead; d++) {
    const date = addDays(today, d);
    const isQuad = isQuadWitching(date);
    const isMonthly = isMonthlyOpEx(date);

    if (isQuad) {
      // 쿼드 위칭 3일 전: HEDGE
      signals.push({
        date: formatDate(addDays(date, -3)),
        targetPrice: currentPrice,
        action: "hedge",
        actionLabel: "헤지 / 관망",
        icon: "🛡️",
        color: "#ffaa44",
        confidence: 85,
        reason: `쿼드 위칭 3일 전 - 극심한 변동성 예상`,
        urgency: d <= 5 ? "now" : "soon",
      });
      // 쿼드 위칭 당일: WAIT
      signals.push({
        date: formatDate(date),
        targetPrice: maxPain ?? currentPrice,
        action: "wait",
        actionLabel: "관망",
        icon: "⏸️",
        color: "#888",
        confidence: 75,
        reason: `🔥 쿼드러플 위칭 당일 - 거래 자제`,
        urgency: d <= 3 ? "now" : "soon",
      });
      // 다음 월요일: BUY (반전 랠리)
      let mon = addDays(date, 3);
      while (mon.getDay() !== 1) mon = addDays(mon, 1);
      signals.push({
        date: formatDate(mon),
        targetPrice: currentPrice * 1.02,
        action: "buy",
        actionLabel: "진입",
        icon: "🚀",
        color: "#00ff88",
        confidence: 65,
        reason: `쿼드 위칭 후 반전 랠리 - 역사적 확률 60%+`,
        urgency: "soon",
      });
    } else if (isMonthly) {
      // 월간 OpEx 2주 전: BUY
      const twoWeeksBefore = addDays(date, -14);
      if (twoWeeksBefore > today) {
        signals.push({
          date: formatDate(twoWeeksBefore),
          targetPrice: currentPrice * 0.99,
          action: "buy",
          actionLabel: "분할 매수",
          icon: "💎",
          color: "#00ff88",
          confidence: 60,
          reason: `월간 OpEx 2주 전 - 변동성 프리미엄 구간`,
          urgency: "soon",
        });
      }
      // 만기 다음 월요일
      let mon = addDays(date, 3);
      while (mon.getDay() !== 1) mon = addDays(mon, 1);
      signals.push({
        date: formatDate(mon),
        targetPrice: currentPrice * 1.015,
        action: "buy",
        actionLabel: "진입",
        icon: "🚀",
        color: "#00ff88",
        confidence: 60,
        reason: `OpEx 후 반전 랠리 가능`,
        urgency: "soon",
      });
    }
  }

  // ─────────────────────────────────────────────
  // 2. RSI 기반
  // ─────────────────────────────────────────────
  if (rsi !== null) {
    if (rsi > 75) {
      signals.push({
        date: formatDate(today),
        targetPrice: currentPrice,
        action: "sell",
        actionLabel: "이익 실현",
        icon: "🔴",
        color: "#ff3860",
        confidence: 70,
        reason: `RSI ${rsi.toFixed(0)} - 극도의 과매수 (조정 임박)`,
        urgency: "now",
      });
    } else if (rsi < 30) {
      signals.push({
        date: formatDate(today),
        targetPrice: currentPrice,
        action: "buy",
        actionLabel: "역발상 매수",
        icon: "💎",
        color: "#00ff88",
        confidence: 75,
        reason: `RSI ${rsi.toFixed(0)} - 극도의 과매도 (반등 임박)`,
        urgency: "now",
      });
    }
  }

  // ─────────────────────────────────────────────
  // 3. Gamma Flip 근접
  // ─────────────────────────────────────────────
  if (gammaFlip !== null) {
    const flipDist = (gammaFlip - currentPrice) / currentPrice;
    if (flipDist < 0 && flipDist > -0.05) {
      signals.push({
        date: formatDate(addDays(today, 1)),
        targetPrice: gammaFlip,
        action: "hedge",
        actionLabel: "손절 준비",
        icon: "⚠️",
        color: "#ffaa44",
        confidence: 80,
        reason: `Gamma Flip $${gammaFlip} 근접 - 하향 돌파 시 변동성 폭발`,
        urgency: "now",
      });
    } else if (flipDist > 0 && flipDist < 0.05) {
      signals.push({
        date: formatDate(addDays(today, 1)),
        targetPrice: gammaFlip,
        action: "buy",
        actionLabel: "돌파 매수",
        icon: "🚀",
        color: "#00ff88",
        confidence: 75,
        reason: `Gamma Flip $${gammaFlip} 근접 - 상향 돌파 시 추세 강화`,
        urgency: "now",
      });
    }
  }

  // ─────────────────────────────────────────────
  // 4. Wall 터치 전략
  // ─────────────────────────────────────────────
  for (const w of walls) {
    const dist = (w.strike - currentPrice) / currentPrice;
    if (w.type === "call_wall" && dist > 0 && dist < 0.03) {
      signals.push({
        date: formatDate(addDays(today, 3)),
        targetPrice: w.strike,
        action: "sell",
        actionLabel: "부분 이익실현",
        icon: "🧱",
        color: "#ff6699",
        confidence: 65,
        reason: `Call Wall $${w.strike} 근접 - 저항선 반발 가능`,
        urgency: "soon",
      });
    } else if (w.type === "put_wall" && dist < 0 && dist > -0.03) {
      signals.push({
        date: formatDate(addDays(today, 3)),
        targetPrice: w.strike,
        action: "buy",
        actionLabel: "지지선 매수",
        icon: "⛰️",
        color: "#00cc88",
        confidence: 65,
        reason: `Put Wall $${w.strike} 근접 - 지지선 반발 가능`,
        urgency: "soon",
      });
    }
  }

  return signals.sort((a, b) => a.date.localeCompare(b.date));
}

// ───────────────────────────────────────────────────────────
// 최종 결정 생성
// ───────────────────────────────────────────────────────────
function makeDecision(params: {
  signals: Signal[];
  currentPrice: number;
  rsi: number | null;
  priceVsSMA20: number;
  gammaRegime: "positive" | "negative";
  gammaFlip: number | null;
  nearestOpEx: { date: string; type: string; daysUntil: number } | null;
}): {
  action: "buy" | "sell" | "hold" | "hedge" | "wait";
  actionLabel: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  confidence: number;
  priority: "high" | "medium" | "low";
  reasons: string[];
  risks: string[];
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
} {
  const { signals, currentPrice, rsi, priceVsSMA20, gammaRegime, gammaFlip, nearestOpEx } = params;

  // 오늘의 시그널만
  const today = formatDate(new Date());
  const todaySignals = signals.filter(s => s.date <= today || s.urgency === "now");

  // 점수 집계
  let score = 0;
  const reasons: string[] = [];
  const risks: string[] = [];

  for (const s of todaySignals) {
    const weight = s.confidence / 100;
    if (s.action === "buy") { score += weight * 10; reasons.push(`✅ ${s.reason}`); }
    if (s.action === "sell") { score -= weight * 10; risks.push(`🔴 ${s.reason}`); }
    if (s.action === "hedge") { score -= weight * 5; risks.push(`⚠️ ${s.reason}`); }
  }

  // 매크로 조정
  if (gammaRegime === "positive") {
    reasons.push("✅ 양의 GEX 레짐 - 변동성 안정적");
    score += 3;
  } else {
    risks.push("⚠️ 음의 GEX - 변동성 폭발 위험");
    score -= 5;
  }

  if (priceVsSMA20 > 5) risks.push(`📈 20일선 대비 +${priceVsSMA20.toFixed(1)}% (과열)`);
  if (priceVsSMA20 < -5) reasons.push(`📉 20일선 대비 ${priceVsSMA20.toFixed(1)}% (저평가)`);

  if (rsi !== null) {
    if (rsi > 70) risks.push(`⚠️ RSI ${rsi.toFixed(0)} - 과매수`);
    if (rsi < 30) reasons.push(`💎 RSI ${rsi.toFixed(0)} - 과매도`);
  }

  if (nearestOpEx && nearestOpEx.daysUntil <= 3) {
    risks.push(`📅 ${nearestOpEx.daysUntil}일 후 ${nearestOpEx.type}`);
  }

  // 결정
  let action: "buy" | "sell" | "hold" | "hedge" | "wait" = "hold";
  let actionLabel = "관망";
  let icon = "⏸️";
  let color = "#888";
  let title = "";
  let subtitle = "";
  let confidence = 50;
  let priority: "high" | "medium" | "low" = "low";
  let targetPrice: number | undefined;
  let stopLoss: number | undefined;
  let takeProfit: number | undefined;

  if (score > 12) {
    action = "buy";
    actionLabel = "매수";
    icon = "🟢";
    color = "#00ff88";
    title = "매수 시그널 - 적극 진입";
    subtitle = "복수의 지표가 강세 방향 일치";
    confidence = Math.min(95, 60 + score);
    priority = score > 20 ? "high" : "medium";
    targetPrice = Math.round(currentPrice * 1.05 * 100) / 100;
    stopLoss = Math.round(currentPrice * 0.97 * 100) / 100;
    takeProfit = Math.round(currentPrice * 1.08 * 100) / 100;
  } else if (score < -12) {
    action = "sell";
    actionLabel = "매도 / 축소";
    icon = "🔴";
    color = "#ff3860";
    title = "매도 시그널 - 이익 실현";
    subtitle = "복수의 지표가 약세 방향 일치";
    confidence = Math.min(95, 60 + Math.abs(score));
    priority = score < -20 ? "high" : "medium";
    targetPrice = Math.round(currentPrice * 0.95 * 100) / 100;
  } else if (score < -5) {
    action = "hedge";
    actionLabel = "헤지";
    icon = "🛡️";
    color = "#ffaa44";
    title = "리스크 관리 구간";
    subtitle = "방어적 포지션 점검 필요";
    confidence = 60;
    priority = "medium";
  } else if (todaySignals.some(s => s.action === "wait" && s.urgency === "now")) {
    action = "wait";
    actionLabel = "관망";
    icon = "⏸️";
    color = "#888";
    title = "중요 이벤트 대기";
    subtitle = "이벤트 후 방향성 확인";
    confidence = 70;
    priority = "medium";
  } else {
    action = "hold";
    actionLabel = "보유 유지";
    icon = "💎";
    color = "#aaccff";
    title = "현재 포지션 유지";
    subtitle = "명확한 시그널 없음";
    confidence = 55;
    priority = "low";
  }

  return {
    action, actionLabel, icon, color, title, subtitle,
    confidence, priority, reasons, risks,
    targetPrice, stopLoss, takeProfit,
  };
}

// ───────────────────────────────────────────────────────────
// RSI 계산
// ───────────────────────────────────────────────────────────
function calcRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase() ?? "NVDA";
    const daysAhead = parseInt(searchParams.get("days") ?? "60");

    // 1. 가격 + 과거 데이터
    const [yahooQuote, history, cboe] = await Promise.all([
      fetchYahooQuotes([symbol]),
      fetchYahooHistory(symbol, "3mo"),
      fetchCboe(symbol),
    ]);

    const currentPrice = yahooQuote.get(symbol)?.price ?? cboe?.currentPrice;
    if (!currentPrice) {
      return NextResponse.json({ success: false, error: "가격 조회 실패" }, { status: 404 });
    }

    // 2. 옵션 파싱
    const today = new Date();
    const parsed: ParsedOpt[] = (cboe?.options || [])
      .map(parseOpt)
      .filter((o): o is ParsedOpt => o !== null && o.expiry >= formatDate(today));

    // 3. 가장 가까운 만기
    const expiries = [...new Set(parsed.map(o => o.expiry))].sort();
    const nearestExpiry = expiries[0] ?? null;

    // 4. 옵션 레벨
    const maxPain = nearestExpiry ? calcMaxPain(parsed, nearestExpiry) : null;
    const walls = findWalls(parsed, currentPrice);
    const gammaFlip = findGammaFlip(parsed, currentPrice);

    // 5. 과거 30일 가격 시계열
    const recent30 = history.slice(-30);
    const closes = recent30.map(h => h.close);
    const rsi = calcRSI(closes);
    const sma20 = closes.length >= 20
      ? closes.slice(-20).reduce((s, c) => s + c, 0) / 20
      : currentPrice;
    const priceVsSMA20 = ((currentPrice - sma20) / sma20) * 100;

    // 6. 가격 예측
    const predictions = predictPricePath(
      recent30,
      currentPrice,
      maxPain,
      gammaFlip,
      walls,
      daysAhead
    );

    // 7. 가격 시계열 (통합)
    const priceSeries: Array<{
      date: string;
      actual: number | null;
      forecast: number | null;
      upperBand: number | null;
      lowerBand: number | null;
      isToday: boolean;
      isFuture: boolean;
    }> = [];

    for (const h of recent30) {
      priceSeries.push({
        date: h.date,
        actual: h.close,
        forecast: null,
        upperBand: null,
        lowerBand: null,
        isToday: false,
        isFuture: false,
      });
    }

    // 오늘
    priceSeries.push({
      date: formatDate(today),
      actual: currentPrice,
      forecast: currentPrice,
      upperBand: currentPrice,
      lowerBand: currentPrice,
      isToday: true,
      isFuture: false,
    });

    for (const p of predictions) {
      priceSeries.push({
        date: p.date,
        actual: null,
        forecast: p.forecast,
        upperBand: p.upperBand,
        lowerBand: p.lowerBand,
        isToday: false,
        isFuture: true,
      });
    }

    // 8. 이벤트 마커
    const events: Array<{
      date: string;
      type: string;
      icon: string;
      label: string;
      importance: number;
      description: string;
    }> = [];

    for (let d = 0; d <= daysAhead; d++) {
      const date = addDays(today, d);
      if (isQuadWitching(date)) {
        events.push({
          date: formatDate(date),
          type: "quad_witching",
          icon: "🔥",
          label: "쿼드 위칭",
          importance: 5,
          description: "분기 최대 만기 - 극심한 변동성",
        });
      } else if (isMonthlyOpEx(date)) {
        events.push({
          date: formatDate(date),
          type: "opex_monthly",
          icon: "📅",
          label: "월간 OpEx",
          importance: 4,
          description: "월간 옵션 만기 - Pinning 효과",
        });
      } else if (isFriday(date)) {
        events.push({
          date: formatDate(date),
          type: "opex_weekly",
          icon: "📆",
          label: "주간 OpEx",
          importance: 2,
          description: "주간 옵션 만기",
        });
      }
    }

    // 9. 가격 레벨
    const levels: Array<{
      price: number;
      type: string;
      label: string;
      strength: number;
      source: string;
      color: string;
    }> = [];

    if (maxPain !== null) {
      levels.push({
        price: maxPain,
        type: "max_pain",
        label: `Max Pain $${maxPain.toFixed(2)}`,
        strength: 70,
        source: `만기 ${nearestExpiry}`,
        color: "#ee99ff",
      });
    }
    if (gammaFlip !== null) {
      levels.push({
        price: gammaFlip,
        type: "gamma_flip",
        label: `Gamma Flip $${gammaFlip.toFixed(2)}`,
        strength: 85,
        source: "변동성 레짐 전환점",
        color: "#ff8844",
      });
    }
    for (const w of walls) {
      levels.push({
        price: w.strike,
        type: w.type,
        label: w.type === "call_wall" ? `🧱 Call Wall $${w.strike.toFixed(2)}` : `⛰️ Put Wall $${w.strike.toFixed(2)}`,
        strength: Math.min(100, Math.round(w.gex / 1e8)),
        source: `GEX $${(w.gex / 1e9).toFixed(2)}B`,
        color: w.type === "call_wall" ? "#ff6699" : "#00cc88",
      });
    }

    // 10. 매매 시그널
    const signals = generateSignals({
      currentPrice,
      maxPain,
      gammaFlip,
      walls,
      rsi,
      priceVsSMA20,
      daysAhead,
    });

    // 11. 가장 가까운 OpEx
    const nearestOpExEvent = events.find(e => e.importance >= 4);
    const nearestOpEx = nearestOpExEvent ? {
      date: nearestOpExEvent.date,
      type: nearestOpExEvent.label,
      daysUntil: Math.floor((new Date(nearestOpExEvent.date).getTime() - today.getTime()) / 86400000),
    } : null;

    // 12. Gamma 레짐
    const gammaRegime: "positive" | "negative" = gammaFlip !== null && gammaFlip < currentPrice
      ? "positive"
      : "negative";

    // 13. 최종 결정
    const decision = makeDecision({
      signals,
      currentPrice,
      rsi,
      priceVsSMA20,
      gammaRegime,
      gammaFlip,
      nearestOpEx,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      symbol,
      currentPrice,
      priceSeries,
      events,
      levels,
      signals,
      decision,
      technicals: {
        rsi,
        sma20,
        priceVsSMA20,
      },
      options: {
        maxPain,
        gammaFlip,
        gammaRegime,
        nearestExpiry,
        expiryCount: expiries.length,
        walls: walls.map(w => ({
          strike: w.strike,
          type: w.type,
          gex: Math.round(w.gex / 1e6) * 1e6,
        })),
      },
      nearestOpEx,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true });
  }
}
