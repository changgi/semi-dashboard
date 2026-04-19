import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const days = parseInt(searchParams.get("days") ?? "30", 10);

    const supabase = createAdmin();
    const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    let query = supabase
      .from("analysis_snapshots")
      .select("*")
      .gte("date", since)
      .order("date", { ascending: false });

    if (symbol) query = query.eq("symbol", symbol.toUpperCase());

    const { data, error } = await query.limit(500);
    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
