import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";
import { resolvePortfolioProxies } from "@/lib/options-proxy";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Daily Alert Cron
// 
// 매일 아침 9시 KST 자동 실행:
//   1. 포트폴리오 상태 체크
//   2. OpEx 임박 여부 확인 (D-3 이내)
//   3. 비정상 시장 활동 감지
//   4. 리스크 급상승 경고
//   5. notifications 테이블에 자동 추가
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// 인증
// ───────────────────────────────────────────────────────────
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev
  return auth === `Bearer ${secret}`;
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
  for (let i = 0; i < 180; i++) {
    const check = new Date(today);
    check.setDate(check.getDate() + i);
    if (check.getDay() !== 5) continue;
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
// CBOE 간단 조회
// ───────────────────────────────────────────────────────────
async function fetchCboeSimple(symbol: string): Promise<{
  currentPrice: number;
  options: any[];
} | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return { currentPrice: d.data.current_price, options: d.data.options ?? [] };
  } catch { return null; }
}

// ───────────────────────────────────────────────────────────
// Notification 생성
// ───────────────────────────────────────────────────────────
interface Notification {
  type: "briefing" | "opex_warning" | "unusual_activity" | "risk_alert" | "opportunity";
  priority: "high" | "medium" | "low";
  title: string;
  message: string;
  symbol?: string;
  metadata?: any;
}

// ═══════════════════════════════════════════════════════════
// GET (Vercel Cron 트리거)
// ═══════════════════════════════════════════════════════════
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdmin();
    const notifications: Notification[] = [];

    // ─────────────────────────────────────────────
    // 1. OpEx 체크 (D-3 이내)
    // ─────────────────────────────────────────────
    const opex = findNextMajorOpEx();
    if (opex && opex.daysUntil <= 3 && opex.daysUntil > 0) {
      notifications.push({
        type: "opex_warning",
        priority: "high",
        title: opex.type === "quad"
          ? `🔥 쿼드 위칭 D-${opex.daysUntil}`
          : `📅 월간 OpEx D-${opex.daysUntil}`,
        message: opex.type === "quad"
          ? `${opex.daysUntil}일 후 쿼드러플 위칭 - 극심한 변동성 예상. 포지션 리스크 축소 검토`
          : `${opex.daysUntil}일 후 월간 OpEx - Pinning 효과 가능. 단기 옵션 매수 비권장`,
        metadata: { opexDate: opex.date.toISOString(), type: opex.type },
      });
    } else if (opex && opex.daysUntil === 0) {
      notifications.push({
        type: "opex_warning",
        priority: "high",
        title: opex.type === "quad" ? "🔥 오늘 쿼드 위칭" : "📅 오늘 월간 OpEx",
        message: "만기 당일 - 0DTE 변동성 극심. 거래 자제 권장",
        metadata: { opexDate: opex.date.toISOString(), type: opex.type },
      });
    } else if (opex && opex.daysUntil >= 11 && opex.daysUntil <= 14) {
      notifications.push({
        type: "opportunity",
        priority: "medium",
        title: `💎 OpEx 2주 전 매수 기회`,
        message: `${opex.daysUntil}일 후 OpEx - 변동성 프리미엄 구간. 분할 매수 검토`,
        metadata: { opexDate: opex.date.toISOString() },
      });
    }

    // ─────────────────────────────────────────────
    // 2. 포트폴리오 리스크 체크
    // ─────────────────────────────────────────────
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);

    let portfolioTotalUsd = 0;
    let portfolioGainPct = 0;
    let positionCount = 0;

    if (holdings && holdings.length > 0) {
      const symbols = [...new Set(holdings.map((h: any) => h.symbol))];
      const [quotes, fx] = await Promise.all([
        fetchYahooQuotes(symbols),
        fetchYahooQuotes(["KRW=X"]),
      ]);
      const usdKrw = fx.get("KRW=X")?.price ?? 1350;

      let totalValue = 0;
      let totalCost = 0;
      for (const h of holdings) {
        const q = quotes.get(h.symbol);
        const price = q?.price ?? h.avg_cost;
        const valueUsd = h.currency === "KRW"
          ? (price * h.shares) / usdKrw
          : price * h.shares;
        const costUsd = h.currency === "KRW"
          ? (h.avg_cost * h.shares) / usdKrw
          : h.avg_cost * h.shares;
        totalValue += valueUsd;
        totalCost += costUsd;
      }
      portfolioTotalUsd = totalValue;
      portfolioGainPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
      positionCount = holdings.length;

      // 집중도 체크
      const proxyMap = resolvePortfolioProxies(
        holdings.map((h: any) => ({ symbol: h.symbol, name: h.name }))
      );
      const proxyWeights: Record<string, number> = {};
      for (const h of holdings) {
        const proxy = proxyMap.get(h.symbol);
        if (!proxy) continue;
        const q = quotes.get(h.symbol);
        const price = q?.price ?? h.avg_cost;
        const valueUsd = h.currency === "KRW"
          ? (price * h.shares) / usdKrw
          : price * h.shares;
        const weight = totalValue > 0 ? (valueUsd / totalValue) * 100 : 0;
        proxyWeights[proxy.proxySymbol] = (proxyWeights[proxy.proxySymbol] || 0) + weight;
      }

      // 단일 proxy 비중 90% 초과 경고
      for (const [proxy, weight] of Object.entries(proxyWeights)) {
        if (weight > 90) {
          notifications.push({
            type: "risk_alert",
            priority: "medium",
            title: `⚖️ 포트폴리오 집중 리스크`,
            message: `${proxy} 비중 ${weight.toFixed(0)}% - 분산 필요. SMH, QQQ 등 추가 고려`,
            metadata: { proxySymbol: proxy, weight },
          });
          break;
        }
      }

      // 큰 수익 실현 알림 (단일 포지션 +50% 이상)
      for (const h of holdings) {
        const q = quotes.get(h.symbol);
        if (!q?.price) continue;
        const gainPct = ((q.price - h.avg_cost) / h.avg_cost) * 100;
        if (gainPct > 100) {
          notifications.push({
            type: "opportunity",
            priority: "medium",
            title: `💰 ${h.symbol} +${gainPct.toFixed(0)}% 달성`,
            message: `${h.name || h.symbol} 평단 대비 +${gainPct.toFixed(1)}% - 부분 이익실현 검토`,
            symbol: h.symbol,
            metadata: { gainPct, shares: h.shares },
          });
        }
      }
    }

    // ─────────────────────────────────────────────
    // 3. 주요 지수 이상 감지 (SPY/QQQ)
    // ─────────────────────────────────────────────
    const [spyCboe, qqqCboe, vixQuote] = await Promise.all([
      fetchCboeSimple("SPY"),
      fetchCboeSimple("QQQ"),
      fetchYahooQuotes(["^VIX"]),
    ]);

    const vix = vixQuote.get("^VIX")?.price;

    // VIX 극단 알림
    if (vix !== undefined) {
      if (vix > 30) {
        notifications.push({
          type: "opportunity",
          priority: "high",
          title: `🔥 VIX ${vix.toFixed(1)} 극도의 공포`,
          message: "역사적으로 공포 극단은 매수 기회. SPY/QQQ/SMH 분할 매수 검토",
          metadata: { vix },
        });
      } else if (vix < 12) {
        notifications.push({
          type: "risk_alert",
          priority: "medium",
          title: `😌 VIX ${vix.toFixed(1)} 극도의 과열`,
          message: "변동성 극저 - 보험(풋) 저가 매수 기회. 포트폴리오 헤지 검토",
          metadata: { vix },
        });
      }
    }

    // SPY/QQQ 음의 GEX 전환 감지
    for (const [label, cboe] of [["SPY", spyCboe], ["QQQ", qqqCboe]] as const) {
      if (!cboe) continue;
      const today = new Date();
      let gex = 0;
      for (const o of cboe.options) {
        const m = o.option?.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
        if (!m) continue;
        const exp = new Date(`20${m[2]}-${m[3]}-${m[4]}`);
        if (exp <= today) continue;
        const gamma = o.gamma || 0;
        const oi = o.open_interest || 0;
        if (!gamma || !oi) continue;
        const g = gamma * oi * 100 * cboe.currentPrice * cboe.currentPrice * 0.01;
        gex += m[5] === "C" ? g : -g;
      }

      if (gex < 0 && Math.abs(gex) > 1e9) {
        notifications.push({
          type: "risk_alert",
          priority: "high",
          title: `⚠️ ${label} 음의 GEX 전환`,
          message: `${label} Gamma ${(gex/1e9).toFixed(2)}B - 변동성 급증 위험. 방어 포지션 고려`,
          symbol: label,
          metadata: { gex, currentPrice: cboe.currentPrice },
        });
      }
    }

    // ─────────────────────────────────────────────
    // 4. 일일 브리핑 (기본)
    // ─────────────────────────────────────────────
    const todayStr = new Date().toISOString().split("T")[0];
    const dateKr = new Date().toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });

    notifications.push({
      type: "briefing",
      priority: "low",
      title: `☕ ${dateKr} 모닝 브리핑`,
      message: holdings && holdings.length > 0
        ? `포트폴리오 $${portfolioTotalUsd.toFixed(2)} (${portfolioGainPct >= 0 ? "+" : ""}${portfolioGainPct.toFixed(2)}%). VIX ${vix?.toFixed(1) ?? "-"}. 대시보드에서 전체 확인`
        : `VIX ${vix?.toFixed(1) ?? "-"}. 대시보드 접속하여 오늘의 시장 확인`,
      metadata: { portfolioTotalUsd, portfolioGainPct, vix, positionCount },
    });

    // ─────────────────────────────────────────────
    // 5. DB에 저장 (테이블 없으면 무시)
    // ─────────────────────────────────────────────
    let inserted = 0;
    let dbError: string | null = null;
    try {
      for (const n of notifications) {
        const { error } = await supabase.from("notifications").insert({
          type: n.type,
          priority: n.priority,
          title: n.title,
          message: n.message,
          symbol: n.symbol ?? null,
          metadata: n.metadata ?? {},
          is_read: false,
        });
        if (!error) inserted++;
      }
    } catch (e) {
      dbError = (e as Error).message;
      // notifications 테이블 없어도 응답은 반환
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      generated: notifications.length,
      inserted,
      dbError,
      notifications: notifications.map(n => ({
        type: n.type,
        priority: n.priority,
        title: n.title,
        message: n.message,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
