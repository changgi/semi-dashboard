import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Exit Strategy API
// 
// 각 보유 포지션별:
// - Take Profit (익절가) - 여러 단계 (R1, R2, R3)
// - Stop Loss (손절가)
// - Trailing Stop (추적 손절)
// - Break-even (본전가)
// - 현재가 대비 % 계산
// 
// 기술적 지표 기반:
// - ATR (Average True Range) - 변동성 기반 손절폭
// - 52주 고저점
// - 평단 대비 기준
// ═══════════════════════════════════════════════════════════

interface ExitStrategy {
  symbol: string;
  name: string;
  currentPrice: number;
  avgCost: number;
  shares: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  isLeverage: boolean;
  underlyingAsset: string;
  volatility30d: number;
  atr14: number;  // Average True Range
  // 레벨
  stopLoss: {
    price: number;
    pctFromCurrent: number;
    type: "atr" | "fixed" | "technical";
    reasoning: string;
  };
  breakeven: {
    price: number;
    pctFromCurrent: number;
    pctGainNeeded: number;
  };
  takeProfit: {
    r1: { price: number; pctFromCurrent: number; reasoning: string };  // 1차 익절
    r2: { price: number; pctFromCurrent: number; reasoning: string };  // 2차 익절
    r3: { price: number; pctFromCurrent: number; reasoning: string };  // 3차 익절
  };
  trailingStop: {
    price: number;
    pctFromCurrent: number;
    pctFromPeak: number;
  };
  recommendation: {
    action: "hold" | "set_stop" | "take_profit" | "urgent_review";
    urgency: "low" | "medium" | "high";
    message: string;
  };
}

function calculateATR(history: any[], period: number = 14): number {
  if (history.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const high = history[i].high ?? history[i].close;
    const low = history[i].low ?? history[i].close;
    const prevClose = history[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  const recentTRs = trs.slice(-period);
  return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
}

function calculateVolatility(closes: number[], period: number = 30): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const returns = slice.slice(1).map((p, i) => (p - slice[i]) / slice[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    
    // 1. 포트폴리오 로드
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        strategies: [],
      });
    }
    
    // 2. Symbol Universe 메타 + 시세
    const symbols = [...new Set(holdings.map((h: any) => h.symbol))];
    const { data: universe } = await supabase
      .from("symbol_universe")
      .select("symbol, name_ko, semi_tags, related_etfs")
      .in("symbol", symbols);
    
    const universeMap = new Map<string, any>();
    for (const u of (universe ?? [])) {
      universeMap.set(u.symbol, u);
    }
    
    const quotes = await fetchYahooQuotes(symbols);
    
    // 3. 각 포지션별 전략 계산
    const strategies: ExitStrategy[] = [];
    
    for (const h of holdings) {
      const meta = universeMap.get(h.symbol);
      const quote = quotes.get(h.symbol);
      const currentPrice = quote?.price ?? h.avg_cost;
      
      // History 로드 (3개월)
      const history = await fetchYahooHistory(h.symbol, "3mo");
      if (!history || history.length < 14) continue;
      
      const closes = history.map((h: any) => h.close).filter((p: number) => p > 0);
      const atr = calculateATR(history, 14);
      const vol30 = calculateVolatility(closes, 30);
      
      const week52Data = history.slice(-252);
      const week52High = Math.max(...week52Data.map((h: any) => h.high ?? h.close));
      const week52Low = Math.min(...week52Data.map((h: any) => h.low ?? h.close));
      
      // 최근 30일 최고가 (trailing stop 기준)
      const recent30High = Math.max(...history.slice(-30).map((h: any) => h.high ?? h.close));
      
      const tags: string[] = meta?.semi_tags ?? [];
      const isLeverage = tags.includes("레버리지") || tags.includes("2x") || tags.includes("3x");
      const underlyingAsset = meta?.related_etfs?.[0] ?? h.symbol;
      
      const shares = h.shares;
      const avgCost = h.avg_cost;
      const marketValue = shares * currentPrice;
      const totalCost = shares * avgCost;
      const gain = marketValue - totalCost;
      const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
      
      // ═════════════════════════════════════
      // Stop Loss 계산
      // ═════════════════════════════════════
      let stopLoss: ExitStrategy["stopLoss"];
      if (isLeverage) {
        // 레버리지: 타이트한 -10% ATR 기반
        const atrStop = currentPrice - (atr * 1.5);
        const fixedStop = currentPrice * 0.9;
        const stopPrice = Math.max(atrStop, fixedStop);
        stopLoss = {
          price: Math.round(stopPrice * 100) / 100,
          pctFromCurrent: ((stopPrice - currentPrice) / currentPrice) * 100,
          type: "atr",
          reasoning: "레버리지 상품: ATR 1.5배 또는 -10% 중 타이트한 값",
        };
      } else if (gainPct > 0) {
        // 수익 중: trailing stop (최근 고점 -7%)
        const trailingStop = recent30High * 0.93;
        stopLoss = {
          price: Math.round(trailingStop * 100) / 100,
          pctFromCurrent: ((trailingStop - currentPrice) / currentPrice) * 100,
          type: "technical",
          reasoning: `최근 30일 고점 ($${recent30High.toFixed(2)}) 대비 -7% 추적 손절`,
        };
      } else {
        // 손실 중 본주: 52주 저가 또는 ATR 2배
        const atrStop = currentPrice - (atr * 2);
        const lowStop = week52Low;
        const stopPrice = Math.max(atrStop, lowStop);
        stopLoss = {
          price: Math.round(stopPrice * 100) / 100,
          pctFromCurrent: ((stopPrice - currentPrice) / currentPrice) * 100,
          type: lowStop > atrStop ? "technical" : "atr",
          reasoning: lowStop > atrStop ? "52주 저가 지지선" : "ATR 2배 손절폭",
        };
      }
      
      // ═════════════════════════════════════
      // Breakeven
      // ═════════════════════════════════════
      const breakeven = {
        price: avgCost,
        pctFromCurrent: ((avgCost - currentPrice) / currentPrice) * 100,
        pctGainNeeded: gainPct < 0 ? Math.abs(gainPct / (100 + gainPct)) * 100 : 0,
      };
      
      // ═════════════════════════════════════
      // Take Profit (3단계)
      // ═════════════════════════════════════
      let takeProfit: ExitStrategy["takeProfit"];
      if (gainPct > 0) {
        // 이미 수익 중: 현재가 기준
        takeProfit = {
          r1: {
            price: Math.round(currentPrice * 1.05 * 100) / 100,
            pctFromCurrent: 5,
            reasoning: "+5% 1차 (30% 물량 정리)",
          },
          r2: {
            price: Math.round(currentPrice * 1.12 * 100) / 100,
            pctFromCurrent: 12,
            reasoning: "+12% 2차 (40% 추가 정리)",
          },
          r3: {
            price: Math.round(currentPrice * 1.25 * 100) / 100,
            pctFromCurrent: 25,
            reasoning: "+25% 3차 (잔여 30% 청산)",
          },
        };
      } else if (Math.abs(gainPct) < 20) {
        // 소폭 손실: 본전 + 단계적 익절
        takeProfit = {
          r1: {
            price: avgCost,
            pctFromCurrent: ((avgCost - currentPrice) / currentPrice) * 100,
            reasoning: `본전가 $${avgCost.toFixed(2)} (30% 정리로 리스크 축소)`,
          },
          r2: {
            price: Math.round(avgCost * 1.1 * 100) / 100,
            pctFromCurrent: ((avgCost * 1.1 - currentPrice) / currentPrice) * 100,
            reasoning: "평단 +10% (40% 추가 정리)",
          },
          r3: {
            price: Math.round(week52High * 0.95 * 100) / 100,
            pctFromCurrent: ((week52High * 0.95 - currentPrice) / currentPrice) * 100,
            reasoning: `52주 고가 95% 수준 ($${(week52High * 0.95).toFixed(2)})`,
          },
        };
      } else {
        // 큰 손실: 점진적 회복 구간
        takeProfit = {
          r1: {
            price: Math.round(currentPrice * 1.15 * 100) / 100,
            pctFromCurrent: 15,
            reasoning: "기술적 반등 +15% (부분 익절로 현금화)",
          },
          r2: {
            price: Math.round(currentPrice * 1.3 * 100) / 100,
            pctFromCurrent: 30,
            reasoning: "중간 회복 +30% (절반 정리)",
          },
          r3: {
            price: avgCost,
            pctFromCurrent: ((avgCost - currentPrice) / currentPrice) * 100,
            reasoning: `본전가 도달 시 잔여 전량 매도 (${breakeven.pctGainNeeded.toFixed(0)}% 상승 필요)`,
          },
        };
      }
      
      // ═════════════════════════════════════
      // Trailing Stop
      // ═════════════════════════════════════
      const trailingPct = isLeverage ? 8 : vol30 > 40 ? 10 : 7;
      const trailingPrice = recent30High * (1 - trailingPct / 100);
      const trailingStop = {
        price: Math.round(trailingPrice * 100) / 100,
        pctFromCurrent: ((trailingPrice - currentPrice) / currentPrice) * 100,
        pctFromPeak: trailingPct,
      };
      
      // ═════════════════════════════════════
      // 추천 액션
      // ═════════════════════════════════════
      let recommendation: ExitStrategy["recommendation"];
      if (isLeverage && gainPct < -30) {
        recommendation = {
          action: "urgent_review",
          urgency: "high",
          message: `🚨 레버리지 큰 손실. 손절가 $${stopLoss.price.toFixed(2)} 또는 기술적 반등 시 부분 정리 권장`,
        };
      } else if (gainPct < -20) {
        recommendation = {
          action: "set_stop",
          urgency: "medium",
          message: `⚠️ 추가 하락 방지를 위한 손절선 $${stopLoss.price.toFixed(2)} 설정 권장`,
        };
      } else if (gainPct > 15) {
        recommendation = {
          action: "take_profit",
          urgency: "medium",
          message: `💰 수익 +${gainPct.toFixed(1)}%. 1차 익절가 $${takeProfit.r1.price.toFixed(2)} 도달 시 30% 정리 준비`,
        };
      } else if (gainPct > 5) {
        recommendation = {
          action: "hold",
          urgency: "low",
          message: `✅ 수익 보유 중. Trailing stop $${trailingStop.price.toFixed(2)} 주시`,
        };
      } else {
        recommendation = {
          action: "hold",
          urgency: "low",
          message: `📊 현상 유지. 손절가 $${stopLoss.price.toFixed(2)} 설정 후 관찰`,
        };
      }
      
      strategies.push({
        symbol: h.symbol,
        name: meta?.name_ko ?? h.name ?? h.symbol,
        currentPrice: Math.round(currentPrice * 100) / 100,
        avgCost,
        shares,
        marketValue: Math.round(marketValue * 100) / 100,
        gain: Math.round(gain * 100) / 100,
        gainPct: Math.round(gainPct * 100) / 100,
        isLeverage,
        underlyingAsset,
        volatility30d: Math.round(vol30 * 10) / 10,
        atr14: Math.round(atr * 100) / 100,
        stopLoss,
        breakeven,
        takeProfit,
        trailingStop,
        recommendation,
      });
    }
    
    // 긴급도 순 정렬
    strategies.sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return urgencyOrder[a.recommendation.urgency] - urgencyOrder[b.recommendation.urgency];
    });
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      strategies,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      strategies: [],
    });
  }
}
