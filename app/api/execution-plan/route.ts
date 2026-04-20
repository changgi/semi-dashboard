import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";
import { resolvePortfolioProxies } from "@/lib/options-proxy";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ═══════════════════════════════════════════════════════════
// Execution Plan API
// 
// 모든 분석 결과 → 실행 가능한 주문 리스트
//   - 매수/매도 종목 + 수량 + 가격
//   - 포지션 사이징 (Kelly Criterion)
//   - 실행 우선순위
//   - 예상 포트폴리오 변화
// ═══════════════════════════════════════════════════════════

interface OrderPlan {
  id: string;
  action: "buy" | "sell" | "reduce" | "hedge";
  symbol: string;
  symbolName: string;
  orderType: "market" | "limit";
  currentPrice: number;
  suggestedPrice: number | null;
  estimatedShares: number;
  estimatedDollarAmount: number;
  estimatedWonAmount: number;
  priority: 1 | 2 | 3 | 4 | 5;
  urgency: "immediate" | "today" | "this_week";
  reasoning: string[];
  expectedReturn: {
    target: number;           // 목표가
    upside: number;           // %
    stopLoss: number;         // 손절가
    downside: number;         // %
    riskRewardRatio: number;  // 2.5:1 등
  };
  kellyFraction: number;       // 0-1 (권장 비중)
  confidence: number;          // 0-100
}

interface ExecutionPlan {
  totalCapital: number;         // KRW
  totalCapitalUsd: number;
  availableCash: number;        // KRW (추정)
  orders: OrderPlan[];
  expectedPortfolio: {
    beforeTotal: number;
    afterTotal: number;
    beforePositions: number;
    afterPositions: number;
    diversificationScore: number;  // 0-100
  };
  summary: {
    totalBuyAmount: number;
    totalSellAmount: number;
    netFlow: number;
    executionOrder: string[];   // 실행 순서
    keyRecommendations: string[];
  };
  risks: string[];
  opportunities: string[];
}

// ───────────────────────────────────────────────────────────
// 빠른 옵션 분석 (재사용)
// ───────────────────────────────────────────────────────────
async function quickAnalyze(symbol: string, currentPrice: number): Promise<{
  maxPain: number | null;
  maxPainDist: number | null;
  gexRegime: "positive" | "negative";
  gexValue: number;
  direction: "up" | "down" | "neutral";
  confidence: number;
  signals: string[];
} | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const options: any[] = data.data?.options ?? [];
    const today = new Date();

    const parsed: any[] = [];
    for (const o of options) {
      const m = o.option?.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
      if (!m) continue;
      const exp = `20${m[2]}-${m[3]}-${m[4]}`;
      if (new Date(exp) <= today) continue;
      parsed.push({
        expiry: exp, type: m[5], strike: parseInt(m[6]) / 1000,
        oi: o.open_interest || 0, gamma: o.gamma || 0,
      });
    }

    // Max Pain
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
    const maxPainDist = maxPain !== null
      ? ((maxPain - currentPrice) / currentPrice) * 100
      : null;

    // GEX
    let gex = 0;
    for (const o of parsed) {
      if (!o.gamma || !o.oi) continue;
      const g = o.gamma * o.oi * 100 * currentPrice * currentPrice * 0.01;
      gex += o.type === "C" ? g : -g;
    }
    const gexRegime: "positive" | "negative" = gex >= 0 ? "positive" : "negative";

    // 방향
    let score = 0;
    const signals: string[] = [];
    if (maxPainDist !== null) {
      if (maxPainDist < -5) { score -= 15; signals.push(`Max Pain 하락 압력 ${maxPainDist.toFixed(1)}%`); }
      else if (maxPainDist > 5) { score += 12; signals.push(`Max Pain 상승 여지 +${maxPainDist.toFixed(1)}%`); }
    }
    if (gexRegime === "positive" && gex > 2e9) { score += 5; signals.push(`강한 양의 GEX ${(gex/1e9).toFixed(1)}B`); }
    else if (gexRegime === "negative") { score -= 10; signals.push(`음의 GEX - 변동성 위험`); }

    const direction: "up" | "down" | "neutral" =
      score > 10 ? "up" : score < -10 ? "down" : "neutral";
    const confidence = Math.min(85, 50 + Math.abs(score));

    return { maxPain, maxPainDist, gexRegime, gexValue: gex, direction, confidence, signals };
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────
// Kelly Criterion 포지션 사이징
// ───────────────────────────────────────────────────────────
function calcKellyFraction(
  winProb: number,        // 0-1 (confidence / 100)
  winPct: number,         // 0.08 (8% 목표)
  lossPct: number         // 0.03 (3% 손절)
): number {
  // Kelly = (winProb × winPct - lossProb × lossPct) / winPct
  const lossProb = 1 - winProb;
  const kelly = (winProb * winPct - lossProb * lossPct) / winPct;
  // 안전 계수 0.25 적용 (Full Kelly는 너무 공격적)
  return Math.max(0, Math.min(0.5, kelly * 0.25));
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

    // 2. 시세 + 환율
    const symbols = [...new Set((holdings || []).map((h: any) => h.symbol))];
    const candidates = ["SPY", "QQQ", "SMH", "SOXX", "NVDA", "AMD", "AAPL", "MSFT", "GOOGL"];
    const allSymbols = [...new Set([...symbols, ...candidates, "KRW=X"])];
    const quotes = await fetchYahooQuotes(allSymbols);
    const usdKrw = quotes.get("KRW=X")?.price ?? 1470;

    // 3. 포트폴리오 현황 계산
    let totalValueUsd = 0;
    const proxyMap = resolvePortfolioProxies(
      (holdings || []).map((h: any) => ({ symbol: h.symbol, name: h.name }))
    );
    const proxyWeights: Record<string, number> = {};
    
    for (const h of (holdings || [])) {
      const q = quotes.get(h.symbol);
      const price = q?.price ?? h.avg_cost;
      const valueUsd = h.currency === "KRW"
        ? (price * h.shares) / usdKrw
        : price * h.shares;
      totalValueUsd += valueUsd;
      const proxy = proxyMap.get(h.symbol);
      if (proxy) {
        proxyWeights[proxy.proxySymbol] = (proxyWeights[proxy.proxySymbol] || 0) + valueUsd;
      }
    }

    const totalCapitalKrw = totalValueUsd * usdKrw;

    // 4. 후보 종목 분석
    const analyses: Record<string, any> = {};
    await Promise.all(
      candidates.map(async (sym) => {
        const q = quotes.get(sym);
        if (!q?.price) return;
        const a = await quickAnalyze(sym, q.price);
        if (a) {
          analyses[sym] = { ...a, currentPrice: q.price, dayChangePct: q.changePct ?? 0 };
        }
      })
    );

    // 5. 주문 플랜 생성
    const orders: OrderPlan[] = [];
    let orderIdx = 0;

    // A. 기존 포지션 점검 (매도/축소)
    for (const h of (holdings || [])) {
      const proxy = proxyMap.get(h.symbol);
      if (!proxy) continue;
      const analysis = analyses[proxy.proxySymbol];
      if (!analysis) continue;

      const q = quotes.get(h.symbol);
      const currentPrice = q?.price ?? h.avg_cost;
      const valueUsd = h.currency === "KRW"
        ? (currentPrice * h.shares) / usdKrw
        : currentPrice * h.shares;
      const weight = totalValueUsd > 0 ? (valueUsd / totalValueUsd) * 100 : 0;

      // 비중 90% 초과 + proxy 하락 시 축소
      if (weight > 90 && analysis.direction === "down") {
        const reduceShares = Math.floor(h.shares * 0.2); // 20% 축소
        if (reduceShares > 0) {
          orders.push({
            id: `ord_${orderIdx++}`,
            action: "reduce",
            symbol: h.symbol,
            symbolName: h.name || h.symbol,
            orderType: "market",
            currentPrice,
            suggestedPrice: null,
            estimatedShares: reduceShares,
            estimatedDollarAmount: h.currency === "KRW"
              ? (currentPrice * reduceShares) / usdKrw
              : currentPrice * reduceShares,
            estimatedWonAmount: h.currency === "KRW"
              ? currentPrice * reduceShares
              : currentPrice * reduceShares * usdKrw,
            priority: 2,
            urgency: "today",
            reasoning: [
              `${proxy.proxySymbol} 약세 시그널 (${analysis.confidence}% 신뢰도)`,
              `포트폴리오 내 비중 ${weight.toFixed(0)}% - 집중 리스크 감소`,
              ...analysis.signals.slice(0, 2),
            ],
            expectedReturn: {
              target: currentPrice * 0.95,
              upside: -5,
              stopLoss: currentPrice * 1.05,
              downside: 5,
              riskRewardRatio: 1.0,
            },
            kellyFraction: 0.2,
            confidence: analysis.confidence,
          });
        }
      }
    }

    // B. 매수 후보 발굴
    const buyCandidates = candidates
      .filter((s) => {
        const a = analyses[s];
        if (!a) return false;
        if (a.direction !== "up") return false;
        // 이미 많이 보유한 proxy는 제외
        const existingWeight = proxyWeights[s]
          ? (proxyWeights[s] / totalValueUsd) * 100
          : 0;
        return existingWeight < 80;
      })
      .sort((a, b) => (analyses[b]?.confidence ?? 0) - (analyses[a]?.confidence ?? 0));

    // 포트폴리오 확장에 사용할 금액 (총 자산의 15%)
    const expansionBudget = totalCapitalKrw * 0.15;
    let budgetRemaining = expansionBudget;

    for (const sym of buyCandidates.slice(0, 3)) {
      const a = analyses[sym];
      if (!a || budgetRemaining <= 0) continue;

      // Kelly Criterion
      const kelly = calcKellyFraction(a.confidence / 100, 0.08, 0.03);
      const allocationKrw = Math.min(expansionBudget * kelly * 2, budgetRemaining);
      const allocationUsd = allocationKrw / usdKrw;
      const shares = Math.floor(allocationUsd / a.currentPrice);

      // 수량 0이면 스킵 (소액 자본에서 비싼 종목은 매수 불가)
      if (shares === 0) continue;

      orders.push({
          id: `ord_${orderIdx++}`,
          action: "buy",
          symbol: sym,
          symbolName: sym,
          orderType: "limit",
          currentPrice: a.currentPrice,
          suggestedPrice: Math.round(a.currentPrice * 0.995 * 100) / 100, // 0.5% 아래 지정가
          estimatedShares: shares,
          estimatedDollarAmount: shares * a.currentPrice,
          estimatedWonAmount: shares * a.currentPrice * usdKrw,
          priority: 3,
          urgency: a.confidence > 70 ? "today" : "this_week",
          reasoning: [
            `${sym} 강세 시그널 (${a.confidence}% 신뢰도)`,
            `섹터 분산 효과 (포트폴리오 다양성 증가)`,
            ...a.signals.slice(0, 2),
          ],
          expectedReturn: {
            target: Math.round(a.currentPrice * 1.08 * 100) / 100,
            upside: 8,
            stopLoss: Math.round(a.currentPrice * 0.97 * 100) / 100,
            downside: -3,
            riskRewardRatio: 2.67,
          },
          kellyFraction: kelly,
          confidence: a.confidence,
        });
        budgetRemaining -= shares * a.currentPrice * usdKrw;
    }

    // C. 강한 하락 시그널 → 헤지 제안
    const strongBearish = candidates.filter((s) => {
      const a = analyses[s];
      return a && a.direction === "down" && a.confidence > 65;
    });

    if (strongBearish.length >= 3 && orders.filter(o => o.action === "buy").length === 0) {
      // 섹터 전체 약세 → SOXS (인버스) 고려 (주의: 장기 보유 비권장)
      orders.push({
        id: `ord_${orderIdx++}`,
        action: "hedge",
        symbol: "SOXS",
        symbolName: "Direxion Semi Bear 3X (인버스)",
        orderType: "limit",
        currentPrice: 0,
        suggestedPrice: null,
        estimatedShares: 0,
        estimatedDollarAmount: Math.min(totalValueUsd * 0.05, 200),
        estimatedWonAmount: Math.min(totalValueUsd * 0.05, 200) * usdKrw,
        priority: 4,
        urgency: "this_week",
        reasoning: [
          `반도체 섹터 전반 약세 (${strongBearish.length}개 종목)`,
          "단기 헤지로 포트폴리오 보호",
          "⚠️ 레버리지 상품 - 장기 보유 비권장",
        ],
        expectedReturn: {
          target: 0,
          upside: 15,
          stopLoss: 0,
          downside: -10,
          riskRewardRatio: 1.5,
        },
        kellyFraction: 0.05,
        confidence: 65,
      });
    }

    // 6. 우선순위 정렬
    orders.sort((a, b) => {
      const urgencyOrder = { immediate: 0, today: 1, this_week: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.priority - b.priority;
    });

    // 7. 요약
    const totalBuy = orders
      .filter(o => o.action === "buy" || o.action === "hedge")
      .reduce((s, o) => s + o.estimatedWonAmount, 0);
    const totalSell = orders
      .filter(o => o.action === "sell" || o.action === "reduce")
      .reduce((s, o) => s + o.estimatedWonAmount, 0);

    const diversificationScore = Object.keys(proxyWeights).length >= 3
      ? 80
      : Object.keys(proxyWeights).length >= 2
      ? 50
      : 20;

    const afterPositions = (holdings?.length || 0)
      + orders.filter(o => o.action === "buy" || o.action === "hedge").length;

    // 8. 핵심 추천
    const keyRecommendations: string[] = [];
    if (orders.length === 0) {
      keyRecommendations.push("✅ 명확한 액션 없음 - 현재 포지션 유지");
    } else {
      const immediates = orders.filter(o => o.urgency === "immediate");
      const todays = orders.filter(o => o.urgency === "today");
      if (immediates.length > 0) {
        keyRecommendations.push(`🔴 즉시 실행 ${immediates.length}건 (장 열리자마자)`);
      }
      if (todays.length > 0) {
        keyRecommendations.push(`🟡 오늘 중 ${todays.length}건 실행`);
      }
      if (totalBuy > totalSell) {
        keyRecommendations.push(`📈 순매수 ₩${Math.round((totalBuy - totalSell) / 1000)}K`);
      } else if (totalSell > totalBuy) {
        keyRecommendations.push(`📉 순매도 ₩${Math.round((totalSell - totalBuy) / 1000)}K`);
      }
    }

    // 소액 투자자 맞춤 조언 (총 자본 < $5,000)
    if (totalValueUsd < 5000) {
      const expensiveCandidates = buyCandidates.filter((s) => {
        const a = analyses[s];
        if (!a) return false;
        const kelly = calcKellyFraction(a.confidence / 100, 0.08, 0.03);
        const budget = (totalCapitalKrw * 0.15 * kelly * 2) / usdKrw;
        return budget < a.currentPrice; // 1주도 못 사는 고가 종목
      });
      if (expensiveCandidates.length > 0) {
        keyRecommendations.push(
          `💡 소액 투자 팁: ${expensiveCandidates[0]} 등 고가 종목은 분할/월별 매수 권장`
        );
      }
      if (totalValueUsd < 2500) {
        keyRecommendations.push(
          "💰 매월 정기 적립식 매수 (DCA) 전략이 효과적"
        );
      }
    }

    // 9. 리스크/기회
    const risks: string[] = [];
    const opportunities: string[] = [];

    for (const [proxy, valueUsd] of Object.entries(proxyWeights)) {
      const pct = (valueUsd / totalValueUsd) * 100;
      if (pct > 90) {
        risks.push(`${proxy} 집중 ${pct.toFixed(0)}% - 분산 시급`);
      }
    }
    if (strongBearish.length >= 3) {
      risks.push(`반도체 섹터 전반 약세 (${strongBearish.length}개 종목)`);
    }
    if (buyCandidates.length >= 3) {
      opportunities.push(`${buyCandidates.slice(0, 3).join("/")} 강세 시그널 포착`);
    }

    const plan: ExecutionPlan = {
      totalCapital: Math.round(totalCapitalKrw),
      totalCapitalUsd: Math.round(totalValueUsd * 100) / 100,
      availableCash: Math.round(totalCapitalKrw * 0.1), // 추정 10%
      orders,
      expectedPortfolio: {
        beforeTotal: Math.round(totalValueUsd),
        afterTotal: Math.round(totalValueUsd),
        beforePositions: holdings?.length || 0,
        afterPositions,
        diversificationScore,
      },
      summary: {
        totalBuyAmount: Math.round(totalBuy),
        totalSellAmount: Math.round(totalSell),
        netFlow: Math.round(totalBuy - totalSell),
        executionOrder: orders.map(o =>
          `${o.action === "buy" ? "매수" : o.action === "sell" ? "매도" : o.action === "reduce" ? "축소" : "헤지"} ${o.symbol} ${o.estimatedShares > 0 ? `${o.estimatedShares}주` : ""}`
        ),
        keyRecommendations,
      },
      risks,
      opportunities,
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...plan,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
