import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ───────────────────────────────────────────────────────────
// 과거 예측 백필
// "만약 과거 N일 전에 예측했다면 얼마로 예측했을까?" 재구성
// 실제 Yahoo Finance의 과거 가격을 사용해서 Ornstein-Uhlenbeck 모델로
// 과거 각 시점의 예측값을 계산 → 이미 시간이 지나서 결과 검증 가능
// ───────────────────────────────────────────────────────────

const FORECAST_TARGETS = [
  { symbol: "CL=F",     longRunMean: 75,    reversion: 0.55, volatility: 35 },
  { symbol: "BZ=F",     longRunMean: 82,    reversion: 0.55, volatility: 33 },
  { symbol: "^IXIC",    longRunMean: undefined, reversion: 0.10, volatility: 22 },
  { symbol: "^NDX",     longRunMean: undefined, reversion: 0.08, volatility: 24 },
  { symbol: "^GSPC",    longRunMean: undefined, reversion: 0.12, volatility: 18 },
  { symbol: "^TNX",     longRunMean: 3.5,   reversion: 0.40, volatility: 12 },
  { symbol: "DX-Y.NYB", longRunMean: 100,   reversion: 0.60, volatility: 8 },
  { symbol: "^VIX",     longRunMean: 18,    reversion: 0.70, volatility: 80 },
  { symbol: "SOXX",     longRunMean: undefined, reversion: 0.15, volatility: 35 },
  { symbol: "SMH",      longRunMean: undefined, reversion: 0.15, volatility: 35 },
];

// 예측 horizon (과거 시점에서 N일 후를 예측)
const HORIZONS = [7, 14, 30, 60, 90];

function computeForecast(
  currentValue: number,
  longRunMean: number | undefined,
  reversionSpeed: number,
  annualVol: number,
  daysAhead: number
) {
  const target = longRunMean ?? currentValue * 1.10;
  const kappa = reversionSpeed;
  const sigma = annualVol / 100;
  const t = daysAhead / 365;

  const decay = Math.exp(-kappa * t);
  const expected = currentValue * decay + target * (1 - decay);
  const variance =
    kappa > 0.01
      ? (sigma * sigma * (1 - Math.exp(-2 * kappa * t))) / (2 * kappa)
      : sigma * sigma * t;
  const stdDev = Math.sqrt(variance) * expected;

  return {
    forecast: Math.round(expected * 10000) / 10000,
    upper: Math.round((expected + 1.28 * stdDev) * 10000) / 10000,
    lower: Math.round(Math.max(0.01, expected - 1.28 * stdDev) * 10000) / 10000,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");

  if (process.env.NODE_ENV === "production" && debugKey !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdmin();

  const { data: runRow } = await supabase
    .from("cron_runs")
    .insert({ job_name: "backfill-forecasts", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    let totalForecasts = 0;
    let totalEvaluations = 0;
    const errors: string[] = [];

    for (const t of FORECAST_TARGETS) {
      try {
        // 1년치 과거 가격 가져오기
        const bars = await fetchYahooHistory(t.symbol, "1y");
        if (bars.length < 100) {
          errors.push(`${t.symbol}: insufficient history (${bars.length} bars)`);
          continue;
        }

        const forecastsToInsert = [];
        const accuracyToInsert = [];

        // 과거 시점들에서 예측을 생성하고, 실제값이 있는 경우 평가
        // (최근 1년 중 20개 시점에서 각각 예측 → 각 horizon별로)
        const step = Math.max(1, Math.floor(bars.length / 50));

        for (let i = 0; i < bars.length - Math.min(...HORIZONS); i += step) {
          const forecastBar = bars[i];
          const forecastDate = forecastBar.date;
          const currentValue = forecastBar.close;

          for (const horizon of HORIZONS) {
            const targetIdx = i + horizon;
            if (targetIdx >= bars.length) continue;  // 미래 실제값 없음

            const targetBar = bars[targetIdx];
            const targetDate = targetBar.date;
            const actualValue = targetBar.close;

            // 예측 계산
            const fc = computeForecast(
              currentValue,
              t.longRunMean,
              t.reversion,
              t.volatility,
              horizon
            );

            forecastsToInsert.push({
              forecast_date: forecastDate,
              symbol: t.symbol,
              current_value: currentValue,
              target_date: targetDate,
              horizon_days: horizon,
              forecast_value: fc.forecast,
              upper_band: fc.upper,
              lower_band: fc.lower,
              model_name: "ornstein-uhlenbeck",
              long_run_mean: t.longRunMean ?? null,
              reversion_speed: t.reversion,
              volatility: t.volatility,
            });

            // 정확도 평가
            const absoluteError = Math.abs(fc.forecast - actualValue);
            const percentError = ((fc.forecast - actualValue) / actualValue) * 100;
            const apE = Math.abs(percentError);
            const inBand = actualValue >= fc.lower && actualValue <= fc.upper;
            const forecastDir = fc.forecast > currentValue;
            const actualDir = actualValue > currentValue;
            const directionCorrect = forecastDir === actualDir;

            accuracyToInsert.push({
              _forecast_meta: {  // forecast_id 연결용 임시 필드
                forecast_date: forecastDate,
                symbol: t.symbol,
                horizon_days: horizon,
              },
              symbol: t.symbol,
              forecast_date: forecastDate,
              target_date: targetDate,
              horizon_days: horizon,
              forecast_value: fc.forecast,
              actual_value: actualValue,
              upper_band: fc.upper,
              lower_band: fc.lower,
              absolute_error: Math.round(absoluteError * 10000) / 10000,
              percent_error: Math.round(percentError * 100) / 100,
              absolute_percent_error: Math.round(apE * 100) / 100,
              in_confidence_band: inBand,
              direction_correct: directionCorrect,
            });
          }
        }

        // forecasts 먼저 저장
        if (forecastsToInsert.length > 0) {
          const { data: insertedForecasts, error: fErr } = await supabase
            .from("macro_forecasts")
            .upsert(forecastsToInsert, {
              onConflict: "forecast_date,symbol,horizon_days",
            })
            .select("id, forecast_date, symbol, horizon_days");

          if (fErr) {
            errors.push(`${t.symbol} forecasts: ${fErr.message}`);
            continue;
          }

          totalForecasts += insertedForecasts?.length ?? 0;

          // forecast_id 매핑
          const forecastIdMap = new Map<string, number>();
          for (const f of insertedForecasts ?? []) {
            const key = `${f.forecast_date}|${f.symbol}|${f.horizon_days}`;
            forecastIdMap.set(key, f.id);
          }

          // accuracy 데이터에 forecast_id 채우기
          const accuracyWithIds = accuracyToInsert
            .map((a) => {
              const key = `${a._forecast_meta.forecast_date}|${a._forecast_meta.symbol}|${a._forecast_meta.horizon_days}`;
              const fid = forecastIdMap.get(key);
              if (!fid) return null;
              const { _forecast_meta, ...clean } = a;
              return { ...clean, forecast_id: fid };
            })
            .filter((a): a is NonNullable<typeof a> => a !== null);

          if (accuracyWithIds.length > 0) {
            // 중복 제거 (이미 평가된 것은 upsert 대신 skip)
            const { data: existing } = await supabase
              .from("forecast_accuracy")
              .select("forecast_id")
              .in(
                "forecast_id",
                accuracyWithIds.map((a) => a.forecast_id)
              );
            const existingIds = new Set((existing ?? []).map((e) => e.forecast_id));
            const toInsert = accuracyWithIds.filter((a) => !existingIds.has(a.forecast_id));

            if (toInsert.length > 0) {
              const { error: aErr } = await supabase.from("forecast_accuracy").insert(toInsert);
              if (aErr) {
                errors.push(`${t.symbol} accuracy: ${aErr.message}`);
              } else {
                totalEvaluations += toInsert.length;
              }
            }
          }
        }
      } catch (e) {
        errors.push(`${t.symbol}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: errors.length === 0,
          records_processed: totalForecasts + totalEvaluations,
          error_message: errors.length > 0 ? errors.join(" | ") : null,
          metadata: {
            forecasts_saved: totalForecasts,
            evaluations_saved: totalEvaluations,
            targets: FORECAST_TARGETS.length,
            horizons: HORIZONS,
          },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      forecasts_saved: totalForecasts,
      evaluations_saved: totalEvaluations,
      targets: FORECAST_TARGETS.length,
      horizons: HORIZONS,
      errors: errors.length > 0 ? errors : undefined,
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
