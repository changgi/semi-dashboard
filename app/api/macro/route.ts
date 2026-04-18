import { NextResponse } from "next/server";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ───────────────────────────────────────────────────────────
// 매크로 지표 정의 (반도체 영향 요인)
// ───────────────────────────────────────────────────────────
const MACROS = [
  // === Oil (원유) - 반도체 공정/운영비 영향 ===
  { symbol: "CL=F",   name: "WTI 원유",        nameEn: "WTI Crude", category: "oil",   impact: "반도체 공정비 · 해운비 · 인플레이션" },
  { symbol: "BZ=F",   name: "브렌트유",        nameEn: "Brent",     category: "oil",   impact: "국제 유가 기준 · 중동 지정학" },
  { symbol: "USO",    name: "위캔오일 (USO)", nameEn: "USO ETF",   category: "oil",   impact: "원유 ETF · 주말 대리 지표" },

  // === Indices (주요 지수) ===
  { symbol: "^IXIC",  name: "나스닥종합",     nameEn: "Nasdaq",    category: "index", impact: "기술주 전체 시장 기조" },
  { symbol: "^NDX",   name: "나스닥100",       nameEn: "Nasdaq 100", category: "index", impact: "위캔나스닥 기준 지수" },
  { symbol: "^GSPC",  name: "S&P 500",         nameEn: "S&P 500",   category: "index", impact: "시장 전체 방향성" },

  // === Bonds & Dollar ===
  { symbol: "^TNX",   name: "美 10Y 국채",     nameEn: "10Y Yield", category: "bond",  impact: "할인율 · PER 상한선 · 성장주 밸류에이션" },
  { symbol: "DX-Y.NYB", name: "달러 인덱스",   nameEn: "DXY",       category: "fx",    impact: "반도체 수출가격 · 신흥국 유동성" },

  // === Volatility ===
  { symbol: "^VIX",   name: "VIX 공포지수",    nameEn: "VIX",       category: "vol",   impact: "시장 심리 · 변동성 과매수/과매도" },

  // === Semiconductor Sector ===
  { symbol: "SOXX",   name: "반도체 ETF (SOXX)", nameEn: "SOXX",    category: "semi",  impact: "필라델피아 반도체 지수" },
  { symbol: "SMH",    name: "반도체 ETF (SMH)",  nameEn: "SMH",     category: "semi",  impact: "반도체 대장주 중심 ETF" },

  // === Korea Semi ===
  { symbol: "005930.KS", name: "삼성전자",     nameEn: "Samsung",   category: "korea", impact: "글로벌 메모리 1위 · Daniel Yoo 4위 평가" },
  { symbol: "000660.KS", name: "SK하이닉스",   nameEn: "SK Hynix",  category: "korea", impact: "HBM 세계 1위 · Daniel Yoo 글로벌 저평가 1위" },
  { symbol: "^KS11",     name: "코스피",       nameEn: "KOSPI",     category: "korea", impact: "한국 시장 · Daniel Yoo 10,000p 전망" },
];

export async function GET() {
  try {
    const symbols = MACROS.map((m) => m.symbol);
    const quotes = await fetchYahooQuotes(symbols);

    const items = MACROS.map((m) => {
      const q = quotes.get(m.symbol);
      return {
        symbol: m.symbol,
        name: m.name,
        nameEn: m.nameEn,
        category: m.category,
        impact: m.impact,
        price: q?.price ?? null,
        change: q?.change ?? null,
        changePct: q?.changePct ?? null,
        prevClose: q?.prevClose ?? null,
        dayHigh: q?.dayHigh ?? null,
        dayLow: q?.dayLow ?? null,
        volume: q?.volume ?? null,
        marketState: q?.marketState ?? null,
        sparkline: [] as number[], // 나중에 채움
      };
    });

    // ★ 각 심볼의 1개월 스파크라인 데이터 병렬 fetch
    await Promise.all(
      items.map(async (item) => {
        try {
          const bars = await fetchYahooHistory(item.symbol, "1mo");
          // 최대 30개 데이터 포인트만 사용
          const step = Math.max(1, Math.floor(bars.length / 30));
          const sparkline: number[] = [];
          for (let i = 0; i < bars.length; i += step) {
            sparkline.push(bars[i].close);
          }
          if (bars.length > 0 && sparkline[sparkline.length - 1] !== bars[bars.length - 1].close) {
            sparkline.push(bars[bars.length - 1].close);
          }
          item.sparkline = sparkline;
        } catch {
          item.sparkline = [];
        }
      })
    );

    // 카테고리별 그룹화
    const byCategory = {
      oil: items.filter((i) => i.category === "oil"),
      index: items.filter((i) => i.category === "index"),
      bond: items.filter((i) => i.category === "bond"),
      fx: items.filter((i) => i.category === "fx"),
      vol: items.filter((i) => i.category === "vol"),
      semi: items.filter((i) => i.category === "semi"),
      korea: items.filter((i) => i.category === "korea"),
    };

    // 매크로 시그널 생성 (Daniel Yoo 프레임워크 기반)
    const signals = generateMacroSignals(items);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      items,
      byCategory,
      signals,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────
// 매크로 시그널 분석 (Daniel Yoo 스타일)
// ───────────────────────────────────────────────────────────
interface MacroSignal {
  type: "positive" | "negative" | "neutral";
  title: string;
  message: string;
  source: string;
}

function generateMacroSignals(items: { symbol: string; name: string; price: number | null; changePct: number | null; }[]): MacroSignal[] {
  const get = (sym: string) => items.find((i) => i.symbol === sym);
  const signals: MacroSignal[] = [];

  const oil = get("CL=F");
  const yield10 = get("^TNX");
  const vix = get("^VIX");
  const ndx = get("^NDX");
  const dxy = get("DX-Y.NYB");
  const soxx = get("SOXX");
  const kospi = get("^KS11");

  // 1. 국채금리 분석 (Daniel Yoo: 4.25% → 3.5% 하락 시 나스닥 40% 상승 여지)
  if (yield10?.price) {
    if (yield10.price < 3.8) {
      signals.push({
        type: "positive",
        title: "📉 10Y 국채 하락",
        message: `금리 ${yield10.price.toFixed(2)}% - 할인율 하락으로 성장주 밸류에이션 상향 여지. PER 확장 가능`,
        source: "Daniel Yoo 분석",
      });
    } else if (yield10.price > 4.5) {
      signals.push({
        type: "negative",
        title: "📈 10Y 국채 급등",
        message: `금리 ${yield10.price.toFixed(2)}% - 성장주 밸류에이션 압박. PER 축소 위험`,
        source: "Macro Risk",
      });
    } else {
      signals.push({
        type: "neutral",
        title: "⚖️ 10Y 국채 안정",
        message: `금리 ${yield10.price.toFixed(2)}% - 장단기 금리차 0.5~0.6% 안정적 범위`,
        source: "Daniel Yoo 프레임",
      });
    }
  }

  // 2. VIX 공포지수 (Daniel Yoo: 탐욕 68 수준 언급)
  if (vix?.price) {
    if (vix.price < 15) {
      signals.push({
        type: "neutral",
        title: "😴 VIX 극저",
        message: `VIX ${vix.price.toFixed(1)} - 과도한 낙관. 변동성 폭발 대비 필요 (Taleb 경계)`,
        source: "Volatility Watch",
      });
    } else if (vix.price > 25) {
      signals.push({
        type: "positive",
        title: "🎯 VIX 급등",
        message: `VIX ${vix.price.toFixed(1)} - 공포 확산. 역발상 매수 기회 가능 (Buffett "when others are fearful")`,
        source: "Contrarian Signal",
      });
    } else {
      signals.push({
        type: "positive",
        title: "✅ VIX 정상",
        message: `VIX ${vix.price.toFixed(1)} - 안정 구간. 적극 투자 환경`,
        source: "Market Health",
      });
    }
  }

  // 3. 원유 - 반도체 공정비용 영향
  if (oil?.price) {
    if (oil.price > 90) {
      signals.push({
        type: "negative",
        title: "🛢️ 유가 급등",
        message: `WTI $${oil.price.toFixed(0)} - 반도체 공정비·해운비 상승 리스크. 인플레 재점화 우려`,
        source: "Input Cost Risk",
      });
    } else if (oil.price < 70) {
      signals.push({
        type: "positive",
        title: "⛽ 유가 안정",
        message: `WTI $${oil.price.toFixed(0)} - 생산비 안정. 마진 개선 여지. 항공/운송 수혜`,
        source: "Daniel Yoo 분석",
      });
    }
  }

  // 4. 달러 - 수출기업 영향
  if (dxy?.price) {
    if (dxy.price > 105) {
      signals.push({
        type: "negative",
        title: "💵 달러 강세",
        message: `DXY ${dxy.price.toFixed(1)} - 신흥국 유동성 축소. 반도체 수출기업 환율 부담`,
        source: "FX Pressure",
      });
    } else if (dxy.price < 100) {
      signals.push({
        type: "positive",
        title: "💴 달러 약세",
        message: `DXY ${dxy.price.toFixed(1)} - 신흥국 수혜. 한국 반도체 수출 유리`,
        source: "Korea Tailwind",
      });
    }
  }

  // 5. 반도체 ETF 모멘텀
  if (soxx?.changePct !== null && soxx?.changePct !== undefined) {
    if (soxx.changePct > 2) {
      signals.push({
        type: "positive",
        title: "🚀 반도체 랠리",
        message: `SOXX ${soxx.changePct > 0 ? "+" : ""}${soxx.changePct.toFixed(2)}% - AI 슈퍼사이클 지속. Memflation 수혜`,
        source: "AI Supercycle",
      });
    } else if (soxx.changePct < -3) {
      signals.push({
        type: "negative",
        title: "⚠️ 반도체 조정",
        message: `SOXX ${soxx.changePct.toFixed(2)}% - 단기 차익실현. Daniel Yoo 프레임: 6개월 내 전고점 탈환 예상`,
        source: "Short-term Correction",
      });
    }
  }

  // 6. 나스닥 100 (Daniel Yoo: PEG 0.63, 12개월 40% 상승 여지)
  if (ndx?.changePct !== null && ndx?.changePct !== undefined) {
    if (ndx.changePct > 1) {
      signals.push({
        type: "positive",
        title: "📈 나스닥 강세",
        message: `NDX ${ndx.changePct > 0 ? "+" : ""}${ndx.changePct.toFixed(2)}% - Daniel Yoo: PEG 0.63, 이익증가율 39%, 가장 매력적 지수`,
        source: "Daniel Yoo - 나스닥100 최선호",
      });
    }
  }

  // 7. 코스피 (Daniel Yoo: 10,000p 전망)
  if (kospi?.price) {
    signals.push({
      type: "positive",
      title: "🇰🇷 한국 매력도",
      message: `KOSPI ${kospi.price.toFixed(0)} - Daniel Yoo: 재평가 없이도 10,000p 돌파 가능, 신흥국 중 13% 비중 추천`,
      source: "Korea Overweight",
    });
  }

  return signals;
}
