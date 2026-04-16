import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import type { DashboardRow } from "@/lib/types";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdmin();

    const { data, error } = await supabase
      .from("v_dashboard")
      .select("*")
      .order("market_cap_b", { ascending: false, nullsFirst: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data as DashboardRow[],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
