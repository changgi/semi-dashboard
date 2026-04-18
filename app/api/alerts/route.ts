import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// ============== GET: 알림 목록 ==============
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") !== "false";

    const supabase = createAdmin();
    let query = supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ============== POST: 알림 생성 ==============
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, condition, threshold, email } = body;

    if (!symbol || !condition || threshold === undefined) {
      return NextResponse.json(
        { success: false, error: "symbol, condition, threshold are required" },
        { status: 400 }
      );
    }

    const validConditions = ["above", "below", "change_up", "change_down"];
    if (!validConditions.includes(condition)) {
      return NextResponse.json(
        { success: false, error: "Invalid condition" },
        { status: 400 }
      );
    }

    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("alerts")
      .insert({
        symbol: symbol.toUpperCase(),
        condition,
        threshold: parseFloat(threshold),
        email: email ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ============== DELETE: 알림 삭제 ==============
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }

    const supabase = createAdmin();
    const { error } = await supabase.from("alerts").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
