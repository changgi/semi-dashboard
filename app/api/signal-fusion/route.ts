import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuote, fetchYahooHistory } from "@/lib/yahoo";
import { createAdmin } from "@/lib/supabase";
import { retryFetchJson } from "@/lib/retry-fetch";

export const revalidate = 600; // 10분 캐시
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/signal-fusion
 *
 * 시그널 융합 엔진 (Whale Insight + 세시반 + 카일 전략)
 *
 * 카일님 원글 인용:
 * "남이 짜준 전략 복붙하는 것보다, 소스를 직접 큐레이션해서
 *  내 시그널을 만드는 게 훨씬 AI 매매다운 방향"
 *
 * 융합 시그널 = 
 *   (1) 스마트 머니 시그널: DART 공시 빈도 + 기관 주목도
 *   (2) 수급 시그널: 거래량 급증 + 종가 강도
 *   (3) 전략 시그널: 카일 7가지 투자 원칙 필터
 *   (4) 리스크 조정: 레버리지/집중도 반영
 *
 * 출력: 종목별 종합 점수 + 매매 권고 + 근거 체인
 */

type FusedSignal = {
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ" | "US" | "unknown";
  currentPrice: number;
  changePct: number;

  smartMoneyScore: number;  // 0-100: DART 공시 빈도 기반
  supplyDemandScore: number; // 0-100: 수급 강도
  strategyFitScore: number;  // 0-100: 카일 원칙 적합도
  riskPenalty: number;       // 0-50: 리스크 감점

  fusedScore: number;        // 최종 종합 점수
  signal: "STRONG_BUY" | "BUY" | "WATCH" | "AVOID" | "HOLD_CURRENT";
  confidence: number;        // 0-100

  reasoning: {
    smartMoney: string[];
    supplyDemand: string[];
    strategyFit: string[];
    risks: string[];
  };

  portfolioContext?: {
    alreadyHeld: boolean;
    currentWeight?: number;
    avgCost?: number;
    pnlPct?: number;
    leverage?: number;
  };
};

// 카일 7원칙
const KYLE_PRINCIPLES = {
  maxUnderlyingWeight: 0.25,  // 1. 기초자산 25% 이하
  maxLeverageWeight: 0.30,    // 2. 레버리지 30% 이하
  requireStopLoss: true,      // 3. 손절가 필수
  journalWithin24h: true,     // 4. 24시간 내 Journal
  noLossAvg: true,            // 5. 손실 종목 물타기 금지
  no2DayBeforeEarnings: true, // 6. 실적 D-2 레버리지 금지
  waitOnEmotion24h: true,     // 7. 감정 개입 시 24시간
};

const LEVERAGE_BY_SYMBOL: Record<string, number> = {
  ORCX: 2, ORCU: 2, ORCS: 2, AMZU: 2, TSLL: 2,
  NVDU: 2, NVDL: 2, TQQQ: 3, SOXL: 3, TNA: 3,
};

async function fetchKylePortfolio() {
  try {
    const supabase = createAdmin();
    const { data } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    if (!data) return [];
    const totalValue = data.reduce((s, p) => s + (p.shares * p.avg_cost), 0);
    return data.map(p => ({
      symbol: p.symbol,
      shares: p.shares,
      avgCost: p.avg_cost,
      weight: totalValue > 0 ? (p.shares * p.avg_cost) / totalValue : 0,
      leverage: LEVERAGE_BY_SYMBOL[p.symbol] ?? 1,
    }));
  } catch {
    return [];
  }
}

async function fetchDartDisclosureCount(
  dartApiKey: string,
  stockCode: string,
  days: number = 30
): Promise<{ disclosureCount: number; hasPensionSignal: boolean }> {
  if (!dartApiKey) return { disclosureCount: 0, hasPensionSignal: false };
  const now = new Date();
  const endDe = now.toISOString().slice(0, 10).replace(/-/g, "");
  const bgnDe = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    // 종목코드로 회사 고유번호 조회는 복잡하므로, 전체 공시에서 필터링하는 방식 대신
    // 단순화: 해당 종목코드 검색
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${dartApiKey}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_detail_ty=D002&page_count=50`;
    const data: any = await retryFetchJson(url, {
      headers: { "User-Agent": "Mozilla/5.0 Semi-Dashboard/1.0" },
    }, { maxRetries: 2, timeoutMs: 10000 });
    if (data?.status !== "000") return { disclosureCount: 0, hasPensionSignal: false };
    const list = data?.list ?? [];
    const matching = list.filter((item: any) => item.stock_code === stockCode);
    const hasPension = matching.some((item: any) =>
      (item.report_nm ?? "").includes("국민연금")
    );
    return { disclosureCount: matching.length, hasPensionSignal: hasPension };
  } catch {
    return { disclosureCount: 0, hasPensionSignal: false };
  }
}

async function analyzeForFusion(
  symbol: string,
  name: string,
  kylePortfolio: any[],
  dartApiKey: string | undefined
): Promise<FusedSignal | null> {
  try {
    const [quote, history] = await Promise.all([
      fetchYahooQuote(symbol),
      fetchYahooHistory(symbol, "3mo"),
    ]);
    if (!quote || !history || history.length < 20) return null;

    const closes = history.map(b => b.close);
    const volumes = history.map(b => b.volume ?? 0);
    const today = history[history.length - 1];
    if (!today) return null;

    // 포트폴리오 컨텍스트
    const existing = kylePortfolio.find(p => p.symbol === symbol);
    const portfolioContext = existing ? {
      alreadyHeld: true,
      currentWeight: existing.weight,
      avgCost: existing.avgCost,
      pnlPct: ((quote.price / existing.avgCost) - 1) * 100,
      leverage: existing.leverage,
    } : { alreadyHeld: false };

    // ───── 1. 스마트 머니 시그널 (DART) ─────
    let smartMoneyScore = 50;
    const smartMoneyReasons: string[] = [];
    // 한국 종목만 DART 조회 가능
    if (dartApiKey && (symbol.endsWith(".KS") || symbol.endsWith(".KQ"))) {
      const stockCode = symbol.split(".")[0];
      const { disclosureCount, hasPensionSignal } = await fetchDartDisclosureCount(dartApiKey, stockCode, 30);
      if (hasPensionSignal) {
        smartMoneyScore += 25;
        smartMoneyReasons.push("🐋 국민연금 최근 30일 내 공시 발생");
      }
      if (disclosureCount >= 3) {
        smartMoneyScore += 15;
        smartMoneyReasons.push(`대량보유 공시 ${disclosureCount}건 집중 (기관 관심 고조)`);
      } else if (disclosureCount >= 1) {
        smartMoneyScore += 8;
        smartMoneyReasons.push(`대량보유 공시 ${disclosureCount}건 발생`);
      } else {
        smartMoneyReasons.push("최근 30일 대량보유 공시 없음 (스마트 머니 중립)");
      }
    } else {
      smartMoneyReasons.push("미국 종목 - DART 공시 데이터 없음 (13F 데이터는 추후 연동)");
    }
    smartMoneyScore = Math.max(0, Math.min(100, smartMoneyScore));

    // ───── 2. 수급 시그널 (세시반) ─────
    let supplyDemandScore = 50;
    const supplyDemandReasons: string[] = [];
    const avgVol20 = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const volumeRatio = avgVol20 === 0 ? 1 : today.volume / avgVol20;
    const closingStrength = (today.high - today.low) === 0
      ? 0.5
      : (today.close - today.low) / (today.high - today.low);

    if (volumeRatio >= 3) {
      supplyDemandScore += 20;
      supplyDemandReasons.push(`거래량 ${volumeRatio.toFixed(1)}배 폭발 (주목 급증)`);
    } else if (volumeRatio >= 2) {
      supplyDemandScore += 12;
      supplyDemandReasons.push(`거래량 ${volumeRatio.toFixed(1)}배 증가`);
    } else if (volumeRatio < 0.5) {
      supplyDemandScore -= 10;
      supplyDemandReasons.push("거래량 위축 (관심 소멸)");
    }
    if (closingStrength > 0.8) {
      supplyDemandScore += 15;
      supplyDemandReasons.push("종가 고점 마감 (장 마감 강세)");
    } else if (closingStrength < 0.2) {
      supplyDemandScore -= 10;
      supplyDemandReasons.push("종가 저점 마감 (매도 압력)");
    }
    if (quote.changePct > 3) {
      supplyDemandScore += 8;
      supplyDemandReasons.push(`당일 +${quote.changePct.toFixed(1)}% 강세`);
    } else if (quote.changePct < -3) {
      supplyDemandScore -= 8;
      supplyDemandReasons.push(`당일 ${quote.changePct.toFixed(1)}% 약세`);
    }
    supplyDemandScore = Math.max(0, Math.min(100, supplyDemandScore));

    // ───── 3. 전략 적합도 (카일 7원칙) ─────
    let strategyFitScore = 70;
    const strategyReasons: string[] = [];

    // 원칙 2: 레버리지 ETF는 전체 30% 이하
    const currentLeverageWeight = kylePortfolio
      .filter(p => p.leverage > 1)
      .reduce((s, p) => s + p.weight, 0);
    const thisIsLeverage = LEVERAGE_BY_SYMBOL[symbol] ?? 1;
    if (thisIsLeverage > 1) {
      if (currentLeverageWeight >= 0.30) {
        strategyFitScore -= 30;
        strategyReasons.push(`⚠️ 레버리지 ETF · 현재 비중 이미 ${(currentLeverageWeight * 100).toFixed(0)}% (원칙 2 위반 위험)`);
      } else {
        strategyReasons.push(`레버리지 ${thisIsLeverage}x · 현재 여유 ${((0.30 - currentLeverageWeight) * 100).toFixed(0)}%p`);
      }
    }

    // 원칙 1: 기초자산 25% 이하
    const UNDERLYING_MAP: Record<string, string> = {
      ORCX: "ORCL", ORCU: "ORCL", ORCS: "ORCL",
      AMZU: "AMZN", TSLL: "TSLA", NVDU: "NVDA", NVDL: "NVDA",
    };
    const underlying = UNDERLYING_MAP[symbol] ?? symbol;
    const underlyingWeight = kylePortfolio
      .filter(p => (UNDERLYING_MAP[p.symbol] ?? p.symbol) === underlying)
      .reduce((s, p) => s + p.weight, 0);
    if (underlyingWeight >= 0.25) {
      strategyFitScore -= 20;
      strategyReasons.push(`⚠️ ${underlying} 기초자산 비중 이미 ${(underlyingWeight * 100).toFixed(0)}% (원칙 1 초과)`);
    }

    // 원칙 5: 손실 종목 물타기 금지
    if (existing && existing.leverage === 1) {
      const pnl = ((quote.price / existing.avgCost) - 1) * 100;
      if (pnl < -10) {
        strategyReasons.push(`본주 손실 ${pnl.toFixed(1)}% · 물타기 금지 원칙은 레버리지만 해당 (본주는 허용)`);
      }
    } else if (existing && existing.leverage > 1) {
      const pnl = ((quote.price / existing.avgCost) - 1) * 100;
      if (pnl < -10) {
        strategyFitScore -= 25;
        strategyReasons.push(`🚫 레버리지 ETF 손실 ${pnl.toFixed(1)}% - 추가 매수 금지 (원칙 5)`);
      }
    }

    strategyFitScore = Math.max(0, Math.min(100, strategyFitScore));

    // ───── 4. 리스크 페널티 ─────
    let riskPenalty = 0;
    const riskReasons: string[] = [];
    if (thisIsLeverage >= 3) {
      riskPenalty += 20;
      riskReasons.push(`${thisIsLeverage}x 레버리지 - 극고위험`);
    } else if (thisIsLeverage === 2) {
      riskPenalty += 10;
      riskReasons.push(`${thisIsLeverage}x 레버리지`);
    }
    // 변동성 페널티
    const ret1d = closes.slice(-20).map((c, i, a) => i === 0 ? 0 : Math.abs(Math.log(c / a[i - 1])));
    const dailyVol = ret1d.reduce((s, v) => s + v, 0) / ret1d.length * 100;
    if (dailyVol > 5) {
      riskPenalty += 10;
      riskReasons.push(`일간 변동성 ${dailyVol.toFixed(1)}% (고변동)`);
    }

    // ───── 5. 최종 융합 점수 ─────
    // 가중 평균: 스마트머니 30% + 수급 30% + 전략적합 30% - 리스크 페널티
    const fusedScore = Math.max(0, Math.min(100,
      smartMoneyScore * 0.30 +
      supplyDemandScore * 0.30 +
      strategyFitScore * 0.30 +
      10 - // 기본 보정
      riskPenalty * 0.5
    ));

    // ───── 6. 시그널 판정 ─────
    let signal: FusedSignal["signal"] = "HOLD_CURRENT";
    let confidence = 50;

    if (existing) {
      // 이미 보유 중 → HOLD/SELL 관점
      if (fusedScore >= 70) { signal = "HOLD_CURRENT"; confidence = 70; }
      else if (fusedScore < 40) { signal = "AVOID"; confidence = 65; }
      else { signal = "WATCH"; confidence = 55; }
    } else {
      // 신규 진입 관점
      if (fusedScore >= 75 && strategyFitScore >= 60) {
        signal = "STRONG_BUY"; confidence = 75;
      } else if (fusedScore >= 60 && strategyFitScore >= 50) {
        signal = "BUY"; confidence = 65;
      } else if (fusedScore >= 45) {
        signal = "WATCH"; confidence = 55;
      } else {
        signal = "AVOID"; confidence = 60;
      }
    }

    return {
      symbol,
      name,
      market: symbol.endsWith(".KS") ? "KOSPI" : symbol.endsWith(".KQ") ? "KOSDAQ" : "US",
      currentPrice: quote.price,
      changePct: quote.changePct,
      smartMoneyScore,
      supplyDemandScore,
      strategyFitScore,
      riskPenalty,
      fusedScore,
      signal,
      confidence,
      reasoning: {
        smartMoney: smartMoneyReasons,
        supplyDemand: supplyDemandReasons,
        strategyFit: strategyReasons,
        risks: riskReasons,
      },
      portfolioContext,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customSymbols = searchParams.get("symbols");

    const dartApiKey = process.env.DART_API_KEY;

    // 기본 분석 대상: 카일 보유 + 대표 한국 종목
    const kylePortfolio = await fetchKylePortfolio();
    const kyleSymbols = kylePortfolio.map(p => ({ symbol: p.symbol, name: p.symbol }));

    const defaultKoreanTargets = [
      { symbol: "005930.KS", name: "삼성전자" },
      { symbol: "000660.KS", name: "SK하이닉스" },
      { symbol: "373220.KS", name: "LG에너지솔루션" },
      { symbol: "207940.KS", name: "삼성바이오로직스" },
      { symbol: "035420.KS", name: "NAVER" },
      { symbol: "068270.KS", name: "셀트리온" },
      { symbol: "086520.KQ", name: "에코프로" },
    ];

    let targets: Array<{ symbol: string; name: string }>;
    if (customSymbols) {
      targets = customSymbols.split(",").map(s => ({ symbol: s.trim(), name: s.trim() }));
    } else {
      // 카일 보유 + 한국 대표 (중복 제거)
      const seen = new Set<string>();
      targets = [...kyleSymbols, ...defaultKoreanTargets].filter(t => {
        if (seen.has(t.symbol)) return false;
        seen.add(t.symbol);
        return true;
      });
    }

    // 분석
    const results: FusedSignal[] = [];
    for (const t of targets) {
      const r = await analyzeForFusion(t.symbol, t.name, kylePortfolio, dartApiKey);
      if (r) results.push(r);
    }

    // 정렬: 카일 보유 먼저, 그 다음 점수순
    results.sort((a, b) => {
      if (a.portfolioContext?.alreadyHeld && !b.portfolioContext?.alreadyHeld) return -1;
      if (!a.portfolioContext?.alreadyHeld && b.portfolioContext?.alreadyHeld) return 1;
      return b.fusedScore - a.fusedScore;
    });

    const summary = {
      totalAnalyzed: results.length,
      strongBuy: results.filter(r => r.signal === "STRONG_BUY").length,
      buy: results.filter(r => r.signal === "BUY").length,
      watch: results.filter(r => r.signal === "WATCH").length,
      avoid: results.filter(r => r.signal === "AVOID").length,
      avgSmartMoneyScore: results.reduce((s, r) => s + r.smartMoneyScore, 0) / Math.max(1, results.length),
      avgSupplyDemandScore: results.reduce((s, r) => s + r.supplyDemandScore, 0) / Math.max(1, results.length),
      dartConfigured: !!dartApiKey,
    };

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      summary,
      signals: results,
      philosophy: {
        title: "소스 큐레이션 기반 자가 시그널",
        source1: "Whale Insight (DART 대량보유 공시) → 스마트 머니 움직임",
        source2: "세시반 (KRX 수급 + 종가 강도) → 단기 모멘텀",
        source3: "카일 7가지 투자 원칙 → 전략 필터",
        note: "남이 짜준 전략 복붙보다, 소스를 직접 조합해 내 시그널을 만드는 것이 AI 매매다운 방향",
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
