import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";
import { resolvePortfolioProxies, OptionsProxy } from "@/lib/options-proxy";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Portfolio Risk Dashboard API
// 
// 카일님 포트폴리오 전체의 통합 리스크 뷰:
//   - 각 종목 → 옵션 proxy 자동 매핑
//   - 각 proxy의 시그널 수집
//   - 포트폴리오 가중 리스크 점수
//   - 종합 액션 추천
// ═══════════════════════════════════════════════════════════

interface PositionAnalysis {
  holding: {
    id: number;
    symbol: string;
    name: string | null;
    shares: number;
    currentValue: number;       // KRW 또는 USD
    valueInUsd: number;
    weight: number;             // 포트폴리오 내 비중 (%)
    gainPct: number;
  };
  proxy: OptionsProxy;
  proxySignals: {
    currentPrice: number | null;
    maxPain: number | null;
    maxPainDistance: number | null;     // %
    gexRegime: "positive" | "negative" | "unknown";
    gexValue: number | null;
    rsi: number | null;
    direction: "up" | "down" | "neutral" | "unknown";
    confidence: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    signals: string[];
  };
}

interface PortfolioRisk {
  totalValueUsd: number;
  overallRiskScore: number;          // 0-100 (높을수록 위험)
  overallRiskLabel: "낮음" | "보통" | "높음" | "긴급";
  overallColor: string;
  weightedBullishScore: number;      // -100 ~ +100
  dominantDirection: "up" | "down" | "neutral";
  positions: PositionAnalysis[];
  topRisks: Array<{ symbol: string; reason: string; weight: number }>;
  topOpportunities: Array<{ symbol: string; reason: string; weight: number }>;
  recommendedActions: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    target: string;
    reason: string;
  }>;
}

// ───────────────────────────────────────────────────────────
// 개별 종목의 옵션 시그널 수집 (간소화 버전)
// ───────────────────────────────────────────────────────────
async function analyzeProxy(proxy: OptionsProxy): Promise<PositionAnalysis["proxySignals"]> {
  const signals: string[] = [];
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let direction: "up" | "down" | "neutral" | "unknown" = "unknown";
  let confidence = 50;

  try {
    // 1. 현재가 조회
    const quotes = await fetchYahooQuotes([proxy.proxySymbol]);
    const currentPrice = quotes.get(proxy.proxySymbol)?.price ?? null;

    if (!currentPrice) {
      return {
        currentPrice: null,
        maxPain: null,
        maxPainDistance: null,
        gexRegime: "unknown",
        gexValue: null,
        rsi: null,
        direction: "unknown",
        confidence: 0,
        riskLevel: "medium",
        signals: ["⚠️ 데이터 조회 실패"],
      };
    }

    // 2. CBOE 옵션 데이터
    const cboeRes = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${proxy.proxySymbol}.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
    );

    if (!cboeRes.ok) {
      return {
        currentPrice,
        maxPain: null,
        maxPainDistance: null,
        gexRegime: "unknown",
        gexValue: null,
        rsi: null,
        direction: "neutral",
        confidence: 40,
        riskLevel: "medium",
        signals: ["⚠️ 옵션 데이터 없음"],
      };
    }

    const cboe = await cboeRes.json();
    const options: any[] = cboe.data?.options ?? [];

    // 옵션 파싱
    const today = new Date();
    const parsed: Array<any> = [];
    for (const o of options) {
      const m = o.option?.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
      if (!m) continue;
      const expiry = new Date(`20${m[2]}-${m[3]}-${m[4]}`);
      if (expiry <= today) continue;
      parsed.push({
        expiry: `20${m[2]}-${m[3]}-${m[4]}`,
        type: m[5],
        strike: parseInt(m[6]) / 1000,
        oi: o.open_interest || 0,
        gamma: o.gamma || 0,
      });
    }

    // Max Pain 계산 (가장 가까운 만기)
    const expiries = [...new Set(parsed.map((p) => p.expiry))].sort();
    const nearestExpiry = expiries[0];
    const f = parsed.filter((p) => p.expiry === nearestExpiry);
    
    let maxPain: number | null = null;
    if (f.length > 0) {
      const strikes = [...new Set(f.map((p) => p.strike))].sort((a, b) => a - b);
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

    const maxPainDistance = maxPain !== null ? ((maxPain - currentPrice) / currentPrice) * 100 : null;

    // GEX 계산 (간단히)
    let totalGex = 0;
    for (const o of parsed) {
      if (!o.gamma || !o.oi) continue;
      const gex = o.gamma * o.oi * 100 * currentPrice * currentPrice * 0.01;
      totalGex += o.type === "C" ? gex : -gex;
    }

    const gexRegime: "positive" | "negative" = totalGex >= 0 ? "positive" : "negative";

    // ─────────────────────────────────────────────
    // 시그널 해석
    // ─────────────────────────────────────────────
    let score = 0;

    if (maxPainDistance !== null) {
      if (maxPainDistance < -3) {
        signals.push(`🎯 Max Pain $${maxPain} (${maxPainDistance.toFixed(1)}%) - 하락 압력`);
        score -= 15;
      } else if (maxPainDistance > 3) {
        signals.push(`🎯 Max Pain $${maxPain} (+${maxPainDistance.toFixed(1)}%) - 상승 여지`);
        score += 10;
      }
    }

    if (gexRegime === "positive") {
      signals.push(`✅ 양의 GEX ${(totalGex / 1e9).toFixed(1)}B - 안정적`);
    } else {
      signals.push(`⚠️ 음의 GEX ${(totalGex / 1e9).toFixed(1)}B - 변동성 위험`);
      score -= 5;
      if (riskLevel === "low") riskLevel = "medium";
    }

    // 방향 결정
    if (score > 10) { direction = "up"; confidence = Math.min(85, 50 + score); }
    else if (score < -10) { direction = "down"; confidence = Math.min(85, 50 + Math.abs(score)); }
    else { direction = "neutral"; confidence = 45; }

    // 리스크 레벨 (proxy가 약하면 기본 보수적)
    if (proxy.correlation < 0.7) {
      if (riskLevel === "low") riskLevel = "medium";
    }
    if (Math.abs(score) > 15) {
      riskLevel = score < 0 ? "high" : "medium";
    }

    return {
      currentPrice,
      maxPain,
      maxPainDistance,
      gexRegime,
      gexValue: totalGex,
      rsi: null, // RSI는 시간 절약 위해 생략
      direction,
      confidence,
      riskLevel,
      signals,
    };
  } catch (e) {
    return {
      currentPrice: null,
      maxPain: null,
      maxPainDistance: null,
      gexRegime: "unknown",
      gexValue: null,
      rsi: null,
      direction: "unknown",
      confidence: 0,
      riskLevel: "medium",
      signals: ["❌ 분석 실패"],
    };
  }
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const supabase = createAdmin();

    // 1. 포트폴리오 조회
    const { data: holdings, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        positions: [],
        message: "포트폴리오 비어있음",
      });
    }

    // 2. 시세 & 환율
    const symbols = [...new Set(holdings.map((h) => h.symbol))];
    const [quotes, fxQuotes] = await Promise.all([
      fetchYahooQuotes(symbols),
      fetchYahooQuotes(["KRW=X"]),
    ]);
    const usdKrw = fxQuotes.get("KRW=X")?.price ?? 1350;

    // 3. Proxy 매핑
    const proxyMap = resolvePortfolioProxies(
      holdings.map((h) => ({ symbol: h.symbol, name: h.name }))
    );

    // 4. 각 종목 분석
    const totalValueUsd = holdings.reduce((sum, h) => {
      const q = quotes.get(h.symbol);
      const value = (q?.price ?? h.avg_cost) * h.shares;
      return sum + (h.currency === "KRW" ? value / usdKrw : value);
    }, 0);

    // Proxy별로 그룹핑 (같은 proxy는 중복 분석 안 하게)
    const uniqueProxies = new Map<string, OptionsProxy>();
    for (const [, proxy] of proxyMap.entries()) {
      uniqueProxies.set(proxy.proxySymbol, proxy);
    }

    // 병렬로 각 proxy 분석
    const proxyAnalyses = new Map<string, PositionAnalysis["proxySignals"]>();
    await Promise.all(
      Array.from(uniqueProxies.values()).map(async (proxy) => {
        const analysis = await analyzeProxy(proxy);
        proxyAnalyses.set(proxy.proxySymbol, analysis);
      })
    );

    // 5. 포지션별 결과 조립
    const positions: PositionAnalysis[] = [];
    let weightedBullishScore = 0;
    let weightedRiskScore = 0;

    for (const h of holdings) {
      const proxy = proxyMap.get(h.symbol);
      if (!proxy) continue;

      const q = quotes.get(h.symbol);
      const currentValue = (q?.price ?? h.avg_cost) * h.shares;
      const valueInUsd = h.currency === "KRW" ? currentValue / usdKrw : currentValue;
      const weight = totalValueUsd > 0 ? (valueInUsd / totalValueUsd) * 100 : 0;
      const gainPct = q?.price
        ? ((q.price - h.avg_cost) / h.avg_cost) * 100
        : 0;

      const proxySignals = proxyAnalyses.get(proxy.proxySymbol) ?? {
        currentPrice: null,
        maxPain: null,
        maxPainDistance: null,
        gexRegime: "unknown" as const,
        gexValue: null,
        rsi: null,
        direction: "unknown" as const,
        confidence: 0,
        riskLevel: "medium" as const,
        signals: [],
      };

      // 가중 점수
      const signedScore =
        proxySignals.direction === "up" ? proxySignals.confidence :
        proxySignals.direction === "down" ? -proxySignals.confidence :
        0;
      weightedBullishScore += (signedScore * weight) / 100;

      // 리스크 점수
      const riskValue =
        proxySignals.riskLevel === "critical" ? 100 :
        proxySignals.riskLevel === "high" ? 70 :
        proxySignals.riskLevel === "medium" ? 40 :
        15;
      weightedRiskScore += (riskValue * weight) / 100;

      positions.push({
        holding: {
          id: h.id,
          symbol: h.symbol,
          name: h.name,
          shares: h.shares,
          currentValue,
          valueInUsd,
          weight,
          gainPct,
        },
        proxy,
        proxySignals,
      });
    }

    // 비중 큰 순으로 정렬
    positions.sort((a, b) => b.holding.weight - a.holding.weight);

    // 6. 최종 해석
    const overallRiskScore = Math.round(weightedRiskScore);
    const overallRiskLabel =
      overallRiskScore >= 70 ? "긴급" :
      overallRiskScore >= 50 ? "높음" :
      overallRiskScore >= 30 ? "보통" :
      "낮음";
    const overallColor =
      overallRiskScore >= 70 ? "#ff3860" :
      overallRiskScore >= 50 ? "#ffaa44" :
      overallRiskScore >= 30 ? "#ffcc00" :
      "#00ff88";

    const dominantDirection: "up" | "down" | "neutral" =
      weightedBullishScore > 20 ? "up" :
      weightedBullishScore < -20 ? "down" :
      "neutral";

    // Top risks / opportunities
    const topRisks: Array<{ symbol: string; reason: string; weight: number }> = [];
    const topOpportunities: Array<{ symbol: string; reason: string; weight: number }> = [];

    for (const p of positions) {
      if (p.proxySignals.direction === "down" && p.proxySignals.confidence > 60) {
        topRisks.push({
          symbol: p.holding.symbol,
          reason: `${p.proxy.proxySymbol} 약세 시그널 (신뢰도 ${p.proxySignals.confidence}%)`,
          weight: p.holding.weight,
        });
      } else if (p.proxySignals.direction === "up" && p.proxySignals.confidence > 60) {
        topOpportunities.push({
          symbol: p.holding.symbol,
          reason: `${p.proxy.proxySymbol} 강세 시그널 (신뢰도 ${p.proxySignals.confidence}%)`,
          weight: p.holding.weight,
        });
      }
      // 음의 GEX인데 비중 큰 경우
      if (p.proxySignals.gexRegime === "negative" && p.holding.weight > 20) {
        topRisks.push({
          symbol: p.holding.symbol,
          reason: `${p.proxy.proxySymbol} 음의 GEX - 변동성 폭발 위험 (비중 ${p.holding.weight.toFixed(0)}%)`,
          weight: p.holding.weight,
        });
      }
    }

    // 7. 추천 액션
    const recommendedActions: PortfolioRisk["recommendedActions"] = [];

    if (overallRiskScore >= 70) {
      recommendedActions.push({
        priority: "high",
        action: "🚨 긴급 리스크 축소",
        target: `비중 상위 ${positions.slice(0, 2).map((p) => p.holding.symbol).join(", ")}`,
        reason: "포트폴리오 리스크 점수 70+ - 즉시 방어 포지션 전환",
      });
    }

    if (topRisks.length > 0) {
      const worst = topRisks[0];
      recommendedActions.push({
        priority: "high",
        action: "🛡️ 헤지 매수 또는 일부 청산",
        target: worst.symbol,
        reason: worst.reason,
      });
    }

    if (topOpportunities.length > 0 && overallRiskScore < 50) {
      const best = topOpportunities[0];
      recommendedActions.push({
        priority: "medium",
        action: "📈 포지션 추가 고려",
        target: best.symbol,
        reason: best.reason,
      });
    }

    if (positions.length > 0 && positions[0].holding.weight > 50) {
      recommendedActions.push({
        priority: "medium",
        action: "⚖️ 분산 필요",
        target: positions[0].holding.symbol,
        reason: `${positions[0].holding.symbol} 비중 ${positions[0].holding.weight.toFixed(0)}% - 집중 리스크`,
      });
    }

    const result: PortfolioRisk = {
      totalValueUsd,
      overallRiskScore,
      overallRiskLabel,
      overallColor,
      weightedBullishScore: Math.round(weightedBullishScore),
      dominantDirection,
      positions,
      topRisks: topRisks.slice(0, 5),
      topOpportunities: topOpportunities.slice(0, 5),
      recommendedActions,
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
