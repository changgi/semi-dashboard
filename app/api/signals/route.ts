import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    const supabase = createAdmin();
    let query = supabase
      .from("trading_signals")
      .select("*")
      .order("computed_at", { ascending: false });

    if (symbol) query = query.eq("symbol", symbol.toUpperCase());

    const { data, error } = await query.limit(100);
    if (error) throw error;

    // 종목별 최신 시그널만
    const latest = new Map<string, typeof data[0]>();
    for (const row of data ?? []) {
      if (!latest.has(row.symbol)) latest.set(row.symbol, row);
    }

    return NextResponse.json({
      success: true,
      data: Array.from(latest.values()),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
