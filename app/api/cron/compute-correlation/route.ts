import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MACRO_SYMBOLS = ["CL=F", "^TNX", "^VIX", "DX-Y.NYB", "^NDX"];

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const aSlice = a.slice(-n);
  const bSlice = b.slice(-n);
  const meanA = aSlice.reduce((s, v) => s + v, 0) / n;
  const meanB = bSlice.reduce((s, v) => s + v, 0) / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = aSlice[i] - meanA;
    const dB = bSlice[i] - meanB;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

function toReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

function classifyStrength(corr: number): string {
  if (corr > 0.5) return "strong";
  if (corr > 0.2) return "moderate";
  if (corr > -0.2) return "weak";
  if (corr > -0.5) return "negative-moderate";
  return "negative-strong";
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
    .insert({ job_name: "compute-correlation", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    // 1. 종목 목록
    const { data: tickers } = await supabase.from("tickers").select("symbol");
    const stocks = (tickers ?? [])
      .map((t) => t.symbol)
      .filter((s) => !["SMH", "SOXX", "SMHX", "SOXL", "SOXS"].includes(s)); // ETF 제외

    // 2. 매크로 히스토리 병렬 fetch
    const macroReturns = new Map<string, number[]>();
    await Promise.all(
      MACRO_SYMBOLS.map(async (m) => {
        try {
          const bars = await fetchYahooHistory(m, "1y");
          macroReturns.set(m, toReturns(bars.map((b) => b.close)));
        } catch {
          // 무시
        }
      })
    );

    // 3. 각 종목의 일봉 가져오기
    const today = new Date().toISOString().split("T")[0];
    const rows = [];

    for (const sym of stocks) {
      const { data: hist } = await supabase
        .from("price_history")
        .select("price, timestamp")
        .eq("symbol", sym)
        .eq("interval_type", "1day")
        .order("timestamp", { ascending: true })
        .limit(252);

      if (!hist || hist.length < 30) continue;

      const prices = hist.map((h) => h.price).filter((p) => p && p > 0);
      const symReturns = toReturns(prices);

      for (const macroSym of MACRO_SYMBOLS) {
        const macroRet = macroReturns.get(macroSym);
        if (!macroRet || macroRet.length < 30) continue;

        const corr = correlation(symReturns, macroRet);

        let interpretation = "";
        if (macroSym === "^TNX") {
          interpretation = corr < -0.2 ? "금리 하락 수혜" : corr > 0.2 ? "금리 동조" : "금리 중립";
        } else if (macroSym === "CL=F") {
          interpretation = corr > 0.3 ? "유가 동조" : corr < -0.3 ? "유가 역상관" : "유가 독립";
        } else if (macroSym === "^VIX") {
          interpretation = corr < -0.4 ? "리스크온 자산" : corr > 0.2 ? "방어주 성격" : "VIX 중립";
        } else if (macroSym === "DX-Y.NYB") {
          interpretation = corr < -0.2 ? "달러 약세 수혜" : "달러 중립";
        } else if (macroSym === "^NDX") {
          interpretation = corr > 0.5 ? "나스닥 동조 강함" : corr > 0.3 ? "나스닥 동조" : "나스닥 독립";
        }

        rows.push({
          symbol: sym,
          macro_symbol: macroSym,
          correlation: Math.round(corr * 1000) / 1000,
          period_days: symReturns.length,
          strength: classifyStrength(corr),
          interpretation,
          date: today,
        });
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase
        .from("correlation_snapshots")
        .upsert(rows, { onConflict: "symbol,macro_symbol,date" });
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
          metadata: { stocks: stocks.length, correlations: rows.length },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      stocks: stocks.length,
      correlations_computed: rows.length,
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
