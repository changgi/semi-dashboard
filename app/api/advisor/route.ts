import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 개인 투자 자문가 API
// 모든 데이터를 종합해 "지금 구체적으로 뭘 해야 하는지" 제안
// 규칙 기반 (rule-based) - API 키 불필요
// ═══════════════════════════════════════════════════════════

interface ActionItem {
  priority: "high" | "medium" | "low";
  category: "buy" | "sell" | "hedge" | "rebalance" | "monitor" | "wait";
  title: string;
  rationale: string;     // 이유
  steps: string[];       // 구체적 실행 단계
  confidence: number;    // 0-100
  timeHorizon: string;   // "즉시", "1주 내", "이번 달" 등
  riskLevel: "low" | "medium" | "high";
  relatedSymbols?: string[];
}

interface AdvisorResponse {
  success: boolean;
  timestamp: string;
  marketRegime: string;        // "강세장", "약세장", "횡보", "변곡점"
  overallScore: number;        // 0-100
  stance: string;              // "적극 매수", "선별 매수", "관망", "방어" 등
  actions: ActionItem[];       // 구체적 할 일 리스트
  keyInsights: string[];       // 핵심 통찰
  riskFactors: string[];       // 위험 요소
  opportunities: string[];     // 기회 요소
  portfolioAdvice?: {          // 포트폴리오 있을 때만
    overallHealth: "excellent" | "good" | "concerning" | "critical";
    rebalanceNeeded: boolean;
    suggestions: string[];
  };
}

export async function GET() {
  try {
    const supabase = createAdmin();

    // ─────────────────────────────────────────────
    // 1. 전체 데이터 병렬 수집
    // ─────────────────────────────────────────────
    const [
      macroQuotes,
      fxQuotes,
      holdingsRes,
      decisionsRes,
      forecastPerfRes,
    ] = await Promise.all([
      fetchYahooQuotes(["^TNX", "^VIX", "KRW=X", "DX-Y.NYB", "CL=F", "^NDX", "SOXX", "SMH"]),
      fetchYahooQuotes(["000660.KS", "005930.KS", "NVDA", "MU", "TSM"]),
      supabase.from("portfolio_holdings").select("*").eq("is_active", true),
      supabase
        .from("portfolio_decisions")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100),
      supabase.from("forecast_performance_summary").select("*").eq("horizon_days", 30),
    ]);

    const tnx = macroQuotes.get("^TNX")?.price;
    const vix = macroQuotes.get("^VIX")?.price;
    const krw = macroQuotes.get("KRW=X")?.price;
    const dxy = macroQuotes.get("DX-Y.NYB")?.price;
    const oil = macroQuotes.get("CL=F")?.price;
    const ndxChange = macroQuotes.get("^NDX")?.changePct ?? 0;
    const soxxChange = macroQuotes.get("SOXX")?.changePct ?? 0;
    const smhChange = macroQuotes.get("SMH")?.changePct ?? 0;

    // 필수 데이터 체크 - 하나라도 없으면 부분 작동
    if (tnx === undefined && vix === undefined && krw === undefined) {
      return NextResponse.json({
        success: false,
        error: "매크로 데이터를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.",
      }, { status: 503 });
    }

    const hynix = fxQuotes.get("000660.KS");
    const samsung = fxQuotes.get("005930.KS");
    const nvda = fxQuotes.get("NVDA");
    const mu = fxQuotes.get("MU");
    const tsm = fxQuotes.get("TSM");

    // ─────────────────────────────────────────────
    // 2. 매크로 환경 점수 (Daniel Yoo 프레임워크) - 각 지표 존재시만 가산
    // ─────────────────────────────────────────────
    let macroScore = 0;
    let maxScore = 0;

    // 금리 (35점)
    if (tnx !== undefined) {
      maxScore += 35;
      if (tnx < 3.5) macroScore += 35;
      else if (tnx < 4.0) macroScore += 25;
      else if (tnx < 4.5) macroScore += 15;
      else if (tnx < 5.0) macroScore += 5;
    }

    // VIX (20점)
    if (vix !== undefined) {
      maxScore += 20;
      if (vix < 15) macroScore += 12;  // 극저는 경계
      else if (vix < 20) macroScore += 20;
      else if (vix < 25) macroScore += 12;
      else if (vix < 30) macroScore += 5;
    }

    // DXY (20점)
    if (dxy !== undefined) {
      maxScore += 20;
      if (dxy < 100) macroScore += 20;
      else if (dxy < 102) macroScore += 15;
      else if (dxy < 105) macroScore += 8;
    }

    // 원유 (15점)
    if (oil !== undefined) {
      maxScore += 15;
      if (oil >= 70 && oil <= 85) macroScore += 15;
      else if (oil >= 65 && oil <= 95) macroScore += 8;
    }

    // 모멘텀 (10점) - 항상 추가 (기본값 0)
    maxScore += 10;
    if (ndxChange > 0.5 && soxxChange > 0.5) macroScore += 10;
    else if (ndxChange > 0 || soxxChange > 0) macroScore += 5;

    // 100점 환산 (일부 지표 누락되어도 정규화)
    macroScore = maxScore > 0 ? Math.round((macroScore / maxScore) * 100) : 50;

    // ─────────────────────────────────────────────
    // 3. 시장 체제 판별
    // ─────────────────────────────────────────────
    let marketRegime: string;
    let stance: string;

    if (macroScore >= 80 && (vix === undefined || vix < 20)) {
      marketRegime = "강세장 (Bull Market)";
      stance = "적극 매수 · 공격적 포지션";
    } else if (macroScore >= 65) {
      marketRegime = "상승 추세 (Uptrend)";
      stance = "매수 · 중립 이상 포지션";
    } else if (macroScore >= 45) {
      marketRegime = "횡보 (Range-bound)";
      stance = "선별 매수 · 개별 종목 주목";
    } else if (macroScore >= 30) {
      marketRegime = "조정 (Correction)";
      stance = "관망 · 현금 비중 확대";
    } else if (vix !== undefined && vix > 30) {
      marketRegime = "공포 구간 (Fear Zone)";
      stance = "역발상 매수 기회 탐색";
    } else {
      marketRegime = "약세 (Bearish)";
      stance = "방어 · 포지션 축소";
    }

    // ─────────────────────────────────────────────
    // 4. 에이전트 합의 집계
    // ─────────────────────────────────────────────
    const decisions = decisionsRes.data ?? [];
    const latestBySymbol = new Map();
    for (const d of decisions) {
      if (!latestBySymbol.has(d.symbol)) latestBySymbol.set(d.symbol, d);
    }

    const topBuys = Array.from(latestBySymbol.values())
      .filter((d: any) => d.final_score >= 15)
      .sort((a: any, b: any) => b.final_score - a.final_score);
    const topSells = Array.from(latestBySymbol.values())
      .filter((d: any) => d.final_score <= -15)
      .sort((a: any, b: any) => a.final_score - b.final_score);

    // ─────────────────────────────────────────────
    // 5. 포트폴리오 분석
    // ─────────────────────────────────────────────
    const holdings = holdingsRes.data ?? [];
    let portfolioAdvice: AdvisorResponse["portfolioAdvice"] = undefined;

    if (holdings.length > 0) {
      const symbols = [...new Set(holdings.map((h) => h.symbol))];
      const quotes = await fetchYahooQuotes(symbols);
      const usdKrw = krw || 1350;

      let totalValueUsd = 0;
      let totalCostUsd = 0;
      let winnerCount = 0;
      let loserCount = 0;
      const concentration: Record<string, number> = {};

      for (const h of holdings) {
        const q = quotes.get(h.symbol);
        if (!q?.price) continue;
        const cost = h.shares * h.avg_cost;
        const value = h.shares * q.price;
        const gainPct = ((value - cost) / cost) * 100;
        const valueUsd = h.currency === "KRW" ? value / usdKrw : value;
        const costUsd = h.currency === "KRW" ? cost / usdKrw : cost;

        totalValueUsd += valueUsd;
        totalCostUsd += costUsd;

        if (gainPct > 0) winnerCount++;
        else loserCount++;

        concentration[h.symbol] = valueUsd;
      }

      const totalGainPct =
        totalCostUsd > 0 ? ((totalValueUsd - totalCostUsd) / totalCostUsd) * 100 : 0;

      // 집중도 체크
      const maxWeight = Math.max(...Object.values(concentration)) / totalValueUsd;
      const isConcentrated = maxWeight > 0.5;

      // 승/패 비율
      const winRate = (winnerCount / (winnerCount + loserCount)) * 100;

      const suggestions: string[] = [];

      if (totalGainPct > 50) {
        suggestions.push(`전체 +${totalGainPct.toFixed(1)}% 우수 성과 · 일부 이익실현 고려 (~20-30%)`);
      } else if (totalGainPct > 20) {
        suggestions.push(`전체 +${totalGainPct.toFixed(1)}% 양호 · 포지션 유지 권장`);
      } else if (totalGainPct < -10) {
        suggestions.push(`전체 ${totalGainPct.toFixed(1)}% 손실 · 투자 논리 재점검 필요`);
      }

      if (isConcentrated) {
        suggestions.push(`집중도 ${(maxWeight * 100).toFixed(0)}% - 분산투자 권장 (한 종목 40% 이하)`);
      }

      if (winRate < 40) {
        suggestions.push(`승률 ${winRate.toFixed(0)}% 저조 - 개별 종목 추세 확인 및 손절 규율 점검`);
      }

      // 한국 종목 비중 체크
      const krStocks = holdings.filter((h) => h.currency === "KRW");
      const krWeight = krStocks.reduce((s, h) => {
        const q = quotes.get(h.symbol);
        if (!q?.price) return s;
        return s + (h.shares * q.price) / usdKrw;
      }, 0) / totalValueUsd * 100;

      if (krw !== undefined && krw > 1400 && krWeight < 20) {
        suggestions.push(`USD/KRW ${krw.toFixed(0)}원 강세 구간 · 한국 수출주 비중 확대 (현 ${krWeight.toFixed(0)}%, Daniel Yoo 권장 13%+)`);
      }

      let overallHealth: "excellent" | "good" | "concerning" | "critical" = "good";
      if (totalGainPct > 30 && winRate > 60 && !isConcentrated) overallHealth = "excellent";
      else if (totalGainPct < -15 || winRate < 30) overallHealth = "critical";
      else if (totalGainPct < 0 || isConcentrated || winRate < 50) overallHealth = "concerning";

      portfolioAdvice = {
        overallHealth,
        rebalanceNeeded: isConcentrated || winRate < 40 || (krw !== undefined && krw > 1400 && krWeight < 20),
        suggestions,
      };
    }

    // ─────────────────────────────────────────────
    // 6. Action Items 생성 (핵심)
    // ─────────────────────────────────────────────
    const actions: ActionItem[] = [];

    // A. 매크로 기반 액션
    if (macroScore >= 75) {
      actions.push({
        priority: "high",
        category: "buy",
        title: `🚀 강세 환경 - 반도체 섹터 추가 매수`,
        rationale: `매크로 점수 ${macroScore}/100 · ${marketRegime} 확인. 과거 데이터: 점수 70+에서 30일 보유 시 평균 +9%, 승률 80%+`,
        steps: [
          "SMH 또는 SOXX ETF로 섹터 전반 노출 확보",
          "개별 종목 추가 시 AI 합의 점수 +15 이상만 선택",
          "포지션 크기: 총 자산의 5-10% 수준",
          "백테스트 패널에서 50+ 임계점 전략 재검증"
        ],
        confidence: 85,
        timeHorizon: "1주 내",
        riskLevel: "medium",
        relatedSymbols: ["SMH", "SOXX"],
      });
    }

    // B. USD/KRW 강세 활용
    if (krw !== undefined && krw > 1400) {
      actions.push({
        priority: "high",
        category: "buy",
        title: `💱 원화 강세 - 한국 수출주 편입 기회`,
        rationale: `USD/KRW ${krw.toFixed(0)}원 · 삼성전자·SK하이닉스 외화환산이익 Q2 대폭 반영 예상. Daniel Yoo 글로벌 저평가 1·4위`,
        steps: [
          `SK하이닉스 (000660.KS, 현재 ₩${hynix?.price?.toLocaleString() ?? "?"}) 신규/추가 매수`,
          `삼성전자 (005930.KS, 현재 ₩${samsung?.price?.toLocaleString() ?? "?"}) 장기 포지션 구축`,
          "전체 포트폴리오에서 한국 수출주 15-20% 목표",
          "KODEX 반도체 ETF (091170.KS)로 간접 노출도 가능"
        ],
        confidence: 80,
        timeHorizon: "이번 달",
        riskLevel: "medium",
        relatedSymbols: ["000660.KS", "005930.KS", "091170.KS"],
      });
    }

    // C. VIX 극저 - 헤지 제안
    if (vix !== undefined && vix < 13 && vix > 0) {
      actions.push({
        priority: "medium",
        category: "hedge",
        title: `⚠️ VIX 극저 ${vix.toFixed(2)} - 꼬리 리스크 헤지 고려`,
        rationale: `VIX 13 이하는 시장 낙관 과열 신호. 이벤트 발생 시 급등 가능성, 저렴한 보험 기회`,
        steps: [
          "SPY 3-6개월 만기 풋옵션 (OTM 5-10%) 포트폴리오 1-2%",
          "또는 VIX ETF (VXX) 소량 편입",
          "인버스 ETF (SOXS) 비중 확대는 비권장 (추세 거스름)",
          "보험 성격이므로 과도한 비중 금지"
        ],
        confidence: 65,
        timeHorizon: "2주 내",
        riskLevel: "low",
        relatedSymbols: ["VXX", "SPY"],
      });
    }

    // D. VIX 급등 - 역발상 매수
    if (vix !== undefined && vix > 25) {
      actions.push({
        priority: "high",
        category: "buy",
        title: `🎯 VIX ${vix.toFixed(2)} 공포 구간 - 역발상 매수 기회`,
        rationale: `VIX 25+ 역사적으로 반등 시작 신호. Daniel Yoo 프레임워크: AI 슈퍼사이클 중 공포는 매수 기회`,
        steps: [
          "분할 매수 전략 (3분할, 1주 간격)",
          "SMH/SOXX로 안전한 섹터 전반 진입",
          "개별 종목은 SK하이닉스, NVDA, MU 순차 편입",
          "손절선: 현재가 -15% 미리 설정"
        ],
        confidence: 75,
        timeHorizon: "즉시",
        riskLevel: "high",
        relatedSymbols: ["SMH", "000660.KS", "NVDA", "MU"],
      });
    }

    // E. AI 강력 합의 - 매수 추천
    if (topBuys.length > 0) {
      const topBuy = topBuys[0];
      actions.push({
        priority: "high",
        category: "buy",
        title: `🤖 AI 에이전트 ${topBuy.agreement_level}% 합의 - ${topBuy.symbol} 매수`,
        rationale: `19명 중 ${topBuy.agreement_level}% 합의로 점수 +${topBuy.final_score}. 판정: ${topBuy.final_vote}`,
        steps: [
          `${topBuy.symbol} 분석 페이지(/stock/${topBuy.symbol})에서 기술적/펀더멘털 재확인`,
          "옵션 시장 센티먼트 일치 여부 체크 (풋/콜 < 0.6 확인)",
          "분할 매수 권장: 전체 포지션의 1/3씩 3회",
          "포트폴리오 패널에서 진입 즉시 기록"
        ],
        confidence: Math.min(95, 50 + topBuy.agreement_level * 0.5),
        timeHorizon: "1주 내",
        riskLevel: "medium",
        relatedSymbols: [topBuy.symbol],
      });
    }

    // F. AI 합의 - 매도/회피
    if (topSells.length > 0) {
      const topSell = topSells[0];
      actions.push({
        priority: "medium",
        category: "sell",
        title: `⚠️ AI 에이전트 매도 합의 - ${topSell.symbol} 주의`,
        rationale: `19명 중 ${topSell.agreement_level}% 합의로 점수 ${topSell.final_score}. 판정: ${topSell.final_vote}`,
        steps: [
          `${topSell.symbol} 보유 중이면 포지션 축소 검토 (절반 매도)`,
          "신규 매수는 보류 권장",
          "기술적 지지선 확인 후 재진입 시점 대기",
          "Stop-loss 재설정: 전일 저점 -3%"
        ],
        confidence: Math.min(85, 40 + topSell.agreement_level * 0.5),
        timeHorizon: "1주 내",
        riskLevel: "low",
        relatedSymbols: [topSell.symbol],
      });
    }

    // G. 금리 급변
    if (tnx !== undefined && tnx < 3.8) {
      actions.push({
        priority: "medium",
        category: "buy",
        title: `📉 10Y 금리 ${tnx.toFixed(2)}% 하락 - 성장주 수혜`,
        rationale: `저금리는 PER 확장 여지 제공. 나스닥 성장주 및 고PER 반도체주 수혜`,
        steps: [
          "고PER 종목 재평가: NVDA, ARM, AVGO",
          "채권 대신 주식 비중 확대 고려 (80:20 → 85:15)",
          "긴 듀레이션 성장주 편입 기회",
          "금리 반등 시 신속 조정 가능한 유동성 유지"
        ],
        confidence: 70,
        timeHorizon: "이번 달",
        riskLevel: "medium",
        relatedSymbols: ["NVDA", "ARM", "AVGO", "QQQ"],
      });
    }

    // H. 포트폴리오 리밸런싱
    if (portfolioAdvice?.rebalanceNeeded) {
      actions.push({
        priority: "medium",
        category: "rebalance",
        title: `💼 포트폴리오 리밸런싱 필요`,
        rationale: portfolioAdvice.suggestions.join(" · "),
        steps: [
          "포트폴리오 패널에서 종목별 비중 확인",
          "40% 이상 집중 종목이 있다면 일부 매도",
          "한국 수출주 비중 13-20% 목표 조정",
          "섹터 분산: 메모리/팹리스/장비 균형"
        ],
        confidence: 80,
        timeHorizon: "이번 달",
        riskLevel: "low",
      });
    }

    // I. 큰 움직임 포착
    if (Math.abs(soxxChange) > 3) {
      const isUp = soxxChange > 0;
      actions.push({
        priority: "medium",
        category: isUp ? "buy" : "monitor",
        title: `${isUp ? "🚀" : "📉"} SOXX ${isUp ? "+" : ""}${soxxChange.toFixed(2)}% ${isUp ? "급등" : "급락"}`,
        rationale: isUp
          ? "반도체 섹터 강한 모멘텀 · 추세 따라가기 유효"
          : "섹터 조정 · Daniel Yoo 역발상 매수 영역 접근 중",
        steps: isUp
          ? [
              "급등 초입이면 SOXL(+3x) 소량 진입도 고려",
              "추격 매수 지양 · 분할 매수 권장",
              "RSI 70+ 과매수 종목은 제외",
            ]
          : [
              "SMH/SOXX로 저평가 구간 진입 준비",
              "분할 매수 3회 이상 권장",
              "손절선 명확히 설정",
            ],
        confidence: 65,
        timeHorizon: "즉시",
        riskLevel: isUp ? "high" : "medium",
        relatedSymbols: isUp ? ["SOXL", "SMH"] : ["SMH", "SOXX"],
      });
    }

    // J. 기본 - 관망
    if (actions.length === 0) {
      actions.push({
        priority: "low",
        category: "wait",
        title: `⚖️ 현재 특별한 액션 시그널 없음 - 관망`,
        rationale: `매크로 점수 ${macroScore}/100 · ${marketRegime}. 기존 포지션 유지 및 신규 기회 탐색`,
        steps: [
          "Today's View 패널 정기적 체크 (하루 2-3회)",
          "알림 센터에서 주요 이벤트 대기",
          "포트폴리오 종목별 실적/뉴스 점검",
          "새로운 매수 기회는 점수 60+ 구간까지 대기"
        ],
        confidence: 60,
        timeHorizon: "관망",
        riskLevel: "low",
      });
    }

    // ─────────────────────────────────────────────
    // 7. Key Insights, Risks, Opportunities
    // ─────────────────────────────────────────────
    const keyInsights: string[] = [];
    const riskFactors: string[] = [];
    const opportunities: string[] = [];

    keyInsights.push(`매크로 환경 ${macroScore}/100 · ${marketRegime}`);
    keyInsights.push(`권장 포지션: ${stance}`);
    if (topBuys.length > 0) {
      keyInsights.push(`AI 강력 매수 합의 ${topBuys.length}종: ${topBuys.slice(0, 3).map((d: any) => d.symbol).join(", ")}`);
    }

    // 위험 요소
    if (tnx !== undefined && tnx > 4.5) riskFactors.push(`10Y 금리 ${tnx.toFixed(2)}% 높음 - 성장주 부담`);
    if (vix !== undefined && vix > 25) riskFactors.push(`VIX ${vix.toFixed(2)} 공포 구간`);
    if (vix !== undefined && vix < 13 && vix > 0) riskFactors.push(`VIX ${vix.toFixed(2)} 극저 - 낙관 과열 가능성`);
    if (dxy !== undefined && dxy > 106) riskFactors.push(`DXY ${dxy.toFixed(2)} 달러 강세 - 신흥국 부담`);
    if (oil !== undefined && oil > 95) riskFactors.push(`WTI $${oil.toFixed(2)} 원유 급등 - 인플레 압박`);
    if (tsm?.changePct !== undefined && tsm.changePct < -3) {
      riskFactors.push(`TSM ${tsm.changePct.toFixed(2)}% - 대만 지정학 리스크 주시`);
    }

    // 기회 요소
    if (krw !== undefined && krw > 1400) opportunities.push(`USD/KRW ${krw.toFixed(0)}원 - 한국 수출주 수혜 극대화`);
    if (tnx !== undefined && tnx < 3.8) opportunities.push(`10Y ${tnx.toFixed(2)}% - 성장주 재평가 구간`);
    if (soxxChange < -2) opportunities.push(`SOXX ${soxxChange.toFixed(2)}% - 역발상 매수 영역`);
    if (macroScore >= 75) opportunities.push(`강세 환경 ${macroScore}/100 - 포지션 확대 유리`);
    if (hynix?.changePct !== undefined && hynix.changePct < -3) {
      opportunities.push(`SK하이닉스 ${hynix.changePct.toFixed(2)}% - Daniel Yoo 저평가 1위 저가 매수`);
    }

    // ─────────────────────────────────────────────
    // 8. 응답 구성
    // ─────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      marketRegime,
      overallScore: macroScore,
      stance,
      actions: actions.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }),
      keyInsights,
      riskFactors,
      opportunities,
      portfolioAdvice,
      methodology:
        "규칙 기반 (rule-based) 분석 · Daniel Yoo 프레임워크 + 19 AI 에이전트 + 매크로 9지표 종합",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
