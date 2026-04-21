import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Opportunity Finder API
// 
// 수익률을 높일 매수 기회를 자동 탐지:
// 1. Momentum         - 5일 상승 모멘텀 + 거래량 증가
// 2. Oversold Bounce  - 과매도 후 반등 시작 (손실 복구 유리)
// 3. Breakout         - 52주 고가 근처 + 돌파
// 4. Pre-Earnings     - 실적 앞두고 상승세
// 5. Value            - 52주 저가 대비 상승, 섹터 바닥
// 
// 모드:
//   mode=recovery : 손실 복구용 (Oversold + Value 우선)
//   mode=growth   : 성장 추구용 (Momentum + Breakout 우선)
//   mode=balanced : 균형 (기본값)
// ═══════════════════════════════════════════════════════════

interface Signal {
  type: "momentum" | "oversold_bounce" | "breakout" | "pre_earnings" | "value";
  strength: number;  // 0-100
  description: string;
}

interface Opportunity {
  symbol: string;
  name: string;
  country: string;
  currency: string;
  currentPrice: number;
  dayChangePct: number;
  week52High: number;
  week52Low: number;
  distanceFromHigh: number;  // % below 52w high
  distanceFromLow: number;   // % above 52w low
  volatility30d: number;
  priceChange5d: number;
  priceChange20d: number;
  priceChange52w: number;
  volumeRatio: number;  // current vs 20d avg
  rsi14: number;  // approximation
  sma20: number;
  sma50: number;
  signals: Signal[];
  totalScore: number;  // 0-100
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
  // 카일님 포트 컨텍스트
  inPortfolio: boolean;
  portfolioAction?: string;  // "add", "not_recommended", "already_full_exposure"
  sector?: string;
  isSemi?: boolean;
  indexes?: string[];
}

// RSI 근사 계산
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
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

async function analyzeSymbol(
  symbol: string,
  meta: any,
  quote: any,
  earningsMap: Map<string, any>
): Promise<Opportunity | null> {
  try {
    // 가격 히스토리 (1개월로 축소 - 성능)
    const history = await fetchYahooHistory(symbol, "3mo");
    if (!history || history.length < 20) return null;
    
    const closes = history.map((h: any) => h.close).filter((p: number) => p > 0);
    if (closes.length < 20) return null;
    
    const currentPrice = quote?.price ?? closes[closes.length - 1];
    const week52Data = history.slice(-252);
    const week52High = Math.max(...week52Data.map((h: any) => h.high ?? h.close));
    const week52Low = Math.min(...week52Data.map((h: any) => h.low ?? h.close));
    
    const priceChange5d = closes.length >= 6 ? ((currentPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
    const priceChange20d = closes.length >= 21 ? ((currentPrice - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;
    const priceChange52w = closes.length >= 252 ? ((currentPrice - closes[0]) / closes[0]) * 100 : ((currentPrice - closes[0]) / closes[0]) * 100;
    
    const distanceFromHigh = ((week52High - currentPrice) / week52High) * 100;
    const distanceFromLow = ((currentPrice - week52Low) / week52Low) * 100;
    
    const vol30 = volatility(closes, 30);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const rsi14 = approximateRSI(closes, 14);
    
    // 거래량 비율
    const volumes = history.map((h: any) => h.volume ?? 0).filter((v: number) => v > 0);
    const avgVolume20 = volumes.length >= 20 ? volumes.slice(-21, -1).reduce((a: number, b: number) => a + b, 0) / 20 : 0;
    const currentVolume = volumes[volumes.length - 1] ?? 0;
    const volumeRatio = avgVolume20 > 0 ? currentVolume / avgVolume20 : 1;
    
    // ─────────────────────────────────────────────
    // 시그널 감지
    // ─────────────────────────────────────────────
    const signals: Signal[] = [];
    
    // 1. MOMENTUM (5d +5% + volume 1.3x + above SMA20)
    if (priceChange5d > 5 && volumeRatio > 1.3 && currentPrice > sma20) {
      const strength = Math.min(100, priceChange5d * 5 + (volumeRatio - 1) * 20);
      signals.push({
        type: "momentum",
        strength,
        description: `5일 +${priceChange5d.toFixed(1)}% + 거래량 ${volumeRatio.toFixed(1)}배`,
      });
    }
    
    // 2. OVERSOLD_BOUNCE (RSI < 40 + 가격 저점 + 반등 시작)
    if (rsi14 < 40 && distanceFromLow < 15 && priceChange5d > 0 && priceChange20d < -5) {
      const strength = Math.min(100, (40 - rsi14) * 2 + priceChange5d * 3);
      signals.push({
        type: "oversold_bounce",
        strength,
        description: `RSI ${rsi14.toFixed(0)} + 52주저가 근처 + 반등 시작 (5d +${priceChange5d.toFixed(1)}%)`,
      });
    }
    
    // 3. BREAKOUT (52주 고가 근처 + 거래량 급증)
    if (distanceFromHigh < 5 && volumeRatio > 1.5) {
      const strength = Math.min(100, (5 - distanceFromHigh) * 15 + (volumeRatio - 1) * 15);
      signals.push({
        type: "breakout",
        strength,
        description: `52주 고가 ${distanceFromHigh.toFixed(1)}% 아래 + 거래량 ${volumeRatio.toFixed(1)}배 폭증`,
      });
    }
    
    // 4. PRE_EARNINGS (실적 D-1~D-7 + 모멘텀 상승)
    const earnings = earningsMap.get(symbol);
    if (earnings && earnings.daysUntil <= 7 && earnings.daysUntil > 0 && priceChange5d > 3) {
      const strength = Math.min(100, (8 - earnings.daysUntil) * 10 + priceChange5d * 3);
      signals.push({
        type: "pre_earnings",
        strength,
        description: `실적 D-${earnings.daysUntil} (${earnings.date}) + 5d +${priceChange5d.toFixed(1)}% 모멘텀`,
      });
    }
    
    // 5. VALUE (52주 저가 대비 20%+ 상승 시작 + RSI 40-60)
    if (distanceFromLow > 10 && distanceFromLow < 30 && rsi14 > 40 && rsi14 < 60 && priceChange20d > -10 && priceChange20d < 5) {
      const strength = Math.min(100, distanceFromLow + Math.abs(50 - rsi14) * -1 + 30);
      signals.push({
        type: "value",
        strength,
        description: `52주 저가 대비 +${distanceFromLow.toFixed(1)}% · 바닥 다지기 패턴`,
      });
    }
    
    if (signals.length === 0) return null;
    
    // ─────────────────────────────────────────────
    // 종합 스코어 (상위 2개 신호 평균 + 보너스)
    // ─────────────────────────────────────────────
    const sortedSignals = [...signals].sort((a, b) => b.strength - a.strength);
    const topStrengths = sortedSignals.slice(0, 2).map(s => s.strength);
    const baseScore = topStrengths.reduce((a, b) => a + b, 0) / topStrengths.length;
    const diversityBonus = Math.min(20, signals.length * 5);
    const totalScore = Math.min(100, baseScore + diversityBonus);
    
    // 리스크 레벨
    const riskLevel: "low" | "medium" | "high" = 
      vol30 > 60 ? "high" :
      vol30 > 35 ? "medium" :
      "low";
    
    // 추천 문구 생성
    let recommendation = "";
    const topSignal = sortedSignals[0];
    if (topSignal.type === "oversold_bounce") {
      recommendation = "💎 과매도 반등 기회. 분할 매수 전략 유리";
    } else if (topSignal.type === "momentum") {
      recommendation = "🚀 강한 상승 모멘텀 진행 중";
    } else if (topSignal.type === "breakout") {
      recommendation = "⚡ 52주 고가 돌파 임박";
    } else if (topSignal.type === "pre_earnings") {
      recommendation = "📊 실적 전 포지셔닝 기회";
    } else if (topSignal.type === "value") {
      recommendation = "🏛️ 가치 + 바닥 다지기";
    }
    
    return {
      symbol,
      name: meta?.name_ko ?? meta?.name_en ?? symbol,
      country: meta?.country ?? "US",
      currency: meta?.currency ?? "USD",
      currentPrice,
      dayChangePct: quote?.changePct ?? 0,
      week52High,
      week52Low,
      distanceFromHigh: Math.round(distanceFromHigh * 10) / 10,
      distanceFromLow: Math.round(distanceFromLow * 10) / 10,
      volatility30d: Math.round(vol30 * 10) / 10,
      priceChange5d: Math.round(priceChange5d * 10) / 10,
      priceChange20d: Math.round(priceChange20d * 10) / 10,
      priceChange52w: Math.round(priceChange52w * 10) / 10,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      rsi14: Math.round(rsi14),
      sma20: Math.round(sma20 * 100) / 100,
      sma50: Math.round(sma50 * 100) / 100,
      signals: sortedSignals,
      totalScore: Math.round(totalScore),
      riskLevel,
      recommendation,
      inPortfolio: false,  // 나중에 세팅
      sector: meta?.gics_sector,
      isSemi: meta?.is_semi,
      indexes: [
        meta?.in_sp500 && "S&P500",
        meta?.in_nasdaq100 && "NASDAQ100",
        meta?.in_kospi100 && "KOSPI100",
      ].filter(Boolean),
    };
  } catch (e) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") ?? "balanced") as "recovery" | "growth" | "balanced";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "15"), 30);
    const minScore = Number(url.searchParams.get("minScore") ?? "40");
    
    const supabase = createAdmin();
    
    // 1. Symbol Universe 스캔 대상 로드 (스마트 선택)
    // S&P500 + NASDAQ100 + KOSPI100 + 반도체 주요 종목
    // 레버리지/인버스는 제외 (원주식으로 판단 후 관련 ETF 제시)
    const { data: universe } = await supabase
      .from("symbol_universe")
      .select("*")
      .eq("is_active", true)
      .or("in_sp500.eq.true,in_nasdaq100.eq.true,is_semi.eq.true")
      .eq("is_etf", false)  // ETF 제외 (나중에 별도 스캔)
      .limit(50);  // 50종목 (Vercel 60초 타임아웃 고려)
    
    if (!universe || universe.length === 0) {
      return NextResponse.json({ success: false, error: "Universe empty", opportunities: [] });
    }
    
    const symbols = universe.map((u: any) => u.symbol);
    
    // 2. 카일님 포트 로드
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("symbol")
      .eq("is_active", true);
    const portfolioSymbols = new Set((holdings ?? []).map((h: any) => h.symbol));
    
    // 3. 실적 일정 맵
    const today = new Date();
    const twoWeeksLater = new Date(Date.now() + 14 * 86400000);
    const { data: earnings } = await supabase
      .from("earnings_schedule")
      .select("symbol, earnings_date, company_name, importance, timing")
      .gte("earnings_date", today.toISOString().split("T")[0])
      .lte("earnings_date", twoWeeksLater.toISOString().split("T")[0]);
    
    const earningsMap = new Map<string, any>();
    for (const e of (earnings ?? [])) {
      const daysUntil = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
      earningsMap.set(e.symbol, { ...e, daysUntil, date: e.earnings_date });
    }
    
    // 4. 실시간 시세 (병렬)
    const quotes = await fetchYahooQuotes(symbols);
    
    // 5. 병렬 분석 (타임박스 적용 - 45초 초과 시 중단)
    const opportunities: Opportunity[] = [];
    const chunkSize = 20;
    const startTime = Date.now();
    const timeBudgetMs = 45000;  // 45초
    let processedCount = 0;
    
    for (let i = 0; i < symbols.length; i += chunkSize) {
      if (Date.now() - startTime > timeBudgetMs) {
        console.warn(`[opportunities] 시간 예산 초과, ${processedCount}/${symbols.length} 처리 후 중단`);
        break;
      }
      const chunk = symbols.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(sym => {
          const meta = universe.find((u: any) => u.symbol === sym);
          return analyzeSymbol(sym, meta, quotes.get(sym), earningsMap);
        })
      );
      for (const r of results) {
        processedCount++;
        if (r && r.totalScore >= minScore) {
          r.inPortfolio = portfolioSymbols.has(r.symbol);
          opportunities.push(r);
        }
      }
    }
    
    // 6. 모드별 가중치 재계산
    const applyModeWeights = (opp: Opportunity): number => {
      const baseScore = opp.totalScore;
      if (mode === "recovery") {
        // 손실 복구: oversold + value 우선, 저변동성 선호
        const relevantSignals = opp.signals.filter(s => s.type === "oversold_bounce" || s.type === "value");
        const bonus = relevantSignals.reduce((sum, s) => sum + s.strength * 0.3, 0);
        const riskPenalty = opp.riskLevel === "high" ? 15 : opp.riskLevel === "medium" ? 5 : 0;
        return Math.min(100, baseScore + bonus - riskPenalty);
      }
      if (mode === "growth") {
        // 성장 추구: momentum + breakout 우선
        const relevantSignals = opp.signals.filter(s => s.type === "momentum" || s.type === "breakout");
        const bonus = relevantSignals.reduce((sum, s) => sum + s.strength * 0.3, 0);
        return Math.min(100, baseScore + bonus);
      }
      return baseScore;  // balanced
    };
    
    opportunities.forEach(o => {
      o.totalScore = applyModeWeights(o);
    });
    
    // 7. 정렬 + 제한
    opportunities.sort((a, b) => b.totalScore - a.totalScore);
    const top = opportunities.slice(0, limit);
    
    // 8. DB 캐싱 (재스캔 부하 감소용)
    try {
      await supabase.from("research_findings").insert({
        finding_type: "opportunity_scan",
        severity: "info",
        title: `Opportunity Scan · ${mode} · ${top.length}종목`,
        summary: `${mode} 모드 · ${symbols.length}종목 스캔, ${opportunities.length}개 기회 포착, 상위 ${top.length}개 반환`,
        data: { mode, top: top.slice(0, 5).map(o => ({ symbol: o.symbol, score: o.totalScore, signals: o.signals.map(s => s.type) })) },
        confidence_score: 0.8,
      });
    } catch {}
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      mode,
      scanned: symbols.length,
      processed: processedCount,
      found: opportunities.length,
      returned: top.length,
      opportunities: top,
      elapsedMs: Date.now() - startTime,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      opportunities: [],
    });
  }
}
