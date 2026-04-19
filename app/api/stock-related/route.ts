import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 종목별 연관 투자상품 매핑
// ═══════════════════════════════════════════════════════════

// 각 종목이 속한 섹터 ETF + 관련 레버리지 상품
const STOCK_RELATED: Record<string, {
  sectorEtfs: Array<{ symbol: string; name: string; nameKr: string; weight?: string; type: string }>;
  leveragedEtfs: Array<{ symbol: string; name: string; nameKr: string; leverage: string }>;
  indexFutures: Array<{ symbol: string; name: string; nameKr: string; relation: string }>;
}> = {
  NVDA: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",   weight: "~20%", type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~10%", type: "market-cap" },
      { symbol: "XSD",  name: "SPDR S&P Semiconductor",       nameKr: "반도체 ETF (XSD)",  weight: "~3%",  type: "equal-weight" },
      { symbol: "XLK",  name: "Technology Select Sector",     nameKr: "기술주 ETF (XLK)",  weight: "~22%", type: "sector" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
      { symbol: "USD",  name: "ProShares Ultra Semi",         nameKr: "반도체 2배 롱",     leverage: "+2x" },
      { symbol: "SSG",  name: "ProShares UltraShort Semi",    nameKr: "반도체 2배 숏",     leverage: "-2x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.74)" },
      { symbol: "ES=F", name: "S&P 500 Futures",              nameKr: "S&P 500 선물",     relation: "중간 동조" },
    ],
  },
  AMD: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~5%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~6%",  type: "market-cap" },
      { symbol: "XSD",  name: "SPDR S&P Semiconductor",       nameKr: "반도체 ETF (XSD)",  weight: "~3%",  type: "equal-weight" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.57)" },
    ],
  },
  TSM: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~12%", type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~8%",  type: "market-cap" },
      { symbol: "EWT",  name: "iShares Taiwan",               nameKr: "대만 ETF (EWT)",    weight: "~25%", type: "country" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F",  name: "Nasdaq 100 Futures",          nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.73)" },
      { symbol: "^TWII", name: "Taiwan Weighted Index",       nameKr: "대만 가권지수",     relation: "대만 시장 기조" },
    ],
  },
  AVGO: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~8%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~9%",  type: "market-cap" },
      { symbol: "XLK",  name: "Technology Select Sector",     nameKr: "기술주 ETF (XLK)",  weight: "~5%",  type: "sector" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.67)" },
    ],
  },
  MU: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~3%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~4%",  type: "market-cap" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "동조 (+0.61)" },
    ],
  },
  ASML: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~5%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~5%",  type: "market-cap" },
      { symbol: "EWN",  name: "iShares Netherlands",          nameKr: "네덜란드 ETF",      weight: "~25%", type: "country" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.65)" },
    ],
  },
  LRCX: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~2%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~3%",  type: "market-cap" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.70)" },
    ],
  },
  KLAC: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~2%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~3%",  type: "market-cap" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "강한 동조 (+0.66)" },
    ],
  },
  ARM: {
    sectorEtfs: [
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~1%",  type: "market-cap" },
      { symbol: "XLK",  name: "Technology Select Sector",     nameKr: "기술주 ETF (XLK)",  weight: "~1%",  type: "sector" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "동조" },
    ],
  },
  INTC: {
    sectorEtfs: [
      { symbol: "SMH",  name: "VanEck Semiconductor",         nameKr: "반도체 ETF (SMH)",  weight: "~3%",  type: "market-cap" },
      { symbol: "SOXX", name: "iShares Semiconductor",        nameKr: "반도체 ETF (SOXX)", weight: "~4%",  type: "market-cap" },
      { symbol: "DIA",  name: "SPDR Dow Jones",               nameKr: "다우 ETF",          weight: "~0.5%", type: "index" },
    ],
    leveragedEtfs: [
      { symbol: "SOXL", name: "Direxion Semi Bull 3X",        nameKr: "반도체 3배 롱",     leverage: "+3x" },
      { symbol: "SOXS", name: "Direxion Semi Bear 3X",        nameKr: "반도체 3배 숏",     leverage: "-3x" },
    ],
    indexFutures: [
      { symbol: "NQ=F", name: "Nasdaq 100 Futures",           nameKr: "나스닥100 선물",    relation: "약한 동조 (+0.44)" },
      { symbol: "YM=F", name: "Dow Futures",                  nameKr: "다우 선물",          relation: "Dow 구성종목" },
    ],
  },
};

// 기본 세트 (매핑에 없는 종목용)
const DEFAULT_SET = {
  sectorEtfs: [
    { symbol: "SMH",  name: "VanEck Semiconductor",           nameKr: "반도체 ETF (SMH)",  type: "market-cap" },
    { symbol: "SOXX", name: "iShares Semiconductor",          nameKr: "반도체 ETF (SOXX)", type: "market-cap" },
  ],
  leveragedEtfs: [
    { symbol: "SOXL", name: "Direxion Semi Bull 3X",          nameKr: "반도체 3배 롱",     leverage: "+3x" },
    { symbol: "SOXS", name: "Direxion Semi Bear 3X",          nameKr: "반도체 3배 숏",     leverage: "-3x" },
  ],
  indexFutures: [
    { symbol: "NQ=F", name: "Nasdaq 100 Futures",             nameKr: "나스닥100 선물",    relation: "기술주 선행" },
  ],
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
    }

    const upperSym = symbol.toUpperCase();
    const mapping = STOCK_RELATED[upperSym] ?? DEFAULT_SET;

    // 모든 관련 심볼 시세 병렬 fetch
    const allRelatedSymbols = [
      ...mapping.sectorEtfs.map((e) => e.symbol),
      ...mapping.leveragedEtfs.map((e) => e.symbol),
      ...mapping.indexFutures.map((f) => f.symbol),
    ];

    const quotes = await fetchYahooQuotes(allRelatedSymbols);

    // 스파크라인 데이터 병렬
    const enrichItem = async <T extends { symbol: string }>(item: T) => {
      const q = quotes.get(item.symbol);
      let sparkline: number[] = [];
      try {
        const bars = await fetchYahooHistory(item.symbol, "1mo");
        const step = Math.max(1, Math.floor(bars.length / 30));
        for (let i = 0; i < bars.length; i += step) {
          sparkline.push(bars[i].close);
        }
        if (bars.length > 0) sparkline.push(bars[bars.length - 1].close);
      } catch {}

      return {
        ...item,
        price: q?.price ?? null,
        change: q?.change ?? null,
        changePct: q?.changePct ?? null,
        sparkline,
      };
    };

    const [sectorEtfs, leveragedEtfs, indexFutures] = await Promise.all([
      Promise.all(mapping.sectorEtfs.map(enrichItem)),
      Promise.all(mapping.leveragedEtfs.map(enrichItem)),
      Promise.all(mapping.indexFutures.map(enrichItem)),
    ]);

    return NextResponse.json({
      success: true,
      symbol: upperSym,
      sectorEtfs,
      leveragedEtfs,
      indexFutures,
      isCustomMapping: STOCK_RELATED[upperSym] !== undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
