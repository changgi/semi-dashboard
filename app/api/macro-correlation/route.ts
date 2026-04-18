import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ───────────────────────────────────────────────────────────
// 매크로-반도체 상관관계 분석
// 유가/국채/VIX/달러가 반도체 종목과 얼마나 동조하는지 계산
// ───────────────────────────────────────────────────────────

const MACRO_SYMBOLS = [
  { symbol: "CL=F", label: "WTI 원유", desc: "생산비·인플레 영향" },
  { symbol: "^TNX", label: "10Y 국채금리", desc: "할인율·PER 영향" },
  { symbol: "^VIX", label: "VIX 공포지수", desc: "시장 리스크 선호도" },
  { symbol: "DX-Y.NYB", label: "달러 인덱스", desc: "수출·유동성" },
  { symbol: "^NDX", label: "나스닥100", desc: "기술주 시장 기조" },
];

// Pearson 상관계수
function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const aSlice = a.slice(-n);
  const bSlice = b.slice(-n);
  const meanA = aSlice.reduce((s, v) => s + v, 0) / n;
  const meanB = bSlice.reduce((s, v) => s + v, 0) / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = aSlice[i] - meanA;
    const dB = bSlice[i] - meanB;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// 일간 수익률 변환
function toReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

export async function GET() {
  try {
    const supabase = createAdmin();

    // 대상 종목 (상위 반도체)
    const targets = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "LRCX", "KLAC", "ARM", "INTC"];

    // 각 종목의 일봉 가져오기
    const symbolPrices = new Map<string, number[]>();
    for (const sym of targets) {
      const { data: hist } = await supabase
        .from("price_history")
        .select("price, timestamp")
        .eq("symbol", sym)
        .eq("interval_type", "1day")
        .order("timestamp", { ascending: true })
        .limit(250);
      if (hist && hist.length >= 30) {
        symbolPrices.set(
          sym,
          hist.map((h) => h.price).filter((p) => p && p > 0)
        );
      }
    }

    // 매크로 히스토리 병렬 fetch
    const macroData = new Map<string, number[]>();
    await Promise.all(
      MACRO_SYMBOLS.map(async (m) => {
        try {
          const bars = await fetchYahooHistory(m.symbol, "1y");
          macroData.set(
            m.symbol,
            bars.map((b) => b.close)
          );
        } catch {
          // 개별 실패 시 무시
        }
      })
    );

    // 상관계수 매트릭스 계산
    const matrix: {
      symbol: string;
      correlations: {
        macro: string;
        label: string;
        desc: string;
        correlation: number;
        strength: "strong" | "moderate" | "weak" | "negative-strong" | "negative-moderate";
        interpretation: string;
      }[];
    }[] = [];

    for (const [sym, prices] of symbolPrices) {
      const symReturns = toReturns(prices);
      const correlations = [];

      for (const macro of MACRO_SYMBOLS) {
        const macroPrices = macroData.get(macro.symbol);
        if (!macroPrices || macroPrices.length < 30) continue;
        const macroReturns = toReturns(macroPrices);
        const corr = correlation(symReturns, macroReturns);

        // 상관 강도 분류
        let strength: "strong" | "moderate" | "weak" | "negative-strong" | "negative-moderate";
        if (corr > 0.5) strength = "strong";
        else if (corr > 0.2) strength = "moderate";
        else if (corr > -0.2) strength = "weak";
        else if (corr > -0.5) strength = "negative-moderate";
        else strength = "negative-strong";

        // 해석
        let interpretation = "";
        if (macro.symbol === "^TNX") {
          if (corr < -0.2) interpretation = "금리 하락 시 수혜 (역상관)";
          else if (corr > 0.2) interpretation = "금리 상승 동조 (이례적)";
          else interpretation = "금리 중립";
        } else if (macro.symbol === "CL=F") {
          if (corr > 0.3) interpretation = "유가와 동조 (원자재주 성격)";
          else if (corr < -0.3) interpretation = "유가 역상관 (테크 전형)";
          else interpretation = "유가 독립적";
        } else if (macro.symbol === "^VIX") {
          if (corr < -0.4) interpretation = "VIX 하락 수혜 (리스크온 자산)";
          else if (corr > 0.2) interpretation = "VIX 동조 (방어주 성격)";
          else interpretation = "VIX 중립";
        } else if (macro.symbol === "DX-Y.NYB") {
          if (corr < -0.2) interpretation = "달러 약세 수혜 (수출기업)";
          else interpretation = "달러 중립";
        } else if (macro.symbol === "^NDX") {
          if (corr > 0.5) interpretation = "나스닥 동조 강함 (대표 기술주)";
          else if (corr > 0.3) interpretation = "나스닥 동조";
          else interpretation = "나스닥 독립";
        }

        correlations.push({
          macro: macro.symbol,
          label: macro.label,
          desc: macro.desc,
          correlation: Math.round(corr * 1000) / 1000,
          strength,
          interpretation,
        });
      }

      matrix.push({ symbol: sym, correlations });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      macros: MACRO_SYMBOLS,
      matrix,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
