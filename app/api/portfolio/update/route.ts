import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 종목 수정 API
// PUT /api/portfolio/update
// Body: { id, shares?, avgCost?, name? }
// ═══════════════════════════════════════════════════════════

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, shares, avgCost, name } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (shares !== undefined) {
      if (isNaN(Number(shares)) || Number(shares) <= 0) {
        return NextResponse.json({ success: false, error: "shares는 양수여야 함" }, { status: 400 });
      }
      updates.shares = Number(shares);
    }
    if (avgCost !== undefined) {
      if (isNaN(Number(avgCost)) || Number(avgCost) <= 0) {
        return NextResponse.json({ success: false, error: "avgCost는 양수여야 함" }, { status: 400 });
      }
      updates.avg_cost = Number(avgCost);
    }
    if (name !== undefined) updates.name = name;

    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("portfolio_holdings")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `✅ ${data?.name ?? data?.symbol} 수정 완료`,
      holding: data,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
