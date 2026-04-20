import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ═══════════════════════════════════════════════════════════
// Hot Actions Bar API
// 매일 보는 핵심 정보만 초고속으로 반환 (< 1초)
// Today's Score + 주요 지표 3개 + 포트폴리오 요약
// ═══════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = createAdmin();

    // 핵심 매크로 + USD/KRW
    const [macroQuotes, holdingsRes] = await Promise.all([
      fetchYahooQuotes(["^TNX", "^VIX", "KRW=X", "SOXX", "^NDX", "DX-Y.NYB", "CL=F"]),
      supabase.from("portfolio_holdings").select("*").eq("is_active", true),
    ]);

    const tnx = macroQuotes.get("^TNX")?.price;
    const vix = macroQuotes.get("^VIX")?.price;
    const krw = macroQuotes.get("KRW=X")?.price;
    const soxx = macroQuotes.get("SOXX");
    const ndx = macroQuotes.get("^NDX");
    const dxy = macroQuotes.get("DX-Y.NYB")?.price;
    const oil = macroQuotes.get("CL=F")?.price;

    // ─────────────────────────────────────────────
    // 매크로 점수 (daily-summary와 동일 로직, 간략화)
    // ─────────────────────────────────────────────
    let score = 0;
    let total = 0;

    if (tnx !== undefined) {
      total += 15;
      if (tnx < 4.0) score += 15;
      else if (tnx < 4.5) score += 8;
    }
    if (vix !== undefined) {
      total += 20;
      if (vix < 20) score += 20;
      else if (vix < 25) score += 10;
    }
    if (krw !== undefined) {
      total += 15;
      if (krw > 1350) score += 15;
      else if (krw > 1250) score += 8;
    }
    if (dxy !== undefined) {
      total += 15;
      if (dxy < 102) score += 15;
      else if (dxy < 105) score += 8;
    }
    if (oil !== undefined) {
      total += 15;
      if (oil >= 70 && oil <= 90) score += 15;
      else if (oil >= 65 && oil <= 95) score += 8;
    }
    if (ndx?.changePct !== undefined && ndx.changePct !== null) {
      total += 10;
      if (ndx.changePct > 0.5) score += 10;
      else if (ndx.changePct > 0) score += 5;
    }
    if (soxx?.changePct !== undefined && soxx.changePct !== null) {
      total += 10;
      if (soxx.changePct > 1) score += 10;
      else if (soxx.changePct > 0) score += 5;
    }

    const normalizedScore = total > 0 ? Math.round((score / total) * 100) : 0;
    const overallView =
      normalizedScore >= 75 ? "매우 우호" :
      normalizedScore >= 50 ? "우호" :
      normalizedScore >= 30 ? "혼재" : "방어";

    const scoreColor =
      normalizedScore >= 75 ? "green" :
      normalizedScore >= 50 ? "amber" :
      normalizedScore >= 30 ? "amber" : "red";

    // ─────────────────────────────────────────────
    // 포트폴리오 요약 (빠르게)
    // ─────────────────────────────────────────────
    let portfolioSummary = null;
    const holdings = holdingsRes.data ?? [];

    if (holdings.length > 0) {
      const symbols = [...new Set(holdings.map((h) => h.symbol))];
      const stockQuotes = await fetchYahooQuotes(symbols);
      const usdKrw = krw ?? 1350;

      let totalValueUsd = 0;
      let totalCostUsd = 0;
      let dayChangeUsd = 0;

      for (const h of holdings) {
        const q = stockQuotes.get(h.symbol);
        if (!q?.price) continue;

        const cost = h.shares * h.avg_cost;
        const value = h.shares * q.price;
        const valueUsd = h.currency === "KRW" ? value / usdKrw : value;
        const costUsd = h.currency === "KRW" ? cost / usdKrw : cost;
        const prevValue = h.shares * (q.prevClose ?? q.price);
        const prevValueUsd = h.currency === "KRW" ? prevValue / usdKrw : prevValue;

        totalValueUsd += valueUsd;
        totalCostUsd += costUsd;
        dayChangeUsd += valueUsd - prevValueUsd;
      }

      portfolioSummary = {
        totalValue: Math.round(totalValueUsd),
        totalGain: Math.round((totalValueUsd - totalCostUsd) * 100) / 100,
        totalGainPct: totalCostUsd > 0
          ? Math.round(((totalValueUsd - totalCostUsd) / totalCostUsd) * 10000) / 100
          : 0,
        dayChange: Math.round(dayChangeUsd * 100) / 100,
        dayChangePct: totalValueUsd > 0
          ? Math.round((dayChangeUsd / (totalValueUsd - dayChangeUsd)) * 10000) / 100
          : 0,
        holdingCount: holdings.length,
      };
    }

    // ─────────────────────────────────────────────
    // 3가지 핵심 지표 + 알림 메세지
    // ─────────────────────────────────────────────
    const quickAlerts: string[] = [];
    if (krw && krw > 1450) quickAlerts.push("💱 USD/KRW 초강세 - 수출 수혜");
    if (vix && vix > 25) quickAlerts.push("🚨 VIX 급등 - 리스크 회피");
    else if (vix && vix < 13) quickAlerts.push("⚠️ VIX 극저 - 과열 경계");
    if (soxx?.changePct && soxx.changePct > 3) quickAlerts.push("🚀 반도체 섹터 강력 랠리");
    else if (soxx?.changePct && soxx.changePct < -3) quickAlerts.push("🎯 반도체 조정 - 매수 기회");
    if (tnx && tnx < 3.8) quickAlerts.push("📉 금리 하락 - 성장주 수혜");

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      score: {
        value: normalizedScore,
        label: overallView,
        color: scoreColor,
      },
      metrics: {
        vix: vix !== undefined ? { value: Math.round(vix * 100) / 100, label: "VIX" } : null,
        krw: krw !== undefined ? { value: Math.round(krw), label: "USD/KRW" } : null,
        soxx: soxx?.changePct !== undefined && soxx.changePct !== null
          ? { value: Math.round(soxx.changePct * 100) / 100, label: "SOXX %", positive: soxx.changePct >= 0 }
          : null,
      },
      portfolio: portfolioSummary,
      alerts: quickAlerts.slice(0, 3), // 최대 3개
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
