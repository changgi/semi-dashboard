import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ───────────────────────────────────────────────────────────
// 단일 심볼에 대한 예측 정확도 + 과거 예측 비교
// GET /api/forecast-accuracy?symbol=CL=F&horizon=30
// ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    const supabase = createAdmin();

    if (!symbol) {
      // symbol 없으면: 전체 성능 요약
      const { data: summary } = await supabase
        .from("forecast_performance_summary")
        .select("*");

      return NextResponse.json({
        success: true,
        type: "summary",
        performance: summary ?? [],
      });
    }

    // 특정 심볼의 정확도 + 과거 예측 이력
    // 1. 성능 요약 (horizon별)
    const { data: performance } = await supabase
      .from("forecast_performance_summary")
      .select("*")
      .eq("symbol", symbol);

    // 2. 최근 평가 결과 (차트용)
    const { data: evaluations } = await supabase
      .from("forecast_accuracy")
      .select("*")
      .eq("symbol", symbol)
      .order("target_date", { ascending: true })
      .limit(500);

    // 3. 활성 예측 (아직 target_date가 도래하지 않은)
    const today = new Date().toISOString().split("T")[0];
    const { data: activeForecasts } = await supabase
      .from("macro_forecasts")
      .select("*")
      .eq("symbol", symbol)
      .gte("target_date", today)
      .order("forecast_date", { ascending: false })
      .limit(200);

    // 4. 과거 "지나온" 예측선 (2주 전 / 1달 전 / 2달 전 시점에서의 전망)
    // 각 forecast_date별로 해당 날짜로부터의 예측 궤적
    const { data: historicalForecasts } = await supabase
      .from("macro_forecasts")
      .select("*")
      .eq("symbol", symbol)
      .gte("forecast_date", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().split("T")[0])
      .order("forecast_date", { ascending: true });

    // 5. 각 예측이 실제로 얼마나 맞았는지 (신뢰도 점수)
    const evaluationsByDate: Record<string, { correct: number; total: number }> = {};
    for (const e of evaluations ?? []) {
      const key = e.forecast_date;
      if (!evaluationsByDate[key]) evaluationsByDate[key] = { correct: 0, total: 0 };
      evaluationsByDate[key].total += 1;
      if (e.in_confidence_band) evaluationsByDate[key].correct += 1;
    }

    // 6. 전체 통계 계산
    const allEvals = evaluations ?? [];
    const overallStats =
      allEvals.length > 0
        ? {
            total_evaluated: allEvals.length,
            avg_mae:
              Math.round(
                (allEvals.reduce((s, e) => s + e.absolute_error, 0) / allEvals.length) * 10000
              ) / 10000,
            avg_mape:
              Math.round(
                (allEvals.reduce((s, e) => s + e.absolute_percent_error, 0) / allEvals.length) * 100
              ) / 100,
            coverage_pct:
              Math.round(
                (allEvals.filter((e) => e.in_confidence_band).length / allEvals.length) * 1000
              ) / 10,
            direction_accuracy_pct:
              Math.round(
                (allEvals.filter((e) => e.direction_correct).length / allEvals.length) * 1000
              ) / 10,
          }
        : null;

    return NextResponse.json({
      success: true,
      type: "detail",
      symbol,
      performance: performance ?? [],
      overall: overallStats,
      evaluations: evaluations ?? [],       // 과거 예측 vs 실제 (평가 완료)
      active_forecasts: activeForecasts ?? [], // 아직 미도래 예측
      historical_forecasts: historicalForecasts ?? [], // 과거 시점들의 예측 궤적
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
