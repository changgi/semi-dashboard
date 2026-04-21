import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Recovery Path API
// 
// 현재 손실 상태에서 본전 회복까지 여러 경로를 제시:
// 1. HOLD_PATH       - 현 상태 유지 시 필요한 상승률
// 2. SWAP_PATH       - 손실 종목 정리 후 기회 종목 이동
// 3. DCA_PATH        - 평단가 낮추기 전략 (추가 매수)
// 4. HEDGE_PATH      - 헷지로 리스크 축소
// 
// 각 경로마다:
// - 예상 기간
// - 필요한 시장 움직임
// - 실행 난이도
// - 예상 성공률 (시장 history 기반)
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    
    // 1. 포트 + 진단 데이터 로드
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        message: "포지션이 없습니다",
      });
    }
    
    // 진단 API 호출 (내부)
    const diagnosisUrl = new URL("/api/portfolio-diagnosis", req.url);
    const diagRes = await fetch(diagnosisUrl);
    const diagnosis = await diagRes.json();
    
    if (!diagnosis.success) {
      return NextResponse.json({ success: false, error: "Diagnosis failed" });
    }
    
    const positions = diagnosis.positions;
    const summary = diagnosis.summary;
    const lossUsd = Math.abs(summary.totalGainUsd);
    const lossPctAbs = Math.abs(summary.totalGainPct);
    const currentValue = summary.totalValueUsd;
    const originalCost = summary.totalCostUsd;
    
    // ─────────────────────────────────────────────
    // PATH 1: HOLD - 현 상태 유지
    // ─────────────────────────────────────────────
    // 본전 회복에 필요한 포트 평균 상승률
    const holdRequiredReturn = ((originalCost - currentValue) / currentValue) * 100;
    
    // 종목별 상승 기여도
    const holdBreakdown = positions.map((p: any) => {
      const recoveryNeeded = p.avgCost > p.currentPrice
        ? ((p.avgCost - p.currentPrice) / p.currentPrice) * 100
        : 0;
      // 과거 연평균 수익률 추정 (일반적으로 대형 레버리지 ETF는 역사적으로 annualized 25-40%)
      const expectedAnnualReturn = p.isLeverage ? 30 : 12;  // 보수적 추정
      const estimatedMonthsToRecover = recoveryNeeded > 0 
        ? Math.ceil(recoveryNeeded / (expectedAnnualReturn / 12))
        : 0;
      return {
        symbol: p.symbol,
        name: p.name,
        recoveryNeeded: Math.round(recoveryNeeded * 10) / 10,
        estimatedMonthsToRecover,
        isLeverage: p.isLeverage,
      };
    });
    
    const maxRecoveryMonths = Math.max(...holdBreakdown.map((h: any) => h.estimatedMonthsToRecover));
    
    const holdPath = {
      name: "🕰️ PATH 1 · 현 상태 유지",
      nameShort: "HOLD",
      strategy: "hold",
      description: "현재 포지션을 유지하며 시장 회복 대기",
      requiredReturn: Math.round(holdRequiredReturn * 10) / 10,
      estimatedMonths: maxRecoveryMonths,
      difficulty: "easy",
      successProbability: lossPctAbs < 20 ? 70 : lossPctAbs < 40 ? 50 : 35,
      pros: [
        "추가 비용 없음 · 매도 수수료 절약",
        "반등 시 100% 수익 회복 가능",
        "감정적 결정 회피",
      ],
      cons: [
        "레버리지 ETF는 시간 감가 지속 (월 −1~3% 추가 손실 가능)",
        "기회비용 큼 (다른 상승 기회 놓침)",
        `예상 회복 기간 약 ${maxRecoveryMonths}개월`,
      ],
      breakdown: holdBreakdown,
      actionSteps: [
        "아무 매매 없이 포지션 유지",
        "월 1회 포트 리뷰로 최악 종목 점검",
        "큰 반등 시 부분 차익 실현 고려",
      ],
    };
    
    // ─────────────────────────────────────────────
    // PATH 2: SWAP - 손실 정리 + 기회 이동
    // ─────────────────────────────────────────────
    // 큰 손실 레버리지 정리 → 인덱스 ETF 이동
    const biggestLoser = [...positions].sort((a: any, b: any) => a.gainPct - b.gainPct)[0];
    const leverageValue = positions
      .filter((p: any) => p.isLeverage)
      .reduce((s: number, p: any) => s + p.marketValueUsd, 0);
    
    // 평균 S&P500 연간 10%, 레버리지 ETF 감가 제거 효과 연 5%
    const swapAnnualReturn = 12;  // 분산된 ETF 기대 수익률
    const swapAvoidedDecay = leverageValue * 0.15;  // 1년간 감가 회피 추정
    const swapEffectiveGain = swapAvoidedDecay + (currentValue * swapAnnualReturn / 100);
    const swapMonthsToRecover = Math.ceil(lossUsd / (swapEffectiveGain / 12));
    
    const swapPath = {
      name: "🔄 PATH 2 · 종목 교체 (SWAP)",
      nameShort: "SWAP",
      strategy: "swap",
      description: "레버리지/큰손실 종목 정리 → 검증된 인덱스 ETF 이동",
      requiredReturn: Math.round((lossUsd / currentValue) * 10000) / 100,
      estimatedMonths: swapMonthsToRecover,
      difficulty: "medium",
      successProbability: 75,
      pros: [
        `레버리지 감가 비용 회피 (연 ~${Math.round(leverageValue * 0.15).toLocaleString()}$)`,
        "S&P500 등 분산 투자로 변동성 축소",
        "세금 손실 공제 활용 가능",
      ],
      cons: [
        "확정 손실 발생 (되돌림 불가)",
        "매도 수수료 + 환전 비용",
        "반등 시 원래 종목 초과 수익 놓칠 수 있음",
      ],
      actionSteps: [
        `${biggestLoser.symbol} 등 큰 손실 포지션 정리`,
        "확보 현금 → TIGER S&P500 (360750.KS) 분할 매수",
        "월별 리밸런싱으로 비중 관리",
      ],
      keyTrades: [
        {
          action: "SELL",
          symbol: biggestLoser.symbol,
          name: biggestLoser.name,
          shares: biggestLoser.shares,
          estimatedCash: Math.round(biggestLoser.marketValueUsd),
          realizedLoss: Math.round(biggestLoser.gain),
        },
        {
          action: "BUY",
          symbol: "360750.KS",
          name: "TIGER S&P500",
          estimatedAmount: Math.round(biggestLoser.marketValueUsd),
          rationale: "분산 + 원화 안정 + 검증된 수익",
        },
      ],
    };
    
    // ─────────────────────────────────────────────
    // PATH 3: DCA - 평단 낮추기
    // ─────────────────────────────────────────────
    // 가장 큰 손실 본주(본주 한정, 레버리지는 DCA 위험)
    const spotLosers = positions.filter((p: any) => !p.isLeverage && p.gainPct < -20);
    const dcaTarget = spotLosers.sort((a: any, b: any) => a.gainPct - b.gainPct)[0];
    
    let dcaPath: any = null;
    if (dcaTarget) {
      const additionalShares = Math.ceil(dcaTarget.shares * 0.5);  // 50% 추가 매수
      const additionalCost = additionalShares * dcaTarget.currentPrice;
      const newTotalShares = dcaTarget.shares + additionalShares;
      const newTotalCost = dcaTarget.shares * dcaTarget.avgCost + additionalCost;
      const newAvgCost = newTotalCost / newTotalShares;
      const newBreakeven = ((newAvgCost - dcaTarget.currentPrice) / dcaTarget.currentPrice) * 100;
      
      dcaPath = {
        name: "💪 PATH 3 · 평단 낮추기 (DCA)",
        nameShort: "DCA",
        strategy: "dca",
        description: `${dcaTarget.symbol}에 추가 매수하여 평단가 하락`,
        requiredReturn: Math.round(newBreakeven * 10) / 10,
        estimatedMonths: Math.max(3, Math.ceil(newBreakeven / 3)),
        difficulty: "medium",
        successProbability: 60,
        pros: [
          `평단 $${dcaTarget.avgCost.toFixed(2)} → $${newAvgCost.toFixed(2)} 하락`,
          `본전 회복 필요 상승률 ${Math.abs(dcaTarget.gainPct).toFixed(1)}% → ${newBreakeven.toFixed(1)}% 축소`,
          "반등 시 레버리지 효과",
        ],
        cons: [
          `추가 자금 $${Math.round(additionalCost).toLocaleString()} 필요`,
          "추가 하락 시 손실 2배 누적 위험",
          "'물타기 금지' 원칙 위반 (전문가 조언)",
        ],
        actionSteps: [
          `${dcaTarget.symbol} ${additionalShares}주 추가 매수 ($${Math.round(additionalCost).toLocaleString()})`,
          `매수는 2-3회 분할 (시장 타이밍 위험 분산)`,
          `총 보유 $${Math.round(dcaTarget.marketValueUsd + additionalCost).toLocaleString()}에서 추가 매수 중단`,
        ],
        keyTrades: [
          {
            action: "BUY",
            symbol: dcaTarget.symbol,
            name: dcaTarget.name,
            shares: additionalShares,
            estimatedAmount: Math.round(additionalCost),
            rationale: "평단 낮추기 · 본주 한정",
          },
        ],
      };
    }
    
    // ─────────────────────────────────────────────
    // PATH 4: HEDGE - 헷지로 하방 방어
    // ─────────────────────────────────────────────
    // 큰 포지션에 인버스 ETF로 10-20% 헷지
    const hedgeBudget = Math.round(currentValue * 0.1);  // 10%
    
    const hedgePath = {
      name: "🛡️ PATH 4 · 헷지로 하방 방어",
      nameShort: "HEDGE",
      strategy: "hedge",
      description: "인버스 ETF 소량 매수로 추가 하락 방어",
      requiredReturn: 0,  // 헷지는 추가 상승 필요 없음
      estimatedMonths: 3,
      difficulty: "hard",
      successProbability: 55,
      pros: [
        "추가 하락 시 손실 일부 상쇄",
        "변동성 축소",
        "심리적 안정감",
      ],
      cons: [
        `헷지 비용 발생 ($${hedgeBudget.toLocaleString()})`,
        "상승 시 수익 감소",
        "타이밍 어려움 (진입/청산)",
      ],
      actionSteps: [
        `SQQQ (나스닥 −3x) 또는 ORCS (오라클 −1x) 소량 매수 ~$${hedgeBudget.toLocaleString()}`,
        "시장 반등 시 즉시 청산",
        "헷지 비율 전체의 5-10% 유지",
      ],
      keyTrades: [
        {
          action: "BUY",
          symbol: "ORCS",
          name: "Oracle Bear 1X",
          estimatedAmount: hedgeBudget,
          rationale: "오라클 집중 포트의 하방 헷지",
        },
      ],
    };
    
    // ─────────────────────────────────────────────
    // 추천 경로 (포트 상태별)
    // ─────────────────────────────────────────────
    let recommendedPath: string;
    let recommendation: string;
    
    const leveragePct = diagnosis.concentration.leveragePct;
    
    if (leveragePct > 60 && lossPctAbs > 20) {
      recommendedPath = "swap";
      recommendation = `레버리지 비중 ${leveragePct.toFixed(0)}% + 손실 ${lossPctAbs.toFixed(1)}%로 시간 감가 비용이 누적됩니다. SWAP 전략으로 레버리지 축소 + 분산이 가장 합리적입니다.`;
    } else if (lossPctAbs < 15) {
      recommendedPath = "hold";
      recommendation = `손실 규모가 상대적으로 작습니다. HOLD 전략으로 기다리며 필요 시 부분 조정이 적절합니다.`;
    } else if (lossPctAbs > 35) {
      recommendedPath = "swap";
      recommendation = `큰 손실 상태입니다. DCA는 위험하고, HOLD는 기회비용이 큽니다. SWAP으로 일부 정리 + 분산이 안전합니다.`;
    } else {
      recommendedPath = "swap";
      recommendation = `중간 규모 손실. 부분 SWAP으로 리스크를 낮추고 서서히 회복을 도모하세요.`;
    }
    
    const paths: any[] = [holdPath, swapPath];
    if (dcaPath) paths.push(dcaPath);
    paths.push(hedgePath);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        currentValue: Math.round(currentValue),
        originalCost: Math.round(originalCost),
        lossUsd: Math.round(lossUsd),
        lossPct: summary.totalGainPct,
      },
      recommendedPath,
      recommendation,
      paths,
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
