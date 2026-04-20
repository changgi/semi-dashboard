import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Data Export API
// 
// GET /api/export?type=portfolio (CSV 파일 다운로드)
//   - type: portfolio | signals | trades | briefing | full
//   - format: csv | json
// ═══════════════════════════════════════════════════════════

function toCsv(rows: any[], headers?: string[]): string {
  if (!rows || rows.length === 0) return "";
  const cols = headers ?? Object.keys(rows[0]);
  const escape = (v: any): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerRow = cols.join(",");
  const dataRows = rows.map((r) => cols.map((c) => escape(r[c])).join(","));
  // Excel 한글 깨짐 방지 UTF-8 BOM
  return "\uFEFF" + headerRow + "\n" + dataRows.join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") ?? "portfolio";
    const format = req.nextUrl.searchParams.get("format") ?? "csv";
    const supabase = createAdmin();
    const today = new Date().toISOString().split("T")[0];

    let rows: any[] = [];
    let filename = "";

    // ─────────────────────────────────────────────
    // 1. 포트폴리오 내보내기
    // ─────────────────────────────────────────────
    if (type === "portfolio") {
      const { data: holdings } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .eq("is_active", true);

      const symbols = [...new Set((holdings || []).map((h: any) => h.symbol))];
      const quotes = await fetchYahooQuotes([...symbols, "KRW=X"]);
      const usdKrw = quotes.get("KRW=X")?.price ?? 1470;

      rows = (holdings || []).map((h: any) => {
        const q = quotes.get(h.symbol);
        const currentPrice = q?.price ?? h.avg_cost;
        const marketValue = currentPrice * h.shares;
        const costValue = h.avg_cost * h.shares;
        const gain = marketValue - costValue;
        const gainPct = costValue > 0 ? (gain / costValue) * 100 : 0;
        return {
          symbol: h.symbol,
          name: h.name || "",
          shares: h.shares,
          avg_cost: h.avg_cost,
          currency: h.currency,
          current_price: currentPrice?.toFixed(2),
          market_value: marketValue?.toFixed(2),
          cost_value: costValue?.toFixed(2),
          gain: gain?.toFixed(2),
          gain_pct: gainPct?.toFixed(2),
          market_value_usd: h.currency === "KRW"
            ? (marketValue / usdKrw).toFixed(2)
            : marketValue.toFixed(2),
          purchase_date: h.purchase_date || "",
          notes: h.notes || "",
        };
      });
      filename = `portfolio_${today}`;
    }

    // ─────────────────────────────────────────────
    // 2. 시그널 이력 내보내기
    // ─────────────────────────────────────────────
    else if (type === "signals") {
      const { data: signals } = await supabase
        .from("journal_signal_tracking")
        .select("*")
        .order("signal_date", { ascending: false })
        .limit(200);

      rows = (signals || []).map((s: any) => ({
        signal_date: s.signal_date,
        symbol: s.symbol,
        direction: s.direction,
        action: s.action,
        confidence: s.confidence,
        source: s.source,
        entry_price: s.entry_price,
        target_price: s.target_price,
        stop_loss: s.stop_loss,
        price_1d: s.price_1d || "",
        price_7d: s.price_7d || "",
        price_30d: s.price_30d || "",
        hit_1d: s.hit_1d === null ? "" : (s.hit_1d ? "HIT" : "MISS"),
        hit_7d: s.hit_7d === null ? "" : (s.hit_7d ? "HIT" : "MISS"),
        hit_30d: s.hit_30d === null ? "" : (s.hit_30d ? "HIT" : "MISS"),
        max_gain_pct: s.max_gain_pct || "",
        max_loss_pct: s.max_loss_pct || "",
        verification_status: s.verification_status,
        reason: s.reason || "",
      }));
      filename = `signals_${today}`;
    }

    // ─────────────────────────────────────────────
    // 3. 매매 이력
    // ─────────────────────────────────────────────
    else if (type === "trades") {
      const { data: trades } = await supabase
        .from("journal_trades")
        .select("*")
        .order("trade_date", { ascending: false })
        .limit(500);

      rows = (trades || []).map((t: any) => ({
        trade_date: t.trade_date,
        symbol: t.symbol,
        action: t.action,
        shares: t.shares,
        price: t.price,
        currency: t.currency,
        total_amount: (t.shares * t.price).toFixed(2),
        rationale: t.rationale || "",
        emotion: t.emotion || "",
      }));
      filename = `trades_${today}`;
    }

    // ─────────────────────────────────────────────
    // 4. 일일 스냅샷 (포트폴리오 추이)
    // ─────────────────────────────────────────────
    else if (type === "snapshots") {
      const { data: snapshots } = await supabase
        .from("journal_daily_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(365);

      rows = (snapshots || []).map((s: any) => ({
        date: s.snapshot_date,
        portfolio_value_usd: s.portfolio_value_usd,
        portfolio_gain_pct: s.portfolio_gain_pct,
        risk_score: s.risk_score,
        position_count: s.position_count,
        today_action: s.today_action,
        today_confidence: s.today_confidence,
        vix: s.vix,
        tnx: s.tnx,
        usd_krw: s.usd_krw,
        spy_price: s.spy_price,
        qqq_price: s.qqq_price,
        sector_direction: s.sector_direction,
        sector_avg_score: s.sector_avg_score,
      }));
      filename = `snapshots_${today}`;
    }

    // ─────────────────────────────────────────────
    // 5. 전체 내보내기 (JSON)
    // ─────────────────────────────────────────────
    else if (type === "full") {
      const [h, s, t, sn] = await Promise.all([
        supabase.from("portfolio_holdings").select("*").eq("is_active", true),
        supabase.from("journal_signal_tracking").select("*").order("signal_date", { ascending: false }).limit(500),
        supabase.from("journal_trades").select("*").order("trade_date", { ascending: false }).limit(500),
        supabase.from("journal_daily_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(180),
      ]);

      const data = {
        exported_at: new Date().toISOString(),
        holdings: h.data || [],
        signals: s.data || [],
        trades: t.data || [],
        snapshots: sn.data || [],
      };

      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="kyle_full_backup_${today}.json"`,
        },
      });
    }

    // ─────────────────────────────────────────────
    // CSV 응답
    // ─────────────────────────────────────────────
    if (format === "json") {
      return NextResponse.json({
        success: true,
        type,
        count: rows.length,
        rows,
      });
    }

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      rows: [],
    });
  }
}
