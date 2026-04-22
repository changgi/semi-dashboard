import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory, fetchYahooSymbolInfo } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Deep Stock Analyzer
// 
// 단일 종목을 7가지 차원에서 종합 평가:
// 1. 현재가 vs 기술적 지표 (RSI, MA, ATR)
// 2. 52주 위치 (바닥/중간/고점)
// 3. 실적 일정
// 4. 포트폴리오 관계 (보유 중? 중복?)
// 5. 섹터 컨텍스트
// 6. 변동성 프로파일
// 7. AI 종합 평가
// 
// 결과: 0-100 점수 + 매수/매도/관망 판단 + 구체적 액션
// ═══════════════════════════════════════════════════════════

interface DeepAnalysis {
  symbol: string;
  name: string;
  country: string;
  currentPrice: number;
  
  // 1. Technical
  technical: {
    rsi14: number;
    rsiSignal: "oversold" | "neutral" | "overbought";
    sma20: number;
    sma50: number;
    sma200: number;
    priceVsSma20: number;
    priceVsSma50: number;
    priceVsSma200: number;
    atr14: number;
    volatility30d: number;
    volumeRatio: number;
    trendDirection: "uptrend" | "downtrend" | "sideways";
  };
  
  // 2. Position
  position52w: {
    high: number;
    low: number;
    distanceFromHigh: number;
    distanceFromLow: number;
    percentileRank: number;  // 0-100 (현재가가 52주 범위의 몇 % 지점?)
    zone: "bottom" | "lower_mid" | "upper_mid" | "top";
  };
  
  // 3. Performance
  performance: {
    day: number;
    week: number;
    month: number;
    quarter: number;
    year: number;
  };
  
  // 4. Earnings
  earnings: {
    nextDate: string | null;
    daysUntil: number | null;
    timing: string | null;
    importance: number | null;
    historicalReaction: number | null;  // 평균 실적 후 반응 %
  };
  
  // 5. Portfolio Context
  portfolio: {
    isHeld: boolean;
    heldShares: number;
    heldAvgCost: number;
    heldGainPct: number;
    relatedPositions: Array<{ symbol: string; relation: string }>;  // ORCX와 관련되면 ORCL
    concentrationWarning: boolean;
  };
  
  // 6. Sector
  sector: {
    name: string | null;
    peers: string[];
    sectorPerformance1m: number | null;
  };
  
  // 7. AI Judgment
  judgment: {
    score: number;  // 0-100
    action: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | "avoid";
    confidence: number;  // 0-100
    reasoning: string[];
    risks: string[];
    opportunities: string[];
    suggestedEntry: number | null;
    suggestedStopLoss: number | null;
    suggestedTakeProfit: number | null;
  };
}

function approximateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + (avgGain / avgLoss));
}

function sma(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function volatility(prices: number[], period: number = 30): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  const returns = slice.slice(1).map((p, i) => (p - slice[i]) / slice[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function calculateATR(history: any[], period: number = 14): number {
  if (history.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const high = history[i].high ?? history[i].close;
    const low = history[i].low ?? history[i].close;
    const prevClose = history[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    
    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol 필수" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    
    // 병렬 데이터 로드
    const [quotesRes, history, info] = await Promise.all([
      fetchYahooQuotes([symbol]),
      fetchYahooHistory(symbol, "1y"),
      fetchYahooSymbolInfo(symbol).catch(() => null),
    ]);
    
    const quote = quotesRes.get(symbol);
    if (!quote || !history || history.length < 30) {
      return NextResponse.json({
        success: false,
        error: `${symbol}: 시세 또는 이력 데이터 부족`,
      });
    }
    
    const closes = history.map((h: any) => h.close).filter((p: number) => p > 0);
    const currentPrice = quote.price;
    
    // ─────────────────────────────────────────────
    // 1. Technical Analysis
    // ─────────────────────────────────────────────
    const rsi14 = approximateRSI(closes, 14);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const atr = calculateATR(history, 14);
    const vol30 = volatility(closes, 30);
    
    const volumes = history.map((h: any) => h.volume ?? 0);
    const avgVolume20 = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
    const volumeRatio = avgVolume20 > 0 ? (volumes[volumes.length - 1] ?? 0) / avgVolume20 : 1;
    
    const trendDirection: "uptrend" | "downtrend" | "sideways" =
      currentPrice > sma20 && sma20 > sma50 ? "uptrend" :
      currentPrice < sma20 && sma20 < sma50 ? "downtrend" : "sideways";
    
    // ─────────────────────────────────────────────
    // 2. 52-week Position
    // ─────────────────────────────────────────────
    const yearData = history.slice(-252);
    const week52High = Math.max(...yearData.map((h: any) => h.high ?? h.close));
    const week52Low = Math.min(...yearData.map((h: any) => h.low ?? h.close));
    const distanceFromHigh = ((week52High - currentPrice) / week52High) * 100;
    const distanceFromLow = ((currentPrice - week52Low) / week52Low) * 100;
    const percentileRank = week52High === week52Low ? 50 
      : ((currentPrice - week52Low) / (week52High - week52Low)) * 100;
    const zone: "bottom" | "lower_mid" | "upper_mid" | "top" =
      percentileRank < 25 ? "bottom" :
      percentileRank < 50 ? "lower_mid" :
      percentileRank < 75 ? "upper_mid" : "top";
    
    // ─────────────────────────────────────────────
    // 3. Performance
    // ─────────────────────────────────────────────
    const perfFromDaysAgo = (days: number): number => {
      if (closes.length < days + 1) return 0;
      const past = closes[closes.length - 1 - days];
      return past > 0 ? ((currentPrice - past) / past) * 100 : 0;
    };
    
    // ─────────────────────────────────────────────
    // 4. Earnings
    // ─────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const { data: earningsData } = await supabase
      .from("earnings_schedule")
      .select("*")
      .eq("symbol", symbol)
      .gte("earnings_date", today)
      .order("earnings_date", { ascending: true })
      .limit(1);
    
    const nextEarnings = earningsData?.[0];
    const daysUntilEarnings = nextEarnings
      ? Math.ceil((new Date(nextEarnings.earnings_date).getTime() - Date.now()) / 86400000)
      : null;
    
    // ─────────────────────────────────────────────
    // 5. Portfolio Context
    // ─────────────────────────────────────────────
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    const heldPosition = holdings?.find((h: any) => h.symbol === symbol);
    
    // 관련 포지션 (같은 기초자산)
    const { data: universeData } = await supabase
      .from("symbol_universe")
      .select("symbol, name_ko, name_en, gics_sector, related_etfs, semi_tags")
      .eq("symbol", symbol)
      .maybeSingle();
    
    const symbolMeta = universeData;
    const relatedPositions: Array<{ symbol: string; relation: string }> = [];
    if (holdings && symbolMeta) {
      for (const h of holdings) {
        // 같은 기초자산의 레버리지 ETF 감지
        if (h.symbol.startsWith(symbol.substring(0, 3)) && h.symbol !== symbol) {
          relatedPositions.push({ symbol: h.symbol, relation: "같은 기초자산 (레버리지 or 본주)" });
        }
      }
    }
    
    // ─────────────────────────────────────────────
    // 6. Sector Info
    // ─────────────────────────────────────────────
    let sectorName: string | null = null;
    let peers: string[] = [];
    if (symbolMeta) {
      sectorName = symbolMeta.gics_sector;
      if (sectorName) {
        const { data: sectorPeers } = await supabase
          .from("symbol_universe")
          .select("symbol")
          .eq("gics_sector", sectorName)
          .neq("symbol", symbol)
          .eq("in_sp500", true)
          .limit(5);
        peers = (sectorPeers ?? []).map((p: any) => p.symbol);
      }
    }
    
    // ─────────────────────────────────────────────
    // 7. AI Judgment
    // ─────────────────────────────────────────────
    let score = 50;
    const reasoning: string[] = [];
    const risks: string[] = [];
    const opportunities: string[] = [];
    
    // Technical score
    if (rsi14 < 30) {
      score += 15;
      opportunities.push(`RSI ${rsi14.toFixed(0)} 과매도 구간 (반등 가능성)`);
    } else if (rsi14 > 70) {
      score -= 15;
      risks.push(`RSI ${rsi14.toFixed(0)} 과매수 (단기 조정 가능)`);
    } else {
      reasoning.push(`RSI ${rsi14.toFixed(0)} 중립`);
    }
    
    if (trendDirection === "uptrend") {
      score += 10;
      opportunities.push("상승 추세 (SMA20 > SMA50)");
    } else if (trendDirection === "downtrend") {
      score -= 10;
      risks.push("하락 추세 지속");
    }
    
    // Position score
    if (zone === "bottom") {
      score += 10;
      opportunities.push(`52주 저가 대비 +${distanceFromLow.toFixed(1)}% (바닥 영역)`);
    } else if (zone === "top") {
      score -= 5;
      reasoning.push(`52주 고가 근접 (${distanceFromHigh.toFixed(1)}% 아래)`);
      if (distanceFromHigh < 3) {
        opportunities.push("52주 고가 돌파 임박 (거래량 필요)");
      }
    }
    
    // Volume
    if (volumeRatio > 2) {
      opportunities.push(`거래량 폭증 ${volumeRatio.toFixed(1)}배 (큰 관심)`);
      score += 5;
    } else if (volumeRatio < 0.5) {
      reasoning.push(`거래량 저조 ${volumeRatio.toFixed(1)}배`);
    }
    
    // Volatility
    if (vol30 > 50) {
      risks.push(`높은 변동성 ${vol30.toFixed(0)}% (연환산)`);
      score -= 5;
    } else if (vol30 < 20) {
      reasoning.push(`안정적 변동성 ${vol30.toFixed(0)}%`);
    }
    
    // Earnings
    if (daysUntilEarnings !== null && daysUntilEarnings <= 7 && daysUntilEarnings > 0) {
      risks.push(`실적 D-${daysUntilEarnings} 임박 (변동성 주의)`);
    }
    
    // Portfolio
    if (heldPosition) {
      if (heldPosition.shares * heldPosition.avg_cost > 5000) {
        reasoning.push(`이미 보유 중 ($${(heldPosition.shares * currentPrice).toFixed(0)})`);
      }
    }
    if (relatedPositions.length >= 2) {
      risks.push(`포트에 관련 포지션 ${relatedPositions.length}개 (중복 노출)`);
      score -= 10;
    }
    
    // 최종 점수 정리
    score = Math.max(0, Math.min(100, score));
    
    let action: DeepAnalysis["judgment"]["action"];
    if (score >= 75) action = "strong_buy";
    else if (score >= 60) action = "buy";
    else if (score >= 45) action = "hold";
    else if (score >= 30) action = "sell";
    else if (score >= 15) action = "strong_sell";
    else action = "avoid";
    
    // 포트 보유 + 점수 낮음 → "sell"로 변경
    if (heldPosition && score < 45) {
      action = "sell";
    }
    
    // 진입가, 손절, 익절 제안
    const suggestedEntry = zone === "bottom" || zone === "lower_mid" 
      ? currentPrice
      : currentPrice * 0.97;  // 고점이면 3% 조정 후 진입
    const suggestedStopLoss = currentPrice - (atr * 2);
    const suggestedTakeProfit = currentPrice + (atr * 4);
    
    const confidence = Math.min(100, 40 + Math.abs(score - 50));  // 50점에서 멀수록 확신
    
    const analysis: DeepAnalysis = {
      symbol,
      name: symbolMeta?.name_ko ?? symbolMeta?.name_en ?? info?.longName ?? symbol,
      country: symbol.includes(".KS") ? "KR" : symbol.includes(".T") ? "JP" : "US",
      currentPrice,
      technical: {
        rsi14: Math.round(rsi14),
        rsiSignal: rsi14 < 30 ? "oversold" : rsi14 > 70 ? "overbought" : "neutral",
        sma20: Math.round(sma20 * 100) / 100,
        sma50: Math.round(sma50 * 100) / 100,
        sma200: Math.round(sma200 * 100) / 100,
        priceVsSma20: ((currentPrice / sma20 - 1) * 100),
        priceVsSma50: ((currentPrice / sma50 - 1) * 100),
        priceVsSma200: ((currentPrice / sma200 - 1) * 100),
        atr14: Math.round(atr * 100) / 100,
        volatility30d: Math.round(vol30 * 10) / 10,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        trendDirection,
      },
      position52w: {
        high: Math.round(week52High * 100) / 100,
        low: Math.round(week52Low * 100) / 100,
        distanceFromHigh: Math.round(distanceFromHigh * 10) / 10,
        distanceFromLow: Math.round(distanceFromLow * 10) / 10,
        percentileRank: Math.round(percentileRank),
        zone,
      },
      performance: {
        day: quote.changePct ?? 0,
        week: perfFromDaysAgo(5),
        month: perfFromDaysAgo(21),
        quarter: perfFromDaysAgo(63),
        year: perfFromDaysAgo(252),
      },
      earnings: {
        nextDate: nextEarnings?.earnings_date ?? null,
        daysUntil: daysUntilEarnings,
        timing: nextEarnings?.timing ?? null,
        importance: nextEarnings?.importance ?? null,
        historicalReaction: null,  // TODO
      },
      portfolio: {
        isHeld: !!heldPosition,
        heldShares: heldPosition?.shares ?? 0,
        heldAvgCost: heldPosition?.avg_cost ?? 0,
        heldGainPct: heldPosition ? ((currentPrice / heldPosition.avg_cost - 1) * 100) : 0,
        relatedPositions,
        concentrationWarning: relatedPositions.length >= 2,
      },
      sector: {
        name: sectorName,
        peers,
        sectorPerformance1m: null,  // TODO
      },
      judgment: {
        score: Math.round(score),
        action,
        confidence: Math.round(confidence),
        reasoning,
        risks,
        opportunities,
        suggestedEntry: Math.round(suggestedEntry * 100) / 100,
        suggestedStopLoss: Math.round(suggestedStopLoss * 100) / 100,
        suggestedTakeProfit: Math.round(suggestedTakeProfit * 100) / 100,
      },
    };
    
    return NextResponse.json({
      success: true,
      analysis,
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
