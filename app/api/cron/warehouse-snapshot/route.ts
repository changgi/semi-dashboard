import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";
import { getAllSemiSymbols } from "@/lib/semi-universe";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ═══════════════════════════════════════════════════════════
// Data Warehouse Collection Cron
// 
// 매일 한국 시간 00:30 (UTC 15:30) 자동 실행:
//   1. 반도체 전종목 시세 스냅샷
//   2. 매크로 지표 (VIX, TNX, SPY, QQQ, KRW)
//   3. 시장 국면 기록
//   4. 기본 상관관계 계산
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  // 인증 (Vercel cron 또는 수동)
  const authHeader = req.headers.get("authorization");
  const isValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = req.nextUrl.searchParams.get("force") === "true";
  
  if (!isValid && !isManual) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const supabase = createAdmin();
    const today = new Date().toISOString().split("T")[0];
    
    // 1. 반도체 유니버스 전체 + 매크로
    const semiSymbols = getAllSemiSymbols();
    const macroSymbols = ["^VIX", "^TNX", "SPY", "QQQ", "^KS11", "KRW=X"];
    const allSymbols = [...new Set([...semiSymbols, ...macroSymbols])];
    
    const quotes = await fetchYahooQuotes(allSymbols);
    
    // 2. 시세 스냅샷 저장
    const snapshots: any[] = [];
    for (const symbol of allSymbols) {
      const q = quotes.get(symbol);
      if (!q || !q.price) continue;
      
      snapshots.push({
        captured_date: today,
        symbol,
        data_type: "quote",
        raw_data: {
          price: q.price,
          change: q.change ?? null,
          changePct: q.changePct ?? null,
          volume: q.volume ?? null,
          dayHigh: q.dayHigh ?? null,
          dayLow: q.dayLow ?? null,
        },
        metrics: {
          price: q.price,
          change_pct: q.changePct,
        },
        source: "yahoo",
      });
    }
    
    // 기존 오늘자 스냅샷 제거 후 재삽입 (upsert)
    const { error: insertError } = await supabase
      .from("data_snapshots")
      .upsert(snapshots, { onConflict: "captured_date,symbol,data_type" });
    
    if (insertError) {
      console.warn("[warehouse] snapshot insert error:", insertError.message);
    }
    
    // 3. 시장 국면 기록
    const vix = quotes.get("^VIX")?.price;
    const tnx = quotes.get("^TNX")?.price;
    const spy = quotes.get("SPY");
    const usdKrw = quotes.get("KRW=X")?.price;
    
    // SPY 200DMA 계산
    let spy200dma: number | null = null;
    try {
      const spyHistory = await fetchYahooHistory("SPY", "1y");
      const closes = spyHistory.map((h: any) => h.close).filter((c: any) => c !== null);
      if (closes.length >= 200) {
        const last200 = closes.slice(-200);
        spy200dma = last200.reduce((s: number, c: number) => s + c, 0) / 200;
      }
    } catch {}
    
    const vixRegime = 
      !vix ? "unknown" :
      vix < 14 ? "calm" :
      vix < 20 ? "normal" :
      vix < 30 ? "elevated" :
      "panic";
    
    const spyRegime =
      !spy?.price || !spy200dma ? "unknown" :
      spy.price > spy200dma * 1.05 ? "bull" :
      spy.price < spy200dma * 0.95 ? "bear" :
      "consolidation";
    
    const krwRegime =
      !usdKrw ? "unknown" :
      usdKrw > 1450 ? "strong_dollar" :
      usdKrw < 1300 ? "weak_dollar" :
      "normal";
    
    // 종합 판단
    const overallRegime =
      vixRegime === "panic" ? "risk_off" :
      vixRegime === "calm" && spyRegime === "bull" ? "risk_on" :
      "transition";
    
    const { error: regimeError } = await supabase
      .from("market_regime_history")
      .upsert({
        captured_date: today,
        vix: vix ?? null,
        vix_regime: vixRegime,
        tnx: tnx ?? null,
        spy_close: spy?.price ?? null,
        spy_200dma: spy200dma ?? null,
        spy_regime: spyRegime,
        usd_krw: usdKrw ?? null,
        krw_regime: krwRegime,
        overall_regime: overallRegime,
      }, { onConflict: "captured_date" });
    
    if (regimeError) {
      console.warn("[warehouse] regime insert error:", regimeError.message);
    }
    
    // 4. 반도체 vs 매크로 상관관계 계산 (샘플 - 매주 월요일만)
    const isWeekly = new Date().getDay() === 1; // 월요일
    const correlations: any[] = [];
    
    if (isWeekly) {
      const keyPairs: Array<[string, string]> = [
        ["NVDA", "SMH"],
        ["TSM", "SMH"],
        ["005930.KS", "SMH"],
        ["SMH", "QQQ"],
        ["NVDA", "^VIX"],
        ["360750.KS", "SPY"],
      ];
      
      for (const [a, b] of keyPairs) {
        try {
          const [hA, hB] = await Promise.all([
            fetchYahooHistory(a, "3mo"),
            fetchYahooHistory(b, "3mo"),
          ]);
          
          const closesA = hA.map((h: any) => h.close).filter((c: any) => c !== null);
          const closesB = hB.map((h: any) => h.close).filter((c: any) => c !== null);
          const n = Math.min(closesA.length, closesB.length);
          
          if (n < 30) continue;
          
          const slicedA = closesA.slice(-n);
          const slicedB = closesB.slice(-n);
          
          // 수익률 계산
          const returnsA = slicedA.slice(1).map((p: number, i: number) => (p / slicedA[i]) - 1);
          const returnsB = slicedB.slice(1).map((p: number, i: number) => (p / slicedB[i]) - 1);
          
          // 상관계수
          const meanA = returnsA.reduce((s: number, r: number) => s + r, 0) / returnsA.length;
          const meanB = returnsB.reduce((s: number, r: number) => s + r, 0) / returnsB.length;
          
          let num = 0, denA = 0, denB = 0;
          for (let i = 0; i < returnsA.length; i++) {
            const dA = returnsA[i] - meanA;
            const dB = returnsB[i] - meanB;
            num += dA * dB;
            denA += dA * dA;
            denB += dB * dB;
          }
          
          const correlation = num / Math.sqrt(denA * denB);
          
          correlations.push({
            computed_at: new Date().toISOString(),
            computed_date: new Date().toISOString().split("T")[0],
            lookback_days: 90,
            symbol_a: a,
            symbol_b: b,
            correlation: Math.round(correlation * 10000) / 10000,
            sample_size: returnsA.length,
          });
        } catch (e) {
          console.warn(`[warehouse] correlation ${a}-${b} error:`, e);
        }
      }
      
      if (correlations.length > 0) {
        const { error: corrError } = await supabase
          .from("correlation_matrix")
          .insert(correlations);
        if (corrError) {
          console.warn("[warehouse] correlation insert error:", corrError.message);
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: "Data warehouse snapshot completed",
      summary: {
        date: today,
        snapshots_captured: snapshots.length,
        regime: {
          vix: vix,
          vix_regime: vixRegime,
          spy_regime: spyRegime,
          krw_regime: krwRegime,
          overall: overallRegime,
        },
        correlations_updated: correlations.length,
        is_weekly_run: isWeekly,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
    }, { status: 500 });
  }
}
