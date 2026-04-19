import { NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ───────────────────────────────────────────────────────────
// 주요 선물 계약 (반도체/기술주 관련)
// ───────────────────────────────────────────────────────────
const FUTURES = [
  { symbol: "ES=F", name: "S&P 500 E-mini",       nameKr: "S&P 500 선물",    category: "index",  contract: "ES",  unit: "$50 × index",   impact: "미국 대형주 방향" },
  { symbol: "NQ=F", name: "Nasdaq 100 E-mini",    nameKr: "나스닥100 선물",  category: "index",  contract: "NQ",  unit: "$20 × index",   impact: "기술주 선행 · 반도체 강상관" },
  { symbol: "YM=F", name: "Dow E-mini",           nameKr: "다우 선물",        category: "index",  contract: "YM",  unit: "$5 × index",    impact: "미국 대형주 전통" },
  { symbol: "RTY=F",name: "Russell 2000 E-mini",  nameKr: "러셀2000 선물",    category: "index",  contract: "RTY", unit: "$50 × index",   impact: "중소형주" },
  { symbol: "CL=F", name: "WTI Crude Oil",        nameKr: "WTI 원유",         category: "energy", contract: "CL",  unit: "1000 barrels",  impact: "에너지 · 인플레이션" },
  { symbol: "NG=F", name: "Natural Gas",          nameKr: "천연가스",         category: "energy", contract: "NG",  unit: "10000 MMBtu",   impact: "에너지 비용" },
  { symbol: "GC=F", name: "Gold",                 nameKr: "금",               category: "metal",  contract: "GC",  unit: "100 oz",        impact: "안전자산 · 인플레이션 헤지" },
  { symbol: "SI=F", name: "Silver",               nameKr: "은",               category: "metal",  contract: "SI",  unit: "5000 oz",       impact: "산업 금속 · 태양광·반도체 원료" },
  { symbol: "HG=F", name: "Copper",               nameKr: "구리",             category: "metal",  contract: "HG",  unit: "25000 lb",      impact: "반도체 배선 원료 · 경기 선행 지표" },
  { symbol: "PL=F", name: "Platinum",             nameKr: "백금",             category: "metal",  contract: "PL",  unit: "50 oz",         impact: "산업 촉매" },
];

export async function GET() {
  try {
    const symbols = FUTURES.map((f) => f.symbol);
    const quotes = await fetchYahooQuotes(symbols);

    const items = await Promise.all(
      FUTURES.map(async (f) => {
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
          contract: f.contract,
          unit: f.unit,
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

    // 선물 기반 시그널 생성
    const signals: Array<{ title: string; message: string; type: "positive" | "negative" | "neutral" }> = [];

    const nqFut = items.find((i) => i.symbol === "NQ=F");
    const cuFut = items.find((i) => i.symbol === "HG=F");
    const gcFut = items.find((i) => i.symbol === "GC=F");
    const ngFut = items.find((i) => i.symbol === "NG=F");

    if (nqFut?.changePct !== null && nqFut?.changePct !== undefined) {
      if (nqFut.changePct > 1) {
        signals.push({
          type: "positive",
          title: "📈 나스닥 선물 강세",
          message: `NQ ${nqFut.changePct >= 0 ? "+" : ""}${nqFut.changePct.toFixed(2)}% - 기술주 오픈 전 호재 · 반도체 수혜 예상`,
        });
      } else if (nqFut.changePct < -1) {
        signals.push({
          type: "negative",
          title: "📉 나스닥 선물 약세",
          message: `NQ ${nqFut.changePct.toFixed(2)}% - 기술주 오픈 전 악재 · 반도체 경계 필요`,
        });
      }
    }

    if (cuFut?.changePct !== null && cuFut?.changePct !== undefined && cuFut.changePct > 2) {
      signals.push({
        type: "positive",
        title: "🟧 구리 급등",
        message: `HG +${cuFut.changePct.toFixed(2)}% - 경기 회복 신호 · 반도체 수요 강세 시사 (Dr. Copper)`,
      });
    }

    if (gcFut?.price && gcFut.price > 4500) {
      signals.push({
        type: "neutral",
        title: "🟡 금 고점 유지",
        message: `GC $${gcFut.price.toFixed(0)} - 안전자산 선호 · 인플레·지정학 불확실성 반영`,
      });
    }

    if (ngFut?.changePct !== null && ngFut?.changePct !== undefined && Math.abs(ngFut.changePct) > 3) {
      signals.push({
        type: ngFut.changePct > 0 ? "negative" : "positive",
        title: "⚡ 천연가스 급변동",
        message: `NG ${ngFut.changePct >= 0 ? "+" : ""}${ngFut.changePct.toFixed(2)}% - 데이터센터 전력 비용 영향 가능`,
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      items,
      signals,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
