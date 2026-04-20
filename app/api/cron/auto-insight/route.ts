import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Auto-Insight Generator
// 
// 매일 축적된 데이터에서 자동으로 인사이트 추출:
//   1. 현재 시장 국면 vs 과거 유사 국면 비교
//   2. 패턴 트리거 조건 충족 여부 체크
//   3. 상관관계 변화 감지
//   4. 이상 신호 자동 감지
// 
// → research_findings 테이블에 자동 저장
// ═══════════════════════════════════════════════════════════

interface Insight {
  category: "pattern_match" | "correlation_shift" | "regime_change" | "anomaly";
  title: string;
  description: string;
  insight: string;
  symbols: string[];
  confidence: number;
  tags: string[];
  supportingData: any;
}

export async function GET(req: NextRequest) {
  // 인증
  const auth = req.headers.get("authorization");
  const isValid = auth === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = req.nextUrl.searchParams.get("force") === "true";
  if (!isValid && !isManual) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdmin();
    const insights: Insight[] = [];
    const today = new Date().toISOString().split("T")[0];

    // ═══════════════════════════════════════════════════════════
    // 1. 현재 시장 지표 + 최근 국면 로드
    // ═══════════════════════════════════════════════════════════
    const quotes = await fetchYahooQuotes([
      "^VIX", "^TNX", "SPY", "QQQ", "SMH", "NVDA", "TSM", "KRW=X"
    ]);
    const vix = quotes.get("^VIX")?.price ?? 0;
    const usdKrw = quotes.get("KRW=X")?.price ?? 0;

    const { data: recentRegimes } = await supabase
      .from("market_regime_history")
      .select("*")
      .order("captured_date", { ascending: false })
      .limit(7);

    const current = recentRegimes?.[0];
    const prev = recentRegimes?.[1];

    // ═══════════════════════════════════════════════════════════
    // 2. 패턴 트리거 체크
    // ═══════════════════════════════════════════════════════════
    const { data: patterns } = await supabase
      .from("pattern_library")
      .select("*")
      .eq("is_active", true);

    for (const p of patterns ?? []) {
      const cond = p.trigger_conditions ?? {};

      // 🎯 VIX 25 돌파 체크
      if (cond.vix_threshold && vix >= cond.vix_threshold) {
        insights.push({
          category: "pattern_match",
          title: `🎯 패턴 트리거: ${p.pattern_name}`,
          description: `VIX ${vix.toFixed(1)} - 임계값 ${cond.vix_threshold} 돌파`,
          insight: `${p.description}. 과거 승률 ${p.win_rate ?? "관찰 중"}. 대상: ${p.applicable_symbols?.join(", ")}`,
          symbols: p.applicable_symbols ?? [],
          confidence: 0.7,
          tags: ["VIX", "공포지수", "패턴매치"],
          supportingData: { vix, threshold: cond.vix_threshold, pattern: p.pattern_name },
        });
      }

      // 💱 환율 임계값 체크
      if (cond.fx_threshold && usdKrw >= cond.fx_threshold) {
        insights.push({
          category: "pattern_match",
          title: `💱 패턴 트리거: ${p.pattern_name}`,
          description: `USD/KRW ${Math.round(usdKrw)} - 임계값 ${cond.fx_threshold} 돌파`,
          insight: `${p.description}. 대상: ${p.applicable_symbols?.join(", ")}`,
          symbols: p.applicable_symbols ?? [],
          confidence: 0.75,
          tags: ["환율", "USDKRW", "패턴매치"],
          supportingData: { usdKrw, threshold: cond.fx_threshold, pattern: p.pattern_name },
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. 국면 전환 감지
    // ═══════════════════════════════════════════════════════════
    if (current && prev && current.overall_regime !== prev.overall_regime) {
      insights.push({
        category: "regime_change",
        title: `🔄 시장 국면 전환: ${prev.overall_regime} → ${current.overall_regime}`,
        description: `${prev.captured_date}의 ${prev.overall_regime}에서 ${current.captured_date}에 ${current.overall_regime}으로 전환`,
        insight:
          current.overall_regime === "risk_off"
            ? "📉 위험 회피 국면 진입 - 방어주/현금 비중 확대 권장"
            : current.overall_regime === "risk_on"
            ? "📈 위험 선호 국면 진입 - 성장주 매수 기회"
            : "🟡 전환 구간 - 관망 + 분할 대응",
        symbols: ["SPY", "QQQ", "SMH", "360750.KS"],
        confidence: 0.85,
        tags: ["국면전환", "시장분석"],
        supportingData: {
          prev: { date: prev.captured_date, regime: prev.overall_regime, vix: prev.vix },
          current: { date: current.captured_date, regime: current.overall_regime, vix: current.vix },
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 4. 상관관계 이상 감지
    // ═══════════════════════════════════════════════════════════
    const { data: recentCorr } = await supabase
      .from("correlation_matrix")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(20);

    // 매우 강한 상관 발견 (>0.85)
    const strongCorr = (recentCorr ?? []).filter((c: any) => Math.abs(c.correlation) > 0.85);
    for (const c of strongCorr.slice(0, 3)) {
      insights.push({
        category: "correlation_shift",
        title: `🔗 강한 연동: ${c.symbol_a} ↔ ${c.symbol_b}`,
        description: `상관계수 ${c.correlation > 0 ? "+" : ""}${c.correlation} (${c.lookback_days}일 기준)`,
        insight:
          c.correlation > 0
            ? `매우 강한 양의 상관 - ${c.symbol_a} 움직이면 ${c.symbol_b}도 같은 방향. 분산 효과 낮음`
            : `강한 음의 상관 - ${c.symbol_a} 상승 시 ${c.symbol_b} 하락 경향. 헤지 효과`,
        symbols: [c.symbol_a, c.symbol_b],
        confidence: 0.9,
        tags: ["상관관계", "포트관리"],
        supportingData: c,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 5. 이상 신호 감지 (VIX 급등)
    // ═══════════════════════════════════════════════════════════
    if (current && prev && prev.vix) {
      const vixChange = ((current.vix - prev.vix) / prev.vix) * 100;
      if (Math.abs(vixChange) > 15) {
        insights.push({
          category: "anomaly",
          title: `⚡ VIX 급변: ${vixChange > 0 ? "+" : ""}${vixChange.toFixed(1)}%`,
          description: `${prev.captured_date} ${prev.vix} → ${current.captured_date} ${current.vix}`,
          insight:
            vixChange > 15
              ? "😰 공포 급등 - 과매도 구간 반등 기회 가능성"
              : "😌 공포 급감 - 탐욕 경계, 차익실현 고려",
          symbols: ["SPY", "QQQ", "VIX"],
          confidence: 0.8,
          tags: ["VIX", "이상신호", "변동성"],
          supportingData: { prev_vix: prev.vix, current_vix: current.vix, change_pct: vixChange },
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. research_findings 테이블에 저장
    // ═══════════════════════════════════════════════════════════
    const toSave = insights.map((i) => ({
      observation_date: today,
      category: i.category,
      symbols: i.symbols,
      title: i.title,
      description: i.description,
      insight: i.insight,
      confidence: i.confidence,
      supporting_data: i.supportingData,
      tags: i.tags,
      author: "auto_insight",
    }));

    let savedCount = 0;
    if (toSave.length > 0) {
      const { data, error } = await supabase
        .from("research_findings")
        .insert(toSave)
        .select("id");
      if (!error) savedCount = data?.length ?? 0;
      else console.warn("[insight] save error:", error.message);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      insights_generated: insights.length,
      insights_saved: savedCount,
      insights,
      context: {
        vix: vix,
        usdKrw,
        current_regime: current?.overall_regime,
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
