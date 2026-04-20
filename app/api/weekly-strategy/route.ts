import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 600; // 10분
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Weekly Strategy API
// 
// 이번 주 모든 이벤트를 묶어서 날짜별 종합 전략 제공:
//   - 날짜별 이벤트 + 예상 영향
//   - 실행 체크리스트 (매일 아침/점심/마감)
//   - 시나리오별 대응 플랜 (상승/하락/횡보)
//   - 포트폴리오 맞춤 추천
// ═══════════════════════════════════════════════════════════

interface WeekDay {
  date: string;
  dayName: string;
  daysUntil: number;
  events: WeekEvent[];
  expectedVolatility: "low" | "medium" | "high" | "extreme";
  recommendedStance: string;
  checklist: string[];
}

interface WeekEvent {
  time: string;
  title: string;
  importance: number;
  category: "earnings" | "macro" | "data" | "options";
  impact: string;
  affectedSymbols: string[];
}

// ───────────────────────────────────────────────────────────
// 이번 주 이벤트 맵 (실제 데이터)
// ───────────────────────────────────────────────────────────
const THIS_WEEK_EVENTS: Array<{
  date: string;
  time: string;
  title: string;
  importance: number;
  category: "earnings" | "macro" | "data" | "options";
  impact: string;
  symbols: string[];
}> = [
  // 화요일 (4/22)
  { date: "2026-04-22", time: "AMC", title: "TSLA 실적 발표 Q1", importance: 4, category: "earnings", impact: "QQQ 변동성 확대 예상. ±3-5%", symbols: ["TSLA", "QQQ"] },
  
  // 수요일 (4/23)
  { date: "2026-04-23", time: "AMC", title: "MSFT 실적 발표 Q3", importance: 5, category: "earnings", impact: "SPY 7% 비중. S&P500 직접 영향. ±3%", symbols: ["MSFT", "SPY", "QQQ"] },
  
  // 목요일 (4/24)
  { date: "2026-04-24", time: "AMC", title: "INTC 실적 발표 Q1", importance: 3, category: "earnings", impact: "반도체 ETF (SMH/SOXX) 영향. 변동성 69%!", symbols: ["INTC", "SMH", "SOXX"] },
  { date: "2026-04-24", time: "08:30 ET", title: "주간 실업수당 청구", importance: 2, category: "data", impact: "예상치 상회 시 금리 영향", symbols: ["SPY", "TNX"] },
  
  // 금요일 (4/25)
  { date: "2026-04-25", time: "All day", title: "주간 OpEx (옵션 만기)", importance: 3, category: "options", impact: "변동성 단기 확대. Gamma squeeze 가능", symbols: ["SPY", "QQQ"] },
  
  // 월요일 (4/28)
  { date: "2026-04-28", time: "BMO", title: "BNP Paribas, Deutsche Bank 실적", importance: 2, category: "earnings", impact: "유럽 은행주 영향", symbols: ["EUFN"] },
  
  // 화요일 (4/29) - 슈퍼 위험 주간!
  { date: "2026-04-29", time: "14:00 ET", title: "🏛️ FOMC 금리 결정", importance: 5, category: "macro", impact: "극심한 변동성. ±2% 당일. 방향성 결정", symbols: ["SPY", "QQQ", "TNX", "DXY"] },
  { date: "2026-04-29", time: "AMC", title: "GOOGL 실적", importance: 4, category: "earnings", impact: "QQQ 영향. 검색/AI 투자 가이던스 주목", symbols: ["GOOGL", "QQQ"] },
  { date: "2026-04-29", time: "AMC", title: "META 실적", importance: 4, category: "earnings", impact: "QQQ 영향. 광고매출/AI 캐펙스", symbols: ["META", "QQQ"] },
  
  // 수요일 (4/30) - 폭탄 주간 1
  { date: "2026-04-30", time: "AMC", title: "🍎 AAPL 실적", importance: 5, category: "earnings", impact: "S&P500 6% 비중. 아이폰 가이던스 핵심", symbols: ["AAPL", "SPY", "QQQ"] },
  { date: "2026-04-30", time: "AMC", title: "AMZN 실적", importance: 4, category: "earnings", impact: "AWS 성장률 주목", symbols: ["AMZN", "QQQ"] },
  { date: "2026-04-30", time: "Evening KST", title: "📱 삼성전자 실적", importance: 5, category: "earnings", impact: "한국 반도체 바로미터. HBM 주문량", symbols: ["005930.KS", "SMH"] },
];

// ───────────────────────────────────────────────────────────
// 변동성 예측
// ───────────────────────────────────────────────────────────
function predictVolatility(events: WeekEvent[]): "low" | "medium" | "high" | "extreme" {
  const totalImportance = events.reduce((s, e) => s + e.importance, 0);
  if (events.some(e => e.importance >= 5) && totalImportance >= 8) return "extreme";
  if (totalImportance >= 7) return "high";
  if (totalImportance >= 4) return "medium";
  return "low";
}

// ───────────────────────────────────────────────────────────
// 권장 자세 결정
// ───────────────────────────────────────────────────────────
function determineStance(volatility: string, events: WeekEvent[]): string {
  const hasFomc = events.some(e => e.title.includes("FOMC"));
  const hasBigEarnings = events.some(e => e.category === "earnings" && e.importance >= 5);
  
  if (volatility === "extreme") {
    if (hasFomc) return "🛡️ 방어 모드 - 신규 매수 금지, 현금 비중 확대";
    return "⚠️ 보수적 - 포지션 축소 고려, 스탑로스 강화";
  }
  if (volatility === "high") {
    if (hasBigEarnings) return "📊 관망 - 결과 확인 후 대응";
    return "🎯 선택적 - 질 좋은 종목만 분할 매수";
  }
  if (volatility === "medium") return "📈 적극적 분석 - 기회 포착 가능";
  return "😌 평상 - 정기 리밸런싱 타이밍";
}

// ───────────────────────────────────────────────────────────
// 체크리스트 생성
// ───────────────────────────────────────────────────────────
function buildChecklist(events: WeekEvent[], dayName: string): string[] {
  const checklist: string[] = [];
  
  // 아침 루틴
  checklist.push("🌅 아침: Position Guide + 뉴스 센티먼트 확인");
  
  // 이벤트별
  for (const e of events) {
    if (e.category === "earnings") {
      checklist.push(`📊 ${e.time}: ${e.title} 결과 확인`);
    } else if (e.category === "macro") {
      checklist.push(`🏛️ ${e.time}: ${e.title} - 시장 반응 주시`);
    } else if (e.category === "data") {
      checklist.push(`📈 ${e.time}: ${e.title} 발표`);
    }
  }
  
  // 오후/저녁 공통
  checklist.push("🌆 마감 후: Journal에 오늘 시그널/결정 기록");
  
  return checklist;
}

// ───────────────────────────────────────────────────────────
// 날짜 헬퍼
// ───────────────────────────────────────────────────────────
function daysBetween(dateStr: string, ref: Date): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const r = new Date(ref);
  r.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - r.getTime()) / 86400000);
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr);
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  return names[d.getDay()];
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const today = new Date();
    
    // 1. 포트폴리오 조회
    const supabase = createAdmin();
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    const portfolioSymbols = new Set((holdings ?? []).map((h: any) => h.symbol));
    
    // 2. 현재가 + VIX
    const quotes = await fetchYahooQuotes(["^VIX", "SPY", "QQQ", "SMH", "SOXX"]);
    const vix = quotes.get("^VIX")?.price;
    const spy = quotes.get("SPY");
    const qqq = quotes.get("QQQ");
    
    // 3. 이번 주 이벤트 → 날짜별 그룹화
    const dayMap = new Map<string, WeekEvent[]>();
    
    for (const e of THIS_WEEK_EVENTS) {
      const daysUntil = daysBetween(e.date, today);
      if (daysUntil < -1 || daysUntil > 10) continue; // 지난 1일 + 앞으로 10일
      
      if (!dayMap.has(e.date)) dayMap.set(e.date, []);
      dayMap.get(e.date)!.push({
        time: e.time,
        title: e.title,
        importance: e.importance,
        category: e.category,
        impact: e.impact,
        affectedSymbols: e.symbols,
      });
    }
    
    // 4. WeekDay 배열 구성
    const weekDays: WeekDay[] = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, events]) => {
        const daysUntil = daysBetween(date, today);
        const volatility = predictVolatility(events);
        const stance = determineStance(volatility, events);
        const dayName = getDayName(date);
        const checklist = buildChecklist(events, dayName);
        
        return {
          date,
          dayName,
          daysUntil,
          events: events.sort((a, b) => b.importance - a.importance),
          expectedVolatility: volatility,
          recommendedStance: stance,
          checklist,
        };
      });
    
    // 5. 시나리오별 대응 플랜
    const scenarios = [
      {
        name: "📈 상승 시나리오",
        probability: "30%",
        trigger: "MSFT/AAPL 실적 Beat + FOMC 비둘기파",
        action: [
          "TIGER S&P500 추가 매수 (DCA)",
          "반도체 ETF(SMH/SOXX) 진입 고려",
          "수익 일부 차익실현 (40%)",
        ],
        targetReturn: "+3 ~ +8%",
      },
      {
        name: "📉 하락 시나리오",
        probability: "40%",
        trigger: "실적 Miss + FOMC 매파 + Iran 확전",
        action: [
          "TIGER S&P500 50% 축소",
          "TLT/GLD 헤지 편입",
          "현금 30% 확보",
          "스탑로스 엄격 적용",
        ],
        targetReturn: "-5 ~ -12%",
      },
      {
        name: "➖ 횡보 시나리오",
        probability: "30%",
        trigger: "실적 혼조 + FOMC 중립",
        action: [
          "현 포지션 유지",
          "분할 매수 DCA",
          "섹터 로테이션 관찰",
        ],
        targetReturn: "-2 ~ +3%",
      },
    ];
    
    // 6. 핵심 액션 우선순위
    const topActions = [
      {
        priority: 1,
        urgency: "immediate",
        action: "💎 TIGER S&P500 +131% 1주 부분 차익실현 (30%)",
        reason: "이번 주 빅 리스크 + 원금 회수 레벨 수익",
      },
      {
        priority: 2,
        urgency: "this_week",
        action: "🛡️ 현금 비중 20% 확보 (현재 0%)",
        reason: "FOMC/실적 대기. 조정 시 재진입 총알",
      },
      {
        priority: 3,
        urgency: "this_week",
        action: "📊 포트폴리오 분산 (3-5종목 확대)",
        reason: "2개 종목 집중 → 개별 리스크 완화",
      },
      {
        priority: 4,
        urgency: "monitor",
        action: "📈 SOXX 하락 시 $395 이하에서 관심",
        reason: "Max Pain $382.5. TSM Beat로 반도체 중장기 긍정",
      },
    ];
    
    // 7. 주간 총평
    const weekSummary = {
      totalEvents: THIS_WEEK_EVENTS.length,
      highImportance: THIS_WEEK_EVENTS.filter(e => e.importance >= 4).length,
      criticalDates: weekDays
        .filter(d => d.expectedVolatility === "extreme" || d.expectedVolatility === "high")
        .map(d => ({ date: d.date, dayName: d.dayName, reason: d.events[0]?.title })),
      overallTheme: "🔥 Big Earnings + FOMC 주간 - 방어 우선",
      tldr: "이번 주~다음 주까지 미국 빅테크 실적 + FOMC로 극심한 변동성 예상. TIGER S&P500 +131% 수익 난 1주 부분 차익실현 권장. 4/29 FOMC 전까지 신규 매수 자제.",
    };
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reportDate: today.toISOString().split("T")[0],
      weekSummary,
      weekDays,
      scenarios,
      topActions,
      contextData: {
        vix: vix ?? null,
        spyPrice: spy?.price ?? null,
        spyChangePct: spy?.changePct ?? null,
        qqqPrice: qqq?.price ?? null,
        qqqChangePct: qqq?.changePct ?? null,
        portfolioHoldings: holdings?.length ?? 0,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      weekDays: [],
      scenarios: [],
      topActions: [],
      weekSummary: { totalEvents: 0, highImportance: 0, criticalDates: [], overallTheme: "", tldr: "" },
    });
  }
}
