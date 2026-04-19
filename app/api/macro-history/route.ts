import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ───────────────────────────────────────────────────────────
// 매크로 지표 메타 정보
// ───────────────────────────────────────────────────────────
const MACRO_META: Record<
  string,
  {
    name: string;
    category: string;
    unit: string;
    longRunMean?: number;      // 장기 평균 (전망 수렴점)
    reversion: number;          // 평균회귀 속도 (0~1, 1이 빠름)
    volatility: number;         // 연 변동성 (%)
    danielYooView?: string;     // Daniel Yoo 전망
  }
> = {
  "CL=F":     { name: "WTI 원유",     category: "oil",   unit: "$",  longRunMean: 75,    reversion: 0.55, volatility: 35, danielYooView: "적정 $70~90 범위, 인플레 영향 완화 기대" },
  "BZ=F":     { name: "브렌트유",     category: "oil",   unit: "$",  longRunMean: 82,    reversion: 0.55, volatility: 33 },
  "USO":      { name: "위캔오일",     category: "oil",   unit: "$",  reversion: 0.50, volatility: 38 },
  "^IXIC":    { name: "나스닥종합",   category: "index", unit: "p",  reversion: 0.10, volatility: 22, danielYooView: "12개월 +30% 이상 상승 예상" },
  "^NDX":     { name: "나스닥100",     category: "index", unit: "p",  reversion: 0.08, volatility: 24, danielYooView: "최선호 지수, +40% 여지" },
  "^GSPC":    { name: "S&P 500",       category: "index", unit: "p",  reversion: 0.12, volatility: 18 },
  "^TNX":     { name: "美 10Y 국채",  category: "bond",  unit: "%",  longRunMean: 3.5,   reversion: 0.40, volatility: 12, danielYooView: "현재 4.25% → 3.5% 하락 예상" },
  "DX-Y.NYB": { name: "달러 인덱스",   category: "fx",    unit: "p",  longRunMean: 100,   reversion: 0.60, volatility: 8,  danielYooView: "달러 약세 지속 → 한국 수출 유리" },
  "^VIX":     { name: "VIX 공포지수", category: "vol",   unit: "p",  longRunMean: 18,    reversion: 0.70, volatility: 80, danielYooView: "정상 구간 15~20 유지 예상" },
  "SOXX":     { name: "반도체 ETF (SOXX)", category: "semi", unit: "$", reversion: 0.15, volatility: 35 },
  "SMH":      { name: "반도체 ETF (SMH)",  category: "semi", unit: "$", reversion: 0.15, volatility: 35 },
};

// ───────────────────────────────────────────────────────────
// Ornstein-Uhlenbeck 평균회귀 모델 전망
// dX = κ(θ - X)dt + σ·dW
// ───────────────────────────────────────────────────────────
function generateForecast(
  currentValue: number,
  longRunMean: number | undefined,
  reversionSpeed: number,
  annualVol: number,
  daysAhead: number
): { days: number[]; forecast: number[]; upperBand: number[]; lowerBand: number[] } {
  const days: number[] = [];
  const forecast: number[] = [];
  const upperBand: number[] = [];
  const lowerBand: number[] = [];

  const target = longRunMean ?? currentValue * 1.10;  // 평균값 없으면 연 10% 성장
  const kappa = reversionSpeed;                       // 평균회귀 강도
  const sigma = annualVol / 100;                      // 연 변동성 (decimal)

  for (let d = 0; d <= daysAhead; d += Math.max(1, Math.floor(daysAhead / 20))) {
    const t = d / 365;                                 // 연 단위
    // 평균회귀 해: X_t = X_0·e^(-κt) + θ·(1 - e^(-κt))
    const decay = Math.exp(-kappa * t);
    const expected = currentValue * decay + target * (1 - decay);

    // 조건부 분산: σ²·(1 - e^(-2κt)) / (2κ)
    const variance =
      kappa > 0.01
        ? (sigma * sigma * (1 - Math.exp(-2 * kappa * t))) / (2 * kappa)
        : sigma * sigma * t;
    const stdDev = Math.sqrt(variance) * expected;

    days.push(d);
    forecast.push(Math.round(expected * 1000) / 1000);
    upperBand.push(Math.round((expected + 1.28 * stdDev) * 1000) / 1000);  // 80%
    lowerBand.push(Math.round(Math.max(0.01, expected - 1.28 * stdDev) * 1000) / 1000);
  }

  return { days, forecast, upperBand, lowerBand };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const range = searchParams.get("range") ?? "6mo";

    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
    }

    const meta = MACRO_META[symbol];
    if (!meta) {
      return NextResponse.json({ success: false, error: "unknown symbol" }, { status: 400 });
    }

    // Yahoo에서 히스토리 가져오기
    const bars = await fetchYahooHistory(symbol, range);

    if (bars.length === 0) {
      return NextResponse.json({ success: false, error: "no history" }, { status: 404 });
    }

    // 히스토리 포맷
    const history = bars.map((b) => ({
      date: b.date,
      timestamp: b.timestamp,
      value: b.close,
    }));

    // 현재값 + 전망
    const current = bars[bars.length - 1].close;
    const forecast180 = generateForecast(
      current,
      meta.longRunMean,
      meta.reversion,
      meta.volatility,
      180
    );

    // 전망치 데이터 (날짜 포함)
    const lastDate = new Date(bars[bars.length - 1].timestamp);
    const forecastSeries = forecast180.days.map((d, i) => {
      const date = new Date(lastDate);
      date.setDate(date.getDate() + d);
      return {
        date: date.toISOString().split("T")[0],
        day: d,
        forecast: forecast180.forecast[i],
        upper: forecast180.upperBand[i],
        lower: forecast180.lowerBand[i],
      };
    });

    // 간단한 통계
    const values = bars.map((b) => b.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
    );
    const zScore = (current - mean) / (stdDev || 1);

    // 추세 판단
    const recent30 = bars.slice(-30).map((b) => b.close);
    const recent30Mean = recent30.reduce((s, v) => s + v, 0) / recent30.length;
    const trend =
      recent30Mean > mean * 1.05
        ? "uptrend"
        : recent30Mean < mean * 0.95
        ? "downtrend"
        : "sideways";

    return NextResponse.json({
      success: true,
      symbol,
      name: meta.name,
      category: meta.category,
      unit: meta.unit,
      current,
      history,
      forecast: forecastSeries,
      stats: {
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        zScore: Math.round(zScore * 100) / 100,
        trend,
      },
      model: {
        longRunMean: meta.longRunMean,
        reversionSpeed: meta.reversion,
        volatility: meta.volatility,
      },
      danielYooView: meta.danielYooView,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
