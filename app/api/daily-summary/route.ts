import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 통합 일일 요약 API
// 모든 데이터 소스를 종합해서 "오늘 시장 어떤가?" 판단
// ═══════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = createAdmin();

    // ═══════════════════════════════════════════════
    // 1. 매크로 스냅샷 (Daniel Yoo 핵심 지표)
    // ═══════════════════════════════════════════════
    const macroSymbols = [
      "CL=F", "^TNX", "^VIX", "DX-Y.NYB", "KRW=X",
      "^NDX", "SOXX", "^KS11", "000660.KS", "005930.KS"
    ];
    const macroQuotes = await fetchYahooQuotes(macroSymbols);

    const macro = {
      oil:     macroQuotes.get("CL=F"),
      yield10: macroQuotes.get("^TNX"),
      vix:     macroQuotes.get("^VIX"),
      dxy:     macroQuotes.get("DX-Y.NYB"),
      usdKrw:  macroQuotes.get("KRW=X"),
      ndx:     macroQuotes.get("^NDX"),
      soxx:    macroQuotes.get("SOXX"),
      kospi:   macroQuotes.get("^KS11"),
      skhynix: macroQuotes.get("000660.KS"),
      samsung: macroQuotes.get("005930.KS"),
    };

    // ═══════════════════════════════════════════════
    // 2. Daniel Yoo 프레임워크 점수 계산
    // ═══════════════════════════════════════════════
    const checkpoints: { name: string; status: "positive" | "negative" | "neutral"; current: string; target: string; note: string }[] = [];

    // 10Y 국채 (4.25% → 3.5% 목표)
    if (macro.yield10?.price) {
      const y = macro.yield10.price;
      checkpoints.push({
        name: "10Y 국채 금리",
        status: y < 4.0 ? "positive" : y > 4.5 ? "negative" : "neutral",
        current: `${y.toFixed(2)}%`,
        target: "3.5% (Daniel Yoo 목표)",
        note: y < 4.0 ? "✅ 금리 하락 진행" : y > 4.5 ? "⚠️ 금리 고점 압박" : "⚖️ 4% 내외 안정",
      });
    }

    // VIX (정상 15~20)
    if (macro.vix?.price) {
      const v = macro.vix.price;
      checkpoints.push({
        name: "VIX 공포지수",
        status: v < 20 ? "positive" : v > 25 ? "negative" : "neutral",
        current: v.toFixed(2),
        target: "15~20 정상",
        note: v < 15 ? "⚠️ 낙관 과열" : v < 20 ? "✅ 안정 투자 환경" : v > 25 ? "🔴 공포 확대" : "⚖️ 중립",
      });
    }

    // USD/KRW (1400원+ = 수출기업 수혜)
    if (macro.usdKrw?.price) {
      const w = macro.usdKrw.price;
      checkpoints.push({
        name: "USD/KRW 환율",
        status: w > 1350 ? "positive" : w < 1200 ? "negative" : "neutral",
        current: `${w.toFixed(0)}원`,
        target: "1350원+ (수출 유리)",
        note: w > 1400 ? "✅ 강력 수출 수혜" : w > 1300 ? "✅ 수출 우호" : "⚖️ 중립",
      });
    }

    // 달러 인덱스 (약세 = 신흥국 수혜)
    if (macro.dxy?.price) {
      const d = macro.dxy.price;
      checkpoints.push({
        name: "달러 인덱스 (DXY)",
        status: d < 102 ? "positive" : d > 106 ? "negative" : "neutral",
        current: d.toFixed(2),
        target: "< 102 (한국 수혜)",
        note: d < 100 ? "✅ 달러 약세 - 신흥국 유리" : d < 102 ? "✅ 안정" : "⚠️ 달러 강세",
      });
    }

    // 원유 (적정 $70~90)
    if (macro.oil?.price) {
      const o = macro.oil.price;
      checkpoints.push({
        name: "WTI 원유",
        status: o >= 70 && o <= 90 ? "positive" : o > 95 ? "negative" : "neutral",
        current: `$${o.toFixed(2)}`,
        target: "$70~90 안정",
        note: o > 95 ? "⚠️ 공정비 부담" : o < 70 ? "✅ 생산비 안정" : "⚖️ 적정 구간",
      });
    }

    // 반도체 ETF (SOXX 모멘텀)
    if (macro.soxx?.changePct !== undefined) {
      const s = macro.soxx.changePct;
      checkpoints.push({
        name: "반도체 ETF (SOXX)",
        status: s > 1 ? "positive" : s < -2 ? "negative" : "neutral",
        current: `${s >= 0 ? "+" : ""}${s.toFixed(2)}%`,
        target: "양의 모멘텀",
        note: s > 2 ? "🚀 반도체 랠리" : s > 0 ? "✅ 상승" : s < -2 ? "⚠️ 조정" : "⚖️ 횡보",
      });
    }

    // 나스닥100 (Daniel Yoo 최선호 지수)
    if (macro.ndx?.changePct !== undefined) {
      const n = macro.ndx.changePct;
      checkpoints.push({
        name: "나스닥100",
        status: n > 0 ? "positive" : n < -1.5 ? "negative" : "neutral",
        current: `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`,
        target: "+30% (12개월)",
        note: n > 1 ? "✅ 강세 지속" : n > 0 ? "✅ 상승" : "⚠️ 조정",
      });
    }

    // ═══════════════════════════════════════════════
    // 3. 에이전트 합의 (최신 Portfolio Decision)
    // ═══════════════════════════════════════════════
    const { data: recentDecisions } = await supabase
      .from("portfolio_decisions")
      .select("symbol, final_vote, final_score, agreement_level, timestamp")
      .order("timestamp", { ascending: false })
      .limit(200);

    // 종목별 최신 판단만 추출
    const latestBySymbol = new Map<string, typeof recentDecisions extends (infer T)[] | null ? T : never>();
    for (const d of recentDecisions ?? []) {
      if (!latestBySymbol.has(d.symbol)) latestBySymbol.set(d.symbol, d);
    }

    // 강력 매수 / 매수 종목 정렬
    const topPicks = Array.from(latestBySymbol.values())
      .filter((d) => d.final_score >= 15)
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, 5);

    const topAvoid = Array.from(latestBySymbol.values())
      .filter((d) => d.final_score <= -15)
      .sort((a, b) => a.final_score - b.final_score)
      .slice(0, 3);

    // ═══════════════════════════════════════════════
    // 4. 전체 프레임워크 건강도 점수 (0~100)
    // ═══════════════════════════════════════════════
    const positiveCount = checkpoints.filter((c) => c.status === "positive").length;
    const negativeCount = checkpoints.filter((c) => c.status === "negative").length;
    const neutralCount = checkpoints.filter((c) => c.status === "neutral").length;
    const totalCount = checkpoints.length;

    const healthScore = totalCount > 0
      ? Math.round(((positiveCount + neutralCount * 0.5) / totalCount) * 100)
      : 0;

    let overallView: string;
    let overallColor: "green" | "amber" | "red";
    if (healthScore >= 75) {
      overallView = "매우 우호적인 투자 환경";
      overallColor = "green";
    } else if (healthScore >= 50) {
      overallView = "투자에 유리한 환경";
      overallColor = "green";
    } else if (healthScore >= 30) {
      overallView = "혼재된 환경 · 선별적 투자";
      overallColor = "amber";
    } else {
      overallView = "방어적 접근 필요";
      overallColor = "red";
    }

    // ═══════════════════════════════════════════════
    // 5. 예측 정확도 요약 (신뢰도)
    // ═══════════════════════════════════════════════
    const { data: accuracy } = await supabase
      .from("forecast_performance_summary")
      .select("*")
      .eq("horizon_days", 30);

    const avgMape = accuracy && accuracy.length > 0
      ? Math.round(accuracy.reduce((s, a) => s + (a.mape ?? 0), 0) / accuracy.length * 10) / 10
      : null;

    const avgCoverage = accuracy && accuracy.length > 0
      ? Math.round(accuracy.reduce((s, a) => s + (a.coverage_pct ?? 0), 0) / accuracy.length * 10) / 10
      : null;

    const avgDirectionAcc = accuracy && accuracy.length > 0
      ? Math.round(accuracy.filter((a) => a.direction_accuracy_pct !== null).reduce((s, a) => s + (a.direction_accuracy_pct ?? 0), 0) / accuracy.filter((a) => a.direction_accuracy_pct !== null).length * 10) / 10
      : null;

    // ═══════════════════════════════════════════════
    // 6. 핵심 경고 · 기회 (우선순위 최상단)
    // ═══════════════════════════════════════════════
    const alerts: { level: "warning" | "opportunity" | "info"; icon: string; title: string; message: string }[] = [];

    // 한국 반도체 종목 특별 체크
    if (macro.skhynix?.price && macro.samsung?.price) {
      const hynixPrice = macro.skhynix.price;
      const samsungPrice = macro.samsung.price;
      alerts.push({
        level: "opportunity",
        icon: "🇰🇷",
        title: "한국 메모리 반도체",
        message: `SK하이닉스 ${hynixPrice.toLocaleString()}원 · 삼성전자 ${samsungPrice.toLocaleString()}원 · Daniel Yoo 글로벌 저평가 1/3위`,
      });
    }

    // USD/KRW 1400+ 수출 수혜
    if (macro.usdKrw?.price && macro.usdKrw.price > 1400) {
      alerts.push({
        level: "opportunity",
        icon: "💱",
        title: "원 약세 최고 수혜",
        message: `USD/KRW ${macro.usdKrw.price.toFixed(0)}원 - 삼성/SK하이닉스 외화환산 이익 극대화`,
      });
    }

    // VIX 낮음
    if (macro.vix?.price && macro.vix.price < 15) {
      alerts.push({
        level: "warning",
        icon: "⚡",
        title: "VIX 극저 주의",
        message: `VIX ${macro.vix.price.toFixed(2)} - 낙관 과열 · Taleb 꼬리 리스크 경계`,
      });
    }

    // SOXX 급락
    if (macro.soxx?.changePct !== undefined && macro.soxx.changePct < -3) {
      alerts.push({
        level: "opportunity",
        icon: "🎯",
        title: "반도체 섹터 조정",
        message: `SOXX ${macro.soxx.changePct.toFixed(2)}% - Daniel Yoo: 6개월 내 전고점 탈환 예상, 역발상 매수 기회`,
      });
    }

    // 금리 하락 추세
    if (macro.yield10?.price && macro.yield10.changePct !== undefined && macro.yield10.changePct < -1) {
      alerts.push({
        level: "opportunity",
        icon: "📉",
        title: "국채 금리 하락",
        message: `10Y ${macro.yield10.price.toFixed(2)}% (${macro.yield10.changePct.toFixed(2)}%) - 성장주 PER 확장 여지, 나스닥 수혜`,
      });
    }

    // 데이터 시스템 상태
    const { count: predCount } = await supabase
      .from("macro_forecasts")
      .select("*", { count: "exact", head: true });

    const { count: accCount } = await supabase
      .from("forecast_accuracy")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      overallView,
      overallColor,
      healthScore,
      framework: {
        checkpoints,
        positiveCount,
        negativeCount,
        neutralCount,
        totalCount,
      },
      agents: {
        topPicks,
        topAvoid,
        totalAnalyzed: latestBySymbol.size,
      },
      accuracy: avgMape !== null ? {
        avgMape,
        avgCoverage,
        avgDirectionAcc,
        sampleCount: accuracy?.reduce((s, a) => s + (a.evaluation_count ?? 0), 0) ?? 0,
      } : null,
      alerts,
      dataStats: {
        totalForecasts: predCount ?? 0,
        evaluatedForecasts: accCount ?? 0,
      },
      daniel_yoo_summary: {
        view: "AI 슈퍼사이클 진행 중 · 향후 12개월 나스닥 +30% 예상",
        recommended_allocation: "주식 80% (미국 75%, 한국 13%, 대만 10%, 중국 2%) · 채권 20%",
        top_picks: "SK하이닉스, Micron, 삼성전자 (메모리 3강) + NVIDIA, ASML",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
