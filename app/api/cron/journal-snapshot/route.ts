import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Daily Journal Snapshot Cron
// 
// 매일 아침 9:30 KST 자동 실행 (0 0 * * *):
//   1. Daily Briefing + Sector Scanner + Portfolio Risk 조회
//   2. journal_daily_snapshots 테이블에 저장
//   3. 주요 시그널은 journal_signal_tracking에 저장
// ═══════════════════════════════════════════════════════════

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return auth === `Bearer ${secret}`;
}

// ───────────────────────────────────────────────────────────
// 내부 API 호출 헬퍼
// ───────────────────────────────────────────────────────────
async function fetchInternal(path: string): Promise<any> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdmin();
    const today = new Date().toISOString().split("T")[0];

    // 1. 모든 분석 API 병렬 호출
    const [briefing, scanner, risk, portfolio] = await Promise.all([
      fetchInternal("/api/daily-briefing"),
      fetchInternal("/api/sector-scanner"),
      fetchInternal("/api/portfolio-risk"),
      fetchInternal("/api/portfolio"),
    ]);

    // 2. 스냅샷 데이터 구성
    const snapshot: any = {
      snapshot_date: today,
    };

    if (briefing?.success) {
      snapshot.vix = briefing.macro?.vix;
      snapshot.tnx = briefing.macro?.tnx;
      snapshot.usd_krw = briefing.macro?.krw;
      snapshot.today_action = briefing.executiveSummary?.todayAction;
      snapshot.today_confidence = briefing.executiveSummary?.confidence;
      snapshot.today_headline = briefing.executiveSummary?.headline;

      // SPY/QQQ 가격
      const spy = briefing.symbolSignals?.find((s: any) => s.symbol === "SPY");
      const qqq = briefing.symbolSignals?.find((s: any) => s.symbol === "QQQ");
      if (spy) snapshot.spy_price = spy.currentPrice;
      if (qqq) snapshot.qqq_price = qqq.currentPrice;
    }

    if (portfolio?.success) {
      snapshot.portfolio_value_usd = portfolio.summary?.totalValue;
      snapshot.portfolio_gain_pct = portfolio.summary?.totalGainPct;
      snapshot.position_count = portfolio.summary?.holdingCount;
    }

    if (risk?.success) {
      snapshot.risk_score = risk.overallRiskScore;
    }

    if (scanner?.success) {
      const ss = scanner.sectorSentiment;
      snapshot.sector_direction = scanner.sectorDirection?.includes("강세")
        ? "bullish"
        : scanner.sectorDirection?.includes("약세")
        ? "bearish"
        : "neutral";
      snapshot.sector_avg_score = ss?.avgScore;
      snapshot.bullish_count = ss?.bullish;
      snapshot.bearish_count = ss?.bearish;

      // 주요 시그널 (Strong Buy + Strong Sell + Unusual Activity)
      const keySignals: any[] = [];
      for (const r of (scanner.results?.strongBuys ?? [])) {
        keySignals.push({
          symbol: r.symbol,
          direction: "up",
          confidence: Math.min(85, 50 + r.score),
          reason: r.rationale,
          source: "sector_scanner",
          entry_price: r.currentPrice,
        });
      }
      for (const r of (scanner.results?.strongSells ?? [])) {
        keySignals.push({
          symbol: r.symbol,
          direction: "down",
          confidence: Math.min(85, 50 + Math.abs(r.score)),
          reason: r.rationale,
          source: "sector_scanner",
          entry_price: r.currentPrice,
        });
      }
      snapshot.key_signals = keySignals;
    }

    // 3. UPSERT (같은 날짜면 업데이트)
    const { error: snapError } = await supabase
      .from("journal_daily_snapshots")
      .upsert(snapshot, { onConflict: "snapshot_date" });

    if (snapError) throw snapError;

    // 4. 각 주요 시그널을 tracking 테이블에 저장
    let signalsInserted = 0;
    if (scanner?.success) {
      const strongSignals = [
        ...(scanner.results?.strongBuys ?? []).map((r: any) => ({
          signal_date: today,
          symbol: r.symbol,
          direction: "up",
          action: "buy",
          confidence: Math.min(85, 50 + r.score),
          source: "sector_scanner",
          reason: r.rationale,
          entry_price: r.currentPrice,
          target_price: Math.round(r.currentPrice * 1.05 * 100) / 100,
          stop_loss: Math.round(r.currentPrice * 0.97 * 100) / 100,
          take_profit: Math.round(r.currentPrice * 1.08 * 100) / 100,
        })),
        ...(scanner.results?.strongSells ?? []).map((r: any) => ({
          signal_date: today,
          symbol: r.symbol,
          direction: "down",
          action: "sell",
          confidence: Math.min(85, 50 + Math.abs(r.score)),
          source: "sector_scanner",
          reason: r.rationale,
          entry_price: r.currentPrice,
          target_price: Math.round(r.currentPrice * 0.95 * 100) / 100,
          stop_loss: Math.round(r.currentPrice * 1.03 * 100) / 100,
          take_profit: Math.round(r.currentPrice * 0.92 * 100) / 100,
        })),
      ];

      // 같은 날, 같은 심볼, 같은 방향은 중복 생성 방지
      for (const sig of strongSignals) {
        const { data: existing } = await supabase
          .from("journal_signal_tracking")
          .select("id")
          .eq("signal_date", sig.signal_date)
          .eq("symbol", sig.symbol)
          .eq("direction", sig.direction)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase
            .from("journal_signal_tracking")
            .insert(sig);
          if (!error) signalsInserted++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      snapshot_date: today,
      snapshot: {
        portfolio_value_usd: snapshot.portfolio_value_usd,
        portfolio_gain_pct: snapshot.portfolio_gain_pct,
        sector_direction: snapshot.sector_direction,
        today_action: snapshot.today_action,
      },
      signals_inserted: signalsInserted,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true });
  }
}
