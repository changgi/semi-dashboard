import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 종목 삭제 API (soft delete)
// DELETE /api/portfolio/remove?id=xxx
// 또는 POST body: { id }
// ═══════════════════════════════════════════════════════════

async function deleteHolding(id: string) {
  if (!id) {
    return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
  }

  const supabase = createAdmin();
  
  // Soft delete: is_active = false
  const { data, error } = await supabase
    .from("portfolio_holdings")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `🗑️ ${data?.name ?? data?.symbol} 제거 완료 (비활성화)`,
    holding: data,
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  return deleteHolding(id);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return deleteHolding(body.id ?? "");
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
