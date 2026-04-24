import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 600; // 10분 캐시
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/tech-divergence
 *
 * 대니얼유 관점 엔진: IT 업종 내 승자/패자 분화 분석
 *
 * 핵심 가설:
 * "IT 업종 내에서도 이번 AI 슈퍼사이클 아래 승자와 패자가 갈리기 시작"
 *
 * 분류:
 *   - AI Infrastructure (승자): 반도체·AI 칩·하드웨어
 *   - AI Application (혼조): 소프트웨어 — 승자는 극소수, 대부분 패자
 *   - Hyperscaler (승자): 클라우드 인프라 대형주
 *
 * 측정:
 *   - 상대 모멘텀 (SPX 대비)
 *   - 52주 위치 (고점 근접 vs 하락 패턴)
 *   - 추세 배열 상태
 *   - 카일 포트폴리오의 "승자/패자 그룹" 노출도
 */

type ETFPosition = {
  symbol: string;
  name: string;
  category: "ai_infra" | "ai_app" | "hyperscaler" | "legacy";
  subcategory: string;
};

const TECH_UNIVERSE: ETFPosition[] = [
  // AI Infrastructure / Hardware (대니얼유 "승자")
  { symbol: "SOXX", name: "반도체 ETF", category: "ai_infra", subcategory: "반도체" },
  { symbol: "SMH", name: "VanEck 반도체", category: "ai_infra", subcategory: "반도체" },
  { symbol: "NVDA", name: "엔비디아", category: "ai_infra", subcategory: "AI 칩" },
  { symbol: "AMD", name: "AMD", category: "ai_infra", subcategory: "AI 칩" },
  { symbol: "AVGO", name: "브로드컴", category: "ai_infra", subcategory: "AI 네트워킹" },
  { symbol: "TSM", name: "TSMC", category: "ai_infra", subcategory: "파운드리" },
  { symbol: "XLK", name: "S&P500 Tech", category: "ai_infra", subcategory: "종합 테크 (하드웨어 가중)" },

  // Software (대니얼유 "패자")
  { symbol: "IGV", name: "Software ETF", category: "ai_app", subcategory: "SW 전반" },
  { symbol: "XSW", name: "SW & Services", category: "ai_app", subcategory: "SW 서비스" },
  { symbol: "CRM", name: "Salesforce", category: "ai_app", subcategory: "CRM SW" },
  { symbol: "NOW", name: "ServiceNow", category: "ai_app", subcategory: "엔터프라이즈 SW" },
  { symbol: "ADBE", name: "Adobe", category: "ai_app", subcategory: "크리에이티브 SW" },

  // Hyperscaler
  { symbol: "MSFT", name: "Microsoft", category: "hyperscaler", subcategory: "Azure" },
  { symbol: "GOOGL", name: "Alphabet", category: "hyperscaler", subcategory: "GCP" },
  { symbol: "AMZN", name: "Amazon", category: "hyperscaler", subcategory: "AWS" },
  { symbol: "ORCL", name: "Oracle", category: "hyperscaler", subcategory: "OCI (AI 인프라 전환 중)" },

  // 벤치마크
  { symbol: "SPY", name: "S&P500", category: "legacy", subcategory: "벤치마크" },
];

async function analyzeETF(pos: ETFPosition) {
  try {
    const [quote, history] = await Promise.all([
      fetchYahooQuote(pos.symbol),
      fetchYahooHistory(pos.symbol, "1y"),
    ]);
    if (!quote || !history || history.length < 20) return null;
    const closes = history.map(b => b.close).filter(v => v != null);
    const cur = quote.price;
    const high52 = Math.max(...closes);
    const low52 = Math.min(...closes);
    const pos52 = high52 > low52 ? (cur - low52) / (high52 - low52) : 0.5;

    // 모멘텀 계산
    const len = closes.length;
    const ret1m = len >= 21 ? (cur / closes[len - 21] - 1) * 100 : 0;
    const ret3m = len >= 63 ? (cur / closes[len - 63] - 1) * 100 : 0;
    const ret1y = len >= 252 ? (cur / closes[len - 252] - 1) * 100 : (cur / closes[0] - 1) * 100;

    // SMA
    const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const sma50 = len >= 50 ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50 : null;
    const sma200 = len >= 200 ? closes.slice(-200).reduce((s, v) => s + v, 0) / 200 : null;

    // 추세 판정
    let trend: "strong_up" | "up" | "sideways" | "down" | "strong_down" = "sideways";
    if (sma50 && sma200) {
      if (cur > sma20 && sma20 > sma50 && sma50 > sma200 && ret1m > 5) trend = "strong_up";
      else if (cur > sma50 && sma50 > sma200) trend = "up";
      else if (cur < sma50 && sma50 < sma200) trend = "down";
      else if (cur < sma20 && cur < sma50 && ret1m < -5) trend = "strong_down";
    }

    // RSI
    const diffs: number[] = [];
    for (let i = 1; i < closes.length; i++) diffs.push(closes[i] - closes[i - 1]);
    const recent = diffs.slice(-14);
    const gains = recent.filter(d => d > 0).reduce((s, v) => s + v, 0);
    const losses = recent.filter(d => d < 0).reduce((s, v) => s - v, 0);
    const rsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);

    return {
      ...pos,
      currentPrice: cur,
      changePct: quote.changePct,
      ret1m, ret3m, ret1y,
      pos52w: pos52 * 100,
      rsi,
      trend,
      sma20, sma50, sma200,
    };
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest) {
  try {
    // 병렬 배치로 분석 (rate limit 고려)
    const results: any[] = [];
    for (let i = 0; i < TECH_UNIVERSE.length; i += 5) {
      const batch = TECH_UNIVERSE.slice(i, i + 5);
      const batchResults = await Promise.all(batch.map(analyzeETF));
      batchResults.forEach(r => { if (r) results.push(r); });
    }

    const spy = results.find(r => r.symbol === "SPY");
    const spyRet1m = spy?.ret1m ?? 0;
    const spyRet3m = spy?.ret3m ?? 0;

    // 상대 수익률 계산 (vs SPY)
    results.forEach(r => {
      r.relativeRet1m = r.ret1m - spyRet1m;
      r.relativeRet3m = r.ret3m - spyRet3m;
    });

    // 카테고리별 집계
    const byCategory = new Map<string, any[]>();
    results.forEach(r => {
      if (!byCategory.has(r.category)) byCategory.set(r.category, []);
      byCategory.get(r.category)!.push(r);
    });

    const categoryStats = Array.from(byCategory.entries()).map(([cat, items]) => {
      const avgRet1m = items.reduce((s, i) => s + i.ret1m, 0) / items.length;
      const avgRet3m = items.reduce((s, i) => s + i.ret3m, 0) / items.length;
      const avgPos52 = items.reduce((s, i) => s + i.pos52w, 0) / items.length;
      const strongUps = items.filter(i => i.trend === "strong_up").length;
      const downs = items.filter(i => i.trend === "down" || i.trend === "strong_down").length;
      return {
        category: cat,
        categoryLabel: cat === "ai_infra" ? "🚀 AI 인프라 (승자)" :
                        cat === "ai_app" ? "⚠️ 소프트웨어 (분화 중)" :
                        cat === "hyperscaler" ? "💼 하이퍼스케일러" :
                        "📊 벤치마크",
        count: items.length,
        avgRet1m, avgRet3m, avgPos52,
        strongUps, downs,
        verdict: strongUps > downs ? "승자" : downs > strongUps ? "패자" : "혼조",
      };
    });

    // 승자/패자 명시적 분류
    const winners = results.filter(r =>
      r.trend === "strong_up" &&
      r.pos52w >= 80 &&
      r.relativeRet1m > 3
    ).sort((a, b) => b.ret1m - a.ret1m);

    const losers = results.filter(r =>
      r.category === "ai_app" &&
      (r.trend === "sideways" || r.trend === "down") &&
      r.pos52w < 50
    ).sort((a, b) => a.pos52w - b.pos52w);

    const betweenWorlds = results.filter(r =>
      !winners.includes(r) && !losers.includes(r) && r.category !== "legacy"
    );

    // 카일 포트폴리오 노출도 분석
    let kyleExposure: any = null;
    try {
      const supabase = createAdmin();
      const { data: holdings } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .eq("is_active", true);

      if (holdings && holdings.length > 0) {
        const LEVERAGE_MAP: Record<string, string> = {
          ORCX: "ORCL", ORCU: "ORCL", ORCS: "ORCL",
          AMZU: "AMZN", TSLL: "TSLA", NVDU: "NVDA", NVDL: "NVDA",
        };
        let totalValue = 0;
        const exposure = { winners: 0, losers: 0, hyperscaler: 0, other: 0 };
        const details: any[] = [];

        for (const h of holdings) {
          let price = h.avg_cost;
          try {
            const q = await fetchYahooQuote(h.symbol);
            if (q?.price) price = q.price;
          } catch {}
          const value = price * h.shares;
          totalValue += value;
          const underlying = LEVERAGE_MAP[h.symbol] ?? h.symbol;
          const techPos = TECH_UNIVERSE.find(t => t.symbol === underlying);
          const category = techPos?.category ?? "unknown";

          let bucket: keyof typeof exposure = "other";
          if (category === "ai_infra") bucket = "winners";
          else if (category === "ai_app") bucket = "losers";
          else if (category === "hyperscaler") bucket = "hyperscaler";

          exposure[bucket] += value;
          details.push({
            symbol: h.symbol,
            underlying,
            category,
            value,
            shares: h.shares,
          });
        }

        kyleExposure = {
          totalValue,
          winnersPct: totalValue > 0 ? (exposure.winners / totalValue) * 100 : 0,
          losersPct: totalValue > 0 ? (exposure.losers / totalValue) * 100 : 0,
          hyperscalerPct: totalValue > 0 ? (exposure.hyperscaler / totalValue) * 100 : 0,
          otherPct: totalValue > 0 ? (exposure.other / totalValue) * 100 : 0,
          details: details.map(d => ({
            ...d,
            weight: totalValue > 0 ? (d.value / totalValue) * 100 : 0,
          })),
        };
      }
    } catch (err) {
      // 포트폴리오 없으면 null
    }

    // 핵심 인사이트
    const insights: string[] = [];
    const aiInfra = categoryStats.find(c => c.category === "ai_infra");
    const aiApp = categoryStats.find(c => c.category === "ai_app");
    if (aiInfra && aiApp) {
      const gap = aiInfra.avgRet1m - aiApp.avgRet1m;
      if (Math.abs(gap) > 5) {
        insights.push(`🔥 AI 인프라 vs 소프트웨어 1개월 모멘텀 격차 ${gap.toFixed(1)}%p — 대니얼유 관점 입증`);
      }
      if (aiInfra.avgPos52 > 80 && aiApp.avgPos52 < 40) {
        insights.push(`📊 AI 인프라 52주 평균 위치 ${aiInfra.avgPos52.toFixed(0)}% vs 소프트웨어 ${aiApp.avgPos52.toFixed(0)}% — 분명한 승자/패자 분화`);
      }
    }
    if (kyleExposure) {
      if (kyleExposure.losersPct > 40) {
        insights.push(`🚨 카일님 포트 "패자 그룹" 노출 ${kyleExposure.losersPct.toFixed(0)}% — 리밸런싱 시급`);
      }
      if (kyleExposure.winnersPct < 20) {
        insights.push(`⚠️ 카일님 포트 "승자 그룹" 노출 ${kyleExposure.winnersPct.toFixed(0)}% — AI 인프라 편입 필요`);
      }
    }

    // 권고 액션
    const recommendedActions: any[] = [];
    if (kyleExposure && kyleExposure.losersPct > 40 && winners.length > 0) {
      const topWinner = winners[0];
      recommendedActions.push({
        priority: "high",
        action: `${topWinner.symbol} (${topWinner.name}) 편입 검토`,
        reason: `승자 그룹 대표, 1개월 +${topWinner.ret1m.toFixed(1)}%, SPY 대비 +${topWinner.relativeRet1m.toFixed(1)}%p 초과 수익`,
      });
    }
    if (kyleExposure && kyleExposure.losersPct > 40) {
      recommendedActions.push({
        priority: "high",
        action: "ORCL 계열 (ORCX/ORCU) 비중 축소 우선",
        reason: `Oracle은 하이퍼스케일러로 분류되나 AI 인프라 전환 미완료, SW/앱 성격도 공존 — 카일 포트의 최대 리스크 요인`,
      });
    }

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      source: "대니얼유 관점 (IT 승자/패자 분화)",
      results,
      categoryStats,
      winners,
      losers,
      betweenWorlds,
      kyleExposure,
      insights,
      recommendedActions,
      philosophy: {
        quote: "지수, 주가는 실적을 따라갑니다. IT 업종 내에서도 이번 AI 슈퍼사이클 아래 승자와 패자가 갈리기 시작",
        application: "하드웨어(반도체) vs 소프트웨어 분화를 52주 위치·모멘텀·추세로 정량화",
        disclaimer: "누가 끝에 이길지는 아무도 모름. 다만 현재 모멘텀과 실적 흐름은 분명함",
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
