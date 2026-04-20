import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// 일일 브리핑 API
// 대시보드의 모든 핵심 데이터를 하나의 리포트용으로 종합
// ═══════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = createAdmin();

    // ─────────────────────────────────────────────
    // 1. 매크로 지표 + 스코어
    // ─────────────────────────────────────────────
    const macroSymbols = [
      "CL=F", "^TNX", "^VIX", "DX-Y.NYB", "KRW=X",
      "^NDX", "^GSPC", "SOXX", "SMH", "^KS11", "^KQ11"
    ];
    const macroQuotes = await fetchYahooQuotes(macroSymbols);

    const macro = {
      oil:       macroQuotes.get("CL=F"),
      yield10:   macroQuotes.get("^TNX"),
      vix:       macroQuotes.get("^VIX"),
      dxy:       macroQuotes.get("DX-Y.NYB"),
      usdKrw:    macroQuotes.get("KRW=X"),
      ndx:       macroQuotes.get("^NDX"),
      sp500:     macroQuotes.get("^GSPC"),
      soxx:      macroQuotes.get("SOXX"),
      smh:       macroQuotes.get("SMH"),
      kospi:     macroQuotes.get("^KS11"),
      kosdaq:    macroQuotes.get("^KQ11"),
    };

    // 매크로 점수 (Daniel Yoo 프레임워크)
    const checkpoints: Array<{ name: string; status: "positive" | "negative" | "neutral"; current: string; target: string }> = [];

    if (macro.yield10?.price !== undefined) {
      const y = macro.yield10.price;
      checkpoints.push({
        name: "10Y 국채 금리",
        status: y < 4.0 ? "positive" : y > 4.5 ? "negative" : "neutral",
        current: `${y.toFixed(2)}%`,
        target: "3.5% (Daniel Yoo 목표)",
      });
    }
    if (macro.vix?.price !== undefined) {
      const v = macro.vix.price;
      checkpoints.push({
        name: "VIX 공포지수",
        status: v < 20 ? "positive" : v > 25 ? "negative" : "neutral",
        current: v.toFixed(2),
        target: "15~20 정상",
      });
    }
    if (macro.usdKrw?.price !== undefined) {
      const w = macro.usdKrw.price;
      checkpoints.push({
        name: "USD/KRW",
        status: w > 1350 ? "positive" : w < 1200 ? "negative" : "neutral",
        current: `${w.toFixed(0)}원`,
        target: "1350원+ (수출 유리)",
      });
    }
    if (macro.dxy?.price !== undefined) {
      const d = macro.dxy.price;
      checkpoints.push({
        name: "달러 인덱스",
        status: d < 102 ? "positive" : d > 106 ? "negative" : "neutral",
        current: d.toFixed(2),
        target: "<102 한국 수혜",
      });
    }
    if (macro.oil?.price !== undefined) {
      const o = macro.oil.price;
      checkpoints.push({
        name: "WTI 원유",
        status: o >= 70 && o <= 90 ? "positive" : o > 95 ? "negative" : "neutral",
        current: `$${o.toFixed(2)}`,
        target: "$70-90 적정",
      });
    }
    if (macro.soxx?.changePct !== undefined && macro.soxx.changePct !== null) {
      checkpoints.push({
        name: "반도체 ETF (SOXX)",
        status: macro.soxx.changePct > 1 ? "positive" : macro.soxx.changePct < -2 ? "negative" : "neutral",
        current: `${macro.soxx.changePct >= 0 ? "+" : ""}${macro.soxx.changePct.toFixed(2)}%`,
        target: "양의 모멘텀",
      });
    }
    if (macro.ndx?.changePct !== undefined && macro.ndx.changePct !== null) {
      checkpoints.push({
        name: "나스닥100",
        status: macro.ndx.changePct > 0 ? "positive" : macro.ndx.changePct < -1.5 ? "negative" : "neutral",
        current: `${macro.ndx.changePct >= 0 ? "+" : ""}${macro.ndx.changePct.toFixed(2)}%`,
        target: "+30% (12개월)",
      });
    }

    const positiveCount = checkpoints.filter((c) => c.status === "positive").length;
    const neutralCount = checkpoints.filter((c) => c.status === "neutral").length;
    const totalCount = checkpoints.length;
    const healthScore = totalCount > 0
      ? Math.round(((positiveCount + neutralCount * 0.5) / totalCount) * 100)
      : 0;

    let overallView: string;
    if (healthScore >= 75) overallView = "매우 우호적인 투자 환경";
    else if (healthScore >= 50) overallView = "투자에 유리한 환경";
    else if (healthScore >= 30) overallView = "혼재된 환경 · 선별적 투자";
    else overallView = "방어적 접근 필요";

    // ─────────────────────────────────────────────
    // 2. 반도체 섹터 스냅샷
    // ─────────────────────────────────────────────
    const { data: tickers } = await supabase.from("tickers").select("symbol, name");
    const stockSymbols = (tickers ?? []).map((t) => t.symbol);
    const stockQuotes = await fetchYahooQuotes(stockSymbols);

    const stocks = (tickers ?? []).map((t) => {
      const q = stockQuotes.get(t.symbol);
      return {
        symbol: t.symbol,
        name: t.name,
        price: q?.price ?? null,
        change: q?.change ?? null,
        changePct: q?.changePct ?? null,
      };
    }).filter((s) => s.price !== null);

    const sortedByChange = [...stocks].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    const topGainers = sortedByChange.slice(0, 5);
    const topLosers = sortedByChange.slice(-5).reverse();

    const sectorAvgChange = stocks.length > 0
      ? stocks.reduce((s, v) => s + (v.changePct ?? 0), 0) / stocks.length
      : 0;

    // ─────────────────────────────────────────────
    // 3. AI 에이전트 합의 (TOP 픽스)
    // ─────────────────────────────────────────────
    const { data: recentDecisions } = await supabase
      .from("portfolio_decisions")
      .select("symbol, final_vote, final_score, agreement_level, timestamp")
      .order("timestamp", { ascending: false })
      .limit(100);

    const latestBySymbol = new Map();
    for (const d of recentDecisions ?? []) {
      if (!latestBySymbol.has(d.symbol)) latestBySymbol.set(d.symbol, d);
    }

    const topPicks = Array.from(latestBySymbol.values())
      .filter((d: any) => d.final_score >= 15)
      .sort((a: any, b: any) => b.final_score - a.final_score)
      .slice(0, 5);

    const topAvoid = Array.from(latestBySymbol.values())
      .filter((d: any) => d.final_score <= -15)
      .sort((a: any, b: any) => a.final_score - b.final_score)
      .slice(0, 3);

    // ─────────────────────────────────────────────
    // 4. 포트폴리오 성과
    // ─────────────────────────────────────────────
    let portfolio: any = null;
    try {
      const { data: holdings } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .eq("is_active", true);

      if (holdings && holdings.length > 0) {
        const symbols = [...new Set(holdings.map((h) => h.symbol))];
        const quotes = await fetchYahooQuotes(symbols);
        const usdKrw = macro.usdKrw?.price ?? 1350;

        let totalValueUsd = 0;
        let totalCostUsd = 0;
        const positions: any[] = [];

        for (const h of holdings) {
          const q = quotes.get(h.symbol);
          if (!q?.price) continue;
          const cost = h.shares * h.avg_cost;
          const value = h.shares * q.price;
          const gain = value - cost;
          const gainPct = (gain / cost) * 100;
          const valueUsd = h.currency === "KRW" ? value / usdKrw : value;
          const costUsd = h.currency === "KRW" ? cost / usdKrw : cost;

          totalValueUsd += valueUsd;
          totalCostUsd += costUsd;

          positions.push({
            symbol: h.symbol,
            name: h.name,
            shares: h.shares,
            avgCost: h.avg_cost,
            currentPrice: q.price,
            currency: h.currency,
            gainPct: Math.round(gainPct * 100) / 100,
            gainUsd: valueUsd - costUsd,
            dayChangePct: q.changePct,
          });
        }

        portfolio = {
          totalValue: Math.round(totalValueUsd * 100) / 100,
          totalCost: Math.round(totalCostUsd * 100) / 100,
          totalGain: Math.round((totalValueUsd - totalCostUsd) * 100) / 100,
          totalGainPct: totalCostUsd > 0 ? Math.round(((totalValueUsd - totalCostUsd) / totalCostUsd) * 10000) / 100 : 0,
          positionCount: positions.length,
          positions: positions.sort((a, b) => b.gainPct - a.gainPct),
        };
      }
    } catch (e) {
      // 테이블 없으면 스킵
    }

    // ─────────────────────────────────────────────
    // 5. 예측 모델 신뢰도
    // ─────────────────────────────────────────────
    let accuracy = null;
    try {
      const { data: perf } = await supabase
        .from("forecast_performance_summary")
        .select("*")
        .eq("horizon_days", 30);

      if (perf && perf.length > 0) {
        accuracy = {
          avgMape: Math.round(perf.reduce((s, a) => s + (a.mape ?? 0), 0) / perf.length * 10) / 10,
          avgCoverage: Math.round(perf.reduce((s, a) => s + (a.coverage_pct ?? 0), 0) / perf.length * 10) / 10,
          avgDirectionAcc: Math.round(
            perf.filter((a) => a.direction_accuracy_pct !== null).reduce((s, a) => s + (a.direction_accuracy_pct ?? 0), 0)
            / perf.filter((a) => a.direction_accuracy_pct !== null).length * 10
          ) / 10,
          sampleCount: perf.reduce((s, a) => s + (a.evaluation_count ?? 0), 0),
        };
      }
    } catch (e) {
      // 스킵
    }

    // ─────────────────────────────────────────────
    // 6. 주요 인사이트 (자동 생성 요약)
    // ─────────────────────────────────────────────
    const insights: string[] = [];

    if (healthScore >= 75) {
      insights.push(`매크로 환경 점수 ${healthScore}/100 "${overallView}" - 적극적 매수 접근 유리`);
    } else if (healthScore <= 30) {
      insights.push(`매크로 환경 점수 ${healthScore}/100 "${overallView}" - 포지션 축소 및 현금 비중 확대 고려`);
    } else {
      insights.push(`매크로 환경 점수 ${healthScore}/100 "${overallView}" - 선별적 접근 필요`);
    }

    if (macro.usdKrw?.price && macro.usdKrw.price > 1400) {
      insights.push(`USD/KRW ${macro.usdKrw.price.toFixed(0)}원 초강세 - 삼성전자·SK하이닉스 외화환산 이익 Q2 대폭 반영 예상`);
    }

    if (macro.vix?.price && macro.vix.price > 25) {
      insights.push(`VIX ${macro.vix.price.toFixed(2)} 공포 확대 - 포지션 축소, 풋옵션 헤지 고려`);
    } else if (macro.vix?.price && macro.vix.price < 13) {
      insights.push(`VIX ${macro.vix.price.toFixed(2)} 극저 - 낙관 과열 경계, 꼬리 리스크 대비 필요`);
    }

    if (sectorAvgChange > 2) {
      insights.push(`반도체 섹터 평균 +${sectorAvgChange.toFixed(2)}% 강세 - 모멘텀 포지션 유지`);
    } else if (sectorAvgChange < -2) {
      insights.push(`반도체 섹터 평균 ${sectorAvgChange.toFixed(2)}% 조정 - Daniel Yoo 역발상 매수 영역`);
    }

    if (topPicks.length >= 3) {
      insights.push(`AI 에이전트 19명 강력 매수 합의: ${topPicks.slice(0, 3).map((p: any) => p.symbol).join(", ")}`);
    }

    if (accuracy && accuracy.sampleCount > 100) {
      insights.push(`30일 예측 모델 신뢰도: MAPE ${accuracy.avgMape}% · 구간 적중 ${accuracy.avgCoverage}% · 방향 적중 ${accuracy.avgDirectionAcc}%`);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reportDate: new Date().toISOString().split("T")[0],
      reportTime: new Date().toLocaleTimeString("ko-KR"),
      // 섹션별 데이터
      summary: {
        healthScore,
        overallView,
        positiveCount,
        neutralCount,
        negativeCount: totalCount - positiveCount - neutralCount,
        totalCount,
      },
      checkpoints,
      macro,
      stocks: {
        topGainers,
        topLosers,
        sectorAvgChange: Math.round(sectorAvgChange * 100) / 100,
        totalCount: stocks.length,
      },
      agents: {
        topPicks,
        topAvoid,
        totalAnalyzed: latestBySymbol.size,
      },
      portfolio,
      accuracy,
      insights,
      danielYoo: {
        view: "AI 슈퍼사이클 진행 중 · 향후 12개월 나스닥 +30% 예상",
        allocation: "주식 80% (미국 75%, 한국 13%, 대만 10%, 중국 2%) · 채권 20%",
        topPicks: "SK하이닉스 (저평가 1위), Micron, 삼성전자 (저평가 4위), NVIDIA, ASML",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
