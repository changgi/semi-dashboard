import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Gamma Profile Analysis API
// 
// 옵션의 Gamma Exposure를 가격대별로 분석
// → Gamma Flip Level 찾기 (변동성 레짐 전환점)
// → 딜러가 어떻게 헤지할지 예측
// → 현물 가격이 어디로 끌릴지 시뮬레이션
// ═══════════════════════════════════════════════════════════

interface ParsedOption {
  expiry: string;
  type: "C" | "P";
  strike: number;
  iv: number;
  oi: number;
  volume: number;
  delta: number;
  gamma: number;
}

interface GammaAtPrice {
  spotPrice: number;
  totalGamma: number;      // 달러 기준 (Billions)
  callGamma: number;
  putGamma: number;
  regime: "positive" | "negative" | "flip";
}

interface GammaProfile {
  pricePoints: GammaAtPrice[];
  flipLevel: number | null;   // Gamma 부호가 바뀌는 가격
  currentRegime: "positive" | "negative";
  currentGamma: number;
  zeroGammaLevel: number | null;
  largestConcentrations: Array<{
    strike: number;
    totalGamma: number;
    type: "call_wall" | "put_wall";
    distance: number;
  }>;
}

// ───────────────────────────────────────────────────────────
// CBOE 옵션 데이터
// ───────────────────────────────────────────────────────────
async function fetchCboe(symbol: string): Promise<{
  currentPrice: number;
  options: any[];
} | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      currentPrice: data.data.current_price,
      options: data.data.options ?? [],
    };
  } catch {
    return null;
  }
}

function parseOption(opt: any): ParsedOption | null {
  const m = opt.option.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    expiry: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5] as "C" | "P",
    strike: parseInt(m[6]) / 1000,
    iv: opt.iv || 0,
    oi: opt.open_interest || 0,
    volume: opt.volume || 0,
    delta: opt.delta || 0,
    gamma: opt.gamma || 0,
  };
}

// ───────────────────────────────────────────────────────────
// Black-Scholes Gamma 재계산
// CBOE가 제공하는 gamma는 현재가 기준 → 다른 가격에서는 직접 계산
// ───────────────────────────────────────────────────────────
function normDistPdf(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

function calculateGammaAtSpot(
  spot: number,
  strike: number,
  iv: number,
  daysToExpiry: number,
  riskFreeRate: number = 0.045
): number {
  if (iv <= 0 || daysToExpiry <= 0 || spot <= 0 || strike <= 0) return 0;
  const T = daysToExpiry / 365;
  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * iv * iv) * T) /
    (iv * Math.sqrt(T));
  return normDistPdf(d1) / (spot * iv * Math.sqrt(T));
}

// ───────────────────────────────────────────────────────────
// 가격대별 총 Gamma 계산
// ───────────────────────────────────────────────────────────
function buildGammaProfile(
  options: ParsedOption[],
  currentPrice: number,
  priceRangePct: number = 0.15
): GammaProfile {
  const today = new Date();
  const activeOptions = options.filter((o) => {
    const exp = new Date(o.expiry);
    const days = (exp.getTime() - today.getTime()) / (86400000);
    return days > 0 && days < 90 && o.oi > 0 && o.iv > 0;
  });

  // ±15% 범위를 30개 구간으로 나누어 각 가격에서 총 GEX 계산
  const minPrice = currentPrice * (1 - priceRangePct);
  const maxPrice = currentPrice * (1 + priceRangePct);
  const steps = 30;
  const priceStep = (maxPrice - minPrice) / steps;

  const pricePoints: GammaAtPrice[] = [];

  for (let i = 0; i <= steps; i++) {
    const spotPrice = minPrice + priceStep * i;
    let callGamma = 0;
    let putGamma = 0;

    for (const opt of activeOptions) {
      const exp = new Date(opt.expiry);
      const daysToExpiry = Math.max(
        1,
        Math.floor((exp.getTime() - today.getTime()) / (86400000))
      );

      const gamma = calculateGammaAtSpot(spotPrice, opt.strike, opt.iv, daysToExpiry);
      // Gamma Exposure (달러): gamma × OI × 100 × spot^2 × 0.01
      const gex = gamma * opt.oi * 100 * spotPrice * spotPrice * 0.01;

      if (opt.type === "C") {
        callGamma += gex;
      } else {
        // 풋은 딜러 관점에서 음수 gamma
        putGamma -= gex;
      }
    }

    const totalGamma = callGamma + putGamma;
    pricePoints.push({
      spotPrice: Math.round(spotPrice * 100) / 100,
      totalGamma: Math.round(totalGamma / 1e6) * 1e6, // 백만 단위 반올림
      callGamma: Math.round(callGamma / 1e6) * 1e6,
      putGamma: Math.round(putGamma / 1e6) * 1e6,
      regime: totalGamma > 0 ? "positive" : totalGamma < 0 ? "negative" : "flip",
    });
  }

  // Gamma Flip Level 찾기 (부호가 바뀌는 지점)
  let flipLevel: number | null = null;
  for (let i = 1; i < pricePoints.length; i++) {
    const prev = pricePoints[i - 1];
    const curr = pricePoints[i];
    if (
      (prev.totalGamma >= 0 && curr.totalGamma < 0) ||
      (prev.totalGamma < 0 && curr.totalGamma >= 0)
    ) {
      // 선형 보간으로 정확한 flip level 찾기
      const ratio = Math.abs(prev.totalGamma) / (Math.abs(prev.totalGamma) + Math.abs(curr.totalGamma));
      flipLevel = Math.round((prev.spotPrice + ratio * (curr.spotPrice - prev.spotPrice)) * 100) / 100;
      break;
    }
  }

  // 현재 레짐
  const currentPoint = pricePoints.find((p) => Math.abs(p.spotPrice - currentPrice) < priceStep) ?? pricePoints[Math.floor(steps / 2)];
  const currentRegime = currentPoint.totalGamma >= 0 ? "positive" : "negative";

  // Zero Gamma Level = Flip Level과 동일 (사실상)
  const zeroGammaLevel = flipLevel;

  // 가장 큰 Gamma 집중 지점 (Call Wall, Put Wall)
  const strikeGammaMap = new Map<number, { call: number; put: number }>();
  for (const opt of activeOptions) {
    const existing = strikeGammaMap.get(opt.strike) ?? { call: 0, put: 0 };
    const gex = opt.gamma * opt.oi * 100 * currentPrice * currentPrice * 0.01;
    if (opt.type === "C") existing.call += gex;
    else existing.put += gex;
    strikeGammaMap.set(opt.strike, existing);
  }

  const walls: Array<{
    strike: number;
    totalGamma: number;
    type: "call_wall" | "put_wall";
    distance: number;
  }> = [];

  for (const [strike, g] of strikeGammaMap.entries()) {
    if (strike > currentPrice && g.call > 0) {
      walls.push({
        strike,
        totalGamma: Math.round(g.call / 1e6) * 1e6,
        type: "call_wall",
        distance: strike - currentPrice,
      });
    } else if (strike < currentPrice && g.put > 0) {
      walls.push({
        strike,
        totalGamma: Math.round(g.put / 1e6) * 1e6,
        type: "put_wall",
        distance: currentPrice - strike,
      });
    }
  }

  // 가장 큰 것 상위 5개
  const largestConcentrations = walls
    .sort((a, b) => b.totalGamma - a.totalGamma)
    .slice(0, 5);

  return {
    pricePoints,
    flipLevel,
    currentRegime,
    currentGamma: currentPoint.totalGamma,
    zeroGammaLevel,
    largestConcentrations,
  };
}

// ───────────────────────────────────────────────────────────
// 해석 생성
// ───────────────────────────────────────────────────────────
function interpretGammaProfile(profile: GammaProfile, currentPrice: number): {
  summary: string;
  signals: string[];
  scenarios: Array<{
    condition: string;
    action: string;
    rationale: string;
  }>;
} {
  const signals: string[] = [];
  const scenarios: Array<{ condition: string; action: string; rationale: string }> = [];

  // 1. 현재 레짐
  if (profile.currentRegime === "positive") {
    signals.push(`✅ 현재 양의 GEX 구간 (${(profile.currentGamma / 1e9).toFixed(2)}B) → 변동성 억제`);
  } else {
    signals.push(`⚠️ 현재 음의 GEX 구간 (${(profile.currentGamma / 1e9).toFixed(2)}B) → 급등락 위험`);
  }

  // 2. Flip Level 분석
  if (profile.flipLevel !== null) {
    const flipDistance = profile.flipLevel - currentPrice;
    const flipPct = (flipDistance / currentPrice) * 100;

    if (profile.currentRegime === "positive" && flipDistance < 0) {
      signals.push(`🚧 Gamma Flip: $${profile.flipLevel} (${flipPct.toFixed(1)}% 아래)`);
      scenarios.push({
        condition: `현물이 $${profile.flipLevel} 아래로 하락 시`,
        action: "🚨 긴급 방어 / 숏 포지션 고려",
        rationale: "음의 GEX 구간 진입 → 딜러 매도 헤지 → 하락 가속화",
      });
      scenarios.push({
        condition: `현물이 현재가 유지 또는 상승`,
        action: "✅ 기존 포지션 유지 가능",
        rationale: "양의 GEX 구간 → 딜러 반대매매로 안정",
      });
    } else if (profile.currentRegime === "negative" && flipDistance > 0) {
      signals.push(`🎯 Gamma Flip: $${profile.flipLevel} (${flipPct.toFixed(1)}% 위)`);
      scenarios.push({
        condition: `현물이 $${profile.flipLevel} 돌파 시`,
        action: "🚀 추세 매수 + 레버리지 활용",
        rationale: "양의 GEX 구간 진입 → 변동성 억제, 추세 유지",
      });
      scenarios.push({
        condition: `현물이 현재가 이하 유지`,
        action: "⚠️ 변동성 헤지 필요",
        rationale: "음의 GEX → 급등락 가능, 보호 전략 중요",
      });
    }
  }

  // 3. Walls 분석
  if (profile.largestConcentrations.length > 0) {
    const callWalls = profile.largestConcentrations.filter((w) => w.type === "call_wall");
    const putWalls = profile.largestConcentrations.filter((w) => w.type === "put_wall");

    if (callWalls.length > 0) {
      const nearest = callWalls.sort((a, b) => a.distance - b.distance)[0];
      signals.push(`🧱 Call Wall $${nearest.strike} (저항선, +${((nearest.distance / currentPrice) * 100).toFixed(1)}%)`);
    }
    if (putWalls.length > 0) {
      const nearest = putWalls.sort((a, b) => a.distance - b.distance)[0];
      signals.push(`⛰️ Put Wall $${nearest.strike} (지지선, ${(-(nearest.distance / currentPrice) * 100).toFixed(1)}%)`);
    }
  }

  // 요약
  let summary = "";
  if (profile.currentRegime === "positive") {
    summary = "딜러들이 양의 감마 포지션 → 시장 변동성 억제 중. 안정적 움직임 기대";
  } else {
    summary = "딜러들이 음의 감마 포지션 → 시장 변동성 증폭 위험. 방어적 전략 필요";
  }

  return { summary, signals, scenarios };
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "symbol 필수" },
        { status: 400 }
      );
    }

    const [cboe, yahoo] = await Promise.all([
      fetchCboe(symbol),
      fetchYahooQuotes([symbol]),
    ]);

    if (!cboe) {
      return NextResponse.json(
        { success: false, error: `${symbol} 옵션 데이터 없음` },
        { status: 404 }
      );
    }

    const currentPrice = yahoo.get(symbol)?.price ?? cboe.currentPrice;
    const parsed = cboe.options
      .map(parseOption)
      .filter((o): o is ParsedOption => o !== null);

    if (parsed.length === 0) {
      return NextResponse.json(
        { success: false, error: "활성 옵션 없음" },
        { status: 404 }
      );
    }

    const profile = buildGammaProfile(parsed, currentPrice);
    const interpretation = interpretGammaProfile(profile, currentPrice);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      symbol,
      currentPrice,
      profile,
      interpretation,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true });
  }
}
