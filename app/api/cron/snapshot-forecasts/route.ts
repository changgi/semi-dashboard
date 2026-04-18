import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuote } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ───────────────────────────────────────────────────────────
// 매크로 예측 대상 지표 (macro-history와 일치)
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

// 예측할 horizon들
const HORIZONS = [7, 14, 30, 60, 90, 180];

// ───────────────────────────────────────────────────────────
// Ornstein-Uhlenbeck 예측 (단일 시점)
// ───────────────────────────────────────────────────────────
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
    .insert({ job_name: "snapshot-forecasts", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    const today = new Date().toISOString().split("T")[0];
    const rows = [];

    for (const t of FORECAST_TARGETS) {
      // 현재 시세
      const quote = await fetchYahooQuote(t.symbol);
      if (!quote?.price || quote.price <= 0) continue;

      for (const horizon of HORIZONS) {
        const forecast = computeForecast(
          quote.price,
          t.longRunMean,
          t.reversion,
          t.volatility,
          horizon
        );

        // target_date 계산
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + horizon);

        rows.push({
          forecast_date: today,
          symbol: t.symbol,
          current_value: quote.price,
          target_date: targetDate.toISOString().split("T")[0],
          horizon_days: horizon,
          forecast_value: forecast.forecast,
          upper_band: forecast.upper,
          lower_band: forecast.lower,
          model_name: "ornstein-uhlenbeck",
          long_run_mean: t.longRunMean ?? null,
          reversion_speed: t.reversion,
          volatility: t.volatility,
        });
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase
        .from("macro_forecasts")
        .upsert(rows, { onConflict: "forecast_date,symbol,horizon_days" });
      if (error) throw error;
      inserted = rows.length;
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
          metadata: { targets: FORECAST_TARGETS.length, horizons: HORIZONS.length },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      forecasts_saved: inserted,
      targets: FORECAST_TARGETS.length,
      horizons: HORIZONS,
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
