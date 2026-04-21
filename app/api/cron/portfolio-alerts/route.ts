import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Portfolio Alert Cron
// 
// 카일님 포트를 5분마다 자동 모니터링:
// - 개별 종목 급락 (−5% 이상)
// - 포트 전체 급락
// - 레버리지 ETF 감가 누적
// - 실적 임박 포지션 알림
// 
// 경보 수준별로 알림 생성 → 대시보드 상단 배너 + 푸시
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const supabase = createAdmin();
    
    // 진단 API 호출해서 현재 상태 획득
    const diagRes = await fetch(new URL("/api/portfolio-diagnosis", req.url));
    const diagnosis = await diagRes.json();
    
    if (!diagnosis.success || !diagnosis.positions) {
      return NextResponse.json({ success: false, error: "Diagnosis failed" });
    }
    
    const alerts: Array<{
      severity: "critical" | "warning" | "info";
      type: string;
      symbol?: string;
      title: string;
      message: string;
      affectedValue: number;
    }> = [];
    
    // 1. 개별 종목 당일 급락 (−5% 이상)
    for (const p of diagnosis.positions) {
      if ((p.dayChangePct ?? 0) <= -5) {
        alerts.push({
          severity: "critical",
          type: "sudden_drop",
          symbol: p.symbol,
          title: `🚨 ${p.symbol} 급락 ${p.dayChangePct.toFixed(1)}%`,
          message: `${p.name}이(가) 당일 ${p.dayChangePct.toFixed(1)}% 급락. 손실 폭: $${Math.abs(p.marketValueUsd * p.dayChangePct / 100).toFixed(0)}`,
          affectedValue: p.marketValueUsd,
        });
      } else if ((p.dayChangePct ?? 0) <= -3) {
        alerts.push({
          severity: "warning",
          type: "notable_drop",
          symbol: p.symbol,
          title: `⚠️ ${p.symbol} 하락 ${p.dayChangePct.toFixed(1)}%`,
          message: `${p.name} 관찰 필요`,
          affectedValue: p.marketValueUsd,
        });
      }
    }
    
    // 2. 개별 종목 급등 (+8% 이상) - 차익 실현 고려
    for (const p of diagnosis.positions) {
      if ((p.dayChangePct ?? 0) >= 8) {
        alerts.push({
          severity: "info",
          type: "sudden_surge",
          symbol: p.symbol,
          title: `🚀 ${p.symbol} 급등 +${p.dayChangePct.toFixed(1)}%`,
          message: `${p.name} 당일 급등. 부분 차익 실현 고려`,
          affectedValue: p.marketValueUsd,
        });
      }
    }
    
    // 3. 포트 건강도 급락
    if (diagnosis.summary?.healthScore < 30) {
      alerts.push({
        severity: "critical",
        type: "health_critical",
        title: `🔴 포트 건강도 CRITICAL (${diagnosis.summary.healthScore}/100)`,
        message: `즉시 리스크 축소 필요. 복구 경로 열어 AI 추천 확인 바랍니다.`,
        affectedValue: diagnosis.summary.totalValueUsd,
      });
    }
    
    // 4. 레버리지 과다 + 손실 누적
    const leveragePct = diagnosis.concentration?.leveragePct ?? 0;
    const totalLossPct = diagnosis.summary?.totalGainPct ?? 0;
    if (leveragePct > 70 && totalLossPct < -20) {
      alerts.push({
        severity: "warning",
        type: "leverage_decay",
        title: `⚡ 레버리지 감가 누적 주의`,
        message: `레버리지 ${leveragePct.toFixed(0)}% + 손실 ${totalLossPct.toFixed(1)}%. 시간 감가 비용 증가 중.`,
        affectedValue: diagnosis.summary.totalValueUsd,
      });
    }
    
    // 5. 실적 임박 포지션
    const today = new Date().toISOString().split("T")[0];
    const twoDaysLater = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const { data: upcomingEarnings } = await supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", today)
      .lte("earnings_date", twoDaysLater);
    
    const portfolioSymbols = new Set(diagnosis.positions.map((p: any) => p.symbol));
    const underlyingAssets = new Set(diagnosis.positions.map((p: any) => p.underlyingAsset));
    
    for (const e of (upcomingEarnings ?? [])) {
      if (portfolioSymbols.has(e.symbol) || underlyingAssets.has(e.symbol)) {
        const daysUntil = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
        const affectedPositions = diagnosis.positions.filter(
          (p: any) => p.symbol === e.symbol || p.underlyingAsset === e.symbol
        );
        const totalExposure = affectedPositions.reduce((sum: number, p: any) => sum + p.marketValueUsd, 0);
        
        alerts.push({
          severity: daysUntil <= 1 ? "critical" : "warning",
          type: "earnings_imminent",
          symbol: e.symbol,
          title: `📅 ${e.symbol} 실적 D-${daysUntil}`,
          message: `${e.company_name} ${e.timing} · 포트 영향 $${totalExposure.toFixed(0)} · 대응 필요`,
          affectedValue: totalExposure,
        });
      }
    }
    
    // 6. DB에 경보 저장 (research_findings)
    if (alerts.length > 0) {
      const saved: any[] = [];
      for (const alert of alerts) {
        const { data } = await supabase.from("research_findings").insert({
          finding_type: "portfolio_alert",
          severity: alert.severity,
          title: alert.title,
          summary: alert.message,
          data: alert,
          confidence_score: 1.0,
        }).select();
        if (data) saved.push(...data);
      }
      
      // 기존 오래된 경보 정리 (7일 이상)
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      await supabase
        .from("research_findings")
        .delete()
        .eq("finding_type", "portfolio_alert")
        .lt("created_at", weekAgo);
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      alertsGenerated: alerts.length,
      criticalCount: alerts.filter(a => a.severity === "critical").length,
      warningCount: alerts.filter(a => a.severity === "warning").length,
      alerts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
    });
  }
}
