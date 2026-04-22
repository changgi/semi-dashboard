import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * /api/market-regime
 *
 * 시장 국면 (regime) 진단 엔진.
 * - 대형 지수 추세 (SPY, QQQ, IWM)
 * - VIX 공포 수준
 * - 섹터 로테이션 (XLK, XLF, XLE, XLV, XLI, XLP)
 * - 금리 지표 (TLT, IEF)
 * - Regime 분류 (Risk-On / Risk-Off / Transition / Late-cycle)
 * - 카일 포트폴리오와의 상관
 * - 전망 (단기/중기)
 */

type QuoteShort = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  ytdPct?: number | null;
  week52Pos?: number | null;
};

async function quickQuote(symbol: string): Promise<QuoteShort> {
  try {
    const q = await fetchYahooQuote(symbol);
    if (!q) return { symbol, price: null, changePct: null };
    // 52주 범위는 historical에서 별도 계산 (메타에 없음)
    let week52Pos: number | null = null;
    try {
      const hist = await fetchYahooHistory(symbol, "1y");
      if (hist.length > 10) {
        const closes = hist.map(b => b.close).filter(v => v != null);
        const high = Math.max(...closes);
        const low = Math.min(...closes);
        if (high > low) week52Pos = (q.price - low) / (high - low);
      }
    } catch {}
    return { symbol, price: q.price, changePct: q.changePct, week52Pos };
  } catch {
    return { symbol, price: null, changePct: null };
  }
}

async function historicalTrend(symbol: string, _days = 60): Promise<{
  symbol: string;
  ret5d: number | null;
  ret20d: number | null;
  ret60d: number | null;
  sma50AboveSma200: boolean | null;
}> {
  try {
    const bars = await fetchYahooHistory(symbol, "1y");
    const closes = bars.map(b => b.close).filter(v => v != null);
    if (closes.length < 10) return { symbol, ret5d: null, ret20d: null, ret60d: null, sma50AboveSma200: null };
    const last = closes[closes.length - 1];
    const ret5d = closes.length >= 6 ? ((last / closes[closes.length - 6]) - 1) * 100 : null;
    const ret20d = closes.length >= 21 ? ((last / closes[closes.length - 21]) - 1) * 100 : null;
    const ret60d = closes.length >= 61 ? ((last / closes[closes.length - 61]) - 1) * 100 : null;
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50 : null;
    const sma200 = closes.length >= 200 ? closes.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200 : null;
    const sma50AboveSma200 = sma50 != null && sma200 != null ? sma50 > sma200 : null;
    return { symbol, ret5d, ret20d, ret60d, sma50AboveSma200 };
  } catch {
    return { symbol, ret5d: null, ret20d: null, ret60d: null, sma50AboveSma200: null };
  }
}

export async function GET(_req: NextRequest) {
  try {
    const coreSymbols = ["SPY", "QQQ", "IWM", "^VIX", "TLT"];
    const sectorSymbols = ["XLK", "XLF", "XLE", "XLV", "XLI", "XLP", "XLY", "XLU"];
    const bellwethers = ["NVDA", "AAPL", "MSFT", "GOOGL", "TSLA", "ORCL"];

    const [coreQuotes, sectorQuotes, bellwetherQuotes] = await Promise.all([
      Promise.all(coreSymbols.map(quickQuote)),
      Promise.all(sectorSymbols.map(quickQuote)),
      Promise.all(bellwethers.map(quickQuote)),
    ]);

    const trendSymbols = ["SPY", "QQQ", "IWM", "XLK", "XLF", "XLE", "XLV", "TLT"];
    const trendResults = await Promise.all(trendSymbols.map(s => historicalTrend(s, 60)));
    const trendMap = new Map(trendResults.map(t => [t.symbol, t]));

    const core = Object.fromEntries(coreQuotes.map(q => [q.symbol, q]));
    const sectors = Object.fromEntries(sectorQuotes.map(q => [q.symbol, q]));
    const bells = Object.fromEntries(bellwetherQuotes.map(q => [q.symbol, q]));

    // Regime 판단
    const spy = trendMap.get("SPY");
    const qqq = trendMap.get("QQQ");
    const iwm = trendMap.get("IWM");
    const vixLevel = core["^VIX"]?.price ?? null;
    const vixChange = core["^VIX"]?.changePct ?? null;

    let regime: "risk_on" | "risk_off" | "transition" | "late_cycle" = "transition";
    const regimeReasons: string[] = [];
    let regimeScore = 0;

    // 추세 지표
    if (spy?.ret20d != null && spy.ret20d > 2) { regimeScore += 2; regimeReasons.push(`SPY 20일 +${spy.ret20d.toFixed(1)}%`); }
    if (spy?.ret20d != null && spy.ret20d < -2) { regimeScore -= 2; regimeReasons.push(`SPY 20일 ${spy.ret20d.toFixed(1)}%`); }
    if (qqq?.ret20d != null && qqq.ret20d > 3) { regimeScore += 2; regimeReasons.push(`QQQ 20일 +${qqq.ret20d.toFixed(1)}% (기술주 강세)`); }
    if (qqq?.ret20d != null && qqq.ret20d < -3) { regimeScore -= 2; regimeReasons.push(`QQQ 20일 ${qqq.ret20d.toFixed(1)}% (기술주 약세)`); }
    if (iwm?.ret20d != null && iwm.ret20d > 2) { regimeScore += 1; regimeReasons.push(`IWM 강세 (Risk-On 신호)`); }
    if (iwm?.ret20d != null && iwm.ret20d < -3) { regimeScore -= 1; regimeReasons.push(`IWM 약세 (Risk-Off 신호)`); }

    // VIX
    if (vixLevel != null) {
      if (vixLevel < 15) { regimeScore += 2; regimeReasons.push(`VIX ${vixLevel.toFixed(1)} (안정 구간)`); }
      else if (vixLevel < 20) { regimeReasons.push(`VIX ${vixLevel.toFixed(1)} (정상 구간)`); }
      else if (vixLevel < 30) { regimeScore -= 2; regimeReasons.push(`VIX ${vixLevel.toFixed(1)} (경계)`); }
      else { regimeScore -= 4; regimeReasons.push(`VIX ${vixLevel.toFixed(1)} (공포 구간)`); }
    }

    // SMA 정배열
    if (spy?.sma50AboveSma200) { regimeScore += 1; regimeReasons.push("SPY SMA50 > SMA200 (장기 상승)"); }
    if (spy?.sma50AboveSma200 === false) { regimeScore -= 2; regimeReasons.push("SPY SMA50 < SMA200 (장기 하락 경고)"); }

    if (regimeScore >= 5) regime = "risk_on";
    else if (regimeScore <= -3) regime = "risk_off";
    else if (regimeScore <= 0 && vixLevel != null && vixLevel > 20) regime = "late_cycle";
    else regime = "transition";

    // 섹터 로테이션
    const sectorTrends = sectorSymbols.map(s => ({
      symbol: s,
      name: sectorNameMap[s] ?? s,
      ret20d: trendMap.get(s)?.ret20d ?? null,
      changePct: sectors[s]?.changePct ?? null,
      week52Pos: sectors[s]?.week52Pos ?? null,
    })).sort((a, b) => (b.ret20d ?? -999) - (a.ret20d ?? -999));

    const topSectors = sectorTrends.slice(0, 3);
    const bottomSectors = sectorTrends.slice(-3);

    // 섹터 신호 해석
    const sectorSignals: string[] = [];
    const xlk20 = trendMap.get("XLK")?.ret20d;
    const xle20 = trendMap.get("XLE")?.ret20d;
    const xlu20 = trendMap.get("XLU") ? sectors["XLU"]?.changePct : null;
    const xlp20 = trendMap.get("XLP") ? sectors["XLP"]?.changePct : null;

    if (xlk20 != null && xlk20 > 3) sectorSignals.push("XLK 강세 — AI/반도체/소프트웨어 랠리 지속");
    if (xlk20 != null && xlk20 < -3) sectorSignals.push("XLK 약세 — 기술주 조정 (카일 포트 직접 영향)");
    if (xle20 != null && xle20 > 5) sectorSignals.push("XLE 강세 — 인플레 재점화 우려");

    // 시장 전망
    const outlookShort: string[] = [];
    const outlookMid: string[] = [];

    if (regime === "risk_on") {
      outlookShort.push("단기 (1-2주): 테크/성장주 유리, 레버리지 ETF 유리");
      outlookMid.push("중기 (1-3개월): 상승 추세 유지 가능, 조정은 매수 기회");
    } else if (regime === "risk_off") {
      outlookShort.push("단기 (1-2주): 방어주/현금 비중 확대");
      outlookMid.push("중기 (1-3개월): 반등은 매도 기회, 현금 비중 높게 유지");
    } else if (regime === "late_cycle") {
      outlookShort.push("단기: 변동성 확대 예상, 2x 레버리지 위험");
      outlookMid.push("중기: 거시 지표 확인 전까지 리스크 관리 최우선");
    } else {
      outlookShort.push("단기: 방향성 불명확, 현 포지션 유지 권장");
      outlookMid.push("중기: 섹터 로테이션 발생 중, 편중 포지션 분산 고려");
    }

    // 카일 포트와의 상관
    const kylePositions = ["ORCL", "ORCX", "ORCU", "AMZU", "TSLL"];
    const kylePortfolioImpact: any[] = [];
    let portfolioData: any[] = [];
    try {
      const supabase = createAdmin();
      const { data } = await supabase.from("portfolio").select("*");
      portfolioData = data ?? [];
    } catch {}

    for (const pos of portfolioData) {
      const sym = pos.symbol;
      let underlying = sym;
      if (sym === "ORCX" || sym === "ORCU") underlying = "ORCL";
      if (sym === "AMZU") underlying = "AMZN";
      if (sym === "TSLL") underlying = "TSLA";

      const bell = bells[underlying];
      kylePortfolioImpact.push({
        symbol: sym,
        underlying,
        underlyingChange: bell?.changePct ?? null,
        leverage: pos.leverage ?? 1,
        leveragedImpact: bell?.changePct != null ? (bell.changePct * (pos.leverage ?? 1)) : null,
      });
    }

    // 핵심 한 줄
    const headline = buildHeadline(regime, vixLevel, topSectors[0], bottomSectors[bottomSectors.length - 1]);

    // 오늘의 테마
    const themes: string[] = [];
    if (xlk20 != null && xlk20 > xle20!) themes.push("기술주 > 에너지 — 디스인플레이션 시나리오");
    if (xlk20 != null && xlk20 < xle20!) themes.push("에너지 > 기술주 — 인플레이션 재점화");
    if (iwm?.ret20d != null && qqq?.ret20d != null && iwm.ret20d > qqq.ret20d + 2) themes.push("Small-cap > Mega-cap — 경기 낙관");
    if (qqq?.ret20d != null && iwm?.ret20d != null && qqq.ret20d > iwm.ret20d + 2) themes.push("Mega-cap > Small-cap — 방어 + 성장 집중");

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      regime,
      regimeScore,
      regimeReasons,
      headline,
      themes,
      indices: {
        SPY: { ...core.SPY, ...trendMap.get("SPY") },
        QQQ: { ...core.QQQ, ...trendMap.get("QQQ") },
        IWM: { ...core.IWM, ...trendMap.get("IWM") },
        VIX: core["^VIX"],
        TLT: { ...core.TLT, ...trendMap.get("TLT") },
      },
      sectors: sectorTrends,
      sectorRotation: {
        leaders: topSectors,
        laggards: bottomSectors,
      },
      sectorSignals,
      bellwethers: bells,
      outlook: {
        short: outlookShort,
        mid: outlookMid,
      },
      kylePortfolioImpact,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true }, { status: 200 });
  }
}

const sectorNameMap: Record<string, string> = {
  XLK: "기술",
  XLF: "금융",
  XLE: "에너지",
  XLV: "헬스케어",
  XLI: "산업재",
  XLP: "필수소비재",
  XLY: "임의소비재",
  XLU: "유틸리티",
};

function buildHeadline(regime: string, vix: number | null, top: any, bottom: any): string {
  const regimeLabel = regime === "risk_on" ? "리스크온" : regime === "risk_off" ? "리스크오프" : regime === "late_cycle" ? "후기 사이클" : "방향성 탐색";
  const vixDesc = vix != null ? (vix < 15 ? "안정" : vix < 25 ? "정상" : "경계") : "-";
  const topName = top?.name ?? "-";
  const bottomName = bottom?.name ?? "-";
  return `${regimeLabel} 국면 · VIX ${vixDesc} · ${topName} 강세, ${bottomName} 약세`;
}
