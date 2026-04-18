import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuote } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");

  const authorized =
    isVercelCron ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    debugKey === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdmin();

  const { data: runRow } = await supabase
    .from("cron_runs")
    .insert({ job_name: "evaluate-forecasts", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    const today = new Date().toISOString().split("T")[0];

    // 1. target_date가 오늘 이하이고 아직 평가되지 않은 예측들 조회
    // (forecast_accuracy에 없는 예측만)
    const { data: pendingForecasts } = await supabase
      .from("macro_forecasts")
      .select("*")
      .lte("target_date", today);

    if (!pendingForecasts || pendingForecasts.length === 0) {
      const duration = Date.now() - started;
      if (runRow?.id) {
        await supabase
          .from("cron_runs")
          .update({
            completed_at: new Date().toISOString(),
            duration_ms: duration,
            success: true,
            records_processed: 0,
          })
          .eq("id", runRow.id);
      }
      return NextResponse.json({ success: true, evaluated: 0, message: "No pending forecasts" });
    }

    // 2. 이미 평가된 예측들 제외
    const { data: alreadyEvaluated } = await supabase
      .from("forecast_accuracy")
      .select("forecast_id");

    const evaluatedIds = new Set((alreadyEvaluated ?? []).map((a) => a.forecast_id));
    const toEvaluate = pendingForecasts.filter((f) => !evaluatedIds.has(f.id));

    if (toEvaluate.length === 0) {
      const duration = Date.now() - started;
      if (runRow?.id) {
        await supabase
          .from("cron_runs")
          .update({
            completed_at: new Date().toISOString(),
            duration_ms: duration,
            success: true,
            records_processed: 0,
          })
          .eq("id", runRow.id);
      }
      return NextResponse.json({ success: true, evaluated: 0, message: "All already evaluated" });
    }

    // 3. 고유 심볼별로 현재 시세 조회 (중복 호출 방지)
    const uniqueSymbols = Array.from(new Set(toEvaluate.map((f) => f.symbol)));
    const priceMap = new Map<string, number>();
    for (const sym of uniqueSymbols) {
      const q = await fetchYahooQuote(sym);
      if (q?.price) priceMap.set(sym, q.price);
    }

    // 4. 정확도 계산 및 저장
    const accuracyRows = [];
    for (const f of toEvaluate) {
      const actualValue = priceMap.get(f.symbol);
      if (!actualValue || actualValue <= 0) continue;

      const absoluteError = Math.abs(f.forecast_value - actualValue);
      const percentError = ((f.forecast_value - actualValue) / actualValue) * 100;
      const absolutePercentError = Math.abs(percentError);
      const inConfidenceBand = actualValue >= f.lower_band && actualValue <= f.upper_band;

      // 방향 적중: 예측 방향과 실제 방향이 같은가?
      const forecastDirection = f.forecast_value > f.current_value;
      const actualDirection = actualValue > f.current_value;
      const directionCorrect = forecastDirection === actualDirection;

      accuracyRows.push({
        forecast_id: f.id,
        symbol: f.symbol,
        forecast_date: f.forecast_date,
        target_date: f.target_date,
        horizon_days: f.horizon_days,
        forecast_value: f.forecast_value,
        actual_value: actualValue,
        upper_band: f.upper_band,
        lower_band: f.lower_band,
        absolute_error: Math.round(absoluteError * 10000) / 10000,
        percent_error: Math.round(percentError * 100) / 100,
        absolute_percent_error: Math.round(absolutePercentError * 100) / 100,
        in_confidence_band: inConfidenceBand,
        direction_correct: directionCorrect,
      });
    }

    let inserted = 0;
    if (accuracyRows.length > 0) {
      const { error } = await supabase.from("forecast_accuracy").insert(accuracyRows);
      if (error) throw error;
      inserted = accuracyRows.length;
    }

    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: true,
          records_processed: inserted,
          metadata: { evaluated: inserted, pending: toEvaluate.length },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      evaluated: inserted,
      pending_forecasts: toEvaluate.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: false,
          error_message: msg,
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
