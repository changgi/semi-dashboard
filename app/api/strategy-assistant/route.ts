import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Strategy Assistant API
// 
// 대화형 질문 → 카일님 실제 포트/시장 기반 답변
// 
// POST { question: "should_i_sell" | "should_i_buy_more" | "should_i_hedge" | 
//                   "risk_check" | "opportunity_scan" }
// ═══════════════════════════════════════════════════════════

interface Answer {
  question: string;
  decision: "yes" | "no" | "partial" | "wait";
  confidence: number;
  oneLiner: string;
  reasoning: string[];
  risks: string[];
  concreteAction: string;
  alternativeOptions?: string[];
  relevantData: {
    label: string;
    value: string;
    color?: string;
  }[];
}

// ───────────────────────────────────────────────────────────
// 시장 데이터 수집
// ───────────────────────────────────────────────────────────
async function gatherContext() {
  const supabase = createAdmin();
  
  // 1. 포트폴리오
  const { data: holdings } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("is_active", true);
  
  // 2. 현재가 수집
  const symbols = [...new Set((holdings ?? []).map((h: any) => h.symbol))];
  const quotes = await fetchYahooQuotes([...symbols, "^VIX", "^TNX", "SPY", "QQQ", "SMH", "KRW=X"]);
  
  // 3. 매크로
  const vix = quotes.get("^VIX")?.price ?? null;
  const tnx = quotes.get("^TNX")?.price ?? null;
  const usdKrw = quotes.get("KRW=X")?.price ?? 1470;
  const spyChange = quotes.get("SPY")?.changePct ?? null;
  
  // 4. 포트 가치 계산
  let totalValueUsd = 0;
  let totalCostUsd = 0;
  const positions: any[] = [];
  
  for (const h of holdings ?? []) {
    const q = quotes.get(h.symbol);
    const currentPrice = q?.price ?? h.avg_cost;
    const marketValue = currentPrice * h.shares;
    const costValue = h.avg_cost * h.shares;
    
    const marketValueUsd = h.currency === "KRW" ? marketValue / usdKrw : marketValue;
    const costValueUsd = h.currency === "KRW" ? costValue / usdKrw : costValue;
    
    totalValueUsd += marketValueUsd;
    totalCostUsd += costValueUsd;
    
    positions.push({
      symbol: h.symbol,
      name: h.name,
      shares: h.shares,
      currentPrice,
      marketValueUsd,
      gainPct: costValue > 0 ? ((marketValue - costValue) / costValue) * 100 : 0,
    });
  }
  
  const totalGainPct = totalCostUsd > 0 ? ((totalValueUsd - totalCostUsd) / totalCostUsd) * 100 : 0;
  
  return {
    positions,
    totalValueUsd,
    totalCostUsd,
    totalGainPct,
    vix,
    tnx,
    usdKrw,
    spyChange,
  };
}

// ───────────────────────────────────────────────────────────
// Q1: 지금 매도해야 할까?
// ───────────────────────────────────────────────────────────
async function shouldISell(ctx: any): Promise<Answer> {
  const reasoning: string[] = [];
  const risks: string[] = [];
  const relevantData = [];
  
  // 수익률 기반
  if (ctx.totalGainPct > 15) {
    reasoning.push(`✅ 현재 수익 +${ctx.totalGainPct.toFixed(1)}% - 일부 차익실현 정당화`);
  } else if (ctx.totalGainPct < 5) {
    reasoning.push(`❌ 수익 ${ctx.totalGainPct.toFixed(1)}% - 아직 매도 근거 약함`);
  } else {
    reasoning.push(`➖ 수익 ${ctx.totalGainPct.toFixed(1)}% - 애매한 구간`);
  }
  
  // 개별 포지션 체크
  const bigWinners = ctx.positions.filter((p: any) => p.gainPct > 50);
  if (bigWinners.length > 0) {
    reasoning.push(`💎 ${bigWinners[0].symbol} +${bigWinners[0].gainPct.toFixed(0)}% - 원금 회수 레벨 수익`);
  }
  
  // VIX 기반
  if (ctx.vix !== null && ctx.vix < 14) {
    reasoning.push(`😌 VIX ${ctx.vix.toFixed(1)} - 낙관론 팽배, 반대 움직임 경계`);
  } else if (ctx.vix !== null && ctx.vix > 20) {
    risks.push(`⚠️ VIX ${ctx.vix.toFixed(1)} - 이미 변동성 높아 매도 타이밍 늦을 수 있음`);
  }
  
  // 이번 주 실적 시즌
  risks.push(`🔥 이번 주 MSFT/AAPL 실적 + 4/29 FOMC - 시장 전반 변동성 확대 예상`);
  risks.push(`🌍 Iran-US 지정학 리스크 현재 진행 중`);
  
  relevantData.push(
    { label: "현재 수익", value: `+${ctx.totalGainPct.toFixed(2)}%`, color: "#00ff88" },
    { label: "포트 가치", value: `$${ctx.totalValueUsd.toFixed(0)}` },
    { label: "VIX", value: ctx.vix !== null ? ctx.vix.toFixed(2) : "-" }
  );
  
  // 결정
  const hasBigWinner = bigWinners.length > 0;
  const isRiskyPeriod = true; // 이번 주는 확실히 리스크 구간
  
  let decision: "yes" | "no" | "partial" | "wait";
  let oneLiner: string;
  let action: string;
  let confidence: number;
  
  if (hasBigWinner && isRiskyPeriod) {
    decision = "partial";
    oneLiner = "부분 차익실현 권장 (30~50%)";
    action = `${bigWinners[0].symbol} 중 30-50% 매도 → 나머지는 장기 보유. 원금 회수로 심리적 안정 확보`;
    confidence = 75;
  } else if (ctx.totalGainPct > 20 && isRiskyPeriod) {
    decision = "partial";
    oneLiner = "일부 현금화 (20~30%) 고려";
    action = "이번 주 리스크 높으니 20-30% 현금화 → 5/13 CPI 후 재진입 타이밍";
    confidence = 65;
  } else {
    decision = "no";
    oneLiner = "현 시점 전량 매도는 비추천";
    action = "스탑로스만 설정(평단 -10%) 후 보유 유지. 급락 시 자동 보호";
    confidence = 70;
  }
  
  return {
    question: "should_i_sell",
    decision,
    confidence,
    oneLiner,
    reasoning,
    risks,
    concreteAction: action,
    alternativeOptions: [
      "📊 전량 보유 + 스탑로스 설정",
      "💰 일부(30%) 매도 + 현금 확보",
      "🛡️ 풋옵션 헤지 (TLT 매수 등)",
    ],
    relevantData,
  };
}

// ───────────────────────────────────────────────────────────
// Q2: 지금 더 매수해야 할까?
// ───────────────────────────────────────────────────────────
async function shouldIBuyMore(ctx: any): Promise<Answer> {
  const reasoning: string[] = [];
  const risks: string[] = [];
  const relevantData = [];
  
  // 집중도 체크
  if (ctx.positions.length <= 2) {
    reasoning.push(`⚠️ 현재 ${ctx.positions.length}개 포지션 - 분산 필요`);
  }
  
  // VIX 기반
  if (ctx.vix !== null && ctx.vix > 25) {
    reasoning.push(`😱 VIX ${ctx.vix.toFixed(1)} - 공포 구간, 역발상 매수 기회`);
  } else if (ctx.vix !== null && ctx.vix < 14) {
    risks.push(`⚠️ VIX ${ctx.vix.toFixed(1)} 낮음 - 시장 낙관적, 조정 가능성`);
  }
  
  // 매크로
  if (ctx.tnx !== null && ctx.tnx > 4.5) {
    risks.push(`📈 10년물 ${ctx.tnx.toFixed(2)}% - 고금리 부담`);
  }
  
  // 이번 주 이벤트
  risks.push(`🔥 이번 주 MSFT/TSLA 실적 - 단기 변동성 확대`);
  risks.push(`🏛️ D-9 FOMC - 이벤트 지나고 방향성 확립 후 진입이 안전`);
  
  relevantData.push(
    { label: "포트 분산", value: `${ctx.positions.length}개 종목`, color: ctx.positions.length <= 2 ? "#ff3860" : "#00ff88" },
    { label: "VIX", value: ctx.vix !== null ? ctx.vix.toFixed(2) : "-" },
    { label: "10Y", value: ctx.tnx !== null ? `${ctx.tnx.toFixed(2)}%` : "-" }
  );
  
  // 결정
  const hasTurbulence = true; // 이번 주
  const needsDiversification = ctx.positions.length <= 2;
  
  let decision: "yes" | "no" | "partial" | "wait";
  let oneLiner: string;
  let action: string;
  let confidence: number;
  
  if (hasTurbulence) {
    decision = "wait";
    oneLiner = "이번 주 기다렸다가 FOMC 후 진입";
    action = "4/30 이후 시장 방향성 확립되면 분할 매수 시작. 지금은 현금 준비";
    confidence = 70;
  } else if (needsDiversification) {
    decision = "yes";
    oneLiner = "분산 목적 매수 좋음";
    action = "반도체 ETF(SMH/SOXX) or 방어주(XLU/VYM) 100$씩 분할 매수 시작";
    confidence = 75;
  } else {
    decision = "partial";
    oneLiner = "조심스러운 분할 매수 OK";
    action = "매월 30-50만원 DCA (Dollar Cost Averaging)로 꾸준히";
    confidence = 65;
  }
  
  return {
    question: "should_i_buy_more",
    decision,
    confidence,
    oneLiner,
    reasoning,
    risks,
    concreteAction: action,
    alternativeOptions: [
      "⏸️ 4/30까지 대기 후 진입",
      "📈 분할 매수 (3회에 걸쳐)",
      "🎯 분산 매수 (다른 섹터 ETF)",
    ],
    relevantData,
  };
}

// ───────────────────────────────────────────────────────────
// Q3: 헤지해야 할까?
// ───────────────────────────────────────────────────────────
async function shouldIHedge(ctx: any): Promise<Answer> {
  const reasoning: string[] = [];
  const risks: string[] = [];
  const relevantData = [];
  
  if (ctx.totalGainPct > 10) {
    reasoning.push(`✅ 수익 ${ctx.totalGainPct.toFixed(1)}% - 지킬 가치 있는 수익`);
  }
  
  if (ctx.vix !== null && ctx.vix < 14) {
    reasoning.push(`💰 VIX ${ctx.vix.toFixed(1)} - 헤지 보험료 저렴 (낮은 VIX = 싼 풋)`);
  }
  
  reasoning.push(`🔥 이번 주~다음 주 빅 이벤트 (실적+FOMC)`);
  reasoning.push(`🌍 Iran 지정학 리스크 진행 중`);
  
  risks.push(`💸 헤지는 비용 발생 - 상승장에서는 수익 감소`);
  risks.push(`⏰ 타이밍 잘못 잡으면 이중 손실 가능`);
  
  relevantData.push(
    { label: "수익", value: `+${ctx.totalGainPct.toFixed(2)}%`, color: "#00ff88" },
    { label: "VIX", value: ctx.vix !== null ? ctx.vix.toFixed(2) : "-", color: ctx.vix !== null && ctx.vix < 14 ? "#00ff88" : "#ffaa44" }
  );
  
  const hasGoodProfit = ctx.totalGainPct > 5;
  const cheapVix = ctx.vix !== null && ctx.vix < 18;
  
  let decision: "yes" | "no" | "partial" | "wait";
  let oneLiner: string;
  let action: string;
  let confidence: number;
  
  if (hasGoodProfit && cheapVix) {
    decision = "yes";
    oneLiner = "헤지 타이밍 적절 (저렴한 VIX)";
    action = "TLT 10% 편입 or SPY 풋옵션 소량 매수. 보험료 1-2%로 포트 보호";
    confidence = 70;
  } else if (hasGoodProfit) {
    decision = "partial";
    oneLiner = "부분 헤지 고려";
    action = "현금 비중 10-15% 확대. 진짜 위기 시 매수 총알";
    confidence = 60;
  } else {
    decision = "no";
    oneLiner = "헤지 비용 부담 큼";
    action = "수익 더 쌓이면 재검토. 지금은 스탑로스로 충분";
    confidence = 65;
  }
  
  return {
    question: "should_i_hedge",
    decision,
    confidence,
    oneLiner,
    reasoning,
    risks,
    concreteAction: action,
    alternativeOptions: [
      "🛡️ TLT (20년 국채) 10% 편입",
      "📉 SPY 풋옵션 소량 매수",
      "💰 현금 비중 10-15%로 확대",
      "🏆 금 ETF (GLD) 5% 편입",
    ],
    relevantData,
  };
}

// ───────────────────────────────────────────────────────────
// Q4: 내 포트 얼마나 위험해?
// ───────────────────────────────────────────────────────────
async function riskCheck(ctx: any): Promise<Answer> {
  const reasoning: string[] = [];
  const risks: string[] = [];
  const relevantData = [];
  
  // 집중도 위험
  if (ctx.positions.length <= 2) {
    risks.push(`🎯 ${ctx.positions.length}개 종목 집중 - 개별 리스크 극대화`);
  }
  
  // 동일 종목 중복
  const symbolCounts = new Map<string, number>();
  for (const p of ctx.positions) {
    symbolCounts.set(p.symbol, (symbolCounts.get(p.symbol) || 0) + 1);
  }
  const duplicates = Array.from(symbolCounts.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    risks.push(`⚠️ ${duplicates[0][0]} 중복 보유 - 단일 종목 과도 집중`);
  }
  
  // 시장 리스크
  risks.push(`📅 D-9 FOMC - 이벤트 변동성`);
  risks.push(`📊 이번 주 대형주 실적 시즌`);
  
  reasoning.push(`💰 평가액 $${ctx.totalValueUsd.toFixed(0)} - 소액 포트는 회복 유리`);
  reasoning.push(`📈 수익 +${ctx.totalGainPct.toFixed(1)}% - 지금 손실은 아님`);
  
  // 리스크 점수 산정
  let riskScore = 0;
  if (ctx.positions.length <= 2) riskScore += 40;
  else if (ctx.positions.length <= 4) riskScore += 20;
  if (duplicates.length > 0) riskScore += 15;
  if (ctx.vix !== null && ctx.vix > 20) riskScore += 15;
  if (ctx.totalGainPct > 50) riskScore -= 10; // 수익 버퍼
  
  riskScore = Math.max(0, Math.min(100, riskScore));
  
  const riskLevel = riskScore > 60 ? "높음" : riskScore > 40 ? "중간" : riskScore > 20 ? "낮음" : "매우 낮음";
  const riskColor = riskScore > 60 ? "#ff3860" : riskScore > 40 ? "#ffaa44" : "#00ff88";
  
  relevantData.push(
    { label: "리스크 점수", value: `${riskScore}/100`, color: riskColor },
    { label: "리스크 등급", value: riskLevel, color: riskColor },
    { label: "포지션 수", value: `${ctx.positions.length}개` }
  );
  
  let decision: "yes" | "no" | "partial" | "wait";
  let oneLiner: string;
  let action: string;
  
  if (riskScore > 60) {
    decision = "yes";
    oneLiner = "🚨 리스크 높음 - 즉시 조치 필요";
    action = "1) 동일 종목 중복 해소 2) 다른 섹터 ETF 추가 3) 현금 비중 20%+";
  } else if (riskScore > 40) {
    decision = "partial";
    oneLiner = "⚠️ 보통 리스크 - 개선 권장";
    action = "포트 분산 서서히 진행. 3-4개 종목으로 확대";
  } else {
    decision = "no";
    oneLiner = "✅ 리스크 관리 양호";
    action = "현 상태 유지. 정기 리밸런싱만 주의";
  }
  
  return {
    question: "risk_check",
    decision,
    confidence: 80,
    oneLiner,
    reasoning,
    risks,
    concreteAction: action,
    alternativeOptions: [
      "📊 포지션 분산 (3-5종목)",
      "💰 현금 비중 확대",
      "🛡️ 헤지 수단 도입 (TLT/GLD)",
    ],
    relevantData,
  };
}

// ───────────────────────────────────────────────────────────
// Q5: 지금 어떤 기회가 있어?
// ───────────────────────────────────────────────────────────
async function opportunityScan(ctx: any): Promise<Answer> {
  const reasoning: string[] = [];
  const opportunities: string[] = [];
  const relevantData = [];
  
  // VIX 기반 기회
  if (ctx.vix !== null) {
    if (ctx.vix > 25) {
      opportunities.push(`😱 VIX ${ctx.vix.toFixed(1)} 공포 - SPY/QQQ 저가매수`);
    } else if (ctx.vix < 13) {
      opportunities.push(`💰 VIX ${ctx.vix.toFixed(1)} 극저 - 풋옵션 보험 저가매수`);
    } else {
      reasoning.push(`😐 VIX ${ctx.vix.toFixed(1)} 평상 구간`);
    }
  }
  
  // 환율 기반 (카일님 한국 투자자)
  if (ctx.usdKrw > 1480) {
    opportunities.push(`💱 USD/KRW ₩${Math.round(ctx.usdKrw)} 초강세 - 한국 수출주 기회`);
  } else if (ctx.usdKrw < 1350) {
    opportunities.push(`💱 원화 강세 - 해외 자산 저가 매수 기회`);
  }
  
  // 실적 반응
  opportunities.push(`🎯 TSM Q1 EPS Beat - 반도체 섹터 강세 신호`);
  
  // 수익 활용
  if (ctx.totalGainPct > 50) {
    opportunities.push(`💎 수익 ${ctx.totalGainPct.toFixed(0)}% - 일부 차익실현으로 재투자 총알`);
  }
  
  reasoning.push(`📊 TSM 실적 호조 → SMH/SOXX 관심`);
  reasoning.push(`🌍 Iran 긴장 → 방어주(XLU, VYM) 주목`);
  
  relevantData.push(
    { label: "VIX", value: ctx.vix !== null ? ctx.vix.toFixed(2) : "-" },
    { label: "USD/KRW", value: `₩${Math.round(ctx.usdKrw)}` },
    { label: "SPY 일간", value: ctx.spyChange !== null ? `${ctx.spyChange >= 0 ? "+" : ""}${ctx.spyChange.toFixed(2)}%` : "-" }
  );
  
  return {
    question: "opportunity_scan",
    decision: "yes",
    confidence: 70,
    oneLiner: `${opportunities.length}개 기회 발견`,
    reasoning,
    risks: [
      `⏰ 타이밍 잘못 잡으면 손실`,
      `💸 FOMC/실적 전 진입은 변동성 리스크`,
    ],
    concreteAction: opportunities[0] || "현재 특별한 기회 없음 - 관망",
    alternativeOptions: opportunities.slice(1, 4),
    relevantData,
  };
}

// ═══════════════════════════════════════════════════════════
// POST
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    const ctx = await gatherContext();
    
    let answer: Answer;
    switch (question) {
      case "should_i_sell":
        answer = await shouldISell(ctx);
        break;
      case "should_i_buy_more":
        answer = await shouldIBuyMore(ctx);
        break;
      case "should_i_hedge":
        answer = await shouldIHedge(ctx);
        break;
      case "risk_check":
        answer = await riskCheck(ctx);
        break;
      case "opportunity_scan":
        answer = await opportunityScan(ctx);
        break;
      default:
        return NextResponse.json({
          success: false,
          error: "Unknown question",
        });
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      context: {
        totalValueUsd: ctx.totalValueUsd,
        totalGainPct: ctx.totalGainPct,
        positionCount: ctx.positions.length,
        vix: ctx.vix,
        tnx: ctx.tnx,
      },
      answer,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
    });
  }
}
