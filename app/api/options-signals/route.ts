import { NextRequest, NextResponse } from "next/server";
import { retryFetchJson } from "@/lib/retry-fetch";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 900; // 15분 캐시 (옵션은 분 단위 변동)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/options-signals
 *
 * 옵션 시장 시그널 엔진
 *
 * 기관의 "진짜 포지션 방향"을 암시하는 4가지 지표:
 *   1. Put/Call Ratio - 풋/콜 거래량 비율 (>1.0 베어, <0.7 불)
 *   2. IV Skew - 외가격 풋/콜의 내재변동성 차이 (테일 리스크 수요)
 *   3. Max Pain - 옵션 만기 시 최대 손실가 (기관 방어선 암시)
 *   4. Unusual Activity - 평소 대비 거래량 급증 스트라이크
 *
 * 데이터 소스: CBOE Delayed Quotes API (공식, 무료, 15분 지연)
 *   https://cdn.cboe.com/api/global/delayed_quotes/options/{ticker}.json
 *   - 인증 불필요
 *   - 그릭스 (delta/gamma/vega/theta) 포함
 *   - 전체 만기일 옵션 체인 제공
 *
 * 카일 보유 기초자산(ORCL/AMZN/TSLA) + 주요 ETF(SPY/QQQ/SOXX) 분석.
 *
 * 한계:
 *   - CBOE 데이터는 15분 지연 (무료 티어 특성)
 *   - 한국 종목 옵션은 분석 불가 (KRX API 제한)
 *   - 옵션 없는 소형주·ETF는 제외됨
 */

type OptionContract = {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  expiration: number;
  // Greeks (CBOE only)
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
};

type OptionsChain = {
  symbol: string;
  underlyingPrice: number;
  expirationDates: number[];
  calls: OptionContract[];
  puts: OptionContract[];
};

async function fetchOptionsChain(symbol: string, expiration?: number): Promise<OptionsChain | null> {
  try {
    // CBOE Global Delayed Quotes API (공식, 무료, 인증 불필요)
    // - 15분 지연 데이터
    // - 그릭스 (delta/gamma/vega/theta) 포함
    // - 전체 만기일 옵션 체인 반환
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`;
    const data: any = await retryFetchJson(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Semi-Dashboard/8.8)",
        "Accept": "application/json",
      },
    }, { maxRetries: 2, timeoutMs: 15000 });

    const d = data?.data;
    if (!d || !d.options) return null;

    const underlyingPrice = d.current_price ?? 0;
    const rawOptions = d.options ?? [];

    // option 심볼 형식: "ORCL260424C00075000"
    //   ORCL = 기초자산
    //   260424 = 만기일 (YYMMDD = 2026-04-24)
    //   C = call / P = put
    //   00075000 = 스트라이크 × 1000 (= $75.00)
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];
    const expirationSet = new Set<number>();

    for (const o of rawOptions) {
      const optSym: string = o.option ?? "";
      // 기초자산명을 제외한 나머지 파싱
      const rest = optSym.replace(symbol, "");
      if (rest.length < 15) continue;
      // rest: "260424C00075000"
      const yy = parseInt(rest.slice(0, 2));
      const mm = parseInt(rest.slice(2, 4));
      const dd = parseInt(rest.slice(4, 6));
      const type = rest[6]; // 'C' or 'P'
      const strike = parseInt(rest.slice(7)) / 1000;

      if (isNaN(yy) || isNaN(mm) || isNaN(dd) || isNaN(strike)) continue;
      const expDate = new Date(Date.UTC(2000 + yy, mm - 1, dd));
      const expUnix = Math.floor(expDate.getTime() / 1000);
      expirationSet.add(expUnix);

      // 특정 만기 필터 (옵션)
      if (expiration && expUnix !== expiration) continue;

      const contract: OptionContract = {
        strike,
        lastPrice: o.last_trade_price ?? 0,
        bid: o.bid ?? 0,
        ask: o.ask ?? 0,
        volume: o.volume ?? 0,
        openInterest: o.open_interest ?? 0,
        impliedVolatility: o.iv ?? 0,
        inTheMoney: type === "C" ? strike < underlyingPrice : strike > underlyingPrice,
        expiration: expUnix,
        // CBOE 전용: 그릭스
        delta: o.delta,
        gamma: o.gamma,
        vega: o.vega,
        theta: o.theta,
      };

      if (type === "C") calls.push(contract);
      else if (type === "P") puts.push(contract);
    }

    // 가장 가까운 만기로 필터 (기본 동작)
    if (!expiration && calls.length > 200) {
      const sortedExp = Array.from(expirationSet).sort((a, b) => a - b);
      const now = Math.floor(Date.now() / 1000);
      const nearest = sortedExp.find(e => e > now) ?? sortedExp[0];
      return {
        symbol,
        underlyingPrice,
        expirationDates: sortedExp,
        calls: calls.filter(c => c.expiration === nearest),
        puts: puts.filter(p => p.expiration === nearest),
      };
    }

    return {
      symbol,
      underlyingPrice,
      expirationDates: Array.from(expirationSet).sort((a, b) => a - b),
      calls,
      puts,
    };
  } catch (err) {
    console.error(`CBOE options fetch failed for ${symbol}:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Put/Call Ratio 계산
// ─────────────────────────────────────────────────────────────
function computePutCallRatio(chain: OptionsChain) {
  const totalPutVol = chain.puts.reduce((s, p) => s + p.volume, 0);
  const totalCallVol = chain.calls.reduce((s, c) => s + c.volume, 0);
  const totalPutOI = chain.puts.reduce((s, p) => s + p.openInterest, 0);
  const totalCallOI = chain.calls.reduce((s, c) => s + c.openInterest, 0);

  const volumeRatio = totalCallVol === 0 ? 0 : totalPutVol / totalCallVol;
  const oiRatio = totalCallOI === 0 ? 0 : totalPutOI / totalCallOI;

  let sentiment: "very_bearish" | "bearish" | "neutral" | "bullish" | "very_bullish" = "neutral";
  if (volumeRatio > 1.5) sentiment = "very_bearish";
  else if (volumeRatio > 1.0) sentiment = "bearish";
  else if (volumeRatio < 0.5) sentiment = "very_bullish";
  else if (volumeRatio < 0.7) sentiment = "bullish";

  return {
    volumeRatio,
    oiRatio,
    totalPutVol,
    totalCallVol,
    totalPutOI,
    totalCallOI,
    sentiment,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. IV Skew 계산 (25-delta 근사)
// ─────────────────────────────────────────────────────────────
function computeIVSkew(chain: OptionsChain) {
  const spot = chain.underlyingPrice;
  if (spot === 0) return null;

  // 외가격 10% 지점의 put/call IV 찾기
  const otmPutTarget = spot * 0.9;
  const otmCallTarget = spot * 1.1;

  const otmPut = chain.puts
    .filter(p => p.strike < spot && p.impliedVolatility > 0)
    .sort((a, b) => Math.abs(a.strike - otmPutTarget) - Math.abs(b.strike - otmPutTarget))[0];

  const otmCall = chain.calls
    .filter(c => c.strike > spot && c.impliedVolatility > 0)
    .sort((a, b) => Math.abs(a.strike - otmCallTarget) - Math.abs(b.strike - otmCallTarget))[0];

  const atmCall = chain.calls
    .filter(c => c.impliedVolatility > 0)
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];

  if (!otmPut || !otmCall || !atmCall) return null;

  const putSkew = otmPut.impliedVolatility - atmCall.impliedVolatility;
  const callSkew = otmCall.impliedVolatility - atmCall.impliedVolatility;
  const totalSkew = otmPut.impliedVolatility - otmCall.impliedVolatility;

  // 해석:
  //   정상: 풋 IV > 콜 IV (좌측 테일 리스크 수요 = 일반적)
  //   심화: totalSkew > 0.05 → 공포 프리미엄 상승
  //   역전: totalSkew < 0 → 이례적 콜 수요 (squeeze 위험 or 강세 베팅)
  let interpretation = "정상 스큐";
  if (totalSkew > 0.1) interpretation = "🚨 공포 프리미엄 고조 (하락 헷지 수요 급증)";
  else if (totalSkew > 0.05) interpretation = "⚠️ 좌측 테일 리스크 수요 증가";
  else if (totalSkew < -0.02) interpretation = "🚀 이례적 콜 수요 (스퀴즈/강세 베팅)";

  return {
    atmIV: atmCall.impliedVolatility,
    otmPutIV: otmPut.impliedVolatility,
    otmCallIV: otmCall.impliedVolatility,
    putSkew,
    callSkew,
    totalSkew,
    interpretation,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. Max Pain 계산
// ─────────────────────────────────────────────────────────────
function computeMaxPain(chain: OptionsChain) {
  const strikes = Array.from(new Set([
    ...chain.calls.map(c => c.strike),
    ...chain.puts.map(p => p.strike),
  ])).sort((a, b) => a - b);

  if (strikes.length === 0) return null;

  let minPain = Infinity;
  let maxPainStrike = strikes[0];

  for (const strike of strikes) {
    // 해당 스트라이크에서 만기 시 옵션 보유자의 총 손실
    const callPain = chain.calls.reduce((sum, c) => {
      const intrinsic = Math.max(0, strike - c.strike);
      return sum + intrinsic * c.openInterest;
    }, 0);
    const putPain = chain.puts.reduce((sum, p) => {
      const intrinsic = Math.max(0, p.strike - strike);
      return sum + intrinsic * p.openInterest;
    }, 0);
    const totalPain = callPain + putPain;
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = strike;
    }
  }

  const spot = chain.underlyingPrice;
  const distance = spot > 0 ? ((maxPainStrike - spot) / spot) * 100 : 0;

  let interpretation = "";
  if (Math.abs(distance) < 1) interpretation = "현재가 = Max Pain (시장이 이미 균형점)";
  else if (distance > 3) interpretation = `📈 Max Pain이 현재가보다 +${distance.toFixed(1)}% 위 (상방 압력 가능)`;
  else if (distance < -3) interpretation = `📉 Max Pain이 현재가보다 ${distance.toFixed(1)}% 아래 (하방 압력 가능)`;
  else interpretation = "현재가 근처 Max Pain (작용 제한적)";

  return {
    maxPainStrike,
    currentPrice: spot,
    distanceFromSpot: distance,
    totalPain: minPain,
    interpretation,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Unusual Activity 탐지
// ─────────────────────────────────────────────────────────────
function detectUnusualActivity(chain: OptionsChain, limit: number = 5) {
  const allOptions = [
    ...chain.calls.map(c => ({ ...c, type: "call" as const })),
    ...chain.puts.map(p => ({ ...p, type: "put" as const })),
  ];

  // Volume / OI 비율이 높으면 새로운 포지션 진입
  const unusual = allOptions
    .filter(o => o.volume > 100 && o.openInterest > 0)
    .map(o => ({
      ...o,
      volOIRatio: o.openInterest > 0 ? o.volume / o.openInterest : 0,
      moneyness: chain.underlyingPrice > 0 ? (o.strike - chain.underlyingPrice) / chain.underlyingPrice : 0,
    }))
    .filter(o => o.volOIRatio > 0.5) // 기존 OI의 50% 이상 신규 거래량
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);

  return unusual.map(o => ({
    type: o.type,
    strike: o.strike,
    expiration: o.expiration,
    volume: o.volume,
    openInterest: o.openInterest,
    volOIRatio: o.volOIRatio,
    moneynessPct: o.moneyness * 100,
    iv: o.impliedVolatility,
    interpretation: buildUnusualInterp(o.type, o.moneyness, o.volOIRatio),
  }));
}

function buildUnusualInterp(
  type: "call" | "put",
  moneyness: number,
  volOIRatio: number
): string {
  const direction = type === "call" ? "상승" : "하락";
  const otm = Math.abs(moneyness) > 0.05;
  const atm = Math.abs(moneyness) < 0.02;

  if (type === "call" && moneyness > 0.1 && volOIRatio > 2) {
    return `🚀 외가격 콜 폭발적 거래 — 급등 베팅 또는 스퀴즈 기대`;
  }
  if (type === "put" && moneyness < -0.1 && volOIRatio > 2) {
    return `🚨 외가격 풋 대량 매수 — 급락 헷지 또는 베어 베팅`;
  }
  if (atm) {
    return `📊 등가격 ${type} 신규 거래 — 방향성 없는 변동성 베팅`;
  }
  return `${direction} ${otm ? "외가격" : "근가격"} ${type} 신규 포지션 진입`;
}

// ─────────────────────────────────────────────────────────────
// 종합 시그널 생성
// ─────────────────────────────────────────────────────────────
function synthesizeSignal(pcr: any, skew: any, maxPain: any) {
  let bullishPoints = 0;
  let bearishPoints = 0;
  const reasons: string[] = [];

  // P/C Ratio
  if (pcr.volumeRatio < 0.7) {
    bullishPoints += 2;
    reasons.push(`✅ P/C Vol ${pcr.volumeRatio.toFixed(2)} (강세)`);
  } else if (pcr.volumeRatio > 1.2) {
    bearishPoints += 2;
    reasons.push(`⚠️ P/C Vol ${pcr.volumeRatio.toFixed(2)} (약세)`);
  } else {
    reasons.push(`📊 P/C Vol ${pcr.volumeRatio.toFixed(2)} (중립)`);
  }

  // IV Skew
  if (skew) {
    if (skew.totalSkew > 0.08) {
      bearishPoints += 1;
      reasons.push(`⚠️ IV 스큐 ${(skew.totalSkew * 100).toFixed(1)}% (공포 프리미엄)`);
    } else if (skew.totalSkew < 0) {
      bullishPoints += 1;
      reasons.push(`🚀 IV 스큐 역전 ${(skew.totalSkew * 100).toFixed(1)}% (콜 수요 강세)`);
    } else {
      reasons.push(`📊 IV 스큐 ${(skew.totalSkew * 100).toFixed(1)}% (정상)`);
    }
  }

  // Max Pain
  if (maxPain) {
    if (maxPain.distanceFromSpot > 3) {
      bullishPoints += 1;
      reasons.push(`📈 Max Pain 상방 ${maxPain.distanceFromSpot.toFixed(1)}%`);
    } else if (maxPain.distanceFromSpot < -3) {
      bearishPoints += 1;
      reasons.push(`📉 Max Pain 하방 ${maxPain.distanceFromSpot.toFixed(1)}%`);
    }
  }

  let netSignal: "bullish" | "bearish" | "neutral" = "neutral";
  const netScore = bullishPoints - bearishPoints;
  if (netScore >= 2) netSignal = "bullish";
  else if (netScore <= -2) netSignal = "bearish";

  return { netSignal, netScore, bullishPoints, bearishPoints, reasons };
}

// ─────────────────────────────────────────────────────────────
// 메인 엔드포인트
// ─────────────────────────────────────────────────────────────
const LEVERAGE_UNDERLYING: Record<string, string> = {
  ORCX: "ORCL", ORCU: "ORCL", ORCS: "ORCL",
  AMZU: "AMZN", TSLL: "TSLA",
  NVDU: "NVDA", NVDL: "NVDA",
  TQQQ: "QQQ", SOXL: "SOXX",
};

async function fetchKyleUnderlyings(): Promise<string[]> {
  try {
    const supabase = createAdmin();
    const { data } = await supabase
      .from("portfolio_holdings")
      .select("symbol")
      .eq("is_active", true);
    if (!data) return [];
    const underlyings = new Set<string>();
    for (const h of data) {
      const underlying = LEVERAGE_UNDERLYING[h.symbol] ?? h.symbol;
      // 한국 종목 제외 (옵션 없음)
      if (!underlying.endsWith(".KS") && !underlying.endsWith(".KQ")) {
        underlyings.add(underlying);
      }
    }
    return Array.from(underlyings);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customSymbols = searchParams.get("symbols");

    // 분석 대상: 카일 기초자산 + 주요 지수 ETF
    const defaultBenchmarks = ["SPY", "QQQ", "SOXX"];
    let targets: string[];
    if (customSymbols) {
      targets = customSymbols.split(",").map(s => s.trim());
    } else {
      const kyle = await fetchKyleUnderlyings();
      targets = Array.from(new Set([...kyle, ...defaultBenchmarks]));
    }

    // 병렬 분석 (3개씩 배치, rate limit 보수적)
    const analyses: any[] = [];
    for (let i = 0; i < targets.length; i += 3) {
      const batch = targets.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          const chain = await fetchOptionsChain(symbol);
          if (!chain) {
            return { symbol, error: "옵션 체인 조회 실패" };
          }

          const pcr = computePutCallRatio(chain);
          const skew = computeIVSkew(chain);
          const maxPain = computeMaxPain(chain);
          const unusual = detectUnusualActivity(chain, 5);
          const signal = synthesizeSignal(pcr, skew, maxPain);

          return {
            symbol,
            underlyingPrice: chain.underlyingPrice,
            nearestExpiration: chain.expirationDates[0]
              ? new Date(chain.expirationDates[0] * 1000).toISOString().slice(0, 10)
              : null,
            putCallRatio: pcr,
            ivSkew: skew,
            maxPain,
            unusualActivity: unusual,
            signal,
          };
        })
      );
      analyses.push(...batchResults);
      await new Promise(r => setTimeout(r, 500));
    }

    // 종합 인사이트
    const valid = analyses.filter(a => !a.error);
    const bullish = valid.filter(a => a.signal?.netSignal === "bullish").length;
    const bearish = valid.filter(a => a.signal?.netSignal === "bearish").length;
    const neutral = valid.filter(a => a.signal?.netSignal === "neutral").length;

    const insights: string[] = [];
    if (bearish > bullish + 1) {
      insights.push(`🚨 옵션 시장 전반 약세 (${bearish}종목 베어 vs ${bullish}종목 불)`);
    } else if (bullish > bearish + 1) {
      insights.push(`🚀 옵션 시장 전반 강세 (${bullish}종목 불 vs ${bearish}종목 베어)`);
    } else {
      insights.push(`⚖️ 옵션 시장 혼조 (불 ${bullish} / 베어 ${bearish} / 중립 ${neutral})`);
    }

    // 카일 종목별 주의 알림
    for (const a of valid) {
      const underlying = LEVERAGE_UNDERLYING[a.symbol] ?? a.symbol;
      if (a.signal?.netSignal === "bearish" && (a.symbol === "ORCL" || a.symbol === "AMZN" || a.symbol === "TSLA")) {
        insights.push(`⚠️ ${a.symbol} 옵션 시장 약세 시그널 — 카일 레버리지 포지션 점검 권고`);
      }
    }

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      totalAnalyzed: valid.length,
      summary: { bullish, bearish, neutral },
      analyses,
      insights,
      education: {
        putCallRatio: "풋/콜 거래량 비율. >1.0이면 베어(풋 매수 우세), <0.7이면 불",
        ivSkew: "OTM 풋과 콜의 내재변동성 차이. 정상(풋>콜)이나 >0.1이면 공포 프리미엄 과열",
        maxPain: "만기 시 옵션 보유자 총 손실이 최대가 되는 스트라이크. 만기까지 가격이 수렴하는 경향",
        unusual: "거래량/미결제약정 비율 높은 옵션 — 새로운 대형 포지션 진입 징후",
      },
      disclaimer: {
        source: "CBOE Global Delayed Quotes API (공식)",
        lag: "15분 지연 데이터 (무료 티어 특성)",
        caveat: "옵션 시그널은 참고용. 만기 효과·감마 스퀴즈 등 복잡성 존재",
        advantages: [
          "그릭스 (delta/gamma/vega/theta) 포함",
          "Yahoo Finance 옵션 API의 Invalid Crumb 문제 회피",
          "공식 소스 = 안정적 유지",
        ],
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
    }, { status: 200 });
  }
}
