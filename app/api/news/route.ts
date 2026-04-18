import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const limit = parseInt(searchParams.get("limit") ?? "30", 10);

    const supabase = createAdmin();
    let query = supabase
      .from("news")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (symbol) {
      query = query.contains("related_symbols", [symbol.toUpperCase()]);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data ?? [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
