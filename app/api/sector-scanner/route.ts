import { NextResponse } from "next/server";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ═══════════════════════════════════════════════════════════
// Opportunity Scanner API
// 
// 반도체 섹터 주요 종목들을 한번에 스캔해서:
//   - 🟢 강력한 매수 시그널
//   - 🔴 긴급 매도 경고
//   - 🔥 비정상 옵션 활동 (기관 매집 의심)
//   - 🚀 Gamma Squeeze 후보
//   - 💎 저평가 종목
// ═══════════════════════════════════════════════════════════

import { getScannerSymbols } from "@/lib/semi-universe";

// 반도체 유니버스에서 30+ 종목 스캔 (한국/미국/대만/네덜란드/일본)
const SECTOR_SYMBOLS = [
  ...getScannerSymbols(),
  // 관련 빅테크 (반도체 영향권)
  "MSFT", "GOOGL", "META", "AAPL", "AMZN", "TSLA",
  // 섹터 비교용
  "SPY", "QQQ",
];

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

interface ScanResult {
  symbol: string;
  currentPrice: number;
  dayChangePct: number;
  volume: number | null;
  // 옵션 메트릭
  maxPain: number | null;
  maxPainDistance: number | null;
  gexTotal: number;
  gexRegime: "positive" | "negative";
  putCallRatio: number;
  putCallVolRatio: number;
  expectedMovePct: number;
  // 신호
  opportunities: string[];    // 기회 신호
  warnings: string[];         // 경고 신호
  unusualActivity: string[];  // 비정상 활동
  gammaSqueezeScore: number;  // 0-100
  // 종합
  score: number;
  category: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  rationale: string;
}

// ───────────────────────────────────────────────────────────
// CBOE 조회
// ───────────────────────────────────────────────────────────
async function fetchCboe(symbol: string): Promise<{
  currentPrice: number;
  options: any[];
} | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return { currentPrice: d.data.current_price, options: d.data.options ?? [] };
  } catch {
    return null;
  }
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
// 개별 종목 스캔
// ───────────────────────────────────────────────────────────
async function scanSymbol(
  symbol: string,
  quote: { price: number; changePct?: number; volume?: number } | undefined
): Promise<ScanResult | null> {
  try {
    if (!quote?.price) return null;

    const cboe = await fetchCboe(symbol);
    if (!cboe) return null;

    const currentPrice = quote.price;
    const dayChangePct = quote.changePct ?? 0;
    const today = new Date();

    const parsed: ParsedOpt[] = [];
    for (const o of cboe.options) {
      const parsedOpt = parseOpt(o);
      if (!parsedOpt) continue;
      if (new Date(parsedOpt.expiry) <= today) continue;
      parsed.push(parsedOpt);
    }

    if (parsed.length === 0) return null;

    // Max Pain (가장 가까운 만기)
    const expiries = [...new Set(parsed.map(p => p.expiry))].sort();
    const nearest = expiries[0];
    const f = parsed.filter(p => p.expiry === nearest);
    let maxPain: number | null = null;
    if (f.length > 0) {
      const strikes = [...new Set(f.map(p => p.strike))].sort((a, b) => a - b);
      let minPain = Infinity;
      for (const t of strikes) {
        let pain = 0;
        for (const o of f) {
          if (o.type === "C" && t > o.strike) pain += (t - o.strike) * o.oi * 100;
          else if (o.type === "P" && t < o.strike) pain += (o.strike - t) * o.oi * 100;
        }
        if (pain < minPain) { minPain = pain; maxPain = t; }
      }
    }
    const maxPainDistance = maxPain !== null
      ? ((maxPain - currentPrice) / currentPrice) * 100
      : null;

    // GEX
    let gexTotal = 0;
    let callOi = 0, putOi = 0;
    let callVol = 0, putVol = 0;
    for (const o of parsed) {
      if (o.gamma && o.oi) {
        const gex = o.gamma * o.oi * 100 * currentPrice * currentPrice * 0.01;
        gexTotal += o.type === "C" ? gex : -gex;
      }
      if (o.type === "C") { callOi += o.oi; callVol += o.volume; }
      else { putOi += o.oi; putVol += o.volume; }
    }
    const gexRegime: "positive" | "negative" = gexTotal >= 0 ? "positive" : "negative";
    const putCallRatio = callOi > 0 ? Math.round((putOi / callOi) * 100) / 100 : 0;
    const putCallVolRatio = callVol > 0 ? Math.round((putVol / callVol) * 100) / 100 : 0;

    // 예상 변동폭 (가장 가까운 ATM IV)
    const atmOptions = parsed
      .filter(o => o.expiry === nearest)
      .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
      .slice(0, 4);
    const avgIv = atmOptions.length > 0
      ? atmOptions.reduce((s, o) => s + o.iv, 0) / atmOptions.length
      : 0;
    const daysToExp = Math.max(1, (new Date(nearest).getTime() - today.getTime()) / 86400000);
    const expectedMovePct = avgIv * Math.sqrt(daysToExp / 365) * 100;

    // ─────────────────────────────────────────────
    // 시그널 생성
    // ─────────────────────────────────────────────
    const opportunities: string[] = [];
    const warnings: string[] = [];
    const unusualActivity: string[] = [];
    let score = 0;
    let gammaSqueezeScore = 0;

    // Max Pain 분석
    if (maxPainDistance !== null) {
      if (maxPainDistance < -5) {
        warnings.push(`🎯 Max Pain 방향 ${maxPainDistance.toFixed(1)}% 하락 압력`);
        score -= 15;
      } else if (maxPainDistance > 5) {
        opportunities.push(`🎯 Max Pain 방향 +${maxPainDistance.toFixed(1)}% 상승 여지`);
        score += 12;
      } else if (Math.abs(maxPainDistance) < 1) {
        opportunities.push(`🎯 Max Pain 근접 ($${maxPain?.toFixed(2)}) - 수렴 가능`);
      }
    }

    // GEX 분석
    if (gexRegime === "positive" && gexTotal > 2e9) {
      opportunities.push(`✅ 강력한 양의 GEX (${(gexTotal/1e9).toFixed(2)}B) - 안정적`);
      score += 5;
    } else if (gexRegime === "negative" && Math.abs(gexTotal) > 1e9) {
      warnings.push(`⚠️ 음의 GEX (${(gexTotal/1e9).toFixed(2)}B) - 변동성 위험`);
      score -= 10;
    }

    // P/C Ratio 극단
    if (putCallRatio > 1.5) {
      opportunities.push(`💎 극도의 풋 편중 (P/C ${putCallRatio}) - 역발상 매수`);
      score += 8;
    } else if (putCallRatio < 0.4) {
      warnings.push(`⚠️ 극도의 콜 편중 (P/C ${putCallRatio}) - 조정 가능`);
      score -= 5;
    }

    // 거래량 기준 P/C
    if (putCallVolRatio > 2.0) {
      unusualActivity.push(`🔥 거래량 P/C ${putCallVolRatio} - 대량 풋 매수 의심`);
      score -= 5;
    } else if (putCallVolRatio < 0.2) {
      unusualActivity.push(`🔥 거래량 P/C ${putCallVolRatio} - 대량 콜 매수 의심`);
      score += 5;
    }

    // 일중 가격 모멘텀
    if (dayChangePct > 5) {
      opportunities.push(`🚀 일중 +${dayChangePct.toFixed(1)}% 강한 모멘텀`);
      score += 3;
    } else if (dayChangePct < -5) {
      warnings.push(`📉 일중 ${dayChangePct.toFixed(1)}% 급락`);
      score -= 3;
    }

    // Gamma Squeeze 후보 탐지
    // 조건: 현재가 근처에 강한 Call Wall + 양의 GEX + 거래량 P/C 낮음
    if (gexRegime === "positive" && putCallVolRatio < 0.5) {
      // 현재가 위쪽 2-5% 범위에 큰 Call OI가 있는지
      const nearStrikes = parsed
        .filter(o => o.type === "C" && o.strike > currentPrice && o.strike < currentPrice * 1.05)
        .reduce((s, o) => s + o.oi, 0);
      if (nearStrikes > 20000) {
        gammaSqueezeScore = Math.min(100, (nearStrikes / 1000));
        opportunities.push(`🚀 Gamma Squeeze 후보 (Call OI ${Math.round(nearStrikes/1000)}K 상방 집중)`);
        score += 10;
      }
    }

    // 예상 변동폭 기반
    if (expectedMovePct > 10) {
      warnings.push(`⚡ 예상 변동 ±${expectedMovePct.toFixed(1)}% 극심`);
    }

    // ─────────────────────────────────────────────
    // 카테고리 결정
    // ─────────────────────────────────────────────
    let category: ScanResult["category"];
    let rationale = "";

    if (score >= 20) {
      category = "strong_buy";
      rationale = opportunities.slice(0, 2).join(" · ");
    } else if (score >= 10) {
      category = "buy";
      rationale = opportunities.length > 0 ? opportunities[0] : "약한 강세 시그널";
    } else if (score <= -20) {
      category = "strong_sell";
      rationale = warnings.slice(0, 2).join(" · ");
    } else if (score <= -10) {
      category = "sell";
      rationale = warnings.length > 0 ? warnings[0] : "약한 약세 시그널";
    } else {
      category = "neutral";
      rationale = "명확한 방향성 없음";
    }

    return {
      symbol,
      currentPrice,
      dayChangePct,
      volume: quote.volume ?? null,
      maxPain,
      maxPainDistance,
      gexTotal: Math.round(gexTotal / 1e6) * 1e6,
      gexRegime,
      putCallRatio,
      putCallVolRatio,
      expectedMovePct: Math.round(expectedMovePct * 100) / 100,
      opportunities,
      warnings,
      unusualActivity,
      gammaSqueezeScore: Math.round(gammaSqueezeScore),
      score,
      category,
      rationale,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    // 1. 모든 종목 시세 병렬 조회
    const quotes = await fetchYahooQuotes(SECTOR_SYMBOLS);

    // 2. 병렬로 옵션 스캔 (너무 많으면 타임아웃 → 주요 종목만 우선)
    const priorities = ["NVDA", "AMD", "TSM", "SMH", "SOXX", "MU", "AVGO", "ARM", "SPY", "QQQ", "INTC", "QCOM"];
    const secondary = SECTOR_SYMBOLS.filter(s => !priorities.includes(s));

    // 먼저 우선 종목 스캔
    const priorityResults = await Promise.all(
      priorities.map(s => scanSymbol(s, quotes.get(s)))
    );

    // 남은 종목은 각자 스캔 (실패해도 무시)
    const secondaryResults = await Promise.all(
      secondary.map(s => scanSymbol(s, quotes.get(s)))
    );

    const allResults = [...priorityResults, ...secondaryResults]
      .filter((r): r is ScanResult => r !== null)
      .sort((a, b) => b.score - a.score);

    // 3. 카테고리별 분류
    const strongBuys = allResults.filter(r => r.category === "strong_buy");
    const buys = allResults.filter(r => r.category === "buy");
    const sells = allResults.filter(r => r.category === "sell");
    const strongSells = allResults.filter(r => r.category === "strong_sell");
    const neutrals = allResults.filter(r => r.category === "neutral");

    // 특별 카테고리
    const unusualActivityList = allResults
      .filter(r => r.unusualActivity.length > 0)
      .sort((a, b) => b.unusualActivity.length - a.unusualActivity.length);

    const gammaSqueezeList = allResults
      .filter(r => r.gammaSqueezeScore > 0)
      .sort((a, b) => b.gammaSqueezeScore - a.gammaSqueezeScore);

    // 4. 섹터 통계
    const sectorSentiment = {
      bullish: strongBuys.length + buys.length,
      bearish: sells.length + strongSells.length,
      neutral: neutrals.length,
      avgScore: Math.round(
        allResults.reduce((s, r) => s + r.score, 0) / (allResults.length || 1)
      ),
      positiveGex: allResults.filter(r => r.gexRegime === "positive").length,
      negativeGex: allResults.filter(r => r.gexRegime === "negative").length,
    };

    // 5. 섹터 판단
    const sectorDirection =
      sectorSentiment.bullish >= sectorSentiment.bearish + 3 ? "강세 우위" :
      sectorSentiment.bearish >= sectorSentiment.bullish + 3 ? "약세 우위" :
      "혼조";

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      scannedCount: allResults.length,
      sectorSentiment,
      sectorDirection,
      results: {
        strongBuys,
        buys,
        neutrals: neutrals.slice(0, 5), // 중립은 상위 5개만
        sells,
        strongSells,
      },
      unusualActivity: unusualActivityList.slice(0, 5),
      gammaSqueezeCandidates: gammaSqueezeList.slice(0, 5),
      allResults: allResults.slice(0, 25), // 전체 결과 상위 25개
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: true,
      scannedCount: 0,
      sectorSentiment: { bullish: 0, bearish: 0, neutral: 0, avgScore: 0, positiveGex: 0, negativeGex: 0 },
      sectorDirection: "혼조",
      results: { strongBuys: [], buys: [], neutrals: [], sells: [], strongSells: [] },
      unusualActivity: [],
      gammaSqueezeCandidates: [],
      allResults: [],
      error: msg,
      _soft_failure: true,
    });
  }
}
