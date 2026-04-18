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
      .from("predictions")
      .select("*")
      .order("computed_at", { ascending: false });

    if (symbol) query = query.eq("symbol", symbol.toUpperCase());

    const { data, error } = await query.limit(200);
    if (error) throw error;

    // 종목별 최신 예측만 필터
    const latest = new Map<string, typeof data>();
    for (const row of data ?? []) {
      const key = `${row.symbol}-${row.horizon}`;
      if (!latest.has(key)) latest.set(key, row);
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
