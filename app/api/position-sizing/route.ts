import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Position Sizing Calculator
// 
// "CDNS 얼마나 살까?" 같은 질문에 답:
// 1. Fixed Fractional (고정 %) - 포트의 n%
// 2. Volatility-Adjusted - 변동성 역산
// 3. Risk Per Trade - 손실 허용 금액 기반
// 4. Kelly Criterion - 승률 + 손익비 기반
// 
// 각 방식 결과 + AI 종합 추천 제공
// ═══════════════════════════════════════════════════════════

interface SizingRequest {
  symbol: string;
  confidence?: number;  // 0-100, 매수 확신도
  riskToleranceUsd?: number;  // 이 한 건에서 잃을 수 있는 최대 $
  portfolioPct?: number;  // 포트의 몇 %를 쓸지 (default 5%)
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const confidence = Number(url.searchParams.get("confidence") ?? "60");
    const riskToleranceUsd = Number(url.searchParams.get("riskUsd") ?? "300");
    const portfolioPct = Number(url.searchParams.get("portfolioPct") ?? "5");
    
    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol 필수" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    
    // 현재 포트 총액 계산
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: false,
        error: "포트 정보 없음",
      });
    }
    
    // 포트 총액 (현재가 기준)
    const portfolioSymbols = holdings.map((h: any) => h.symbol);
    const portfolioQuotes = await fetchYahooQuotes(portfolioSymbols);
    let totalPortfolioValue = 0;
    for (const h of holdings) {
      const q = portfolioQuotes.get(h.symbol);
      const currentPrice = q?.price ?? h.avg_cost;
      const valueUsd = h.currency === "KRW" 
        ? (h.shares * currentPrice) / 1472  // 환율 추정
        : h.shares * currentPrice;
      totalPortfolioValue += valueUsd;
    }
    
    // 대상 종목 정보
    const quotes = await fetchYahooQuotes([symbol]);
    const quote = quotes.get(symbol);
    if (!quote) {
      return NextResponse.json({ success: false, error: "시세 조회 실패" });
    }
    
    const currentPrice = quote.price;
    
    // 변동성 계산 (ATR 기반)
    const history = await fetchYahooHistory(symbol, "3mo");
    let atr = currentPrice * 0.02; // 기본값 2%
    if (history && history.length > 15) {
      const trs: number[] = [];
      for (let i = 1; i < history.length; i++) {
        const high = history[i].high ?? history[i].close;
        const low = history[i].low ?? history[i].close;
        const prevClose = history[i - 1].close;
        trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
      }
      atr = trs.slice(-14).reduce((a, b) => a + b, 0) / 14;
    }
    
    // ═════════════════════════════════════
    // 계산 방식 1: Fixed Fractional (포트 %)
    // ═════════════════════════════════════
    const fixedFractionalUsd = (totalPortfolioValue * portfolioPct) / 100;
    const fixedFractionalShares = Math.floor(fixedFractionalUsd / currentPrice);
    
    // ═════════════════════════════════════
    // 계산 방식 2: Risk Per Trade (손절선 기반)
    // 손절가는 현재가 - ATR × 2 로 가정
    // 허용 손실 / (현재가 - 손절가) = 주수
    // ═════════════════════════════════════
    const stopLossPrice = currentPrice - (atr * 2);
    const riskPerShare = currentPrice - stopLossPrice;
    const riskPerTradeShares = Math.floor(riskToleranceUsd / riskPerShare);
    const riskPerTradeUsd = riskPerTradeShares * currentPrice;
    
    // ═════════════════════════════════════
    // 계산 방식 3: Volatility-Adjusted
    // 변동성 높을수록 작게
    // ═════════════════════════════════════
    const volPct = (atr / currentPrice) * 100;
    const volAdjustedPct = Math.min(10, Math.max(1, 10 - volPct * 2));  // 1-10%
    const volAdjustedUsd = (totalPortfolioValue * volAdjustedPct) / 100;
    const volAdjustedShares = Math.floor(volAdjustedUsd / currentPrice);
    
    // ═════════════════════════════════════
    // 계산 방식 4: Kelly Criterion (간소화)
    // f = (bp - q) / b
    // b = 손익비 (takeProfit / stopLoss)
    // p = 승률 (신뢰도)
    // q = 1 - p
    // 실전에선 0.25 × Kelly 권장 (Half Kelly)
    // ═════════════════════════════════════
    const winRate = confidence / 100;  // 0-1
    const lossRate = 1 - winRate;
    const lossPerShare = riskPerShare;
    const gainPerShare = atr * 3;  // TP = ATR × 3 가정 (RR 1:1.5)
    const oddsB = gainPerShare / lossPerShare;
    const kellyF = (oddsB * winRate - lossRate) / oddsB;
    const halfKellyF = Math.max(0, kellyF * 0.25);  // Quarter Kelly (보수적)
    const kellyUsd = totalPortfolioValue * halfKellyF;
    const kellyShares = Math.floor(kellyUsd / currentPrice);
    
    // ═════════════════════════════════════
    // AI 종합 추천 (4방식의 최소값 보수적 기준)
    // ═════════════════════════════════════
    const candidates = [
      { method: "fixed", shares: fixedFractionalShares, usd: fixedFractionalUsd },
      { method: "risk", shares: riskPerTradeShares, usd: riskPerTradeUsd },
      { method: "volatility", shares: volAdjustedShares, usd: volAdjustedUsd },
      { method: "kelly", shares: kellyShares, usd: kellyUsd },
    ];
    
    // 4개 중 중간값(보수적)을 AI 추천
    candidates.sort((a, b) => a.shares - b.shares);
    const recommended = candidates[1];  // 두 번째로 작은 값 (중간 보수적)
    const recommendedShares = Math.max(1, recommended.shares);
    const recommendedUsd = recommendedShares * currentPrice;
    const recommendedPortPct = (recommendedUsd / totalPortfolioValue) * 100;
    
    // 추가 판단
    let recommendation = "";
    if (recommendedPortPct > 20) {
      recommendation = "⚠️ 포트 20% 이상 집중 · 소량부터 분할 매수 권장";
    } else if (recommendedPortPct < 1) {
      recommendation = "너무 소량 · 실질 효과 미미. 매매 비용 고려.";
    } else if (volPct > 4) {
      recommendation = `높은 변동성 (${volPct.toFixed(1)}%/일) · 분할 매수 + 타이트한 손절 필수`;
    } else {
      recommendation = `포트 ${recommendedPortPct.toFixed(1)}% 적정 규모 · 진입 가능`;
    }
    
    return NextResponse.json({
      success: true,
      symbol,
      currentPrice: Math.round(currentPrice * 100) / 100,
      atr: Math.round(atr * 100) / 100,
      volatilityPct: Math.round(volPct * 10) / 10,
      totalPortfolioValue: Math.round(totalPortfolioValue),
      inputs: {
        confidence,
        riskToleranceUsd,
        portfolioPct,
      },
      
      methods: {
        fixedFractional: {
          name: "고정 비율",
          description: `포트의 ${portfolioPct}%`,
          shares: fixedFractionalShares,
          usd: Math.round(fixedFractionalUsd),
          pros: "단순 · 예측 가능",
          cons: "변동성 무시",
        },
        riskPerTrade: {
          name: "손실 허용 기반",
          description: `최대 $${riskToleranceUsd} 손실 허용 + 손절 $${stopLossPrice.toFixed(2)}`,
          shares: riskPerTradeShares,
          usd: Math.round(riskPerTradeUsd),
          pros: "손절 시 최대 손실 제한",
          cons: "변동성 크면 소량",
          stopLoss: Math.round(stopLossPrice * 100) / 100,
        },
        volatilityAdjusted: {
          name: "변동성 조정",
          description: `변동성 ${volPct.toFixed(1)}% → ${volAdjustedPct.toFixed(1)}% 배정`,
          shares: volAdjustedShares,
          usd: Math.round(volAdjustedUsd),
          pros: "변동성 낮은 종목에 더 큰 배정",
          cons: "수익 기회 감소 가능",
        },
        kelly: {
          name: "Kelly Quarter",
          description: `승률 ${confidence}% · 손익비 1:${oddsB.toFixed(1)}`,
          shares: kellyShares,
          usd: Math.round(kellyUsd),
          kellyF: Math.round(halfKellyF * 1000) / 10,  // %
          pros: "수학적 최적",
          cons: "확신도 예측 어려움",
        },
      },
      
      aiRecommendation: {
        shares: recommendedShares,
        usd: Math.round(recommendedUsd),
        portfolioPct: Math.round(recommendedPortPct * 10) / 10,
        method: recommended.method,
        stopLossPrice: Math.round(stopLossPrice * 100) / 100,
        estimatedRisk: Math.round(recommendedShares * riskPerShare),
        note: recommendation,
      },
      
      splitStrategy: {
        firstBuy: Math.ceil(recommendedShares * 0.5),
        secondBuy: Math.ceil(recommendedShares * 0.3),
        thirdBuy: recommendedShares - Math.ceil(recommendedShares * 0.5) - Math.ceil(recommendedShares * 0.3),
        note: "3회 분할 매수로 평균가 평탄화",
      },
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
