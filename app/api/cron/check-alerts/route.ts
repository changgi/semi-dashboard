import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AlertRow {
  id: string;
  symbol: string;
  condition: "above" | "below" | "change_up" | "change_down";
  threshold: number;
  email: string | null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");

  const authorized =
    isVercelCron ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    debugKey === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdmin();

  try {
    // 활성 알림 조회
    const { data: alerts, error: alertErr } = await supabase
      .from("alerts")
      .select("*")
      .eq("is_active", true);

    if (alertErr) throw alertErr;
    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ success: true, checked: 0 });
    }

    // 관련 심볼의 현재가 조회
    const symbols = Array.from(new Set(alerts.map((a) => a.symbol)));
    const { data: quotes, error: quoteErr } = await supabase
      .from("quotes")
      .select("symbol, price, change_percent")
      .in("symbol", symbols);

    if (quoteErr) throw quoteErr;

    const quoteMap = new Map(quotes?.map((q) => [q.symbol, q]) ?? []);
    const triggered: {
      alert_id: string;
      symbol: string;
      price_at_trigger: number;
    }[] = [];

    for (const alert of alerts as AlertRow[]) {
      const q = quoteMap.get(alert.symbol);
      if (!q || q.price === null) continue;

      let shouldTrigger = false;
      switch (alert.condition) {
        case "above":
          shouldTrigger = q.price >= alert.threshold;
          break;
        case "below":
          shouldTrigger = q.price <= alert.threshold;
          break;
        case "change_up":
          shouldTrigger = (q.change_percent ?? 0) >= alert.threshold;
          break;
        case "change_down":
          shouldTrigger = (q.change_percent ?? 0) <= -Math.abs(alert.threshold);
          break;
      }

      if (shouldTrigger) {
        triggered.push({
          alert_id: alert.id,
          symbol: alert.symbol,
          price_at_trigger: q.price,
        });
      }
    }

    if (triggered.length > 0) {
      // 로그 기록
      await supabase.from("alert_triggers").insert(triggered);

      // 알림 비활성화 (1회성)
      const triggeredIds = triggered.map((t) => t.alert_id);
      await supabase
        .from("alerts")
        .update({
          is_active: false,
          triggered_at: new Date().toISOString(),
        })
        .in("id", triggeredIds);
    }

    return NextResponse.json({
      success: true,
      checked: alerts.length,
      triggered: triggered.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
