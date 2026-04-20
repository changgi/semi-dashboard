import { NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 900;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Korea Market Lens API
// 
// 카일님 같은 한국 투자자를 위한 특화 분석:
//   - USD/KRW 환율 추세 + 환차익/환차손 분석
//   - 한국 증시 주요 지수 (KOSPI, KOSDAQ)
//   - 한국 대표 ETF (TIGER, KODEX) 성과
//   - 환헤지 여부 판단
//   - 원화 기준 실질 수익률
// ═══════════════════════════════════════════════════════════

interface KoreaLens {
  fx: {
    current: number;
    change1d: number;
    change1w: number;
    change1m: number;
    week52High: number;
    week52Low: number;
    position: "strong_dollar" | "weak_dollar" | "neutral";
    trend: "rising" | "falling" | "sideways";
    interpretation: string;
  };
  kospi: {
    price: number;
    change1d: number;
    change1w: number;
    yield1m: number;
    regime: "bull" | "bear" | "consolidation";
  } | null;
  koreanEtfs: Array<{
    symbol: string;
    name: string;
    price: number;
    changePct: number;
    recommendation: string;
  }>;
  portfolioAnalysis: {
    totalValueKrw: number;
    totalValueUsd: number;
    fxImpact: "positive" | "negative" | "neutral";
    fxImpactKrw: number;
    fxImpactPct: number;
    realReturnKrw: number;
    realReturnPct: number;
  } | null;
  insights: string[];
  actions: string[];
}

// ───────────────────────────────────────────────────────────
// 환율 해석
// ───────────────────────────────────────────────────────────
function interpretFx(current: number, change1d: number, change1w: number): {
  position: "strong_dollar" | "weak_dollar" | "neutral";
  trend: "rising" | "falling" | "sideways";
  interpretation: string;
} {
  const position: "strong_dollar" | "weak_dollar" | "neutral" =
    current > 1400 ? "strong_dollar" :
    current < 1300 ? "weak_dollar" :
    "neutral";
  
  const trend: "rising" | "falling" | "sideways" =
    change1w > 1 ? "rising" :
    change1w < -1 ? "falling" :
    "sideways";
  
  let interpretation = "";
  if (position === "strong_dollar" && trend === "rising") {
    interpretation = `💥 달러 초강세 지속. 해외 자산 보유 유리, 한국 수출기업 수혜. 환차익 실현 기회`;
  } else if (position === "strong_dollar" && trend === "falling") {
    interpretation = `📉 달러 강세 후 조정. 해외 자산 환차익 일부 반납 가능성`;
  } else if (position === "weak_dollar") {
    interpretation = `📈 원화 강세. 해외 자산 저가 매수 기회. 환전 타이밍`;
  } else {
    interpretation = `➖ 박스권 횡보. 큰 환차익/손실 가능성 낮음`;
  }
  
  return { position, trend, interpretation };
}

// ───────────────────────────────────────────────────────────
// 한국 ETF 분석
// ───────────────────────────────────────────────────────────
const KOREAN_ETFS = [
  { symbol: "360750.KS", name: "TIGER S&P500", sector: "us_large" },
  { symbol: "379800.KS", name: "KODEX 미국S&P500TR", sector: "us_large" },
  { symbol: "133690.KS", name: "TIGER 미국나스닥100", sector: "us_tech" },
  { symbol: "379810.KS", name: "KODEX 미국나스닥100TR", sector: "us_tech" },
  { symbol: "139260.KS", name: "TIGER 200IT", sector: "korea_tech" },
  { symbol: "091160.KS", name: "KODEX 반도체", sector: "korea_semi" },
  { symbol: "069500.KS", name: "KODEX 200", sector: "korea_large" },
  { symbol: "229200.KS", name: "KODEX 코스닥150", sector: "korea_small" },
  { symbol: "251340.KS", name: "KODEX 코스닥150선물인버스", sector: "short" },
];

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    // 1. 카일님 포트
    const supabase = createAdmin();
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    // 2. 환율 데이터
    const fxHistory = await fetchYahooHistory("KRW=X", "3mo");
    const quotes = await fetchYahooQuotes([
      "KRW=X",
      "^KS11",  // KOSPI
      ...KOREAN_ETFS.map(e => e.symbol),
      ...[...new Set((holdings ?? []).map((h: any) => h.symbol))],
    ]);
    
    const current = quotes.get("KRW=X")?.price ?? 1470;
    const kospi = quotes.get("^KS11");
    
    // 환율 분석
    const prices = fxHistory.map((h: any) => h.close).filter((p: any) => p !== null);
    const price1d = prices.length >= 2 ? prices[prices.length - 2] : current;
    const price1w = prices.length >= 7 ? prices[prices.length - 7] : current;
    const price1m = prices.length >= 20 ? prices[prices.length - 20] : current;
    const week52High = prices.length > 0 ? Math.max(...prices) : current;
    const week52Low = prices.length > 0 ? Math.min(...prices) : current;
    
    const change1d = ((current - price1d) / price1d) * 100;
    const change1w = ((current - price1w) / price1w) * 100;
    const change1m = ((current - price1m) / price1m) * 100;
    
    const { position, trend, interpretation } = interpretFx(current, change1d, change1w);
    
    const fx = {
      current: Math.round(current),
      change1d: Math.round(change1d * 100) / 100,
      change1w: Math.round(change1w * 100) / 100,
      change1m: Math.round(change1m * 100) / 100,
      week52High: Math.round(week52High),
      week52Low: Math.round(week52Low),
      position,
      trend,
      interpretation,
    };
    
    // KOSPI 분석
    let kospiData: KoreaLens["kospi"] = null;
    if (kospi && kospi.price) {
      const kospiHistory = await fetchYahooHistory("^KS11", "1mo");
      const kospiPrices = kospiHistory.map((h: any) => h.close).filter((p: any) => p !== null);
      const kospi1m = kospiPrices.length > 0 ? kospiPrices[0] : kospi.price;
      const yield1m = ((kospi.price - kospi1m) / kospi1m) * 100;
      
      kospiData = {
        price: Math.round(kospi.price),
        change1d: kospi.changePct ?? 0,
        change1w: 0, // 7일 전 기준 필요하면 추가 계산
        yield1m: Math.round(yield1m * 100) / 100,
        regime: yield1m > 3 ? "bull" : yield1m < -3 ? "bear" : "consolidation",
      };
    }
    
    // 한국 ETF 분석
    const koreanEtfs = KOREAN_ETFS.map(etf => {
      const q = quotes.get(etf.symbol);
      let recommendation = "";
      
      if (etf.sector === "us_large" && position === "strong_dollar") {
        recommendation = "💰 환차익 확보 기회";
      } else if (etf.sector === "korea_semi" && current > 1450) {
        recommendation = "📈 반도체 수출 수혜";
      } else if (etf.sector === "korea_large" && position === "weak_dollar") {
        recommendation = "📊 국내 증시 회복 관찰";
      }
      
      return {
        symbol: etf.symbol,
        name: etf.name,
        price: q?.price ?? 0,
        changePct: q?.changePct ?? 0,
        recommendation: recommendation || "👁️ 관망",
      };
    }).filter(e => e.price > 0);
    
    // 포트폴리오 환율 영향 분석
    let portfolioAnalysis: KoreaLens["portfolioAnalysis"] = null;
    if ((holdings ?? []).length > 0) {
      let totalValueKrw = 0;
      let totalValueUsd = 0;
      let totalCostKrw = 0;
      
      for (const h of holdings ?? []) {
        const q = quotes.get(h.symbol);
        const currentPrice = q?.price ?? h.avg_cost;
        const marketValue = currentPrice * h.shares;
        const costValue = h.avg_cost * h.shares;
        
        const marketValueKrw = h.currency === "KRW" ? marketValue : marketValue * current;
        const costValueKrw = h.currency === "KRW" ? costValue : costValue * current;
        const marketValueUsd = h.currency === "KRW" ? marketValue / current : marketValue;
        
        totalValueKrw += marketValueKrw;
        totalValueUsd += marketValueUsd;
        totalCostKrw += costValueKrw;
      }
      
      const realReturnKrw = totalValueKrw - totalCostKrw;
      const realReturnPct = totalCostKrw > 0 ? (realReturnKrw / totalCostKrw) * 100 : 0;
      
      // 환율 영향: 만약 환율이 1년 평균(1350원)이었다면?
      const baselineRate = 1350;
      const fxImpactKrw = Math.round((current - baselineRate) * totalValueUsd);
      const fxImpactPct = totalValueKrw > 0 ? (fxImpactKrw / totalValueKrw) * 100 : 0;
      
      portfolioAnalysis = {
        totalValueKrw: Math.round(totalValueKrw),
        totalValueUsd: Math.round(totalValueUsd * 100) / 100,
        fxImpact: fxImpactKrw > 50000 ? "positive" : fxImpactKrw < -50000 ? "negative" : "neutral",
        fxImpactKrw: Math.abs(fxImpactKrw),
        fxImpactPct: Math.round(fxImpactPct * 100) / 100,
        realReturnKrw: Math.round(realReturnKrw),
        realReturnPct: Math.round(realReturnPct * 100) / 100,
      };
    }
    
    // 인사이트
    const insights: string[] = [];
    const actions: string[] = [];
    
    insights.push(interpretation);
    
    if (portfolioAnalysis && portfolioAnalysis.fxImpact === "positive") {
      insights.push(`💰 환차익 약 ₩${portfolioAnalysis.fxImpactKrw.toLocaleString()} (${portfolioAnalysis.fxImpactPct.toFixed(1)}%) 발생 중`);
      actions.push(`🔄 환율 ${current}원 고점 부근 - 일부 해외 자산 환전 실익 고려`);
    } else if (portfolioAnalysis && portfolioAnalysis.fxImpact === "negative") {
      insights.push(`📉 환차손 약 ₩${portfolioAnalysis.fxImpactKrw.toLocaleString()} (${portfolioAnalysis.fxImpactPct.toFixed(1)}%) 발생`);
      actions.push(`⏸️ 환율 회복 대기 - 지금 환전하면 손실 확정`);
    }
    
    if (position === "strong_dollar" && kospiData?.regime === "bear") {
      insights.push(`🎯 달러 강세 + KOSPI 약세 - 전통적 디커플링 패턴`);
      actions.push(`📊 해외 자산 유지. KOSPI 바닥 확인 후 저가 매수`);
    }
    
    if (trend === "rising" && change1w > 2) {
      actions.push(`💱 환율 급등 (+${change1w.toFixed(1)}%/주) - 추가 환전 신중`);
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      fx,
      kospi: kospiData,
      koreanEtfs,
      portfolioAnalysis,
      insights,
      actions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      fx: null,
      kospi: null,
      koreanEtfs: [],
      portfolioAnalysis: null,
      insights: [],
      actions: [],
    });
  }
}
