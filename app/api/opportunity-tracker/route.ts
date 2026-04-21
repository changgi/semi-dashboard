import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Opportunity Tracker API
// 
// 과거 Opportunity 추천이 실제로 얼마나 맞았는지 추적:
// - 7일 전, 14일 전, 30일 전 추천 종목들의 현재 수익률
// - 시그널 타입별 적중률
// - 전체 시스템 신뢰도 점수
// 
// 목적: 카일님이 추천을 따라도 될지 판단하는 근거 제공
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    
    // 1. 과거 opportunity_scan 레코드 로드
    const { data: scans } = await supabase
      .from("research_findings")
      .select("created_at, data, summary")
      .eq("finding_type", "opportunity_scan")
      .order("created_at", { ascending: false })
      .limit(30);
    
    if (!scans || scans.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        message: "아직 충분한 추천 이력이 없습니다. 시스템을 며칠 사용해보세요.",
        hasData: false,
      });
    }
    
    // 2. 추천된 종목들 수집 (심볼별 최초 추천 시점 + 시그널)
    const recommendations = new Map<string, {
      symbol: string;
      firstRecommended: Date;
      lastRecommended: Date;
      recommendCount: number;
      signals: string[];
      scores: number[];
      modes: string[];
    }>();
    
    for (const scan of scans) {
      const createdAt = new Date(scan.created_at);
      const data = scan.data as any;
      if (!data?.top) continue;
      
      const mode = data.mode ?? "balanced";
      
      for (const item of data.top) {
        const key = item.symbol;
        if (!recommendations.has(key)) {
          recommendations.set(key, {
            symbol: key,
            firstRecommended: createdAt,
            lastRecommended: createdAt,
            recommendCount: 0,
            signals: [],
            scores: [],
            modes: [],
          });
        }
        const r = recommendations.get(key)!;
        r.recommendCount++;
        r.scores.push(item.score);
        if (item.signals) r.signals.push(...item.signals);
        r.modes.push(mode);
        if (createdAt < r.firstRecommended) r.firstRecommended = createdAt;
        if (createdAt > r.lastRecommended) r.lastRecommended = createdAt;
      }
    }
    
    if (recommendations.size === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        message: "추천 이력이 파싱되지 않음",
        hasData: false,
      });
    }
    
    // 3. 현재 시세 조회
    const symbols = [...recommendations.keys()];
    const quotes = await fetchYahooQuotes(symbols);
    
    // 4. 히스토리 가격 조회 (첫 추천 당시 가격 찾기)
    // data_snapshots에서 심볼별 과거 가격 찾기
    const firstDates = [...recommendations.values()].map(r => r.firstRecommended.toISOString().split("T")[0]);
    const uniqueDates = [...new Set(firstDates)];
    
    const { data: snapshots } = await supabase
      .from("data_snapshots")
      .select("symbol, snapshot_date, close_price")
      .in("symbol", symbols)
      .in("snapshot_date", uniqueDates);
    
    const priceLookup = new Map<string, number>();
    for (const s of (snapshots ?? [])) {
      priceLookup.set(`${s.symbol}:${s.snapshot_date}`, s.close_price);
    }
    
    // 5. 성과 계산
    const performance: any[] = [];
    for (const [sym, rec] of recommendations.entries()) {
      const currentPrice = quotes.get(sym)?.price;
      if (!currentPrice) continue;
      
      const firstDateStr = rec.firstRecommended.toISOString().split("T")[0];
      const firstPrice = priceLookup.get(`${sym}:${firstDateStr}`);
      
      if (!firstPrice || firstPrice <= 0) continue;
      
      const returnPct = ((currentPrice - firstPrice) / firstPrice) * 100;
      const daysHeld = Math.ceil((Date.now() - rec.firstRecommended.getTime()) / 86400000);
      const avgScore = rec.scores.reduce((a, b) => a + b, 0) / rec.scores.length;
      const signalCounts: Record<string, number> = {};
      for (const s of rec.signals) {
        signalCounts[s] = (signalCounts[s] ?? 0) + 1;
      }
      const topSignal = Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      
      performance.push({
        symbol: sym,
        firstRecommended: firstDateStr,
        daysHeld,
        recommendCount: rec.recommendCount,
        avgScore: Math.round(avgScore),
        topSignal,
        entryPrice: firstPrice,
        currentPrice,
        returnPct: Math.round(returnPct * 100) / 100,
        successful: returnPct > 0,
      });
    }
    
    // 6. 통계 계산
    const winners = performance.filter(p => p.successful);
    const losers = performance.filter(p => !p.successful);
    const winRate = performance.length > 0 ? (winners.length / performance.length) * 100 : 0;
    const avgReturn = performance.length > 0
      ? performance.reduce((sum, p) => sum + p.returnPct, 0) / performance.length
      : 0;
    const avgWinner = winners.length > 0
      ? winners.reduce((sum, p) => sum + p.returnPct, 0) / winners.length
      : 0;
    const avgLoser = losers.length > 0
      ? losers.reduce((sum, p) => sum + p.returnPct, 0) / losers.length
      : 0;
    
    // 시그널 타입별 성과
    const signalPerformance: Record<string, { count: number; winRate: number; avgReturn: number }> = {};
    const signalGroups: Record<string, any[]> = {};
    for (const p of performance) {
      if (!p.topSignal) continue;
      if (!signalGroups[p.topSignal]) signalGroups[p.topSignal] = [];
      signalGroups[p.topSignal].push(p);
    }
    for (const [sig, items] of Object.entries(signalGroups)) {
      const wins = items.filter(i => i.successful).length;
      signalPerformance[sig] = {
        count: items.length,
        winRate: (wins / items.length) * 100,
        avgReturn: items.reduce((sum, i) => sum + i.returnPct, 0) / items.length,
      };
    }
    
    // 7. 신뢰도 점수 (0-100)
    let confidenceScore = 50;  // 기본
    if (performance.length >= 10) confidenceScore += 10;  // 샘플 크기
    if (performance.length >= 30) confidenceScore += 10;
    if (winRate >= 60) confidenceScore += 15;
    else if (winRate >= 50) confidenceScore += 5;
    else confidenceScore -= 10;
    if (avgReturn > 0) confidenceScore += 5;
    if (avgReturn > 5) confidenceScore += 10;
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      hasData: performance.length > 0,
      summary: {
        trackedSymbols: performance.length,
        totalScans: scans.length,
        winRate: Math.round(winRate * 10) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
        avgWinner: Math.round(avgWinner * 100) / 100,
        avgLoser: Math.round(avgLoser * 100) / 100,
        confidenceScore,
        confidenceGrade: 
          confidenceScore >= 70 ? "high" :
          confidenceScore >= 50 ? "medium" :
          "low",
      },
      bySignal: signalPerformance,
      topWinners: winners.sort((a, b) => b.returnPct - a.returnPct).slice(0, 5),
      topLosers: losers.sort((a, b) => a.returnPct - b.returnPct).slice(0, 5),
      performance: performance.sort((a, b) => b.returnPct - a.returnPct),
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
