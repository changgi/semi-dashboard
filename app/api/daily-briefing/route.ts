import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";
import { resolvePortfolioProxies } from "@/lib/options-proxy";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Daily Briefing API
// 
// 카일님이 아침에 5분만 보면 되는 종합 브리핑:
//   1. Executive Summary (한 줄 요약 + 오늘 할 일)
//   2. 포트폴리오 상태 (P&L + 리스크)
//   3. 핵심 종목 시그널 (SPY, QQQ, SMH, NVDA)
//   4. 오늘의 이벤트 (OpEx, 매크로)
//   5. 액션 체크리스트
// ═══════════════════════════════════════════════════════════

interface BriefingSymbolSignal {
  symbol: string;
  currentPrice: number;
  dayChangePct: number;
  maxPain: number | null;
  maxPainDistance: number | null;
  gexRegime: "positive" | "negative" | "unknown";
  gexValue: number;
  direction: "up" | "down" | "neutral";
  confidence: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  keyInsight: string;
}

interface ExecutiveSummary {
  headline: string;              // 가장 중요한 한 문장
  todayAction: string;           // 오늘의 액션
  actionColor: string;
  actionIcon: string;
  urgency: "critical" | "important" | "normal";
  confidence: number;
  keyPoints: string[];           // 3-5개 핵심 포인트
}

interface ActionItem {
  priority: "high" | "medium" | "low";
  icon: string;
  action: string;
  target: string;
  timing: string;
  reason: string;
}

// ───────────────────────────────────────────────────────────
// 날짜 유틸
// ───────────────────────────────────────────────────────────
function getThirdFriday(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstFriday = firstDay.getDay() <= 5
    ? firstDay.getDate() + (5 - firstDay.getDay())
    : firstDay.getDate() + (12 - firstDay.getDay());
  return new Date(year, month, firstFriday + 14);
}

function isQuadWitching(d: Date): boolean {
  const m = d.getMonth();
  if (![2, 5, 8, 11].includes(m)) return false;
  return d.toDateString() === getThirdFriday(d.getFullYear(), m).toDateString();
}

function findNextMajorOpEx(): { date: Date; type: "quad" | "monthly"; daysUntil: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 최대 6개월까지 찾기
  for (let i = 0; i < 180; i++) {
    const check = new Date(today);
    check.setDate(check.getDate() + i);
    if (check.getDay() !== 5) continue; // 금요일만
    const third = getThirdFriday(check.getFullYear(), check.getMonth());
    if (check.toDateString() === third.toDateString()) {
      return {
        date: check,
        type: isQuadWitching(check) ? "quad" : "monthly",
        daysUntil: i,
      };
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────
// 심볼별 신호 수집 (간소화)
// ───────────────────────────────────────────────────────────
async function analyzeSymbol(symbol: string): Promise<BriefingSymbolSignal | null> {
  try {
    const [quotes, cboeRes] = await Promise.all([
      fetchYahooQuotes([symbol]),
      fetch(
        `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
      ),
    ]);

    const q = quotes.get(symbol);
    if (!q?.price) return null;

    const currentPrice = q.price;
    const dayChangePct = q.changePct ?? 0;

    if (!cboeRes.ok) {
      return {
        symbol,
        currentPrice,
        dayChangePct,
        maxPain: null,
        maxPainDistance: null,
        gexRegime: "unknown",
        gexValue: 0,
        direction: "neutral",
        confidence: 30,
        riskLevel: "medium",
        keyInsight: "옵션 데이터 없음",
      };
    }

    const cboe = await cboeRes.json();
    const options: any[] = cboe.data?.options ?? [];

    const today = new Date();
    const parsed: any[] = [];
    for (const o of options) {
      const m = o.option?.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
      if (!m) continue;
      const exp = new Date(`20${m[2]}-${m[3]}-${m[4]}`);
      if (exp <= today) continue;
      parsed.push({
        expiry: `20${m[2]}-${m[3]}-${m[4]}`,
        type: m[5],
        strike: parseInt(m[6]) / 1000,
        oi: o.open_interest || 0,
        gamma: o.gamma || 0,
      });
    }

    // Max Pain
    const expiries = [...new Set(parsed.map(p => p.expiry))].sort();
    const nearest = expiries[0];
    const f = parsed.filter(p => p.expiry === nearest);
    let maxPain: number | null = null;
    if (f.length > 0) {
      const strikes = [...new Set(f.map(p => p.strike))].sort((a, b) => a - b);
      let minPain = Infinity;
      for (const t of strikes) {
        let pain = 0;
        for (const o of f) {
          if (o.type === "C" && t > o.strike) pain += (t - o.strike) * o.oi * 100;
          else if (o.type === "P" && t < o.strike) pain += (o.strike - t) * o.oi * 100;
        }
        if (pain < minPain) { minPain = pain; maxPain = t; }
      }
    }

    const maxPainDistance = maxPain !== null
      ? ((maxPain - currentPrice) / currentPrice) * 100
      : null;

    // GEX
    let totalGex = 0;
    for (const o of parsed) {
      if (!o.gamma || !o.oi) continue;
      const gex = o.gamma * o.oi * 100 * currentPrice * currentPrice * 0.01;
      totalGex += o.type === "C" ? gex : -gex;
    }
    const gexRegime = totalGex >= 0 ? "positive" : "negative";

    // 방향 결정
    let score = 0;
    if (maxPainDistance !== null) {
      if (maxPainDistance < -3) score -= 15;
      else if (maxPainDistance > 3) score += 10;
    }
    if (dayChangePct > 2) score += 8;
    if (dayChangePct < -2) score -= 8;
    if (gexRegime === "negative") score -= 5;

    const direction: "up" | "down" | "neutral" =
      score > 10 ? "up" : score < -10 ? "down" : "neutral";
    const confidence = Math.min(85, 50 + Math.abs(score));

    // 리스크 레벨
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (gexRegime === "negative" && Math.abs(totalGex) > 2e9) riskLevel = "high";
    else if (gexRegime === "negative") riskLevel = "medium";
    if (Math.abs(dayChangePct) > 5) riskLevel = "high";

    // 핵심 인사이트 생성
    let keyInsight = "";
    if (direction === "down" && maxPainDistance !== null && maxPainDistance < -3) {
      keyInsight = `Max Pain $${maxPain} 방향 하락 압력`;
    } else if (direction === "up" && maxPainDistance !== null && maxPainDistance > 3) {
      keyInsight = `Max Pain $${maxPain} 방향 상승 여력`;
    } else if (gexRegime === "negative") {
      keyInsight = `음의 GEX - 변동성 급증 주의`;
    } else if (gexRegime === "positive") {
      keyInsight = `양의 GEX - 안정적 움직임`;
    } else {
      keyInsight = "특별한 시그널 없음";
    }

    return {
      symbol,
      currentPrice,
      dayChangePct,
      maxPain,
      maxPainDistance,
      gexRegime,
      gexValue: totalGex,
      direction,
      confidence,
      riskLevel,
      keyInsight,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const supabase = createAdmin();

    // 1. 포트폴리오 조회
    const { data: holdings, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    if (error) throw error;

    // 2. 핵심 종목 리스트 (포트폴리오 proxy + 주요 종목)
    const corestocks = ["SPY", "QQQ", "SMH", "NVDA", "AMD", "TSM"];
    const portfolioProxies = holdings
      ? resolvePortfolioProxies(holdings.map(h => ({ symbol: h.symbol, name: h.name })))
      : new Map();
    const proxySymbols = new Set<string>();
    for (const [, proxy] of portfolioProxies.entries()) {
      proxySymbols.add(proxy.proxySymbol);
    }
    // 핵심 종목 + 포트 proxy를 병합
    const symbolsToAnalyze = [...new Set([...corestocks, ...Array.from(proxySymbols)])];

    // 3. 매크로 + 모든 종목 병렬 분석
    const [macroQuotes, ...signalResults] = await Promise.all([
      fetchYahooQuotes(["^VIX", "^TNX", "KRW=X", "DX-Y.NYB", "CL=F"]),
      ...symbolsToAnalyze.map((s) => analyzeSymbol(s)),
    ]);

    const symbolSignals = signalResults
      .filter((s): s is BriefingSymbolSignal => s !== null);

    // 4. 매크로 지표
    const vix = macroQuotes.get("^VIX")?.price ?? null;
    const tnx = macroQuotes.get("^TNX")?.price ?? null;
    const krw = macroQuotes.get("KRW=X")?.price ?? 1350;
    const dxy = macroQuotes.get("DX-Y.NYB")?.price ?? null;
    const oil = macroQuotes.get("CL=F")?.price ?? null;

    // 5. 포트폴리오 상태
    let portfolioSummary = {
      totalValueUsd: 0,
      totalGainPct: 0,
      positionCount: 0,
      riskScore: 0,
    };

    if (holdings && holdings.length > 0) {
      const symbols = [...new Set(holdings.map(h => h.symbol))];
      const holdingQuotes = await fetchYahooQuotes(symbols);

      let totalValue = 0;
      let totalCost = 0;
      let weightedRisk = 0;

      for (const h of holdings) {
        const q = holdingQuotes.get(h.symbol);
        const price = q?.price ?? h.avg_cost;
        const value = price * h.shares;
        const cost = h.avg_cost * h.shares;
        const valueUsd = h.currency === "KRW" ? value / krw : value;
        const costUsd = h.currency === "KRW" ? cost / krw : cost;

        totalValue += valueUsd;
        totalCost += costUsd;

        // proxy 리스크
        const proxy = portfolioProxies.get(h.symbol);
        const proxySig = proxy ? symbolSignals.find(s => s.symbol === proxy.proxySymbol) : null;
        const riskValue =
          proxySig?.riskLevel === "critical" ? 100 :
          proxySig?.riskLevel === "high" ? 70 :
          proxySig?.riskLevel === "medium" ? 40 : 15;
        weightedRisk += (riskValue * valueUsd);
      }

      portfolioSummary = {
        totalValueUsd: Math.round(totalValue * 100) / 100,
        totalGainPct: totalCost > 0 ? Math.round(((totalValue - totalCost) / totalCost) * 10000) / 100 : 0,
        positionCount: holdings.length,
        riskScore: totalValue > 0 ? Math.round(weightedRisk / totalValue) : 0,
      };
    }

    // 6. 다음 주요 OpEx
    const nextOpEx = findNextMajorOpEx();

    // 7. Executive Summary
    const execSummary = buildExecutiveSummary({
      symbolSignals,
      portfolioSummary,
      vix,
      tnx,
      krw,
      nextOpEx,
    });

    // 8. 액션 아이템
    const actions = buildActionItems({
      symbolSignals,
      portfolioSummary,
      vix,
      nextOpEx,
    });

    // 9. 오늘의 이벤트
    const todayEvents: Array<{ time: string; event: string; impact: string }> = [];
    if (nextOpEx && nextOpEx.daysUntil === 0) {
      todayEvents.push({
        time: "15:30 EST (04:30 KST)",
        event: nextOpEx.type === "quad" ? "🔥 쿼드러플 위칭" : "📅 월간 OpEx",
        impact: nextOpEx.type === "quad" ? "극심한 변동성 예상" : "높은 변동성",
      });
    }
    // VIX 극단 체크
    if (vix !== null) {
      if (vix > 25) {
        todayEvents.push({
          time: "실시간",
          event: `😱 VIX ${vix.toFixed(1)} 공포 구간`,
          impact: "역발상 매수 기회 탐색",
        });
      } else if (vix < 13) {
        todayEvents.push({
          time: "실시간",
          event: `😌 VIX ${vix.toFixed(1)} 극저 구간`,
          impact: "보험(풋) 저가 매수 기회",
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reportDate: new Date().toISOString().split("T")[0],
      executiveSummary: execSummary,
      actionItems: actions,
      portfolioSummary,
      symbolSignals,
      macro: {
        vix,
        tnx,
        krw,
        dxy,
        oil,
        vixRegime: vix === null ? "unknown" : vix > 25 ? "fear" : vix > 20 ? "elevated" : vix > 15 ? "normal" : "complacent",
      },
      todayEvents,
      nextOpEx: nextOpEx ? {
        date: nextOpEx.date.toISOString().split("T")[0],
        type: nextOpEx.type,
        daysUntil: nextOpEx.daysUntil,
        label: nextOpEx.type === "quad" ? "🔥 쿼드러플 위칭" : "📅 월간 OpEx",
      } : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: true,
      reportDate: new Date().toISOString().split("T")[0],
      executiveSummary: {
        headline: "데이터를 일시적으로 불러올 수 없습니다",
        todayAction: "대기",
        actionColor: "#888",
        actionIcon: "⏸️",
        urgency: "normal",
        confidence: 0,
        keyPoints: ["잠시 후 새로고침해주세요"],
      },
      actionItems: [],
      portfolioSummary: { totalValueUsd: 0, totalGainPct: 0, positionCount: 0, riskScore: 0 },
      symbolSignals: [],
      macro: { vix: null, tnx: null, krw: 1470, dxy: null, oil: null, vixRegime: "unknown" },
      todayEvents: [],
      nextOpEx: null,
      error: msg,
      _soft_failure: true,
    });
  }
}

// ───────────────────────────────────────────────────────────
// Executive Summary 빌드
// ───────────────────────────────────────────────────────────
function buildExecutiveSummary(params: {
  symbolSignals: BriefingSymbolSignal[];
  portfolioSummary: { totalGainPct: number; riskScore: number };
  vix: number | null;
  tnx: number | null;
  krw: number;
  nextOpEx: { type: "quad" | "monthly"; daysUntil: number } | null;
}): ExecutiveSummary {
  const { symbolSignals, portfolioSummary, vix, nextOpEx } = params;

  // SPY 기준으로 전체 시장 방향 판단
  const spy = symbolSignals.find(s => s.symbol === "SPY");
  const qqq = symbolSignals.find(s => s.symbol === "QQQ");
  const smh = symbolSignals.find(s => s.symbol === "SMH");

  let bullishCount = symbolSignals.filter(s => s.direction === "up").length;
  let bearishCount = symbolSignals.filter(s => s.direction === "down").length;
  let riskCount = symbolSignals.filter(s => s.riskLevel === "high" || s.riskLevel === "critical").length;

  // 종합 점수
  let score = 0;
  if (spy?.direction === "up") score += 15;
  if (spy?.direction === "down") score -= 15;
  if (qqq?.direction === "up") score += 10;
  if (qqq?.direction === "down") score -= 10;
  score += (bullishCount - bearishCount) * 3;

  if (vix !== null) {
    if (vix > 25) score -= 15;
    if (vix < 13) score -= 5; // 극저도 약한 음수 (과열)
    if (vix > 15 && vix < 20) score += 5;
  }

  if (nextOpEx && nextOpEx.daysUntil <= 3 && nextOpEx.type === "quad") {
    score -= 10; // 쿼드 위칭 임박
  }

  if (portfolioSummary.riskScore > 60) score -= 10;

  // 판정
  let todayAction = "";
  let actionColor = "";
  let actionIcon = "";
  let urgency: "critical" | "important" | "normal" = "normal";
  let headline = "";
  const keyPoints: string[] = [];
  let confidence = 50;

  if (score >= 15) {
    todayAction = "매수";
    actionColor = "#00ff88";
    actionIcon = "📈";
    urgency = "important";
    headline = "복수 지표가 강세 방향 일치 - 매수 우위";
    confidence = Math.min(85, 60 + score);
    keyPoints.push(`✅ SPY ${spy?.direction === "up" ? "상승" : "중립"} 시그널`);
    keyPoints.push(`✅ ${bullishCount}개 종목 강세 vs ${bearishCount}개 약세`);
    if (vix && vix < 20) keyPoints.push(`✅ VIX ${vix.toFixed(1)} - 안정적 환경`);
  } else if (score <= -15) {
    todayAction = "매도 / 헤지";
    actionColor = "#ff3860";
    actionIcon = "🔴";
    urgency = "critical";
    headline = "복수 지표가 약세 방향 일치 - 방어적 포지션 필요";
    confidence = Math.min(85, 60 + Math.abs(score));
    keyPoints.push(`⚠️ ${bearishCount}개 종목 약세 vs ${bullishCount}개 강세`);
    if (vix && vix > 20) keyPoints.push(`⚠️ VIX ${vix.toFixed(1)} - 공포 확산`);
    if (riskCount > 0) keyPoints.push(`⚠️ ${riskCount}개 종목 리스크 구간`);
  } else if (score <= -5) {
    todayAction = "헤지 / 관망";
    actionColor = "#ffaa44";
    actionIcon = "🛡️";
    urgency = "important";
    headline = "리스크 관리 구간 - 방어 포지션 점검";
    confidence = 65;
    keyPoints.push(`⚠️ 혼조 시장 - 방향성 불확실`);
    if (nextOpEx && nextOpEx.daysUntil <= 3) {
      keyPoints.push(`📅 ${nextOpEx.daysUntil}일 후 OpEx - 변동성 주의`);
    }
  } else {
    todayAction = "보유 유지";
    actionColor = "#aaccff";
    actionIcon = "💎";
    urgency = "normal";
    headline = "명확한 시그널 없음 - 현재 포지션 유지";
    confidence = 55;
    keyPoints.push("➖ 주요 지표 중립");
    if (portfolioSummary.totalGainPct > 0) {
      keyPoints.push(`✅ 포트폴리오 +${portfolioSummary.totalGainPct.toFixed(1)}% 수익 유지`);
    }
  }

  // 추가 맥락
  if (smh?.direction === "up") keyPoints.push(`📈 반도체 섹터 강세 (SMH)`);
  if (smh?.direction === "down") keyPoints.push(`📉 반도체 섹터 약세 (SMH)`);

  if (nextOpEx && nextOpEx.daysUntil <= 7 && nextOpEx.daysUntil > 3) {
    keyPoints.push(`📅 ${nextOpEx.daysUntil}일 후 ${nextOpEx.type === "quad" ? "쿼드 위칭" : "월간 OpEx"}`);
  }

  return {
    headline,
    todayAction,
    actionColor,
    actionIcon,
    urgency,
    confidence,
    keyPoints: keyPoints.slice(0, 5),
  };
}

// ───────────────────────────────────────────────────────────
// Action Items 빌드
// ───────────────────────────────────────────────────────────
function buildActionItems(params: {
  symbolSignals: BriefingSymbolSignal[];
  portfolioSummary: { riskScore: number; totalGainPct: number };
  vix: number | null;
  nextOpEx: { type: "quad" | "monthly"; daysUntil: number } | null;
}): ActionItem[] {
  const { symbolSignals, portfolioSummary, vix, nextOpEx } = params;
  const actions: ActionItem[] = [];

  // 1. 쿼드 위칭 임박
  if (nextOpEx && nextOpEx.type === "quad" && nextOpEx.daysUntil <= 3 && nextOpEx.daysUntil > 0) {
    actions.push({
      priority: "high",
      icon: "🚨",
      action: "포지션 리스크 축소",
      target: "포트폴리오 전체",
      timing: `D-${nextOpEx.daysUntil}`,
      reason: "쿼드러플 위칭 임박 - 극심한 변동성 예상",
    });
  }

  // 2. OpEx 2주 전 매수 기회
  if (nextOpEx && nextOpEx.daysUntil >= 11 && nextOpEx.daysUntil <= 20) {
    actions.push({
      priority: "medium",
      icon: "💎",
      action: "분할 매수 시작",
      target: "포트폴리오 확장 종목",
      timing: `다음 2주`,
      reason: `OpEx ${nextOpEx.daysUntil}일 전 - 변동성 프리미엄 구간`,
    });
  }

  // 3. VIX 극단
  if (vix !== null) {
    if (vix > 30) {
      actions.push({
        priority: "high",
        icon: "🔥",
        action: "역발상 매수 준비",
        target: "SPY, QQQ, SMH",
        timing: "즉시",
        reason: `VIX ${vix.toFixed(1)} 극도의 공포 - 역사적 반등 구간`,
      });
    } else if (vix < 13) {
      actions.push({
        priority: "medium",
        icon: "🛡️",
        action: "헤지 매수",
        target: "SPY 풋옵션 (보험)",
        timing: "금주",
        reason: `VIX ${vix.toFixed(1)} 극저 - 저렴한 풋 옵션 기회`,
      });
    }
  }

  // 4. 약세 시그널 강한 종목 → 매도
  const strongBearish = symbolSignals.filter(s => s.direction === "down" && s.confidence > 65);
  for (const s of strongBearish.slice(0, 2)) {
    actions.push({
      priority: "high",
      icon: "🔴",
      action: "포지션 축소 / 매도",
      target: s.symbol,
      timing: "즉시",
      reason: `${s.symbol} 약세 ${s.confidence}% 신뢰도 - ${s.keyInsight}`,
    });
  }

  // 5. 강세 시그널 강한 종목 → 매수
  const strongBullish = symbolSignals.filter(s => s.direction === "up" && s.confidence > 65);
  for (const s of strongBullish.slice(0, 2)) {
    actions.push({
      priority: "medium",
      icon: "📈",
      action: "포지션 추가 고려",
      target: s.symbol,
      timing: "금주",
      reason: `${s.symbol} 강세 ${s.confidence}% - ${s.keyInsight}`,
    });
  }

  // 6. 포트폴리오 리스크 높음
  if (portfolioSummary.riskScore > 60) {
    actions.push({
      priority: "high",
      icon: "⚠️",
      action: "포트폴리오 리스크 점검",
      target: "포트폴리오 전체",
      timing: "오늘",
      reason: `리스크 점수 ${portfolioSummary.riskScore}/100 - 분산 및 헤지 필요`,
    });
  }

  // 기본 액션
  if (actions.length === 0) {
    actions.push({
      priority: "low",
      icon: "💎",
      action: "현재 포지션 유지",
      target: "포트폴리오 전체",
      timing: "오늘",
      reason: "명확한 액션 시그널 없음 - 관망 권장",
    });
  }

  // 중복 제거 및 우선순위 정렬
  const seen = new Set<string>();
  const filtered = actions.filter(a => {
    const key = `${a.action}_${a.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return filtered.slice(0, 6);
}
