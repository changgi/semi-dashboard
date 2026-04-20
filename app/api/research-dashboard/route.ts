import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 600;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Research Dashboard API
// 
// 축적된 데이터 warehouse에서 분석 결과 조회:
//   - 시장 국면 히스토리 (최근 30일)
//   - 활성 패턴 + 승률
//   - 주요 상관관계
//   - 최근 연구 인사이트
// ═══════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = createAdmin();
    
    // 1. 최근 30일 시장 국면
    const { data: regimeHistory } = await supabase
      .from("market_regime_history")
      .select("*")
      .order("captured_date", { ascending: false })
      .limit(30);
    
    // 2. 활성 패턴
    const { data: patterns } = await supabase
      .from("pattern_library")
      .select("*")
      .eq("is_active", true)
      .order("win_rate", { ascending: false });
    
    // 3. 주요 상관관계 (최신)
    const { data: correlations } = await supabase
      .from("correlation_matrix")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(20);
    
    // 4. 최근 연구 인사이트
    const { data: findings } = await supabase
      .from("research_findings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    
    // 5. 데이터 축적 통계
    const { count: snapshotsCount } = await supabase
      .from("data_snapshots")
      .select("*", { count: "exact", head: true });
    
    const { count: regimeCount } = await supabase
      .from("market_regime_history")
      .select("*", { count: "exact", head: true });
    
    // 6. 최신 국면 vs 1주일 전
    const currentRegime = (regimeHistory ?? [])[0];
    const weekAgoRegime = (regimeHistory ?? [])[6];
    
    // 7. VIX 히스토리 min/max
    const vixValues = (regimeHistory ?? []).map((r: any) => r.vix).filter((v: any) => v !== null);
    const vixStats = vixValues.length > 0 ? {
      current: vixValues[0],
      min30d: Math.min(...vixValues),
      max30d: Math.max(...vixValues),
      avg30d: Math.round((vixValues.reduce((s: number, v: number) => s + v, 0) / vixValues.length) * 100) / 100,
    } : null;
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      
      // 통계
      stats: {
        totalSnapshots: snapshotsCount ?? 0,
        regimeDays: regimeCount ?? 0,
        activePatterns: (patterns ?? []).length,
        totalFindings: (findings ?? []).length,
      },
      
      // 시장 국면 요약
      currentRegime: currentRegime ? {
        date: currentRegime.captured_date,
        vix: currentRegime.vix,
        vix_regime: currentRegime.vix_regime,
        spy_regime: currentRegime.spy_regime,
        krw_regime: currentRegime.krw_regime,
        overall: currentRegime.overall_regime,
      } : null,
      
      weekAgoRegime: weekAgoRegime ? {
        date: weekAgoRegime.captured_date,
        vix: weekAgoRegime.vix,
        vix_regime: weekAgoRegime.vix_regime,
        overall: weekAgoRegime.overall_regime,
      } : null,
      
      vixStats,
      
      // 최근 30일 국면 변화 타임라인
      regimeTimeline: (regimeHistory ?? []).map((r: any) => ({
        date: r.captured_date,
        vix: r.vix,
        vix_regime: r.vix_regime,
        spy_regime: r.spy_regime,
        overall: r.overall_regime,
      })),
      
      // 패턴 승률 순
      topPatterns: (patterns ?? []).slice(0, 5).map((p: any) => ({
        name: p.pattern_name,
        description: p.description,
        occurrences: p.occurrences_count ?? 0,
        winRate: p.win_rate ?? null,
        avgReturn: p.avg_return ?? null,
        lastOccurred: p.last_occurred_date,
        applicableSymbols: p.applicable_symbols ?? [],
      })),
      
      // 주요 상관관계
      topCorrelations: (correlations ?? []).slice(0, 10).map((c: any) => ({
        pair: `${c.symbol_a} - ${c.symbol_b}`,
        correlation: c.correlation,
        strength: 
          Math.abs(c.correlation) > 0.8 ? "매우 강함" :
          Math.abs(c.correlation) > 0.6 ? "강함" :
          Math.abs(c.correlation) > 0.4 ? "보통" :
          "약함",
        direction: c.correlation > 0 ? "positive" : "negative",
        lookbackDays: c.lookback_days,
        sampleSize: c.sample_size,
      })),
      
      // 최근 인사이트
      recentFindings: (findings ?? []).map((f: any) => ({
        date: f.observation_date,
        category: f.category,
        title: f.title,
        insight: f.insight,
        confidence: f.confidence,
        symbols: f.symbols ?? [],
        tags: f.tags ?? [],
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      stats: { totalSnapshots: 0, regimeDays: 0, activePatterns: 0, totalFindings: 0 },
      currentRegime: null,
      weekAgoRegime: null,
      vixStats: null,
      regimeTimeline: [],
      topPatterns: [],
      topCorrelations: [],
      recentFindings: [],
    });
  }
}
