import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Market Events API
// 
// 카일님 포트에 영향 있는 이벤트를 시간순으로 반환:
// 1. 시장 개장/마감 (한국, 미국)
// 2. 실적 발표 (보유 종목 우선)
// 3. 매크로 이벤트 (FOMC 등)
// 
// 모두 KST 기준 시간 제공
// ═══════════════════════════════════════════════════════════

interface MarketEvent {
  id: string;
  type: "market_open" | "market_close" | "earnings" | "macro" | "premarket";
  label: string;
  icon: string;
  dateTimeKST: string;  // ISO 형식
  timeDisplay: string;  // "22:30 KST" 또는 "오늘 22:30"
  relatedSymbol: string | null;
  relatedToPortfolio: boolean;
  importance: number;  // 1-5
  action: string | null;
  dayOffset: number;  // 0=오늘, 1=내일
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    const url = new URL(req.url);
    const daysAhead = Math.min(Number(url.searchParams.get("days") ?? "7"), 14);
    
    const events: MarketEvent[] = [];
    
    // 현재 KST 시간
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset - now.getTimezoneOffset() * 60 * 1000);
    const kstToday = new Date(kstNow);
    kstToday.setHours(0, 0, 0, 0);
    
    // ═══════════════════════════════════════
    // 1. 오늘 ~ N일 시장 개장/마감 일정
    // ═══════════════════════════════════════
    for (let offset = 0; offset <= daysAhead; offset++) {
      const targetDate = new Date(kstToday);
      targetDate.setDate(targetDate.getDate() + offset);
      const dayOfWeek = targetDate.getDay();  // 0=일 ~ 6=토
      
      // 한국장 (월-금)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const krOpen = new Date(targetDate);
        krOpen.setHours(9, 0, 0, 0);
        if (krOpen > kstNow || offset > 0) {
          events.push({
            id: `kr-open-${offset}`,
            type: "market_open",
            label: "한국장 개장",
            icon: "🇰🇷",
            dateTimeKST: krOpen.toISOString(),
            timeDisplay: offset === 0 ? `오늘 09:00` : `${offset}일 후 09:00`,
            relatedSymbol: null,
            relatedToPortfolio: false,
            importance: 2,
            action: null,
            dayOffset: offset,
          });
        }
        
        const krClose = new Date(targetDate);
        krClose.setHours(15, 30, 0, 0);
        if (krClose > kstNow || offset > 0) {
          events.push({
            id: `kr-close-${offset}`,
            type: "market_close",
            label: "한국장 마감",
            icon: "🇰🇷",
            dateTimeKST: krClose.toISOString(),
            timeDisplay: offset === 0 ? `오늘 15:30` : `${offset}일 후 15:30`,
            relatedSymbol: null,
            relatedToPortfolio: false,
            importance: 1,
            action: null,
            dayOffset: offset,
          });
        }
      }
      
      // 미국 프리마켓
      const usPremarket = new Date(targetDate);
      usPremarket.setHours(17, 0, 0, 0);
      if (usPremarket > kstNow || offset > 0) {
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          events.push({
            id: `us-pre-${offset}`,
            type: "premarket",
            label: "美 프리마켓 개장",
            icon: "🌓",
            dateTimeKST: usPremarket.toISOString(),
            timeDisplay: offset === 0 ? `오늘 17:00` : `${offset}일 후 17:00`,
            relatedSymbol: null,
            relatedToPortfolio: false,
            importance: 2,
            action: "레버리지 포지션 사전 매도 가능",
            dayOffset: offset,
          });
        }
      }
      
      // 미국 정규장 (월-금 기준, KST 22:30 = 미국 09:30 EST)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const usOpen = new Date(targetDate);
        usOpen.setHours(22, 30, 0, 0);
        if (usOpen > kstNow) {
          events.push({
            id: `us-open-${offset}`,
            type: "market_open",
            label: "美 정규장 개장",
            icon: "🇺🇸",
            dateTimeKST: usOpen.toISOString(),
            timeDisplay: offset === 0 ? `오늘 22:30` : `${offset}일 후 22:30`,
            relatedSymbol: null,
            relatedToPortfolio: true,
            importance: 3,
            action: null,
            dayOffset: offset,
          });
        }
      }
      
      // 미국 정규장 마감 (다음 날 05:00 KST)
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayOfWeek = nextDay.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const usClose = new Date(nextDay);
        usClose.setHours(5, 0, 0, 0);
        if (usClose > kstNow) {
          events.push({
            id: `us-close-${offset}`,
            type: "market_close",
            label: "美 정규장 마감",
            icon: "🏁",
            dateTimeKST: usClose.toISOString(),
            timeDisplay: offset === 0 ? "내일 05:00" : `${offset + 1}일 후 05:00`,
            relatedSymbol: null,
            relatedToPortfolio: false,
            importance: 1,
            action: null,
            dayOffset: offset + 1,
          });
        }
      }
    }
    
    // ═══════════════════════════════════════
    // 2. 실적 일정 (DB에서 조회)
    // ═══════════════════════════════════════
    const { data: earnings } = await supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", kstToday.toISOString().split("T")[0])
      .lte("earnings_date", new Date(kstToday.getTime() + daysAhead * 86400000).toISOString().split("T")[0])
      .order("earnings_date", { ascending: true });
    
    // 보유 종목 조회 (관련성 체크용)
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("symbol")
      .eq("is_active", true);
    
    const heldSymbols = new Set((holdings ?? []).map((h: any) => h.symbol));
    
    for (const e of earnings ?? []) {
      const eDate = new Date(e.earnings_date);
      // AMC면 미국 시간 장 마감 후 → 한국 05:00 다음 날
      // BMO면 미국 시간 장 개장 전 → 한국 22:00 전날
      const isAMC = e.timing?.includes("AMC") || e.timing?.includes("after");
      const isBMO = e.timing?.includes("BMO") || e.timing?.includes("before");
      
      let eventDateKST: Date;
      if (isAMC) {
        // 발표 다음 날 한국 시간 06:00 (대략)
        eventDateKST = new Date(eDate);
        eventDateKST.setDate(eventDateKST.getDate() + 1);
        eventDateKST.setHours(6, 0, 0, 0);
      } else if (isBMO) {
        eventDateKST = new Date(eDate);
        eventDateKST.setHours(21, 0, 0, 0);
      } else {
        // 기본: 해당 일 KST 15:00
        eventDateKST = new Date(eDate);
        eventDateKST.setHours(15, 0, 0, 0);
      }
      
      // 이미 지난 이벤트 skip
      if (eventDateKST < kstNow) continue;
      
      const dayOffset = Math.floor((eventDateKST.getTime() - kstToday.getTime()) / 86400000);
      const isHeld = heldSymbols.has(e.symbol);
      
      // 레버리지 파생 체크 (ORCL → ORCX/ORCU)
      const relatedLeveraged = (holdings ?? []).filter((h: any) => 
        h.symbol.startsWith(e.symbol.substring(0, 3)) && h.symbol !== e.symbol
      );
      const hasLeveraged = relatedLeveraged.length > 0;
      
      events.push({
        id: `earnings-${e.symbol}-${e.earnings_date}`,
        type: "earnings",
        label: `${e.company_name ?? e.symbol} 실적${isAMC ? " (AMC)" : isBMO ? " (BMO)" : ""}`,
        icon: "📅",
        dateTimeKST: eventDateKST.toISOString(),
        timeDisplay: dayOffset === 0 ? "오늘" : dayOffset === 1 ? "내일" : `${dayOffset}일 후`,
        relatedSymbol: e.symbol,
        relatedToPortfolio: isHeld || hasLeveraged,
        importance: e.importance ?? (isHeld ? 5 : 3),
        action: isHeld
          ? `${e.symbol} 보유 중 · 변동성 대비`
          : hasLeveraged
          ? `${relatedLeveraged.map((l: any) => l.symbol).join(", ")} 영향 가능`
          : null,
        dayOffset,
      });
    }
    
    // 시간순 정렬
    events.sort((a, b) => a.dateTimeKST.localeCompare(b.dateTimeKST));
    
    // 다음 큰 이벤트 (portfolio related 최우선)
    const nextCriticalEvent = events.find(e => 
      e.relatedToPortfolio && e.importance >= 3
    );
    
    const nextEvent = events[0];
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      kstNow: kstNow.toISOString(),
      totalEvents: events.length,
      nextEvent,
      nextCriticalEvent,
      events,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      events: [],
    });
  }
}
