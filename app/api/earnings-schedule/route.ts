import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Earnings Schedule Management API
// 
// GET    - 전체 실적 일정 조회
// POST   - 새 실적 일정 추가
// PATCH  - 기존 일정 수정
// DELETE - 비활성화
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    const daysFrom = Number(url.searchParams.get("days_from") ?? "-7");
    const daysTo = Number(url.searchParams.get("days_to") ?? "60");
    
    const supabase = createAdmin();
    
    const fromDate = new Date(Date.now() + daysFrom * 86400000).toISOString().split("T")[0];
    const toDate = new Date(Date.now() + daysTo * 86400000).toISOString().split("T")[0];
    
    let query = supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", fromDate)
      .lte("earnings_date", toDate)
      .order("earnings_date", { ascending: true });
    
    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    // 날짜별 그룹화
    const byDate = new Map<string, any[]>();
    const today = new Date().toISOString().split("T")[0];
    
    for (const e of data ?? []) {
      const dateKey = e.earnings_date;
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      
      const daysUntil = Math.floor(
        (new Date(e.earnings_date).getTime() - new Date(today).getTime()) / 86400000
      );
      
      byDate.get(dateKey)!.push({
        ...e,
        daysUntil,
      });
    }
    
    const grouped = Array.from(byDate.entries()).map(([date, events]) => ({
      date,
      events,
      totalImportance: events.reduce((s: number, e: any) => s + e.importance, 0),
      maxImportance: Math.max(...events.map((e: any) => e.importance)),
    }));
    
    return NextResponse.json({
      success: true,
      count: data?.length ?? 0,
      earnings: data ?? [],
      grouped,
      stats: {
        thisWeek: (data ?? []).filter((e: any) => {
          const d = new Date(e.earnings_date);
          const days = Math.floor((d.getTime() - Date.now()) / 86400000);
          return days >= 0 && days <= 7;
        }).length,
        thisMonth: (data ?? []).filter((e: any) => {
          const d = new Date(e.earnings_date);
          const days = Math.floor((d.getTime() - Date.now()) / 86400000);
          return days >= 0 && days <= 30;
        }).length,
        highImportance: (data ?? []).filter((e: any) => e.importance >= 4).length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      count: 0,
      earnings: [],
      grouped: [],
      stats: { thisWeek: 0, thisMonth: 0, highImportance: 0 },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, company_name, earnings_date, earnings_time, quarter, importance, affected_etfs, notes } = body;
    
    if (!symbol || !earnings_date || !quarter) {
      return NextResponse.json({ success: false, error: "symbol, earnings_date, quarter 필수" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("earnings_schedule")
      .insert({
        symbol: symbol.toUpperCase().trim(),
        company_name: company_name || symbol,
        earnings_date,
        earnings_time: earnings_time || "AMC",
        quarter,
        importance: Number(importance) || 3,
        affected_etfs: affected_etfs || [],
        notes: notes || "",
        is_active: true,
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: `${symbol} ${earnings_date} 실적 일정 추가됨`,
      earning: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("earnings_schedule")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, earning: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    
    if (!id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    const { error } = await supabase
      .from("earnings_schedule")
      .update({ is_active: false })
      .eq("id", id);
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, message: "비활성화 완료" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
