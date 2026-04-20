import { NextResponse } from "next/server";

export const revalidate = 3600; // 1시간
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Economic & Earnings Calendar API
// 
// 주가에 영향을 미치는 핵심 이벤트:
//   - 연준 FOMC 회의 (미국 금리)
//   - CPI/PPI/PCE (인플레이션)
//   - NFP 고용지표
//   - 주요 기업 실적발표 (NVDA, AAPL, MSFT, TSLA 등)
//   - 한국 금리 결정 / 수출입 동향
// ═══════════════════════════════════════════════════════════

interface EconomicEvent {
  id: string;
  date: string;           // YYYY-MM-DD
  time?: string;          // HH:MM KST
  timezone: string;       // KST, ET 등
  category: "fed" | "inflation" | "employment" | "earnings" | "korea" | "other";
  importance: 1 | 2 | 3 | 4 | 5;  // 5가 가장 중요
  title: string;
  description: string;
  expectedImpact: string;
  affectedSymbols: string[];
  tradingGuide: {
    before: string;
    during: string;
    after: string;
  };
  daysUntil: number;
  hoursUntil?: number;
}

// ───────────────────────────────────────────────────────────
// FOMC 회의 일정 (2026년)
// ───────────────────────────────────────────────────────────
const FOMC_MEETINGS_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-16",
];

// ───────────────────────────────────────────────────────────
// 미국 CPI 발표 일정 (매월 둘째 주 화~목)
// ───────────────────────────────────────────────────────────
function getCPIDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
    // 둘째 주 수요일 (대략)
    const firstDay = target.getDay();
    const daysToWed = (3 - firstDay + 7) % 7;
    const secondWed = new Date(target.getFullYear(), target.getMonth(), 1 + daysToWed + 7);
    dates.push(secondWed.toISOString().split("T")[0]);
  }
  return dates;
}

// ───────────────────────────────────────────────────────────
// NFP 발표 (매월 첫째 주 금요일)
// ───────────────────────────────────────────────────────────
function getNFPDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const firstDay = target.getDay();
    const daysToFri = (5 - firstDay + 7) % 7;
    const firstFri = new Date(target.getFullYear(), target.getMonth(), 1 + daysToFri);
    dates.push(firstFri.toISOString().split("T")[0]);
  }
  return dates;
}

// ───────────────────────────────────────────────────────────
// 주요 기업 실적발표 스케줄 (분기별 대략)
// ───────────────────────────────────────────────────────────
interface EarningsSchedule {
  symbol: string;
  name: string;
  estimatedDate: string;  // 대략적
  quarter: string;
  importance: number;
  affectedETFs: string[];
}

function getUpcomingEarnings(): EarningsSchedule[] {
  // 2026년 Q1 실적 발표 시즌 (2026-04 ~ 2026-05)
  // 2026년 Q2 실적 발표 시즌 (2026-07 ~ 2026-08)
  // 실제 확정 일정이 아닌 과거 패턴 기반 예측
  return [
    { symbol: "NVDA",  name: "NVIDIA",         estimatedDate: "2026-05-21", quarter: "Q1 2026", importance: 5, affectedETFs: ["SMH", "SOXX", "QQQ"] },
    { symbol: "AAPL",  name: "Apple",          estimatedDate: "2026-04-30", quarter: "Q2 2026", importance: 5, affectedETFs: ["QQQ", "SPY"] },
    { symbol: "MSFT",  name: "Microsoft",      estimatedDate: "2026-04-23", quarter: "Q3 2026", importance: 5, affectedETFs: ["QQQ", "SPY"] },
    { symbol: "GOOGL", name: "Alphabet",       estimatedDate: "2026-04-29", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
    { symbol: "AMZN",  name: "Amazon",         estimatedDate: "2026-04-30", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ", "SPY"] },
    { symbol: "META",  name: "Meta",           estimatedDate: "2026-04-29", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
    { symbol: "TSLA",  name: "Tesla",          estimatedDate: "2026-04-22", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
    { symbol: "AMD",   name: "AMD",            estimatedDate: "2026-05-06", quarter: "Q1 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
    { symbol: "TSM",   name: "TSMC",           estimatedDate: "2026-04-17", quarter: "Q1 2026", importance: 5, affectedETFs: ["SMH", "SOXX"] },
    { symbol: "AVGO",  name: "Broadcom",       estimatedDate: "2026-06-05", quarter: "Q2 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
    { symbol: "MU",    name: "Micron",         estimatedDate: "2026-06-25", quarter: "Q3 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
    { symbol: "INTC",  name: "Intel",          estimatedDate: "2026-04-24", quarter: "Q1 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
    { symbol: "QCOM",  name: "Qualcomm",       estimatedDate: "2026-05-01", quarter: "Q2 2026", importance: 3, affectedETFs: ["SMH"] },
    { symbol: "ARM",   name: "ARM Holdings",   estimatedDate: "2026-05-07", quarter: "Q4 2026", importance: 3, affectedETFs: ["SMH"] },
    // 한국
    { symbol: "005930.KS", name: "삼성전자",      estimatedDate: "2026-04-30", quarter: "Q1 2026", importance: 5, affectedETFs: ["KODEX반도체"] },
    { symbol: "000660.KS", name: "SK하이닉스",    estimatedDate: "2026-04-24", quarter: "Q1 2026", importance: 5, affectedETFs: ["KODEX반도체"] },
  ];
}

// ───────────────────────────────────────────────────────────
// 한국 주요 이벤트
// ───────────────────────────────────────────────────────────
const KOREA_BOK_MEETINGS_2026 = [
  "2026-01-16",
  "2026-02-25",
  "2026-04-10",
  "2026-05-22",
  "2026-07-10",
  "2026-08-28",
  "2026-10-16",
  "2026-11-27",
];

// ───────────────────────────────────────────────────────────
// 이벤트 빌드
// ───────────────────────────────────────────────────────────
function buildEconomicEvents(): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let id = 0;

  const daysUntil = (dateStr: string): number => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.floor((d.getTime() - today.getTime()) / 86400000);
  };

  // 1. FOMC
  for (const date of FOMC_MEETINGS_2026) {
    const days = daysUntil(date);
    if (days < -7 || days > 180) continue;
    events.push({
      id: `fomc_${id++}`,
      date,
      time: "14:00",
      timezone: "ET",
      category: "fed",
      importance: 5,
      title: "🏛️ FOMC 금리 결정",
      description: "연방공개시장위원회 회의 결과 발표. 금리 동결/인하/인상 여부와 점도표 공개",
      expectedImpact: "극심한 변동성. 성장주/채권/달러 모두 반응. 긴급 헤지 필요 가능성",
      affectedSymbols: ["SPY", "QQQ", "TLT", "GLD", "DXY"],
      tradingGuide: {
        before: "발표 2-3일 전 VIX 급등 가능. 헤지 포지션 검토",
        during: "당일 14:00 ET 발표 직전/직후 극심한 변동성",
        after: "다음 2-3일간 방향성 확립. 기술적 돌파 주의",
      },
      daysUntil: days,
    });
  }

  // 2. CPI
  for (const date of getCPIDates()) {
    const days = daysUntil(date);
    if (days < -3 || days > 90) continue;
    events.push({
      id: `cpi_${id++}`,
      date,
      time: "08:30",
      timezone: "ET",
      category: "inflation",
      importance: 5,
      title: "📊 미국 CPI 발표",
      description: "전월 소비자물가지수. 연준 금리정책에 직접 영향",
      expectedImpact: "예상보다 높으면 금리 인상 기대 → 성장주 타격. 낮으면 랠리",
      affectedSymbols: ["SPY", "QQQ", "TLT", "XLF", "NVDA"],
      tradingGuide: {
        before: "예상치 확인 (Bloomberg/Investing.com). 포지션 사이징 축소",
        during: "08:30 ET 발표 직후 5분간 급변동. 단타 금지",
        after: "일중 방향성 확립. 추세추종 가능",
      },
      daysUntil: days,
    });
  }

  // 3. NFP
  for (const date of getNFPDates()) {
    const days = daysUntil(date);
    if (days < -3 || days > 90) continue;
    events.push({
      id: `nfp_${id++}`,
      date,
      time: "08:30",
      timezone: "ET",
      category: "employment",
      importance: 4,
      title: "👔 NFP 고용지표 발표",
      description: "비농업부문 신규 고용 수. 연준 정책에 영향",
      expectedImpact: "강한 고용 → 긴축 압력. 약한 고용 → 완화 기대",
      affectedSymbols: ["SPY", "QQQ", "DXY", "TLT"],
      tradingGuide: {
        before: "예상치 ±5만 이내는 중립. 극단치 주의",
        during: "금요일 08:30 ET. 당일 방향성 결정 가능성",
        after: "다음 주 FOMC 전 노이즈",
      },
      daysUntil: days,
    });
  }

  // 4. 기업 실적발표
  for (const e of getUpcomingEarnings()) {
    const days = daysUntil(e.estimatedDate);
    if (days < -3 || days > 90) continue;
    events.push({
      id: `earn_${id++}`,
      date: e.estimatedDate,
      time: "AMC", // After Market Close
      timezone: "ET",
      category: "earnings",
      importance: e.importance as 3 | 4 | 5,
      title: `💼 ${e.name} (${e.symbol}) 실적`,
      description: `${e.quarter} 실적 발표. ${e.affectedETFs.join("/")} 섹터 전체 영향`,
      expectedImpact: e.importance >= 5
        ? "섹터 전체 흔들림. ±10% 변동 가능"
        : "해당 종목 ±5-8% 변동 일반적",
      affectedSymbols: [e.symbol, ...e.affectedETFs],
      tradingGuide: {
        before: "1주 전부터 IV 급등. 실적 전 매도/매수 신중",
        during: "장마감 후 발표. 시간외 ±10% 가능",
        after: "다음날 갭업/갭다운. 추세 확립 후 진입",
      },
      daysUntil: days,
    });
  }

  // 5. 한국 금통위
  for (const date of KOREA_BOK_MEETINGS_2026) {
    const days = daysUntil(date);
    if (days < -3 || days > 90) continue;
    events.push({
      id: `bok_${id++}`,
      date,
      time: "10:00",
      timezone: "KST",
      category: "korea",
      importance: 4,
      title: "🇰🇷 한국은행 기준금리 결정",
      description: "한국은행 금통위 기준금리 결정. 환율/KOSPI에 직접 영향",
      expectedImpact: "원화 변동 → 외국인 수급 영향 → 삼성전자/SK하이닉스 영향",
      affectedSymbols: ["005930.KS", "000660.KS", "360750.KS"],
      tradingGuide: {
        before: "전망 컨센서스 확인. 환율 모니터링",
        during: "10:00 KST 결정 발표 + 총재 간담회",
        after: "KOSPI 방향성. 원화 변동 → ETF 평가액 영향",
      },
      daysUntil: days,
    });
  }

  // 정렬: 날짜 순
  events.sort((a, b) => a.daysUntil - b.daysUntil);

  return events;
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const events = buildEconomicEvents();

    // 카테고리 통계
    const byCategory = {
      fed: events.filter((e) => e.category === "fed").length,
      inflation: events.filter((e) => e.category === "inflation").length,
      employment: events.filter((e) => e.category === "employment").length,
      earnings: events.filter((e) => e.category === "earnings").length,
      korea: events.filter((e) => e.category === "korea").length,
    };

    // 긴급도별 분류
    const nextWeek = events.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 7);
    const nextMonth = events.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 30);
    const highImpact = events.filter((e) => e.importance >= 4 && e.daysUntil >= 0 && e.daysUntil <= 30);

    // 다음 주요 이벤트
    const nextMajor = events.find((e) => e.importance >= 4 && e.daysUntil >= 0) || null;

    // 오늘의 이벤트
    const todayEvents = events.filter((e) => e.daysUntil === 0);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalEvents: events.length,
      byCategory,
      todayEvents,
      nextWeek,
      nextMonth,
      highImpact,
      nextMajor,
      allEvents: events,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      totalEvents: 0,
      byCategory: { fed: 0, inflation: 0, employment: 0, earnings: 0, korea: 0 },
      todayEvents: [],
      nextWeek: [],
      nextMonth: [],
      highImpact: [],
      nextMajor: null,
      allEvents: [],
    });
  }
}
