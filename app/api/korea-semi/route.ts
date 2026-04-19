import { NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 한국 반도체 생태계 (Daniel Yoo 저평가 1위/4위 + 장비주)
// ═══════════════════════════════════════════════════════════

const KOREA_STOCKS = {
  // 메모리 대형주 (Daniel Yoo 글로벌 저평가 1위 / 4위)
  majors: [
    { symbol: "000660.KS", name: "SK하이닉스",     nameEn: "SK Hynix",      subtitle: "HBM 세계 1위 · Daniel Yoo 글로벌 저평가 1위", marketCap: "~820조", role: "memory" },
    { symbol: "005930.KS", name: "삼성전자",       nameEn: "Samsung",       subtitle: "글로벌 메모리 1위 · Daniel Yoo 4위",         marketCap: "~1400조", role: "memory" },
  ],
  // 반도체 장비/소재 (HBM 수혜)
  equipment: [
    { symbol: "042700.KS", name: "한미반도체",      nameEn: "HanmiSemi",     subtitle: "HBM 본딩 장비 독점 · TC Bonder",              marketCap: "~26조",  role: "equipment" },
    { symbol: "240810.KS", name: "원익IPS",        nameEn: "Wonik IPS",     subtitle: "CVD/ALD 장비 · 삼성/하이닉스 공급",             marketCap: "~1.7조", role: "equipment" },
    { symbol: "036930.KS", name: "주성엔지니어링", nameEn: "Jusung Eng",    subtitle: "ALD/CVD 장비 · 삼성 주력",                      marketCap: "~1.1조", role: "equipment" },
    { symbol: "039030.KS", name: "이오테크닉스",   nameEn: "Eo Technics",   subtitle: "레이저 마킹 장비 · AI 칩 후공정",               marketCap: "~2.5조", role: "equipment" },
    { symbol: "058470.KS", name: "리노공업",       nameEn: "Leeno Industrial", subtitle: "테스트핀 · 반도체 검사 세계 1위",           marketCap: "~3.3조", role: "equipment" },
    { symbol: "095610.KS", name: "테스",           nameEn: "TES",           subtitle: "반도체 식각 장비 · 삼성/SK 공급",               marketCap: "~4600억", role: "equipment" },
  ],
  // 반도체 ETF
  etfs: [
    { symbol: "091170.KS", name: "KODEX 반도체",    nameEn: "KODEX Semi",        subtitle: "삼성전자+SK하이닉스+장비주 종합 ETF",       marketCap: "ETF",    role: "etf" },
    { symbol: "139290.KS", name: "TIGER 200 IT",   nameEn: "TIGER 200 IT",      subtitle: "코스피200 IT 섹터 ETF",                      marketCap: "ETF",    role: "etf" },
    { symbol: "122630.KS", name: "KODEX 레버리지", nameEn: "KODEX Leverage 2x", subtitle: "KOSPI200 2배 레버리지 · 공격적",            marketCap: "ETF",    role: "leveraged" },
    { symbol: "252670.KS", name: "KODEX 인버스2X", nameEn: "KODEX Inverse 2x",  subtitle: "KOSPI200 -2배 · 하락 헤지",                 marketCap: "ETF",    role: "inverse" },
  ],
};

const ALL_SYMBOLS = [
  ...KOREA_STOCKS.majors,
  ...KOREA_STOCKS.equipment,
  ...KOREA_STOCKS.etfs,
].map((s) => s.symbol);

// 지수
const INDICES = ["^KS11", "^KQ11"]; // KOSPI, KOSDAQ

// 환율 및 매크로
const MACRO_SYMBOLS = ["KRW=X", "SMH", "SOXX", "^NDX"];

export async function GET() {
  try {
    // 1. 모든 종목 시세 + 지수 + 매크로 병렬 fetch
    const [stockQuotes, indexQuotes, macroQuotes] = await Promise.all([
      fetchYahooQuotes(ALL_SYMBOLS),
      fetchYahooQuotes(INDICES),
      fetchYahooQuotes(MACRO_SYMBOLS),
    ]);

    // 스파크라인 포함해 enrichment
    const enrichStock = async <T extends { symbol: string; name: string; nameEn: string; subtitle: string; marketCap: string; role: string }>(
      item: T
    ) => {
      const q = stockQuotes.get(item.symbol);
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
        prevClose: q?.prevClose ?? null,
        dayHigh: q?.dayHigh ?? null,
        dayLow: q?.dayLow ?? null,
        volume: q?.volume ?? null,
        marketState: q?.marketState ?? null,
        sparkline,
      };
    };

    const [majors, equipment, etfs] = await Promise.all([
      Promise.all(KOREA_STOCKS.majors.map(enrichStock)),
      Promise.all(KOREA_STOCKS.equipment.map(enrichStock)),
      Promise.all(KOREA_STOCKS.etfs.map(enrichStock)),
    ]);

    // 2. 지수 정보
    const kospi = indexQuotes.get("^KS11");
    const kosdaq = indexQuotes.get("^KQ11");

    // 3. 매크로 맥락
    const usdKrw = macroQuotes.get("KRW=X");
    const smh = macroQuotes.get("SMH");
    const ndx = macroQuotes.get("^NDX");

    // ═══════════════════════════════════════════════
    // 4. 한국 반도체 특별 시그널 생성
    // ═══════════════════════════════════════════════
    const signals: Array<{ level: "positive" | "negative" | "neutral"; icon: string; title: string; message: string }> = [];

    // USD/KRW → 수출 수혜
    if (usdKrw?.price) {
      if (usdKrw.price > 1450) {
        signals.push({
          level: "positive",
          icon: "💱",
          title: "원화 초약세 - 메모리 수혜 극대화",
          message: `USD/KRW ${usdKrw.price.toFixed(0)}원 - 삼성/SK하이닉스 외화환산 이익 대폭 증가, Q2 실적 기대`,
        });
      } else if (usdKrw.price > 1350) {
        signals.push({
          level: "positive",
          icon: "💱",
          title: "원화 약세 수출 우호",
          message: `USD/KRW ${usdKrw.price.toFixed(0)}원 - 수출 기업 환율 수혜 구간`,
        });
      }
    }

    // SK하이닉스 vs 미국 메모리(MU) 방향성
    const hynixChange = majors[0].changePct;
    if (hynixChange !== null && hynixChange !== undefined) {
      if (hynixChange > 2) {
        signals.push({
          level: "positive",
          icon: "🧠",
          title: "SK하이닉스 강세",
          message: `+${hynixChange.toFixed(2)}% - HBM 수요 지속 · NVIDIA 공급 확대 기대`,
        });
      } else if (hynixChange < -3) {
        signals.push({
          level: "negative",
          icon: "🧠",
          title: "SK하이닉스 조정",
          message: `${hynixChange.toFixed(2)}% - Daniel Yoo 역발상 매수 영역 진입, 글로벌 저평가 1위 재확인`,
        });
      }
    }

    // 한미반도체 (HBM TC Bonder 독점)
    const hanmi = equipment.find((e) => e.symbol === "042700.KS");
    if (hanmi?.changePct !== null && hanmi?.changePct !== undefined) {
      if (hanmi.changePct > 3) {
        signals.push({
          level: "positive",
          icon: "⚡",
          title: "한미반도체 급등",
          message: `+${hanmi.changePct.toFixed(2)}% - HBM TC Bonder 수요 급증 신호 · 메모리 사이클 확인`,
        });
      } else if (hanmi.changePct < -5) {
        signals.push({
          level: "negative",
          icon: "⚡",
          title: "한미반도체 급락",
          message: `${hanmi.changePct.toFixed(2)}% - HBM 수주 둔화 우려 · 메모리 전방 확인 필요`,
        });
      }
    }

    // SMH (글로벌 반도체) vs KOSPI 반도체 섹터
    if (smh?.changePct !== null && smh?.changePct !== undefined) {
      if (smh.changePct > 2) {
        signals.push({
          level: "positive",
          icon: "🌐",
          title: "글로벌 반도체 랠리",
          message: `SMH +${smh.changePct.toFixed(2)}% - 한국 반도체도 동조 상승 기대 (장중 미국 뉴스에 민감)`,
        });
      }
    }

    // 코스피 방향
    if (kospi?.changePct !== null && kospi?.changePct !== undefined) {
      if (kospi.changePct < -1.5) {
        signals.push({
          level: "negative",
          icon: "📉",
          title: "코스피 조정",
          message: `${kospi.changePct.toFixed(2)}% - 외국인 매도 가능성 · 개별 종목 변동성 확대 주의`,
        });
      }
    }

    // 상하한가 근접 체크
    for (const stock of [...majors, ...equipment]) {
      if (stock.changePct !== null && stock.changePct !== undefined) {
        if (stock.changePct > 20) {
          signals.push({
            level: "positive",
            icon: "🚀",
            title: `${stock.name} 상한가 근접`,
            message: `+${stock.changePct.toFixed(2)}% - 상한가 임박 · 거래량 확인 필요`,
          });
        } else if (stock.changePct < -15) {
          signals.push({
            level: "negative",
            icon: "⚠️",
            title: `${stock.name} 급락`,
            message: `${stock.changePct.toFixed(2)}% - 매도 압박 · 뉴스 확인 필요`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════
    // 5. 섹터 요약 통계
    // ═══════════════════════════════════════════════
    const allStocks = [...majors, ...equipment];
    const priceChanges = allStocks
      .map((s) => s.changePct)
      .filter((p): p is number => p !== null && p !== undefined);

    const sectorStats = {
      avgChange: priceChanges.length > 0
        ? Math.round((priceChanges.reduce((s, v) => s + v, 0) / priceChanges.length) * 100) / 100
        : 0,
      positiveCount: priceChanges.filter((p) => p > 0).length,
      negativeCount: priceChanges.filter((p) => p < 0).length,
      flatCount: priceChanges.filter((p) => p === 0).length,
      totalCount: priceChanges.length,
    };

    // ═══════════════════════════════════════════════
    // 6. 외국인/기관 매매 프록시 (코스피 지수 방향)
    // ═══════════════════════════════════════════════
    let foreignSentiment: "buying" | "selling" | "neutral" = "neutral";
    if (kospi?.changePct !== null && kospi?.changePct !== undefined) {
      // 코스피와 SK하이닉스/삼성 방향 비교
      const hynixPct = majors[0].changePct ?? 0;
      const samsungPct = majors[1].changePct ?? 0;
      const avgMajor = (hynixPct + samsungPct) / 2;
      const kospiPct = kospi.changePct;

      // 대형주가 지수보다 2% 이상 좋으면 외국인 매수 시그널
      if (avgMajor - kospiPct > 2) foreignSentiment = "buying";
      else if (avgMajor - kospiPct < -2) foreignSentiment = "selling";
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      indices: {
        kospi: kospi
          ? {
              price: kospi.price,
              change: kospi.change,
              changePct: kospi.changePct,
              marketState: kospi.marketState,
            }
          : null,
        kosdaq: kosdaq
          ? {
              price: kosdaq.price,
              change: kosdaq.change,
              changePct: kosdaq.changePct,
              marketState: kosdaq.marketState,
            }
          : null,
      },
      macro: {
        usdKrw: usdKrw?.price,
        usdKrwChange: usdKrw?.changePct,
        smhChange: smh?.changePct,
        ndxChange: ndx?.changePct,
      },
      stocks: {
        majors,
        equipment,
        etfs,
      },
      signals,
      sectorStats,
      foreignSentiment,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
