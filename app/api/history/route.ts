import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const RANGE_MAP: Record<string, { hours: number; interval: string }> = {
  "1h": { hours: 1, interval: "1min" },
  "1d": { hours: 24, interval: "1min" },
  "7d": { hours: 24 * 7, interval: "1hour" },
  "1m": { hours: 24 * 30, interval: "1day" },
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const range = searchParams.get("range") ?? "1d";

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "symbol is required" },
        { status: 400 }
      );
    }

    const config = RANGE_MAP[range] ?? RANGE_MAP["1d"];
    const since = new Date(Date.now() - config.hours * 3600 * 1000).toISOString();

    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("price_history")
      .select("symbol, price, timestamp, interval_type")
      .eq("symbol", symbol.toUpperCase())
      .gte("timestamp", since)
      .order("timestamp", { ascending: true })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      symbol,
      range,
      data: data ?? [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
