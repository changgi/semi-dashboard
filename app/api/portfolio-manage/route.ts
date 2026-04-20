import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Portfolio Management API (CRUD)
// 
// POST   /api/portfolio-manage   → 새 보유종목 추가
// PATCH  /api/portfolio-manage   → 기존 종목 수량/평단 수정
// DELETE /api/portfolio-manage   → 보유종목 비활성화 (soft delete)
// 
// Body:
//   POST:   { symbol, name, shares, avg_cost, currency }
//   PATCH:  { id, shares?, avg_cost? }
//   DELETE: { id } (또는 { symbol } 전체)
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// POST - 새 보유종목 추가
// ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, name, shares, avg_cost, currency } = body;
    
    // 유효성 검증
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ success: false, error: "심볼 필수" }, { status: 400 });
    }
    if (!shares || shares <= 0) {
      return NextResponse.json({ success: false, error: "수량은 0보다 커야 함" }, { status: 400 });
    }
    if (!avg_cost || avg_cost <= 0) {
      return NextResponse.json({ success: false, error: "평단가 필수" }, { status: 400 });
    }
    if (!currency || !["USD", "KRW"].includes(currency)) {
      return NextResponse.json({ success: false, error: "USD 또는 KRW만 지원" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("portfolio_holdings")
      .insert({
        symbol: symbol.toUpperCase().trim(),
        name: name || symbol,
        shares: Number(shares),
        avg_cost: Number(avg_cost),
        currency,
        is_active: true,
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: `${symbol} ${shares}주 추가 완료`,
      holding: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────
// PATCH - 수량/평단 수정
// ───────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, shares, avg_cost, name } = body;
    
    if (!id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }
    
    const updates: any = {};
    if (shares !== undefined) {
      if (shares <= 0) {
        return NextResponse.json({ success: false, error: "수량은 0보다 커야 함" }, { status: 400 });
      }
      updates.shares = Number(shares);
    }
    if (avg_cost !== undefined) {
      if (avg_cost <= 0) {
        return NextResponse.json({ success: false, error: "평단가는 0보다 커야 함" }, { status: 400 });
      }
      updates.avg_cost = Number(avg_cost);
    }
    if (name !== undefined) {
      updates.name = String(name);
    }
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "수정할 필드 없음" }, { status: 400 });
    }
    
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
      message: "수정 완료",
      holding: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────
// DELETE - 보유종목 비활성화 (soft delete)
// ───────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, symbol } = body;
    
    const supabase = createAdmin();
    
    let query = supabase.from("portfolio_holdings").update({ is_active: false });
    
    if (id) {
      query = query.eq("id", id);
    } else if (symbol) {
      query = query.eq("symbol", symbol.toUpperCase());
    } else {
      return NextResponse.json({ success: false, error: "id 또는 symbol 필수" }, { status: 400 });
    }
    
    const { data, error } = await query.select();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: `${data?.length ?? 0}개 종목 비활성화`,
      deleted: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────
// GET - 전체 보유 + 비활성 목록
// ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    
    const supabase = createAdmin();
    let query = supabase.from("portfolio_holdings").select("*").order("created_at", { ascending: false });
    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      count: data?.length ?? 0,
      holdings: data ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
