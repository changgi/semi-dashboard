import { NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 900; // 15분
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Pre-Earnings Monitor API
// 
// 7일 이내 실적 발표 예정 종목 추적:
//   - 현재가 + 52주 최고/최저 대비
//   - 지난 30일 변동성
//   - 최근 4분기 실적 후 평균 반응
//   - IV (내재변동성) 상승 여부
//   - 카일님 포트와의 연관성
// ═══════════════════════════════════════════════════════════

interface EarningsWatch {
  symbol: string;
  name: string;
  earningsDate: string;
  daysUntil: number;
  quarter: string;
  importance: number;
  
  // 현재가
  currentPrice: number | null;
  dayChangePct: number | null;
  
  // 52주 분석
  week52High: number | null;
  week52Low: number | null;
  distanceFromHigh: number | null;
  distanceFromLow: number | null;
  
  // 변동성
  volatility30d: number | null;
  
  // 최근 가격 추세
  priceChange7d: number | null;
  priceChange30d: number | null;
  
  // 실적 전 준비
  expectedMove: number | null;          // 예상 변동폭 (IV 기반 근사치)
  supportLevel: number | null;
  resistanceLevel: number | null;
  
  // 포트 연관성
  portfolioImpact: "direct" | "indirect" | "none";
  affectedETFs: string[];
  
  // 추천 액션
  preEarningsAction: string;
  riskLevel: "high" | "medium" | "low";
}

// ───────────────────────────────────────────────────────────
// 실적 일정 (하드코딩 + 점진적으로 동적화)
// ───────────────────────────────────────────────────────────
const EARNINGS_SCHEDULE = [
  { symbol: "TSLA",       name: "Tesla",         date: "2026-04-22", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
  { symbol: "MSFT",       name: "Microsoft",     date: "2026-04-23", quarter: "Q3 2026", importance: 5, affectedETFs: ["QQQ", "SPY"] },
  { symbol: "INTC",       name: "Intel",         date: "2026-04-24", quarter: "Q1 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "AAPL",       name: "Apple",         date: "2026-04-30", quarter: "Q2 2026", importance: 5, affectedETFs: ["QQQ", "SPY"] },
  { symbol: "AMZN",       name: "Amazon",        date: "2026-04-30", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ", "SPY"] },
  { symbol: "GOOGL",      name: "Alphabet",      date: "2026-04-29", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
  { symbol: "META",       name: "Meta",          date: "2026-04-29", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
  { symbol: "AMD",        name: "AMD",           date: "2026-05-06", quarter: "Q1 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "QCOM",       name: "Qualcomm",      date: "2026-05-01", quarter: "Q2 2026", importance: 3, affectedETFs: ["SMH"] },
  { symbol: "ARM",        name: "ARM Holdings",  date: "2026-05-07", quarter: "Q4 2026", importance: 3, affectedETFs: ["SMH"] },
  { symbol: "NVDA",       name: "NVIDIA",        date: "2026-05-21", quarter: "Q1 2026", importance: 5, affectedETFs: ["SMH", "SOXX", "QQQ"] },
  { symbol: "AVGO",       name: "Broadcom",      date: "2026-06-05", quarter: "Q2 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "MU",         name: "Micron",        date: "2026-06-25", quarter: "Q3 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
];

// ───────────────────────────────────────────────────────────
// 분석 헬퍼
// ───────────────────────────────────────────────────────────
function daysBetween(dateStr: string, ref: Date): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const r = new Date(ref);
  r.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - r.getTime()) / 86400000);
}

function computeVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // 연환산 %
}

// ───────────────────────────────────────────────────────────
// 포트폴리오 관련성 판단 (강화된 로직)
// ───────────────────────────────────────────────────────────
function determineImpact(symbol: string, affectedETFs: string[], portfolioSymbols: Set<string>): "direct" | "indirect" | "none" {
  // 1. 직접 보유
  if (portfolioSymbols.has(symbol)) return "direct";
  
  // 2. 영향 ETF 직접 보유
  for (const etf of affectedETFs) {
    if (portfolioSymbols.has(etf)) return "indirect";
  }
  
  // 3. 한국 ETF → 미국 ETF 매핑
  const portfolioArr = Array.from(portfolioSymbols);
  
  for (const p of portfolioArr) {
    // TIGER/KODEX S&P500 계열 (360750.KS, 379800.KS 등) → SPY 연동
    const isSP500ETF = p.includes("360750") || p.includes("379800") || p.includes("TIGER") && p.toLowerCase().includes("s&p");
    if (isSP500ETF && (affectedETFs.includes("SPY") || affectedETFs.includes("QQQ"))) {
      return "indirect";
    }
    
    // KODEX 나스닥100 (379810.KS 등) → QQQ 연동
    if ((p.includes("379810") || p.includes("133690")) && affectedETFs.includes("QQQ")) {
      return "indirect";
    }
    
    // TIGER 반도체 (139260.KS), KODEX 반도체 (091160.KS) → SMH/SOXX 연동
    if ((p.includes("139260") || p.includes("091160")) && (affectedETFs.includes("SMH") || affectedETFs.includes("SOXX"))) {
      return "indirect";
    }
    
    // 삼성전자/SK하이닉스 → 반도체 ETF 실적 영향
    if ((p.includes("005930") || p.includes("000660")) && (affectedETFs.includes("SMH") || affectedETFs.includes("SOXX"))) {
      return "indirect";
    }
  }
  
  return "none";
}

// ───────────────────────────────────────────────────────────
// 실적 전 액션 결정
// ───────────────────────────────────────────────────────────
function buildPreEarningsAction(
  daysUntil: number,
  impact: string,
  volatility: number,
  distanceFromHigh: number,
  importance: number
): { action: string; risk: "high" | "medium" | "low" } {
  // 고위험 조건들
  const isHighImportance = importance >= 5;
  const isHighVolatility = volatility > 40;
  const isNearHigh = distanceFromHigh > -5; // 최고가 근처 (-5% 이내)

  if (impact === "direct") {
    if (daysUntil <= 1) {
      return {
        action: "🛡️ 내일 발표! 포지션 50% 축소 or 풋 헤지 고려. 보유는 리스크 큼",
        risk: "high",
      };
    }
    if (daysUntil <= 3) {
      return {
        action: `📊 ${daysUntil}일 후 발표. 포지션 점검: 수익 중이면 일부 차익실현, 손실 중이면 스탑로스 설정`,
        risk: isHighImportance ? "high" : "medium",
      };
    }
    return {
      action: `📋 ${daysUntil}일 여유. 실적 시즌 포지션 계획 수립`,
      risk: "medium",
    };
  }

  if (impact === "indirect") {
    if (daysUntil <= 1 && isHighImportance) {
      return {
        action: "⚠️ 대형주 실적 임박. ETF(QQQ/SPY) 변동성 확대 예상. 신규 매수 보류",
        risk: "medium",
      };
    }
    if (daysUntil <= 3) {
      return {
        action: "📈 간접 영향 종목. 실적 결과에 따라 보유 ETF 변동성 예상",
        risk: isHighImportance ? "medium" : "low",
      };
    }
    return {
      action: "👁️ 모니터링만 필요. 이벤트 당일 시장 반응 확인",
      risk: "low",
    };
  }

  // 미보유
  if (daysUntil <= 1 && isHighImportance) {
    return {
      action: "🔍 미보유지만 관심 종목. 실적 후 급락 시 매수 기회",
      risk: "low",
    };
  }
  return {
    action: "📊 시장 전반 참고용. 액션 불필요",
    risk: "low",
  };
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const today = new Date();
    
    // 포트폴리오 보유 종목 (카일님 포지션) - Supabase 직접 조회
    const portfolioSymbols = new Set<string>();
    try {
      const supabase = createAdmin();
      const { data: holdings } = await supabase
        .from("portfolio_holdings")
        .select("symbol")
        .eq("is_active", true);
      
      for (const h of holdings ?? []) {
        portfolioSymbols.add(h.symbol);
      }
    } catch (e) {
      console.warn("[earnings-monitor] 포트폴리오 조회 실패", e);
    }

    // 7일 이내 + 이미 지난 3일 이내 실적만 (최근 결과도 포함)
    const relevant = EARNINGS_SCHEDULE
      .map(e => ({ ...e, daysUntil: daysBetween(e.date, today) }))
      .filter(e => e.daysUntil >= -3 && e.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const symbols = relevant.map(e => e.symbol);
    
    // 병렬로 데이터 수집
    const quotes = await fetchYahooQuotes(symbols);
    
    const watchlist: EarningsWatch[] = [];
    
    for (const e of relevant) {
      const q = quotes.get(e.symbol);
      const currentPrice = q?.price ?? null;
      const dayChangePct = q?.changePct ?? null;
      
      // 과거 이력 (30일)
      let history: any[] = [];
      try {
        history = await fetchYahooHistory(e.symbol, "6mo");
      } catch {}
      
      // 52주 분석
      const prices = history.map(h => h.close).filter(p => p !== null && !isNaN(p));
      const week52High = prices.length > 0 ? Math.max(...prices) : null;
      const week52Low = prices.length > 0 ? Math.min(...prices) : null;
      const distanceFromHigh = currentPrice !== null && week52High !== null
        ? ((currentPrice - week52High) / week52High) * 100
        : null;
      const distanceFromLow = currentPrice !== null && week52Low !== null
        ? ((currentPrice - week52Low) / week52Low) * 100
        : null;
      
      // 변동성 (30일)
      const recent30 = history.slice(-30).map(h => h.close);
      const volatility30d = computeVolatility(recent30);
      
      // 7일/30일 변화
      const priceChange7d = history.length >= 7 && currentPrice !== null && history[history.length - 7]
        ? ((currentPrice - history[history.length - 7].close) / history[history.length - 7].close) * 100
        : null;
      const priceChange30d = history.length >= 30 && currentPrice !== null && history[history.length - 30]
        ? ((currentPrice - history[history.length - 30].close) / history[history.length - 30].close) * 100
        : null;
      
      // Expected Move (IV 기반 근사치 - 실제 IV 대신 volatility 사용)
      const daysToEarnings = Math.abs(e.daysUntil);
      const expectedMove = currentPrice !== null && volatility30d > 0
        ? currentPrice * (volatility30d / 100) * Math.sqrt(daysToEarnings / 252)
        : null;
      
      // 지지/저항
      const supportLevel = week52Low !== null && currentPrice !== null
        ? Math.round((week52Low + (currentPrice - week52Low) * 0.3) * 100) / 100
        : null;
      const resistanceLevel = week52High !== null && currentPrice !== null
        ? Math.round((currentPrice + (week52High - currentPrice) * 0.5) * 100) / 100
        : null;
      
      // 포트 영향
      const portfolioImpact = determineImpact(e.symbol, e.affectedETFs, portfolioSymbols);
      
      // 액션
      const { action, risk } = buildPreEarningsAction(
        e.daysUntil,
        portfolioImpact,
        volatility30d,
        distanceFromHigh ?? 0,
        e.importance
      );
      
      watchlist.push({
        symbol: e.symbol,
        name: e.name,
        earningsDate: e.date,
        daysUntil: e.daysUntil,
        quarter: e.quarter,
        importance: e.importance,
        currentPrice,
        dayChangePct,
        week52High,
        week52Low,
        distanceFromHigh: distanceFromHigh !== null ? Math.round(distanceFromHigh * 100) / 100 : null,
        distanceFromLow: distanceFromLow !== null ? Math.round(distanceFromLow * 100) / 100 : null,
        volatility30d: Math.round(volatility30d * 100) / 100,
        priceChange7d: priceChange7d !== null ? Math.round(priceChange7d * 100) / 100 : null,
        priceChange30d: priceChange30d !== null ? Math.round(priceChange30d * 100) / 100 : null,
        expectedMove: expectedMove !== null ? Math.round(expectedMove * 100) / 100 : null,
        supportLevel,
        resistanceLevel,
        portfolioImpact,
        affectedETFs: e.affectedETFs,
        preEarningsAction: action,
        riskLevel: risk,
      });
    }
    
    // 통계
    const thisWeek = watchlist.filter(w => w.daysUntil >= 0 && w.daysUntil <= 7);
    const upcoming = watchlist.filter(w => w.daysUntil > 7);
    const passed = watchlist.filter(w => w.daysUntil < 0);
    
    const directImpact = watchlist.filter(w => w.portfolioImpact === "direct");
    const indirectImpact = watchlist.filter(w => w.portfolioImpact === "indirect");
    const highRisk = watchlist.filter(w => w.riskLevel === "high");
    
    // 인사이트
    const insights: string[] = [];
    
    if (directImpact.length > 0) {
      const closest = directImpact.sort((a, b) => a.daysUntil - b.daysUntil)[0];
      if (closest.daysUntil >= 0) {
        insights.push(`⚠️ 직접 보유 종목 실적 임박: ${closest.symbol} D-${closest.daysUntil}`);
      }
    }
    
    if (indirectImpact.length > 0 && thisWeek.length >= 3) {
      insights.push(`📊 이번 주 대형주 실적 ${thisWeek.length}건. ETF(SPY/QQQ) 변동성 확대 예상`);
    }
    
    if (highRisk.length > 0) {
      insights.push(`🚨 고위험 ${highRisk.length}건 - 포지션 축소/헤지 검토`);
    }
    
    const avgVol = watchlist.reduce((s, w) => s + (w.volatility30d || 0), 0) / (watchlist.length || 1);
    if (avgVol > 50) {
      insights.push(`📈 평균 변동성 ${avgVol.toFixed(0)}% - 시장 전반 불안정`);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalWatched: watchlist.length,
      thisWeek,
      upcoming,
      passed,
      directImpact,
      indirectImpact,
      highRisk,
      insights,
      watchlist,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      totalWatched: 0,
      thisWeek: [],
      upcoming: [],
      passed: [],
      directImpact: [],
      indirectImpact: [],
      highRisk: [],
      insights: [],
      watchlist: [],
    });
  }
}
