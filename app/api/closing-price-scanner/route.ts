import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 300; // 5분 캐시
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/closing-price-scanner
 *
 * 한국 종가 매매 후보 스캐너 (세시반 스타일)
 *
 * 핵심 기능:
 *   - 수급 흐름 점수 (거래량 급증 + 가격 상승)
 *   - 종가 매매 후보 (마감 전 강세 + 이벤트)
 *   - 섹터 트리맵 데이터 (시가총액 + 등락률)
 *   - 장 마감 시간대별 분석 (15:20~15:30 집중)
 *
 * 데이터 소스:
 *   - Yahoo Finance (한국 종목 .KS/.KQ 접미사)
 *   - symbol_universe 테이블 (한국 종목 목록)
 *
 * 제한사항:
 *   - KRX 공식 수급 데이터 미사용 (기관/외국인 매매 정확도 떨어짐)
 *   - Yahoo Finance 거래량 기반 근사치로 수급 추정
 *   - 실시간 호가창 없음 (종가만 사용)
 */

type SupplyDemandSignal = {
  symbol: string;
  name: string;
  sector?: string;
  currentPrice: number;
  changePct: number;
  volume: number;
  avgVolume20: number;
  volumeRatio: number;     // 20일 평균 대비 거래량 비율
  closingStrength: number; // 종가 강도 (종가가 당일 고가에 근접한 정도)
  dayRange: { low: number; high: number };
  score: number;           // 종합 수급 점수 (0-100)
  signals: string[];
  marketCapB?: number;     // 시가총액 (억원)
};

type KoreanStock = {
  symbol: string;
  name?: string;
  sector?: string;
  market?: "KOSPI" | "KOSDAQ";
};

// 한국 주요 종목 시드 (DB에 없을 경우 백업)
const KR_SEED_SYMBOLS: KoreanStock[] = [
  // KOSPI 대형주 (반도체/AI/배터리 등 카일님 관심 분야)
  { symbol: "005930.KS", name: "삼성전자", sector: "반도체", market: "KOSPI" },
  { symbol: "000660.KS", name: "SK하이닉스", sector: "반도체", market: "KOSPI" },
  { symbol: "373220.KS", name: "LG에너지솔루션", sector: "배터리", market: "KOSPI" },
  { symbol: "207940.KS", name: "삼성바이오로직스", sector: "바이오", market: "KOSPI" },
  { symbol: "005380.KS", name: "현대차", sector: "자동차", market: "KOSPI" },
  { symbol: "035420.KS", name: "NAVER", sector: "IT서비스", market: "KOSPI" },
  { symbol: "035720.KS", name: "카카오", sector: "IT서비스", market: "KOSPI" },
  { symbol: "051910.KS", name: "LG화학", sector: "화학", market: "KOSPI" },
  { symbol: "006400.KS", name: "삼성SDI", sector: "배터리", market: "KOSPI" },
  { symbol: "068270.KS", name: "셀트리온", sector: "바이오", market: "KOSPI" },
  { symbol: "005490.KS", name: "POSCO홀딩스", sector: "철강", market: "KOSPI" },
  { symbol: "105560.KS", name: "KB금융", sector: "금융", market: "KOSPI" },
  { symbol: "055550.KS", name: "신한지주", sector: "금융", market: "KOSPI" },
  { symbol: "012330.KS", name: "현대모비스", sector: "자동차부품", market: "KOSPI" },
  { symbol: "028260.KS", name: "삼성물산", sector: "건설", market: "KOSPI" },
  // KOSDAQ 기술주
  { symbol: "086520.KQ", name: "에코프로", sector: "배터리소재", market: "KOSDAQ" },
  { symbol: "247540.KQ", name: "에코프로비엠", sector: "배터리소재", market: "KOSDAQ" },
  { symbol: "091990.KQ", name: "셀트리온헬스케어", sector: "바이오", market: "KOSDAQ" },
  { symbol: "041510.KQ", name: "에스엠", sector: "엔터테인먼트", market: "KOSDAQ" },
  { symbol: "196170.KQ", name: "알테오젠", sector: "바이오", market: "KOSDAQ" },
];

async function fetchKoreanSymbols(): Promise<KoreanStock[]> {
  try {
    const supabase = createAdmin();
    const { data } = await supabase
      .from("symbol_universe")
      .select("symbol, name, sector, country")
      .or("symbol.like.%.KS,symbol.like.%.KQ")
      .limit(100);
    if (data && data.length > 0) {
      return data.map(d => ({
        symbol: d.symbol,
        name: d.name,
        sector: d.sector,
        market: d.symbol.endsWith(".KS") ? "KOSPI" : "KOSDAQ",
      }));
    }
  } catch {}
  return KR_SEED_SYMBOLS;
}

async function analyzeStock(stock: KoreanStock): Promise<SupplyDemandSignal | null> {
  try {
    const [quote, history] = await Promise.all([
      fetchYahooQuote(stock.symbol),
      fetchYahooHistory(stock.symbol, "3mo"),
    ]);

    if (!quote || !history || history.length < 20) return null;

    const closes = history.map(b => b.close);
    const volumes = history.map(b => b.volume ?? 0);
    const today = history[history.length - 1];
    const yesterday = history[history.length - 2];
    if (!today || !yesterday) return null;

    // 20일 평균 거래량
    const recent20Vol = volumes.slice(-20);
    const avgVolume20 = recent20Vol.reduce((s, v) => s + v, 0) / recent20Vol.length;
    const volumeRatio = avgVolume20 === 0 ? 1 : today.volume / avgVolume20;

    // 종가 강도 (종가가 당일 고가에 근접할수록 강세)
    const dayRangeSize = today.high - today.low;
    const closingStrength = dayRangeSize === 0
      ? 0.5
      : (today.close - today.low) / dayRangeSize;

    // 수급 점수 계산 (0-100)
    let score = 50;
    const signals: string[] = [];

    // 거래량 급증
    if (volumeRatio >= 3) { score += 20; signals.push(`거래량 ${volumeRatio.toFixed(1)}배 폭발`); }
    else if (volumeRatio >= 2) { score += 15; signals.push(`거래량 ${volumeRatio.toFixed(1)}배 증가`); }
    else if (volumeRatio >= 1.5) { score += 8; signals.push(`거래량 ${volumeRatio.toFixed(1)}배`); }
    else if (volumeRatio < 0.5) { score -= 10; signals.push("거래량 감소"); }

    // 종가 강도 (장 마감 시 강세)
    if (closingStrength > 0.85) { score += 15; signals.push("종가 고점 마감 (강한 매수세)"); }
    else if (closingStrength > 0.7) { score += 8; signals.push("종가 상단 마감"); }
    else if (closingStrength < 0.2) { score -= 10; signals.push("종가 저점 마감 (매도세)"); }

    // 상승률
    const changePct = quote.changePct;
    if (changePct > 5) { score += 10; signals.push(`+${changePct.toFixed(1)}% 강세`); }
    else if (changePct > 2) { score += 5; signals.push(`+${changePct.toFixed(1)}% 상승`); }
    else if (changePct < -3) { score -= 10; signals.push(`${changePct.toFixed(1)}% 약세`); }

    // 연속 상승
    if (closes.length >= 4) {
      const last4 = closes.slice(-4);
      const rising = last4[3] > last4[2] && last4[2] > last4[1] && last4[1] > last4[0];
      if (rising) { score += 5; signals.push("3일 연속 상승"); }
    }

    score = Math.max(0, Math.min(100, score));

    return {
      symbol: stock.symbol,
      name: stock.name ?? stock.symbol,
      sector: stock.sector,
      currentPrice: quote.price,
      changePct,
      volume: today.volume,
      avgVolume20,
      volumeRatio,
      closingStrength,
      dayRange: { low: today.low, high: today.high },
      score,
      signals,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") ?? "all"; // all | closing | volume | sector
    const minScore = parseInt(searchParams.get("minScore") ?? "60", 10);
    const sector = searchParams.get("sector");

    const symbols = await fetchKoreanSymbols();
    let targets = symbols;
    if (sector) targets = targets.filter(s => s.sector === sector);

    // 동시 분석 (batch 10씩)
    const results: SupplyDemandSignal[] = [];
    for (let i = 0; i < targets.length; i += 10) {
      const batch = targets.slice(i, i + 10);
      const batchResults = await Promise.all(batch.map(analyzeStock));
      batchResults.forEach(r => { if (r) results.push(r); });
    }

    // 모드별 필터 + 정렬
    let filtered = results;
    if (mode === "closing") {
      // 종가 매매 후보: 종가 강도 + 거래량 + 상승
      filtered = results
        .filter(r => r.closingStrength >= 0.7 && r.volumeRatio >= 1.5 && r.changePct > 0)
        .sort((a, b) => b.score - a.score);
    } else if (mode === "volume") {
      filtered = results
        .filter(r => r.volumeRatio >= 2)
        .sort((a, b) => b.volumeRatio - a.volumeRatio);
    } else {
      filtered = results
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score);
    }

    // 섹터별 집계 (트리맵 데이터)
    const sectorMap = new Map<string, { count: number; avgChange: number; totalVol: number }>();
    results.forEach(r => {
      const sec = r.sector ?? "기타";
      const existing = sectorMap.get(sec);
      if (existing) {
        existing.count++;
        existing.avgChange += r.changePct;
        existing.totalVol += r.volume;
      } else {
        sectorMap.set(sec, { count: 1, avgChange: r.changePct, totalVol: r.volume });
      }
    });
    const sectorTreemap = Array.from(sectorMap.entries()).map(([name, v]) => ({
      sector: name,
      stockCount: v.count,
      avgChangePct: v.avgChange / v.count,
      totalVolume: v.totalVol,
    })).sort((a, b) => b.avgChangePct - a.avgChangePct);

    // 현재 한국 시간 및 시장 상태
    const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
    const kstHour = nowKst.getUTCHours();
    const kstMin = nowKst.getUTCMinutes();
    const kstTime = `${String(kstHour).padStart(2, "0")}:${String(kstMin).padStart(2, "0")}`;
    let marketStatus: "pre_open" | "open" | "closing_soon" | "closed" | "weekend" = "closed";
    const day = nowKst.getUTCDay();
    if (day === 0 || day === 6) marketStatus = "weekend";
    else if (kstHour < 9) marketStatus = "pre_open";
    else if (kstHour === 9 || (kstHour < 15) || (kstHour === 15 && kstMin < 20)) marketStatus = "open";
    else if (kstHour === 15 && kstMin >= 20 && kstMin < 30) marketStatus = "closing_soon";
    else marketStatus = "closed";

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      kstTime,
      marketStatus,
      mode,
      totalScanned: symbols.length,
      totalAnalyzed: results.length,
      totalFiltered: filtered.length,
      candidates: filtered.slice(0, 30),
      sectorTreemap,
      topGainers: results.filter(r => r.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 10),
      topLosers: results.filter(r => r.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 10),
      volumeLeaders: results.sort((a, b) => b.volumeRatio - a.volumeRatio).slice(0, 10),
      disclaimer: {
        note: "Yahoo Finance 기반 거래량/가격 근사치. KRX 공식 기관·외국인 수급과 다를 수 있음.",
        limitation: "실시간 호가창 없음. 종가·당일 거래량 기반 분석만 제공.",
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
