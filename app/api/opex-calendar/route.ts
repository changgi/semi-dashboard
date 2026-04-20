import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Options Expiration Calendar API
// 향후 만기일 캘린더 + 각 만기별 영향 분석 + 매매 타이밍
// 
// 만기 타입:
//   - weekly: 매주 금요일 (SPY/QQQ/개별주 일부)
//   - monthly: 매월 3번째 금요일 (대부분 개별주)
//   - quad_witching: 분기 마지막 3번째 금요일 (3/6/9/12월)
//   - vix_expiration: 매월 수요일 (VIX 옵션)
// ═══════════════════════════════════════════════════════════

interface ExpirationEvent {
  date: string;                       // YYYY-MM-DD
  dayName: string;                    // 금, 수 등
  type: "weekly" | "monthly" | "quad_witching" | "vix_expiration";
  typeLabel: string;                  // 한글 레이블
  importance: 1 | 2 | 3 | 4 | 5;      // 1=낮음, 5=매우 높음
  daysUntil: number;
  // 예상 영향
  expectedImpact: {
    volatilityLevel: "낮음" | "보통" | "높음" | "극심";
    historicalReturnBias: "상승" | "하락" | "중립";
    typicalMoveRange: string;          // 예상 변동폭
  };
  // 매매 타이밍 가이드
  tradingGuide: {
    before: string;                    // 만기 전 전략
    during: string;                    // 만기 당일
    after: string;                     // 만기 후
  };
  affectedSymbols: string[];            // 영향받는 주요 종목
  notes: string[];                      // 특이사항
}

// ───────────────────────────────────────────────────────────
// 날짜 유틸
// ───────────────────────────────────────────────────────────
function getThirdFriday(year: number, month: number): Date {
  // month: 0-11
  const firstDay = new Date(year, month, 1);
  let firstFriday = firstDay.getDay() <= 5
    ? firstDay.getDate() + (5 - firstDay.getDay())
    : firstDay.getDate() + (5 + 7 - firstDay.getDay());
  const thirdFridayDate = firstFriday + 14;
  return new Date(year, month, thirdFridayDate);
}

function getAllFridays(startDate: Date, endDate: Date): Date[] {
  const fridays: Date[] = [];
  const current = new Date(startDate);
  // 첫 번째 금요일 찾기
  while (current.getDay() !== 5) {
    current.setDate(current.getDate() + 1);
  }
  // 주간 반복
  while (current <= endDate) {
    fridays.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }
  return fridays;
}

function isQuadWitching(date: Date): boolean {
  // 3, 6, 9, 12월의 3번째 금요일
  const month = date.getMonth();
  if (![2, 5, 8, 11].includes(month)) return false; // 0-indexed
  const third = getThirdFriday(date.getFullYear(), month);
  return date.toDateString() === third.toDateString();
}

function isMonthlyOpEx(date: Date): boolean {
  // 매월 3번째 금요일
  const third = getThirdFriday(date.getFullYear(), date.getMonth());
  return date.toDateString() === third.toDateString();
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getVIXExpirations(startDate: Date, endDate: Date): Date[] {
  // VIX 옵션은 매월 3번째 금요일의 30일 전 수요일
  const vixDates: Date[] = [];
  const current = new Date(startDate);
  current.setDate(1);

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    // 다음달 3번째 금요일
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const thirdFri = getThirdFriday(nextYear, nextMonth);
    // 30일 전
    const vixDate = new Date(thirdFri);
    vixDate.setDate(vixDate.getDate() - 30);
    if (vixDate >= startDate && vixDate <= endDate) {
      vixDates.push(vixDate);
    }
    current.setMonth(current.getMonth() + 1);
  }
  return vixDates;
}

// ───────────────────────────────────────────────────────────
// 각 만기 타입별 영향 분석 데이터
// ───────────────────────────────────────────────────────────

function analyzeExpiration(date: Date): {
  type: ExpirationEvent["type"];
  typeLabel: string;
  importance: 1 | 2 | 3 | 4 | 5;
  expectedImpact: ExpirationEvent["expectedImpact"];
  tradingGuide: ExpirationEvent["tradingGuide"];
  affectedSymbols: string[];
  notes: string[];
} {
  const isQuad = isQuadWitching(date);
  const isMonthly = isMonthlyOpEx(date);
  const isFriday = date.getDay() === 5;
  const isWednesday = date.getDay() === 3;

  if (isQuad) {
    return {
      type: "quad_witching",
      typeLabel: "🔥 쿼드러플 위칭",
      importance: 5,
      expectedImpact: {
        volatilityLevel: "극심",
        historicalReturnBias: "중립",
        typicalMoveRange: "±1.5~3.0% (장중)",
      },
      tradingGuide: {
        before: "만기 2-3일 전부터 변동성 확대 시작. 신규 포지션 자제, 헤지 점검",
        during: "장중 변동 극심. 오전 개별주 옵션, 오후 지수 옵션 순차 정리. 마감 30분 전 급변 주의",
        after: "월요일부터 새로운 방향성 형성. 'OpEx 후 반전' 패턴 흔함 (3일 이내)",
      },
      affectedSymbols: ["SPY", "QQQ", "SMH", "SOXX", "NVDA", "AAPL", "MSFT"],
      notes: [
        "3월/6월/9월/12월 3번째 금요일",
        "개별주+지수+선물 동시 만기로 가장 큰 이벤트",
        "역사적으로 만기 후 5일 반등 확률 60%+",
        "만기 직전 Gamma Squeeze 빈번",
      ],
    };
  }

  if (isMonthly) {
    return {
      type: "monthly",
      typeLabel: "📅 월간 OpEx",
      importance: 4,
      expectedImpact: {
        volatilityLevel: "높음",
        historicalReturnBias: "상승",
        typicalMoveRange: "±1.0~2.0%",
      },
      tradingGuide: {
        before: "만기주 월~목 'OpEx Pinning' 효과 - 현재가 근처에 머물기 쉬움. 스트래들/스트랭글 매도 유리",
        during: "오전 변동성 확대, 오후 점차 안정. Max Pain 근처 수렴 경향",
        after: "월요일 '반전 랠리' 빈번 (Monday After OpEx). 신규 포지션 진입 적기",
      },
      affectedSymbols: ["SPY", "QQQ", "NVDA", "TSM", "AMD", "MU", "AVGO"],
      notes: [
        "매월 3번째 금요일",
        "대부분 개별주 옵션 만기일",
        "만기주는 변동성 감쇠(IV Crush) 효과",
        "S&P500 역사적으로 만기 후 주 +0.3% 평균",
      ],
    };
  }

  if (isFriday) {
    return {
      type: "weekly",
      typeLabel: "📆 주간 OpEx",
      importance: 2,
      expectedImpact: {
        volatilityLevel: "보통",
        historicalReturnBias: "중립",
        typicalMoveRange: "±0.5~1.0%",
      },
      tradingGuide: {
        before: "목요일 오후 IV 급락 시작. 단기 옵션 매수는 비권장",
        during: "0DTE (만기당일) 옵션 변동성 극심. 현물은 상대적으로 안정",
        after: "월요일 오픈 갭 주의. 주말 뉴스 반영",
      },
      affectedSymbols: ["SPY", "QQQ", "IWM", "NVDA", "TSLA"],
      notes: [
        "매주 금요일 주간 옵션 만기",
        "SPY/QQQ/인기 개별주만 주간 옵션 있음",
        "0DTE 거래량 급증으로 장중 변동성 증가",
      ],
    };
  }

  if (isWednesday) {
    return {
      type: "vix_expiration",
      typeLabel: "📊 VIX 만기",
      importance: 3,
      expectedImpact: {
        volatilityLevel: "보통",
        historicalReturnBias: "중립",
        typicalMoveRange: "±0.5~1.5%",
      },
      tradingGuide: {
        before: "VIX 옵션 포지션 정리 시작. S&P500 변동성 감소 경향",
        during: "VIX 자체는 30분 전 정산. 현물 시장 영향은 제한적",
        after: "새로운 변동성 사이클 시작. VIX 선물 롤오버 영향",
      },
      affectedSymbols: ["VXX", "UVXY", "SVXY"],
      notes: [
        "매월 3번째 금요일의 30일 전 수요일",
        "VIX 옵션/선물 만기",
        "직접 영향은 VIX 관련 ETF에 국한",
        "시장 변동성 예측 신호로 활용",
      ],
    };
  }

  // 기본 (예상치 못한 경우)
  return {
    type: "weekly",
    typeLabel: "기타",
    importance: 1,
    expectedImpact: {
      volatilityLevel: "낮음",
      historicalReturnBias: "중립",
      typicalMoveRange: "±0.3%",
    },
    tradingGuide: {
      before: "-",
      during: "-",
      after: "-",
    },
    affectedSymbols: [],
    notes: [],
  };
}

// ───────────────────────────────────────────────────────────
// 다음 중요 만기까지 매매 시점 생성
// ───────────────────────────────────────────────────────────
interface TradingTimingSignal {
  signal: string;
  action: "buy" | "sell" | "hedge" | "wait" | "watch";
  actionLabel: string;
  targetDate: string;
  daysUntil: number;
  rationale: string;
  confidence: number;
}

function generateTradingSignals(
  events: ExpirationEvent[],
  vixLevel: number | null
): TradingTimingSignal[] {
  const signals: TradingTimingSignal[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 가장 가까운 Quad Witching
  const nextQuad = events.find((e) => e.type === "quad_witching");
  if (nextQuad) {
    const daysUntil = nextQuad.daysUntil;
    if (daysUntil <= 3 && daysUntil > 0) {
      signals.push({
        signal: "🚨 쿼드러플 위칭 임박",
        action: "hedge",
        actionLabel: "헤지 / 관망",
        targetDate: nextQuad.date,
        daysUntil,
        rationale: `${daysUntil}일 후 쿼드러플 위칭. 변동성 극심 예상. 신규 포지션 보류 권장`,
        confidence: 85,
      });
    } else if (daysUntil >= 4 && daysUntil <= 10) {
      signals.push({
        signal: "📅 쿼드 위칭 대비",
        action: "watch",
        actionLabel: "모니터링",
        targetDate: nextQuad.date,
        daysUntil,
        rationale: `${daysUntil}일 후 쿼드 위칭. 변동성 확대 시작 시기. 포지션 규모 점검`,
        confidence: 70,
      });
    } else if (daysUntil >= 11 && daysUntil <= 20) {
      signals.push({
        signal: "💎 만기 전 기회 구간",
        action: "buy",
        actionLabel: "분할 매수 고려",
        targetDate: nextQuad.date,
        daysUntil,
        rationale: `쿼드 위칭 ${daysUntil}일 전. 역사적 '만기 전 변동성 프리미엄' 구간. 분할 진입 적기`,
        confidence: 60,
      });
    }
  }

  // 가장 가까운 Monthly OpEx
  const nextMonthly = events.find((e) => e.type === "monthly" || e.type === "quad_witching");
  if (nextMonthly) {
    const daysUntil = nextMonthly.daysUntil;
    // 만기주 월요일 진입 (OpEx Week Effect)
    const isMondayOfExpiryWeek = daysUntil === 4 && new Date(nextMonthly.date).getDay() === 5;
    if (isMondayOfExpiryWeek) {
      signals.push({
        signal: "📈 OpEx 주 Pinning 효과",
        action: "wait",
        actionLabel: "Pinning 대기",
        targetDate: nextMonthly.date,
        daysUntil,
        rationale: "만기주 월요일. 현재가 근처에 머물기 쉬운 구간. 큰 움직임 없을 가능성",
        confidence: 65,
      });
    }

    // 만기 다음 월요일 (Post-OpEx Reversal)
    const nextMondayDate = new Date(nextMonthly.date);
    nextMondayDate.setDate(nextMondayDate.getDate() + 3);
    const daysToNextMonday = Math.floor(
      (nextMondayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysToNextMonday > 0 && daysToNextMonday <= 10) {
      signals.push({
        signal: "🚀 OpEx 후 반전 랠리",
        action: "buy",
        actionLabel: "진입 고려",
        targetDate: formatDate(nextMondayDate),
        daysUntil: daysToNextMonday,
        rationale: `OpEx 다음 월요일. 역사적 반등 확률 60%+. 헤지 해제에 따른 수급 개선`,
        confidence: 65,
      });
    }
  }

  // VIX 기반 추가 시그널
  if (vixLevel !== null) {
    if (vixLevel > 25) {
      signals.push({
        signal: "😱 VIX 공포 구간 + 만기 주의",
        action: "watch",
        actionLabel: "역발상 매수 준비",
        targetDate: formatDate(today),
        daysUntil: 0,
        rationale: `VIX ${vixLevel.toFixed(1)} 공포 구간. OpEx 시점 맞춰 역발상 기회 포착`,
        confidence: 70,
      });
    } else if (vixLevel < 13) {
      signals.push({
        signal: "⚠️ VIX 극저 + 만기 변동성 주의",
        action: "hedge",
        actionLabel: "보험 매수",
        targetDate: formatDate(today),
        daysUntil: 0,
        rationale: `VIX ${vixLevel.toFixed(1)} 극저. 만기 즈음 변동성 급등 가능성. 저렴한 풋 헤지 유리`,
        confidence: 65,
      });
    }
  }

  return signals.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ═══════════════════════════════════════════════════════════
// GET 엔드포인트
// ═══════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const daysAhead = parseInt(searchParams.get("days") ?? "90");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysAhead);

    // 1. 모든 금요일 수집 (weekly/monthly/quad)
    const allFridays = getAllFridays(today, endDate);
    const vixDates = getVIXExpirations(today, endDate);

    // 2. 각 날짜 분석
    const events: ExpirationEvent[] = [];
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

    for (const fri of allFridays) {
      const analysis = analyzeExpiration(fri);
      const daysUntil = Math.floor(
        (fri.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      events.push({
        date: formatDate(fri),
        dayName: dayNames[fri.getDay()],
        daysUntil,
        ...analysis,
      });
    }

    for (const wed of vixDates) {
      const analysis = analyzeExpiration(wed);
      const daysUntil = Math.floor(
        (wed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      events.push({
        date: formatDate(wed),
        dayName: dayNames[wed.getDay()],
        daysUntil,
        ...analysis,
      });
    }

    // 3. 날짜순 정렬
    events.sort((a, b) => a.date.localeCompare(b.date));

    // 4. VIX 레벨 (매매 시그널용)
    let vixLevel: number | null = null;
    try {
      const vixQuote = await fetchYahooQuotes(["^VIX"]);
      vixLevel = vixQuote.get("^VIX")?.price ?? null;
    } catch {}

    // 5. 매매 시그널 생성
    const tradingSignals = generateTradingSignals(events, vixLevel);

    // 6. 다음 중요 만기 (importance >= 4)
    const nextMajor = events.find((e) => e.importance >= 4);

    // 7. 이번 주 요약
    const thisWeekEvents = events.filter((e) => e.daysUntil <= 7);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      daysAhead,
      vixLevel,
      events,
      nextMajor,
      thisWeek: thisWeekEvents,
      tradingSignals,
      summary: {
        totalEvents: events.length,
        quadWitchingCount: events.filter((e) => e.type === "quad_witching").length,
        monthlyCount: events.filter((e) => e.type === "monthly").length,
        weeklyCount: events.filter((e) => e.type === "weekly").length,
        vixCount: events.filter((e) => e.type === "vix_expiration").length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true });
  }
}
