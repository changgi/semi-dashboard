import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuote, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 600; // 10분 캐시
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/orcl-inflection-tracker
 *
 * 카일님 ORCL 장기 테제 검증 엔진 (v8.10)
 *
 * 작동 원리:
 *   1. Bull 테제와 Bear 테제 각각의 신호를 동등하게 평가
 *   2. 데이터 가능한 신호는 자동, 수동 신호는 DB에서 조회
 *   3. 일일 점수를 thesis_daily_scores에 누적 → 미래 사후 검증 가능
 *   4. 카일님 ORCL+ORCX 포지션 현재 가치도 함께 기록
 *
 * 핵심 차이 (회피용 엔진과 다름):
 *   - 정당화 엔진 아님: Bear 신호도 동등 표시
 *   - 시간 가치 추적: ORCX decay 표시
 *   - 사후 검증 가능: 모든 신호 기록 보존
 *
 * 카일 모토 적용:
 *   "결과가 아닌 결정의 질을 평가하라"
 *   → Bull/Bear 점수 둘 다 보존, 미래에 어느 쪽이 옳았는지 학습
 */

type SignalCatalog = {
  signal_key: string;
  signal_name: string;
  signal_type: "bull" | "bear";
  stage: string;
  weight: number;
  data_source: string;
  threshold_text: string;
};

type SignalObservation = {
  signal_key: string;
  is_triggered: boolean;
  observed_value: number | null;
  evidence_text: string;
};

// ─────────────────────────────────────────────
// 자동 평가 가능한 신호들
// ─────────────────────────────────────────────

async function evalAutoSignals(): Promise<Map<string, SignalObservation>> {
  const observations = new Map<string, SignalObservation>();

  try {
    // ORCL 가격 데이터
    const orclQuote = await fetchYahooQuote("ORCL");
    const orclHistory = await fetchYahooHistory("ORCL", "1y");

    if (orclQuote && orclHistory && orclHistory.length >= 200) {
      const closes = orclHistory.map((b: any) => b.close).filter((v: any) => v != null);
      const cur = orclQuote.price;
      const sma200 = closes.slice(-200).reduce((s: number, v: number) => s + v, 0) / 200;
      const sma20 = closes.slice(-20).reduce((s: number, v: number) => s + v, 0) / 20;
      const ret20d = ((cur / closes[closes.length - 21]) - 1) * 100;
      const recent6mLow = Math.min(...closes.slice(-126));

      // Bull · price · SMA200 돌파
      observations.set("orcl_bull_price_above_sma200", {
        signal_key: "orcl_bull_price_above_sma200",
        is_triggered: cur > sma200,
        observed_value: cur,
        evidence_text: `ORCL $${cur.toFixed(2)} vs SMA200 $${sma200.toFixed(2)} = ${cur > sma200 ? "위" : "아래"}`,
      });

      // Bull · price · 20일 모멘텀 양전환
      observations.set("orcl_bull_momentum20d", {
        signal_key: "orcl_bull_momentum20d",
        is_triggered: ret20d > 5,
        observed_value: ret20d,
        evidence_text: `20일 수익률 ${ret20d.toFixed(1)}% (기준 +5%)`,
      });

      // Bear · price · SMA200 이탈
      observations.set("orcl_bear_below_sma200", {
        signal_key: "orcl_bear_below_sma200",
        is_triggered: cur < sma200,
        observed_value: cur,
        evidence_text: `ORCL $${cur.toFixed(2)} < SMA200 $${sma200.toFixed(2)}: ${cur < sma200 ? "이탈 중" : "회복"}`,
      });

      // Bear · price · 20일 모멘텀 음전환
      observations.set("orcl_bear_momentum_negative", {
        signal_key: "orcl_bear_momentum_negative",
        is_triggered: ret20d < -5,
        observed_value: ret20d,
        evidence_text: `20일 수익률 ${ret20d.toFixed(1)}%`,
      });

      // Bear · price · 6개월 신저가
      observations.set("orcl_bear_lower_lows", {
        signal_key: "orcl_bear_lower_lows",
        is_triggered: cur <= recent6mLow * 1.02,
        observed_value: cur,
        evidence_text: `현재 $${cur.toFixed(2)} vs 6개월 저점 $${recent6mLow.toFixed(2)}`,
      });
    }

    // ORCL/SOXX 상대 강도 (Bull · market)
    const soxxQuote = await fetchYahooQuote("SOXX");
    const soxxHistory = await fetchYahooHistory("SOXX", "1mo");
    if (orclHistory && soxxHistory && soxxHistory.length >= 20 && orclHistory.length >= 20) {
      const orclCloses = orclHistory.map((b: any) => b.close);
      const soxxCloses = soxxHistory.map((b: any) => b.close);
      const orclRet = (orclCloses[orclCloses.length - 1] / orclCloses[orclCloses.length - 21] - 1) * 100;
      const soxxRet = (soxxCloses[soxxCloses.length - 1] / soxxCloses[soxxCloses.length - 21] - 1) * 100;
      const rs = orclRet - soxxRet;

      observations.set("orcl_bull_relative_strength", {
        signal_key: "orcl_bull_relative_strength",
        is_triggered: rs > 0,
        observed_value: rs,
        evidence_text: `ORCL ${orclRet.toFixed(1)}% vs SOXX ${soxxRet.toFixed(1)}% (격차 ${rs.toFixed(1)}%p)`,
      });
    }

    // IGV 6개월 (Bear · macro · SW 베어)
    const igvHistory = await fetchYahooHistory("IGV", "6mo");
    if (igvHistory && igvHistory.length >= 60) {
      const igvCloses = igvHistory.map((b: any) => b.close);
      const igvRet6m = (igvCloses[igvCloses.length - 1] / igvCloses[0] - 1) * 100;
      observations.set("orcl_bear_software_bear", {
        signal_key: "orcl_bear_software_bear",
        is_triggered: igvRet6m < -10,
        observed_value: igvRet6m,
        evidence_text: `IGV 6개월 수익률 ${igvRet6m.toFixed(1)}%`,
      });
    }

    // NVDA 매출 둔화 신호 (Bull · infra) - Yahoo의 trailing revenue로 근사
    // 실제로는 분기 실적 데이터 필요하나 단순화
    const nvdaQuote = await fetchYahooQuote("NVDA");
    if (nvdaQuote) {
      // 분기 매출 데이터는 Yahoo basic API로 접근 어려움 → 수동 신호로 분류
      // 여기서는 placeholder
      observations.set("orcl_bull_nvda_revenue_decel", {
        signal_key: "orcl_bull_nvda_revenue_decel",
        is_triggered: false, // 수동 입력 필요
        observed_value: null,
        evidence_text: "분기 실적 발표 후 수동 업데이트 필요",
      });
    }
  } catch (err) {
    console.error("Auto signal eval error:", err);
  }

  return observations;
}

// ─────────────────────────────────────────────
// 점수 산출
// ─────────────────────────────────────────────

function computeScores(
  catalog: SignalCatalog[],
  observations: Map<string, SignalObservation>
) {
  const stageMaxWeights: Record<string, number> = {};
  const stageActualWeights: Record<string, number> = {};
  const triggered: Array<{ key: string; name: string; type: string; weight: number; evidence: string }> = [];

  // 단계별 max weight 사전 계산
  for (const sig of catalog) {
    const key = `${sig.signal_type}_${sig.stage}`;
    stageMaxWeights[key] = (stageMaxWeights[key] || 0) + sig.weight;
  }

  // 관측된 신호 누적
  for (const sig of catalog) {
    const obs = observations.get(sig.signal_key);
    if (!obs || !obs.is_triggered) continue;
    const key = `${sig.signal_type}_${sig.stage}`;
    stageActualWeights[key] = (stageActualWeights[key] || 0) + sig.weight;
    triggered.push({
      key: sig.signal_key,
      name: sig.signal_name,
      type: sig.signal_type,
      weight: sig.weight,
      evidence: obs.evidence_text,
    });
  }

  // 단계별 정규화 점수 (0-100 of stage max)
  const bull_infra = stageMaxWeights["bull_infra"]
    ? (stageActualWeights["bull_infra"] || 0) / stageMaxWeights["bull_infra"] * 100
    : 0;
  const bull_transition = stageMaxWeights["bull_transition"]
    ? (stageActualWeights["bull_transition"] || 0) / stageMaxWeights["bull_transition"] * 100
    : 0;
  const bull_market = stageMaxWeights["bull_market"]
    ? (stageActualWeights["bull_market"] || 0) / stageMaxWeights["bull_market"] * 100
    : 0;
  const bull_price = stageMaxWeights["bull_price"]
    ? (stageActualWeights["bull_price"] || 0) / stageMaxWeights["bull_price"] * 100
    : 0;

  const bear_competition = stageMaxWeights["bear_competition"]
    ? (stageActualWeights["bear_competition"] || 0) / stageMaxWeights["bear_competition"] * 100
    : 0;
  const bear_fundamentals = stageMaxWeights["bear_fundamentals"]
    ? (stageActualWeights["bear_fundamentals"] || 0) / stageMaxWeights["bear_fundamentals"] * 100
    : 0;
  const bear_macro = stageMaxWeights["bear_macro"]
    ? (stageActualWeights["bear_macro"] || 0) / stageMaxWeights["bear_macro"] * 100
    : 0;
  const bear_price = stageMaxWeights["bear_price"]
    ? (stageActualWeights["bear_price"] || 0) / stageMaxWeights["bear_price"] * 100
    : 0;

  // Bull 종합: stage별 가중 평균 (transition이 가장 중요)
  const bull_score = bull_infra * 0.20 + bull_transition * 0.35 + bull_market * 0.25 + bull_price * 0.20;

  // Bear 종합
  const bear_score = bear_competition * 0.30 + bear_fundamentals * 0.30 + bear_macro * 0.20 + bear_price * 0.20;

  const net_score = bull_score - bear_score;

  return {
    bull_score,
    bear_score,
    net_score,
    bull_infra,
    bull_transition,
    bull_market,
    bull_price,
    bear_competition,
    bear_fundamentals,
    bear_macro,
    bear_price,
    triggered,
  };
}

// ─────────────────────────────────────────────
// 판정
// ─────────────────────────────────────────────

function judge(net: number, bull: number, bear: number): {
  verdict: string;
  recommendation: string;
  confidence: string;
} {
  if (net >= 30 && bull >= 50) {
    return {
      verdict: "🚀 Bull 테제 우세 — 변곡점 임박",
      recommendation: "ORCX 부분 청산 시작 또는 ORCL 본주 전환 고려",
      confidence: "high",
    };
  }
  if (net >= 15) {
    return {
      verdict: "🟢 Bull 우위 — 모니터링 강화",
      recommendation: "ORCX 보유 가능, 단 시간 가치 손실 감수",
      confidence: "medium",
    };
  }
  if (net <= -30 && bear >= 50) {
    return {
      verdict: "🚨 Bear 테제 우세 — 손실 회피 필요",
      recommendation: "ORCX 청산 또는 본주 전환으로 시간 감가 회피",
      confidence: "high",
    };
  }
  if (net <= -15) {
    return {
      verdict: "🟡 Bear 우위 — 주의",
      recommendation: "ORCX 일부 청산, 신호 변화 면밀히 관찰",
      confidence: "medium",
    };
  }
  return {
    verdict: "⚖️ 중립 — 양 시나리오 혼재",
    recommendation: "현 상태 유지, 신호 누적 관찰",
    confidence: "low",
  };
}

// ─────────────────────────────────────────────
// 시간 가치 (Theta) 경고
// ─────────────────────────────────────────────

function computeThetaWarning(
  orclCurrent: number,
  orclTarget: number,
  orcxShares: number,
  orcxAvgCost: number,
  orcxCurrent: number
) {
  const orclNeededPct = ((orclTarget / orclCurrent) - 1) * 100;
  // ORCX는 일일 리셋 2x → 변동성 손실 발생
  // 단순 추정: ORCL +X% → ORCX +1.8X% (이상적), 실제는 시간 감가로 더 적음
  const idealOrcxPct = orclNeededPct * 2;
  // 1년 보유 시 약 8-12% 추가 감가 가정 (역사적 평균)
  const annualDecay = 10;
  const realisticOrcxPct = idealOrcxPct - annualDecay;

  const orcxBreakEvenPct = ((orcxAvgCost / orcxCurrent) - 1) * 100;
  const monthsToBreakEven = orcxBreakEvenPct > realisticOrcxPct
    ? Infinity
    : 12; // 단순화

  return {
    orclCurrentPrice: orclCurrent,
    orclTargetPrice: orclTarget,
    orclNeededPct,
    idealOrcxPct,
    realisticOrcxPct,
    orcxBreakEvenPct,
    feasible: realisticOrcxPct >= orcxBreakEvenPct,
    estimatedMonthsToBreakEven: monthsToBreakEven,
    annualDecayAssumption: annualDecay,
    warning: realisticOrcxPct < orcxBreakEvenPct
      ? `⚠️ ORCL +${orclNeededPct.toFixed(0)}%로는 ORCX 본전 미달 가능 (시간 감가)`
      : `✅ ORCL +${orclNeededPct.toFixed(0)}% 도달 시 ORCX 본전 가능성`,
  };
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const supabase = createAdmin();

    // 시그널 카탈로그 조회
    const { data: catalog, error: catErr } = await supabase
      .from("thesis_signals_catalog")
      .select("*")
      .eq("symbol", "ORCL");
    if (catErr) throw catErr;
    if (!catalog || catalog.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Signal catalog empty. Run migration 2026-04-24-orcl-thesis-tracker.sql first.",
        _soft_failure: true,
      }, { status: 200 });
    }

    // 자동 신호 평가
    const autoObs = await evalAutoSignals();

    // 최근 수동 관측치 가져오기 (지난 30일)
    const { data: manualObs } = await supabase
      .from("thesis_signal_observations")
      .select("*")
      .gte("observed_at", new Date(Date.now() - 30 * 86400 * 1000).toISOString())
      .order("observed_at", { ascending: false });

    // 수동 관측치를 카탈로그 키별 최신으로 정리
    const manualMap = new Map<string, any>();
    for (const obs of manualObs ?? []) {
      if (!manualMap.has(obs.signal_key)) {
        manualMap.set(obs.signal_key, obs);
      }
    }

    // 자동 + 수동 통합
    const observations = new Map<string, SignalObservation>();
    for (const [k, v] of autoObs.entries()) observations.set(k, v);
    for (const [k, v] of manualMap.entries()) {
      if (!observations.has(k)) {
        observations.set(k, {
          signal_key: k,
          is_triggered: v.is_triggered,
          observed_value: v.observed_value,
          evidence_text: v.evidence_text || "수동 관측",
        });
      }
    }

    // 점수 산출
    const scores = computeScores(catalog, observations);
    const judgment = judge(scores.net_score, scores.bull_score, scores.bear_score);

    // 카일 포지션 정보
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true)
      .in("symbol", ["ORCL", "ORCX", "ORCU"]);

    const orclQuote = await fetchYahooQuote("ORCL");
    const orcxQuote = await fetchYahooQuote("ORCX");
    const orcuQuote = await fetchYahooQuote("ORCU");

    const positionDetails = (holdings ?? []).map((h: any) => {
      const quote = h.symbol === "ORCL" ? orclQuote : h.symbol === "ORCX" ? orcxQuote : orcuQuote;
      const cur = quote?.price ?? h.avg_cost;
      const value = h.shares * cur;
      const cost = h.shares * h.avg_cost;
      const pnl = value - cost;
      const pnlPct = ((cur / h.avg_cost) - 1) * 100;
      return { symbol: h.symbol, shares: h.shares, avgCost: h.avg_cost, currentPrice: cur, value, cost, pnl, pnlPct };
    });

    // 시간 가치 경고 (ORCX 기준)
    const orcxHolding = positionDetails.find(p => p.symbol === "ORCX");
    const thetaWarning = orcxHolding && orclQuote ? computeThetaWarning(
      orclQuote.price,
      285.72, // ORCL 전고점 = ORCX 본전 도달 추정 가격
      orcxHolding.shares,
      orcxHolding.avgCost,
      orcxHolding.currentPrice
    ) : null;

    // 최근 30일 점수 추이
    const { data: recentScores } = await supabase
      .from("thesis_daily_scores")
      .select("computed_at, bull_score, bear_score, net_score")
      .eq("symbol", "ORCL")
      .gte("computed_at", new Date(Date.now() - 30 * 86400 * 1000).toISOString())
      .order("computed_at", { ascending: true });

    // 오늘 점수 저장 (사후 검증 보존)
    const totalPositionValue = positionDetails.reduce((s, p) => s + p.value, 0);
    const totalPositionCost = positionDetails.reduce((s, p) => s + p.cost, 0);
    const totalPnlPct = totalPositionCost > 0 ? ((totalPositionValue / totalPositionCost) - 1) * 100 : 0;

    await supabase.from("thesis_daily_scores").insert({
      symbol: "ORCL",
      bull_score: scores.bull_score,
      bear_score: scores.bear_score,
      net_score: scores.net_score,
      bull_infra: scores.bull_infra,
      bull_transition: scores.bull_transition,
      bull_market: scores.bull_market,
      bull_price: scores.bull_price,
      bear_competition: scores.bear_competition,
      bear_fundamentals: scores.bear_fundamentals,
      bear_macro: scores.bear_macro,
      bear_price: scores.bear_price,
      triggered_signals: scores.triggered,
      position_value: totalPositionValue,
      position_pnl_pct: totalPnlPct,
    });

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      thesis: {
        bull: "AI 인프라 완성 → 데이터 활용 단계 → ORCL 누적 데이터 강자로 부상",
        bear: "OpenAI/Anthropic 등 AI 신생기업이 SW 생태계 잠식, 변곡점 안 옴",
      },
      scores: {
        bull: scores.bull_score,
        bear: scores.bear_score,
        net: scores.net_score,
        bull_breakdown: {
          infra: scores.bull_infra,
          transition: scores.bull_transition,
          market: scores.bull_market,
          price: scores.bull_price,
        },
        bear_breakdown: {
          competition: scores.bear_competition,
          fundamentals: scores.bear_fundamentals,
          macro: scores.bear_macro,
          price: scores.bear_price,
        },
      },
      judgment,
      triggered_signals: scores.triggered,
      positions: positionDetails,
      theta_warning: thetaWarning,
      score_history: recentScores ?? [],
      philosophy: {
        moto: "결과가 아닌 결정의 질을 평가하라",
        method: "Bull/Bear 시그널 동등 평가, 시계열 보존, 사후 검증 가능",
        usage: "이 점수가 ORCX 보유 정당화 도구가 아님. 카일 테제의 '진실성'을 시간이 검증하는 도구.",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
    }, { status: 200 });
  }
}
