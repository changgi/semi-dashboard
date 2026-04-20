import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Investment Journal API
// 
// GET /api/journal?days=30
//   - 최근 N일 스냅샷
//   - 전체 시그널 성과
//   - 소스/심볼별 승률
//   - 주요 인사이트
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30");

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    // 1. 일일 스냅샷
    const { data: snapshots } = await supabase
      .from("journal_daily_snapshots")
      .select("*")
      .gte("snapshot_date", sinceStr)
      .order("snapshot_date", { ascending: false });

    // 2. 시그널 tracking (검증된 것)
    const { data: verifiedSignals } = await supabase
      .from("journal_signal_tracking")
      .select("*")
      .eq("verification_status", "verified")
      .order("signal_date", { ascending: false });

    // 3. 시그널 tracking (진행 중)
    const { data: pendingSignals } = await supabase
      .from("journal_signal_tracking")
      .select("*")
      .eq("verification_status", "pending")
      .gte("signal_date", sinceStr)
      .order("signal_date", { ascending: false });

    const verified = verifiedSignals ?? [];
    const pending = pendingSignals ?? [];

    // 4. 전체 통계
    const totalVerified = verified.length;
    const correct1d = verified.filter((s) => s.hit_1d).length;
    const correct7d = verified.filter((s) => s.hit_7d).length;
    const correct30d = verified.filter((s) => s.hit_30d).length;
    const overallStats = {
      total: totalVerified,
      accuracy1d: totalVerified > 0 ? Math.round((correct1d / totalVerified) * 100) : 0,
      accuracy7d: totalVerified > 0 ? Math.round((correct7d / totalVerified) * 100) : 0,
      accuracy30d: totalVerified > 0 ? Math.round((correct30d / totalVerified) * 100) : 0,
      avgMaxGain: totalVerified > 0
        ? Math.round(
            verified.reduce((s, x) => s + (x.max_gain_pct || 0), 0) / totalVerified * 100
          ) / 100
        : 0,
      avgMaxLoss: totalVerified > 0
        ? Math.round(
            verified.reduce((s, x) => s + (x.max_loss_pct || 0), 0) / totalVerified * 100
          ) / 100
        : 0,
    };

    // 5. 방향별 통계
    const byDirection = {
      up: verified.filter((s) => s.direction === "up"),
      down: verified.filter((s) => s.direction === "down"),
    };
    const directionStats = {
      upSignals: {
        total: byDirection.up.length,
        accuracy: byDirection.up.length > 0
          ? Math.round(
              (byDirection.up.filter((s) => s.hit_30d).length / byDirection.up.length) * 100
            )
          : 0,
      },
      downSignals: {
        total: byDirection.down.length,
        accuracy: byDirection.down.length > 0
          ? Math.round(
              (byDirection.down.filter((s) => s.hit_30d).length / byDirection.down.length) * 100
            )
          : 0,
      },
    };

    // 6. 심볼별 TOP 성과
    const bySymbol = new Map<string, { count: number; correct: number }>();
    for (const s of verified) {
      const existing = bySymbol.get(s.symbol) ?? { count: 0, correct: 0 };
      existing.count++;
      if (s.hit_30d) existing.correct++;
      bySymbol.set(s.symbol, existing);
    }
    const symbolStats = Array.from(bySymbol.entries())
      .map(([sym, s]) => ({
        symbol: sym,
        total: s.count,
        correct: s.correct,
        accuracy: Math.round((s.correct / s.count) * 100),
      }))
      .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
      .slice(0, 10);

    // 7. 신뢰도 구간별 정확도
    const byConfidence = {
      high: verified.filter((s) => s.confidence >= 75),
      medium: verified.filter((s) => s.confidence >= 60 && s.confidence < 75),
      low: verified.filter((s) => s.confidence < 60),
    };
    const confidenceStats = {
      high: {
        total: byConfidence.high.length,
        accuracy: byConfidence.high.length > 0
          ? Math.round((byConfidence.high.filter((s) => s.hit_30d).length / byConfidence.high.length) * 100)
          : 0,
      },
      medium: {
        total: byConfidence.medium.length,
        accuracy: byConfidence.medium.length > 0
          ? Math.round((byConfidence.medium.filter((s) => s.hit_30d).length / byConfidence.medium.length) * 100)
          : 0,
      },
      low: {
        total: byConfidence.low.length,
        accuracy: byConfidence.low.length > 0
          ? Math.round((byConfidence.low.filter((s) => s.hit_30d).length / byConfidence.low.length) * 100)
          : 0,
      },
    };

    // 8. 인사이트 생성
    const insights: string[] = [];
    
    if (overallStats.accuracy30d >= 65) {
      insights.push(`✅ 전체 시그널 적중률 ${overallStats.accuracy30d}% - 신뢰할 만한 수준`);
    } else if (overallStats.accuracy30d > 0 && overallStats.accuracy30d < 50) {
      insights.push(`⚠️ 전체 적중률 ${overallStats.accuracy30d}% - 시그널 검증 필요`);
    }

    if (directionStats.downSignals.accuracy > directionStats.upSignals.accuracy + 10) {
      insights.push(`📉 하락 시그널이 상승 시그널보다 적중률 ${directionStats.downSignals.accuracy - directionStats.upSignals.accuracy}%p 높음`);
    } else if (directionStats.upSignals.accuracy > directionStats.downSignals.accuracy + 10) {
      insights.push(`📈 상승 시그널이 하락 시그널보다 적중률 ${directionStats.upSignals.accuracy - directionStats.downSignals.accuracy}%p 높음`);
    }

    if (confidenceStats.high.total >= 5 && confidenceStats.high.accuracy >= 75) {
      insights.push(`🎯 고신뢰도(75%+) 시그널 적중률 ${confidenceStats.high.accuracy}% - 강력 추천`);
    }

    if (symbolStats.length > 0 && symbolStats[0].accuracy >= 80) {
      insights.push(`⭐ ${symbolStats[0].symbol} 시그널 적중률 ${symbolStats[0].accuracy}% - 최고 성과`);
    }

    if (overallStats.avgMaxGain >= 8) {
      insights.push(`💎 평균 최대 상승 +${overallStats.avgMaxGain}% - 우수한 수익 기회`);
    }

    // 9. 포트폴리오 추이 (스냅샷 기반)
    const portfolioTrend = (snapshots ?? []).map((s) => ({
      date: s.snapshot_date,
      value: s.portfolio_value_usd,
      gainPct: s.portfolio_gain_pct,
      riskScore: s.risk_score,
    }));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      period: { days, since: sinceStr },
      snapshots: snapshots ?? [],
      snapshotCount: snapshots?.length ?? 0,
      pendingSignals: pending,
      pendingCount: pending.length,
      verifiedCount: totalVerified,
      overallStats,
      directionStats,
      symbolStats,
      confidenceStats,
      portfolioTrend,
      insights,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      snapshots: [],
      pendingSignals: [],
      overallStats: { total: 0, accuracy1d: 0, accuracy7d: 0, accuracy30d: 0, avgMaxGain: 0, avgMaxLoss: 0 },
      directionStats: { upSignals: { total: 0, accuracy: 0 }, downSignals: { total: 0, accuracy: 0 } },
      symbolStats: [],
      confidenceStats: { high: { total: 0, accuracy: 0 }, medium: { total: 0, accuracy: 0 }, low: { total: 0, accuracy: 0 } },
      portfolioTrend: [],
      insights: ["데이터 수집 중..."],
    });
  }
}
