import { NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ───────────────────────────────────────────────────────────
// 주요 환율 및 관련 지표
// ───────────────────────────────────────────────────────────
const FX_SYMBOLS = [
  { symbol: "KRW=X",     name: "USD/KRW",  nameKr: "달러/원",        category: "won",   impact: "한국 반도체 수출 · 외국인 자본" },
  { symbol: "EURKRW=X",  name: "EUR/KRW",  nameKr: "유로/원",        category: "won",   impact: "유럽 무역 · ASML 관련" },
  { symbol: "JPYKRW=X",  name: "JPY/KRW",  nameKr: "엔/원",          category: "won",   impact: "일본 반도체 경쟁력 · 소재/장비 수입" },
  { symbol: "CNYKRW=X",  name: "CNY/KRW",  nameKr: "위안/원",        category: "won",   impact: "중국 리스크 · 대중국 수출" },
  { symbol: "EURUSD=X",  name: "EUR/USD",  nameKr: "유로/달러",      category: "major", impact: "주요 통화쌍 · ECB 정책" },
  { symbol: "JPY=X",     name: "USD/JPY",  nameKr: "달러/엔",        category: "major", impact: "BOJ 정책 · 엔 캐리 트레이드" },
  { symbol: "GBPUSD=X",  name: "GBP/USD",  nameKr: "파운드/달러",    category: "major", impact: "영국 금융 · BOE 정책" },
  { symbol: "CNY=X",     name: "USD/CNY",  nameKr: "달러/위안",      category: "major", impact: "중국 리스크 · PBoC 개입" },
  { symbol: "DX-Y.NYB",  name: "DXY",      nameKr: "달러 인덱스",    category: "index", impact: "달러 종합 강도 · 신흥국 유동성" },
  { symbol: "^TWII",     name: "TWII",     nameKr: "대만 가권지수",  category: "asia",  impact: "대만 반도체 · TSMC 영향" },
];

export async function GET() {
  try {
    const symbols = FX_SYMBOLS.map((f) => f.symbol);
    const quotes = await fetchYahooQuotes(symbols);

    // 각 통화쌍에 대해 1개월 스파크라인 병렬 fetch
    const items = await Promise.all(
      FX_SYMBOLS.map(async (f) => {
        const q = quotes.get(f.symbol);
        let sparkline: number[] = [];
        try {
          const bars = await fetchYahooHistory(f.symbol, "1mo");
          const step = Math.max(1, Math.floor(bars.length / 30));
          for (let i = 0; i < bars.length; i += step) {
            sparkline.push(bars[i].close);
          }
          if (bars.length > 0) sparkline.push(bars[bars.length - 1].close);
        } catch {}

        return {
          symbol: f.symbol,
          name: f.name,
          nameKr: f.nameKr,
          category: f.category,
          impact: f.impact,
          price: q?.price ?? null,
          change: q?.change ?? null,
          changePct: q?.changePct ?? null,
          prevClose: q?.prevClose ?? null,
          dayHigh: q?.dayHigh ?? null,
          dayLow: q?.dayLow ?? null,
          marketState: q?.marketState ?? null,
          sparkline,
        };
      })
    );

    // USD/KRW 환율 특수 해석 (반도체 투자에 매우 중요)
    const usdKrw = items.find((i) => i.symbol === "KRW=X");
    let krwAnalysis = null;
    if (usdKrw?.price) {
      const price = usdKrw.price;
      let sentiment: "positive_samsung" | "negative_samsung" | "neutral";
      let message: string;

      if (price > 1400) {
        sentiment = "positive_samsung";
        message = `원 약세 (${price.toFixed(0)}원) - 삼성전자·SK하이닉스 수출 경쟁력 상승 · 외화 환산 이익 증가`;
      } else if (price < 1200) {
        sentiment = "negative_samsung";
        message = `원 강세 (${price.toFixed(0)}원) - 수출 기업 환율 부담 · 수입 원가 하락`;
      } else {
        sentiment = "neutral";
        message = `원/달러 (${price.toFixed(0)}원) - 안정 구간`;
      }

      krwAnalysis = { sentiment, message, price };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      items,
      krwAnalysis,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
