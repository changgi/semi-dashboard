import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 600;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Time Machine API - 유사 상황 검색
// 
// 현재 시장 상태와 유사한 과거 국면을 찾고:
//   1. 당시 시장이 어떻게 전개됐는지
//   2. 어떤 액션이 효과적이었는지
//   3. 카일님 포트폴리오에 어떤 영향이 있었을지
// 
// 축적된 market_regime_history를 활용
// ═══════════════════════════════════════════════════════════

interface SimilarPeriod {
  date: string;
  daysAgo: number;
  vix: number;
  vix_regime: string;
  spy_regime: string;
  overall: string;
  similarity: number;  // 0-1
  outcome?: {
    day1_vix_change: number | null;
    day7_vix_change: number | null;
    day30_regime: string | null;
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    
    // 1. 현재 시장 상태
    const quotes = await fetchYahooQuotes(["^VIX", "^TNX", "SPY", "KRW=X"]);
    const currentVix = quotes.get("^VIX")?.price ?? 0;
    const currentTnx = quotes.get("^TNX")?.price ?? 0;
    const currentKrw = quotes.get("KRW=X")?.price ?? 0;
    
    // 2. 오늘 국면 정보 가져오기
    const { data: todayRegime } = await supabase
      .from("market_regime_history")
      .select("*")
      .order("captured_date", { ascending: false })
      .limit(1)
      .single();
    
    // 3. 과거 모든 국면 로드
    const { data: history } = await supabase
      .from("market_regime_history")
      .select("*")
      .order("captured_date", { ascending: false })
      .limit(365);
    
    if (!history || history.length === 0) {
      return NextResponse.json({
        success: true,
        message: "축적된 데이터 부족 - 매일 데이터 쌓이면서 정확해집니다",
        current: { vix: currentVix, tnx: currentTnx, krw: currentKrw },
        similar: [],
        insights: [
          "🌱 Warehouse 구축 완료 (오늘 첫 스냅샷 캡쳐됨)",
          "📊 매일 KST 00:30 자동 축적 시작",
          "⏰ 30일 후 더 의미있는 유사도 분석 가능",
        ],
      });
    }
    
    // 4. 각 과거 국면과 유사도 계산
    const similar: SimilarPeriod[] = history.map((h: any) => {
      const vixDiff = Math.abs((h.vix ?? 0) - currentVix);
      const tnxDiff = Math.abs((h.tnx ?? 0) - currentTnx);
      const krwDiff = Math.abs((h.usd_krw ?? 0) - currentKrw);
      
      // 유사도 점수 (VIX 위주)
      const vixScore = Math.max(0, 1 - vixDiff / 10);      // VIX 10 차이 = 0점
      const tnxScore = Math.max(0, 1 - tnxDiff / 2);       // 2% 차이 = 0점
      const krwScore = Math.max(0, 1 - krwDiff / 100);     // 100원 차이 = 0점
      
      const similarity = vixScore * 0.5 + tnxScore * 0.25 + krwScore * 0.25;
      
      const dateObj = new Date(h.captured_date);
      const daysAgo = Math.floor((Date.now() - dateObj.getTime()) / 86400000);
      
      return {
        date: h.captured_date,
        daysAgo,
        vix: h.vix ?? 0,
        vix_regime: h.vix_regime ?? "unknown",
        spy_regime: h.spy_regime ?? "unknown",
        overall: h.overall_regime ?? "unknown",
        similarity: Math.round(similarity * 100) / 100,
      };
    })
    .filter(s => s.daysAgo >= 1) // 오늘 제외
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
    
    // 5. 각 유사 기간의 결과 추적
    for (const period of similar) {
      const periodDate = new Date(period.date);
      const day1Date = new Date(periodDate.getTime() + 86400000).toISOString().split("T")[0];
      const day7Date = new Date(periodDate.getTime() + 7 * 86400000).toISOString().split("T")[0];
      const day30Date = new Date(periodDate.getTime() + 30 * 86400000).toISOString().split("T")[0];
      
      const [d1, d7, d30] = await Promise.all([
        supabase.from("market_regime_history").select("vix, overall_regime").eq("captured_date", day1Date).maybeSingle(),
        supabase.from("market_regime_history").select("vix, overall_regime").eq("captured_date", day7Date).maybeSingle(),
        supabase.from("market_regime_history").select("vix, overall_regime").eq("captured_date", day30Date).maybeSingle(),
      ]);
      
      period.outcome = {
        day1_vix_change: d1.data?.vix ? Math.round(((d1.data.vix - period.vix) / period.vix) * 10000) / 100 : null,
        day7_vix_change: d7.data?.vix ? Math.round(((d7.data.vix - period.vix) / period.vix) * 10000) / 100 : null,
        day30_regime: d30.data?.overall_regime ?? null,
      };
    }
    
    // 6. 인사이트 생성
    const insights: string[] = [];
    
    if (similar[0]?.similarity > 0.8) {
      const top = similar[0];
      insights.push(
        `🎯 ${top.daysAgo}일 전 (${top.date})과 매우 유사한 상황 (유사도 ${Math.round(top.similarity * 100)}%)`
      );
      if (top.outcome && top.outcome.day7_vix_change !== null) {
        const direction = top.outcome.day7_vix_change > 0 ? "상승" : "하락";
        insights.push(
          `📊 당시 1주일 후 VIX ${top.outcome.day7_vix_change > 0 ? "+" : ""}${top.outcome.day7_vix_change}% ${direction}`
        );
      }
    } else if (similar.length > 0) {
      insights.push(`⏳ 축적 데이터 ${history.length}일 - 의미있는 유사도를 위해 더 많은 데이터 필요`);
    }
    
    // VIX 기반 역사적 컨텍스트
    const vixValues = history.map((h: any) => h.vix).filter((v: any) => v !== null);
    if (vixValues.length > 0) {
      const vixPercentile = (vixValues.filter((v: number) => v < currentVix).length / vixValues.length) * 100;
      insights.push(
        `📈 현재 VIX ${currentVix.toFixed(1)} = 과거 ${history.length}일 중 ${vixPercentile.toFixed(0)} 백분위`
      );
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      current: {
        vix: currentVix,
        tnx: currentTnx,
        krw: Math.round(currentKrw),
        regime: todayRegime?.overall_regime ?? "unknown",
      },
      dataDepth: history.length,
      similar,
      insights,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      current: null,
      dataDepth: 0,
      similar: [],
      insights: [],
    });
  }
}
