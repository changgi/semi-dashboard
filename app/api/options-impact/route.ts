import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Options Impact Analyzer
// 옵션 시장 지표 → 현물 가격 영향 예측
// 
// 핵심 개념:
//   1. Gamma Exposure (GEX): 딜러 헤지 → 현물 변동성
//   2. Max Pain: 옵션 만기 시 가격 자석 효과
//   3. IV Skew: 공포/탐욕 편향
//   4. Put/Call OI: 포지셔닝
//   5. 대규모 OI 스트라이크: 지지/저항선
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface ParsedOption {
  symbol: string;      // e.g. NVDA240510C00200000
  underlying: string;
  expiry: string;      // YYYY-MM-DD
  type: "C" | "P";
  strike: number;
  iv: number;          // 0-1 scale
  oi: number;
  volume: number;
  bid: number;
  ask: number;
  mid: number;         // (bid+ask)/2
  delta: number;       // 0-1 for calls, -1-0 for puts
  gamma: number;
}

interface SupportResistanceLevel {
  price: number;
  strength: number;     // 0-100 (OI 기반)
  type: "support" | "resistance";
  source: string;
}

interface ImpactPrediction {
  direction: "up" | "down" | "neutral";
  confidence: number;   // 0-100
  targetPrice: number;
  targetPct: number;
  timeHorizon: string;
  rationale: string[];
  signals: string[];
}

// ───────────────────────────────────────────────────────────
// CBOE 옵션 데이터 fetch
// ───────────────────────────────────────────────────────────
async function fetchCboeOptions(symbol: string): Promise<{
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

// ───────────────────────────────────────────────────────────
// 옵션 심볼 파싱
// 예: NVDA240510C00200000 → { expiry: 2024-05-10, type: C, strike: 200 }
// ───────────────────────────────────────────────────────────
function parseOptionSymbol(opt: any): ParsedOption | null {
  const m = opt.option.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;

  const underlying = m[1];
  const expiry = `20${m[2]}-${m[3]}-${m[4]}`;
  const type = m[5] as "C" | "P";
  const strike = parseInt(m[6]) / 1000;
  const bid = opt.bid || 0;
  const ask = opt.ask || 0;

  return {
    symbol: opt.option,
    underlying,
    expiry,
    type,
    strike,
    iv: opt.iv || 0,
    oi: opt.open_interest || 0,
    volume: opt.volume || 0,
    bid,
    ask,
    mid: (bid + ask) / 2,
    delta: opt.delta || 0,
    gamma: opt.gamma || 0,
  };
}

// ───────────────────────────────────────────────────────────
// Max Pain 계산 - 만기 시 옵션 보유자 총 손실 최대화 지점
// ───────────────────────────────────────────────────────────
function calculateMaxPain(options: ParsedOption[], expiry: string): number | null {
  const byExpiry = options.filter((o) => o.expiry === expiry);
  if (byExpiry.length === 0) return null;

  const strikes = [...new Set(byExpiry.map((o) => o.strike))].sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = strikes[0];

  for (const testStrike of strikes) {
    let totalPain = 0;
    for (const opt of byExpiry) {
      if (opt.type === "C" && testStrike > opt.strike) {
        totalPain += (testStrike - opt.strike) * opt.oi * 100;
      } else if (opt.type === "P" && testStrike < opt.strike) {
        totalPain += (opt.strike - testStrike) * opt.oi * 100;
      }
    }
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testStrike;
    }
  }
  return maxPainStrike;
}

// ───────────────────────────────────────────────────────────
// GEX (Gamma Exposure) 계산
// 딜러가 옵션 매도 시 델타 헤지 위한 현물 매매 규모
// GEX > 0: 변동성 억제 (현물 안정)
// GEX < 0: 변동성 증폭 (급등/급락 위험)
// ───────────────────────────────────────────────────────────
function calculateGEX(options: ParsedOption[], currentPrice: number): {
  totalGex: number;
  callGex: number;
  putGex: number;
  byStrike: Array<{ strike: number; gex: number; oi: number }>;
} {
  let callGex = 0;
  let putGex = 0;
  const byStrikeMap = new Map<number, { gex: number; oi: number }>();

  for (const opt of options) {
    if (opt.gamma === 0 || opt.oi === 0) continue;
    
    // GEX = gamma * OI * 100 (계약당 100주) * 현재가^2 * 0.01
    // 콜은 +, 풋은 - (딜러 관점)
    const gex = opt.gamma * opt.oi * 100 * currentPrice * currentPrice * 0.01;
    const signedGex = opt.type === "C" ? gex : -gex;

    if (opt.type === "C") callGex += gex;
    else putGex -= gex;

    const existing = byStrikeMap.get(opt.strike) || { gex: 0, oi: 0 };
    existing.gex += signedGex;
    existing.oi += opt.oi;
    byStrikeMap.set(opt.strike, existing);
  }

  const byStrike = Array.from(byStrikeMap.entries())
    .map(([strike, v]) => ({ strike, ...v }))
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
    .slice(0, 20);

  return {
    totalGex: callGex + putGex,
    callGex,
    putGex,
    byStrike,
  };
}

// ───────────────────────────────────────────────────────────
// 지지/저항선 계산 (대규모 OI 스트라이크)
// ───────────────────────────────────────────────────────────
function findSupportResistance(
  options: ParsedOption[],
  currentPrice: number,
  expiry: string
): SupportResistanceLevel[] {
  const byExpiry = options.filter((o) => o.expiry === expiry);
  const strikeMap = new Map<number, { callOI: number; putOI: number }>();

  for (const opt of byExpiry) {
    const existing = strikeMap.get(opt.strike) || { callOI: 0, putOI: 0 };
    if (opt.type === "C") existing.callOI += opt.oi;
    else existing.putOI += opt.oi;
    strikeMap.set(opt.strike, existing);
  }

  const totalOI = Array.from(strikeMap.values()).reduce(
    (sum, v) => sum + v.callOI + v.putOI,
    0
  );

  const levels: SupportResistanceLevel[] = [];
  for (const [strike, v] of strikeMap.entries()) {
    const totalStrikeOI = v.callOI + v.putOI;
    const strength = totalOI > 0 ? (totalStrikeOI / totalOI) * 100 : 0;
    if (strength < 2) continue;

    // 현재가 위: 콜 OI가 크면 저항선 (딜러 숏감마 → 상방 방어)
    // 현재가 아래: 풋 OI가 크면 지지선 (딜러 롱풋 → 하방 방어)
    if (strike > currentPrice && v.callOI > v.putOI) {
      levels.push({
        price: strike,
        strength: Math.round(strength),
        type: "resistance",
        source: `콜 OI ${v.callOI.toLocaleString()}`,
      });
    } else if (strike < currentPrice && v.putOI > v.callOI) {
      levels.push({
        price: strike,
        strength: Math.round(strength),
        type: "support",
        source: `풋 OI ${v.putOI.toLocaleString()}`,
      });
    }
  }

  return levels.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

// ───────────────────────────────────────────────────────────
// 큰 거래 (Unusual Activity) 감지 - 거래량이 OI를 크게 초과
// ───────────────────────────────────────────────────────────
function detectUnusualActivity(options: ParsedOption[]): Array<{
  strike: number;
  type: string;
  volume: number;
  oi: number;
  ratio: number;
  implication: string;
  expiry: string;
}> {
  const unusual: Array<any> = [];
  for (const opt of options) {
    if (opt.oi === 0 || opt.volume < 100) continue;
    const ratio = opt.volume / Math.max(opt.oi, 1);
    if (ratio < 0.5) continue;

    let implication = "";
    if (opt.type === "C" && ratio > 2) {
      implication = "매수 베팅 - 현물 상승 신호";
    } else if (opt.type === "P" && ratio > 2) {
      implication = "매도 베팅 - 현물 하락 신호";
    } else if (opt.type === "C") {
      implication = "적극적 콜 매수";
    } else {
      implication = "적극적 풋 매수";
    }

    unusual.push({
      strike: opt.strike,
      type: opt.type === "C" ? "콜" : "풋",
      volume: opt.volume,
      oi: opt.oi,
      ratio: Math.round(ratio * 100) / 100,
      implication,
      expiry: opt.expiry,
    });
  }
  return unusual.sort((a, b) => b.volume - a.volume).slice(0, 5);
}

// ───────────────────────────────────────────────────────────
// IV Skew & Term Structure
// ───────────────────────────────────────────────────────────
function analyzeIVStructure(options: ParsedOption[], currentPrice: number): {
  atmCallIV: number;
  atmPutIV: number;
  otmPutIV: number;      // 5% OTM 풋
  otmCallIV: number;     // 5% OTM 콜
  verticalSkew: number;  // 풋-콜 IV (공포지수)
  putSkew25d: number;    // 25델타 풋 vs ATM
  interpretation: string;
} {
  const nearStrikes = options.filter(
    (o) => Math.abs(o.strike - currentPrice) / currentPrice < 0.015 && o.iv > 0
  );
  const atmCalls = nearStrikes.filter((o) => o.type === "C");
  const atmPuts = nearStrikes.filter((o) => o.type === "P");
  const atmCallIV = atmCalls.length > 0
    ? atmCalls.reduce((s, o) => s + o.iv, 0) / atmCalls.length
    : 0;
  const atmPutIV = atmPuts.length > 0
    ? atmPuts.reduce((s, o) => s + o.iv, 0) / atmPuts.length
    : 0;

  // 5% OTM
  const otm5Puts = options.filter(
    (o) =>
      o.type === "P" &&
      Math.abs((currentPrice * 0.95) - o.strike) / currentPrice < 0.01 &&
      o.iv > 0
  );
  const otm5Calls = options.filter(
    (o) =>
      o.type === "C" &&
      Math.abs((currentPrice * 1.05) - o.strike) / currentPrice < 0.01 &&
      o.iv > 0
  );
  const otmPutIV = otm5Puts.length > 0
    ? otm5Puts.reduce((s, o) => s + o.iv, 0) / otm5Puts.length
    : atmPutIV;
  const otmCallIV = otm5Calls.length > 0
    ? otm5Calls.reduce((s, o) => s + o.iv, 0) / otm5Calls.length
    : atmCallIV;

  const verticalSkew = atmPutIV - atmCallIV;
  const putSkew25d = otmPutIV - atmCallIV;

  let interpretation = "";
  if (putSkew25d > 0.05) interpretation = "높은 풋 스큐 - 하방 보호 수요 강함 (헤지 증가)";
  else if (putSkew25d > 0.02) interpretation = "정상 스큐 - 중립적";
  else if (putSkew25d < -0.01) interpretation = "역스큐 - 상방 폭발 베팅 (드문 신호)";
  else interpretation = "낮은 스큐 - 시장 낙관";

  return {
    atmCallIV,
    atmPutIV,
    otmPutIV,
    otmCallIV,
    verticalSkew,
    putSkew25d,
    interpretation,
  };
}

// ───────────────────────────────────────────────────────────
// 🎯 현물 영향 예측 (종합)
// ───────────────────────────────────────────────────────────
function predictSpotImpact(params: {
  currentPrice: number;
  maxPain: number | null;
  gex: ReturnType<typeof calculateGEX>;
  ivStructure: ReturnType<typeof analyzeIVStructure>;
  supportResistance: SupportResistanceLevel[];
  unusualActivity: ReturnType<typeof detectUnusualActivity>;
  putCallRatio: number;
  daysToExpiry: number;
}): ImpactPrediction {
  const {
    currentPrice,
    maxPain,
    gex,
    ivStructure,
    supportResistance,
    unusualActivity,
    putCallRatio,
    daysToExpiry,
  } = params;

  const signals: string[] = [];
  const rationale: string[] = [];
  let directionScore = 0; // -100 ~ +100

  // 1. Max Pain 영향 (만기 가까울수록 강함)
  if (maxPain !== null) {
    const painDiff = maxPain - currentPrice;
    const painDiffPct = (painDiff / currentPrice) * 100;
    if (daysToExpiry <= 7 && Math.abs(painDiffPct) > 1) {
      const weight = 20;
      if (painDiff > 0) {
        directionScore += weight;
        signals.push(`🎯 Max Pain ${painDiff > 0 ? "위" : "아래"} $${maxPain} (+${painDiffPct.toFixed(1)}%)`);
        rationale.push(`만기 ${daysToExpiry}일 내 옵션 딜러가 Max Pain($${maxPain})으로 가격 당길 가능성`);
      } else {
        directionScore -= weight;
        signals.push(`🎯 Max Pain 아래 $${maxPain} (${painDiffPct.toFixed(1)}%)`);
        rationale.push(`만기 ${daysToExpiry}일 내 Max Pain($${maxPain})까지 하락 압력 가능`);
      }
    }
  }

  // 2. GEX - 변동성 예측
  if (gex.totalGex > 0) {
    signals.push(`📊 양의 GEX: 변동성 억제 (안정적 움직임 예상)`);
    rationale.push("딜러 매수 포지션 → 상승 시 매도, 하락 시 매수로 변동성 줄임");
  } else if (gex.totalGex < -1e9) {
    signals.push(`⚠️ 음의 GEX: 변동성 증폭 위험 (급등락 가능)`);
    rationale.push("딜러 매도 포지션 → 추세 강화, 뉴스/이벤트 시 큰 움직임");
    // 음의 GEX는 방향성은 중립, 변동성만 증가
  }

  // 3. Put/Call Ratio
  if (putCallRatio < 0.5) {
    directionScore += 15;
    signals.push(`📈 낮은 P/C ${putCallRatio.toFixed(2)}: 콜 압도 (강세)`);
    rationale.push("콜 수요 압도 - 강세 베팅 주류");
  } else if (putCallRatio > 1.0) {
    directionScore -= 15;
    signals.push(`📉 높은 P/C ${putCallRatio.toFixed(2)}: 풋 압도 (약세/헤지)`);
    rationale.push("풋 수요 증가 - 약세 또는 대규모 헤지");
  }

  // 4. IV Skew
  if (ivStructure.putSkew25d > 0.08) {
    directionScore -= 10;
    signals.push(`⚠️ 높은 풋 스큐 ${(ivStructure.putSkew25d * 100).toFixed(1)}%`);
    rationale.push(ivStructure.interpretation);
  } else if (ivStructure.putSkew25d < 0) {
    directionScore += 10;
    signals.push(`🚀 역스큐: 상방 폭발 베팅`);
    rationale.push("OTM 콜이 풋보다 비싸짐 - 드문 강세 신호");
  }

  // 5. Unusual Activity
  const bullishUnusual = unusualActivity.filter((u) => u.type === "콜" && u.strike > currentPrice);
  const bearishUnusual = unusualActivity.filter((u) => u.type === "풋" && u.strike < currentPrice);
  if (bullishUnusual.length > bearishUnusual.length) {
    directionScore += 10;
    signals.push(`🔥 비정상 콜 매수 ${bullishUnusual.length}건`);
    rationale.push("스마트머니 상승 베팅 증가");
  } else if (bearishUnusual.length > bullishUnusual.length) {
    directionScore -= 10;
    signals.push(`🔥 비정상 풋 매수 ${bearishUnusual.length}건`);
    rationale.push("스마트머니 하락 베팅 증가");
  }

  // 6. 가장 가까운 저항/지지
  const nearestResistance = supportResistance.find((l) => l.type === "resistance");
  const nearestSupport = supportResistance.find((l) => l.type === "support");

  // ─────────────────────────────────────────────
  // 최종 예측
  // ─────────────────────────────────────────────
  let direction: "up" | "down" | "neutral" = "neutral";
  let confidence = Math.min(95, Math.abs(directionScore) + 30);
  let targetPrice = currentPrice;

  if (directionScore > 15) {
    direction = "up";
    targetPrice = nearestResistance?.price ?? currentPrice * 1.03;
  } else if (directionScore < -15) {
    direction = "down";
    targetPrice = nearestSupport?.price ?? currentPrice * 0.97;
  } else {
    direction = "neutral";
    confidence = 40;
    // 중립이면 max pain이 있으면 거기로 수렴
    if (maxPain !== null && daysToExpiry <= 7) targetPrice = maxPain;
  }

  const targetPct = ((targetPrice - currentPrice) / currentPrice) * 100;

  let timeHorizon = "";
  if (daysToExpiry <= 7) timeHorizon = `${daysToExpiry}일 (만기까지)`;
  else if (daysToExpiry <= 30) timeHorizon = "1-4주";
  else timeHorizon = "1-2개월";

  return {
    direction,
    confidence: Math.round(confidence),
    targetPrice: Math.round(targetPrice * 100) / 100,
    targetPct: Math.round(targetPct * 100) / 100,
    timeHorizon,
    rationale,
    signals,
  };
}

// ═══════════════════════════════════════════════════════════
// GET 엔드포인트
// ═══════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "symbol 파라미터 필수" },
        { status: 400 }
      );
    }

    // 1. 옵션 데이터 수집
    const cboeData = await fetchCboeOptions(symbol);
    if (!cboeData) {
      return NextResponse.json(
        { success: false, error: `${symbol} CBOE 옵션 데이터 없음` },
        { status: 404 }
      );
    }

    // 2. 현재가 (Yahoo + CBOE 병합)
    const yahooQuotes = await fetchYahooQuotes([symbol]);
    const currentPrice = yahooQuotes.get(symbol)?.price ?? cboeData.currentPrice;

    // 3. 옵션 파싱
    const today = new Date().toISOString().split("T")[0];
    const parsed = cboeData.options
      .map(parseOptionSymbol)
      .filter((o): o is ParsedOption => o !== null && o.expiry >= today);

    if (parsed.length === 0) {
      return NextResponse.json(
        { success: false, error: "활성 옵션 없음" },
        { status: 404 }
      );
    }

    // 4. 가장 가까운 만기 선택
    const expiries = [...new Set(parsed.map((o) => o.expiry))].sort();
    const nearestExpiry = expiries[0];
    const daysToExpiry = Math.floor(
      (new Date(nearestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // 5. 주요 지표 계산
    const maxPain = calculateMaxPain(parsed, nearestExpiry);
    const gex = calculateGEX(parsed, currentPrice);
    const ivStructure = analyzeIVStructure(parsed, currentPrice);
    const supportResistance = findSupportResistance(parsed, currentPrice, nearestExpiry);
    const unusualActivity = detectUnusualActivity(parsed);

    // 6. Put/Call 비율
    const totalCallOI = parsed.filter((o) => o.type === "C").reduce((s, o) => s + o.oi, 0);
    const totalPutOI = parsed.filter((o) => o.type === "P").reduce((s, o) => s + o.oi, 0);
    const putCallRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

    const totalCallVol = parsed.filter((o) => o.type === "C").reduce((s, o) => s + o.volume, 0);
    const totalPutVol = parsed.filter((o) => o.type === "P").reduce((s, o) => s + o.volume, 0);
    const putCallVolRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 1;

    // 7. 현물 영향 예측
    const prediction = predictSpotImpact({
      currentPrice,
      maxPain,
      gex,
      ivStructure,
      supportResistance,
      unusualActivity,
      putCallRatio,
      daysToExpiry,
    });

    // 8. 예상 변동폭 (ATM 스트래들 가격 기반)
    const atmOptions = parsed.filter(
      (o) =>
        o.expiry === nearestExpiry &&
        Math.abs(o.strike - currentPrice) / currentPrice < 0.015
    );
    const atmCallMid = atmOptions
      .filter((o) => o.type === "C")
      .reduce((s, o) => s + o.mid, 0) / Math.max(1, atmOptions.filter((o) => o.type === "C").length);
    const atmPutMid = atmOptions
      .filter((o) => o.type === "P")
      .reduce((s, o) => s + o.mid, 0) / Math.max(1, atmOptions.filter((o) => o.type === "P").length);
    const expectedMove = atmCallMid + atmPutMid;
    const expectedMovePct = currentPrice > 0 ? (expectedMove / currentPrice) * 100 : 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      symbol,
      currentPrice,
      // 예측
      prediction,
      // 예상 변동폭
      expectedMove: Math.round(expectedMove * 100) / 100,
      expectedMovePct: Math.round(expectedMovePct * 100) / 100,
      // 지표
      maxPain,
      daysToExpiry,
      nearestExpiry,
      gex: {
        total: Math.round(gex.totalGex / 1e6) * 1e6, // 백만 단위 반올림
        call: Math.round(gex.callGex / 1e6) * 1e6,
        put: Math.round(gex.putGex / 1e6) * 1e6,
        regime: gex.totalGex > 0 ? "positive" : gex.totalGex < -1e9 ? "negative_extreme" : "neutral",
        topStrikes: gex.byStrike.slice(0, 10),
      },
      ivStructure: {
        atmCallIV: Math.round(ivStructure.atmCallIV * 10000) / 100,
        atmPutIV: Math.round(ivStructure.atmPutIV * 10000) / 100,
        verticalSkew: Math.round(ivStructure.verticalSkew * 10000) / 100,
        putSkew25d: Math.round(ivStructure.putSkew25d * 10000) / 100,
        interpretation: ivStructure.interpretation,
      },
      putCallRatio: Math.round(putCallRatio * 100) / 100,
      putCallVolRatio: Math.round(putCallVolRatio * 100) / 100,
      totalCallOI,
      totalPutOI,
      supportResistance,
      unusualActivity,
      allExpiries: expiries.slice(0, 10),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
