import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Trade Journal API
// 
// GET  : 매매 기록 조회 + 통계
// POST : 새 매매 기록 추가
// PATCH: 기존 기록 수정 (감정/교훈 추가)
// DELETE: 기록 삭제
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    
    let query = supabase
      .from("trade_journal")
      .select("*")
      .order("trade_date", { ascending: false })
      .limit(limit);
    
    if (symbol) {
      query = query.eq("symbol", symbol);
    }
    
    const { data: records, error } = await query;
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      });
    }
    
    // 통계 계산
    const buys = (records ?? []).filter(r => r.action === "BUY");
    const sells = (records ?? []).filter(r => r.action === "SELL");
    const totalInvested = buys.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    const totalRealized = sells.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    const totalRealizedPnl = sells.reduce((s, r) => s + (r.realized_pnl ?? 0), 0);
    const winningSells = sells.filter(r => (r.realized_pnl ?? 0) > 0).length;
    const winRate = sells.length > 0 ? (winningSells / sells.length) * 100 : 0;
    
    // 소스별 분석
    const sourceStats: Record<string, { count: number; avgPnl: number }> = {};
    for (const r of records ?? []) {
      const src = r.source ?? "unknown";
      if (!sourceStats[src]) sourceStats[src] = { count: 0, avgPnl: 0 };
      sourceStats[src].count++;
      if (r.realized_pnl) {
        sourceStats[src].avgPnl += r.realized_pnl;
      }
    }
    for (const src in sourceStats) {
      if (sourceStats[src].count > 0) {
        sourceStats[src].avgPnl = sourceStats[src].avgPnl / sourceStats[src].count;
      }
    }
    
    // 최근 교훈
    const lessons = (records ?? [])
      .filter(r => r.lesson)
      .map(r => ({ date: r.trade_date, symbol: r.symbol, lesson: r.lesson }))
      .slice(0, 5);
    
    return NextResponse.json({
      success: true,
      count: records?.length ?? 0,
      records: records ?? [],
      stats: {
        totalBuys: buys.length,
        totalSells: sells.length,
        uniqueSymbols: new Set((records ?? []).map(r => r.symbol)).size,
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalRealized: Math.round(totalRealized * 100) / 100,
        totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        winningSells,
        losingSells: sells.length - winningSells,
        sourceStats,
      },
      lessons,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      records: [],
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createAdmin();
    
    // 필수 필드 확인
    if (!body.symbol || !body.action || !body.shares || !body.price || !body.trade_date) {
      return NextResponse.json({
        success: false,
        error: "필수 필드 누락: symbol, action, shares, price, trade_date",
      }, { status: 400 });
    }
    
    const totalAmount = body.shares * body.price;
    
    // 시장 스냅샷 자동 캡처
    let marketSnapshot: any = null;
    try {
      const quotes = await fetchYahooQuotes(["^VIX", "SPY", "QQQ"]);
      marketSnapshot = {
        vix: quotes.get("^VIX")?.price,
        spy: quotes.get("SPY")?.price,
        spyChange: quotes.get("SPY")?.changePct,
        qqq: quotes.get("QQQ")?.price,
        qqqChange: quotes.get("QQQ")?.changePct,
      };
    } catch {}
    
    // 매도의 경우: 기존 매수 기록 찾아서 평단/손익 계산
    let avgCostBasis: number | null = null;
    let realizedPnl: number | null = null;
    let realizedPnlPct: number | null = null;
    let holdingDays: number | null = null;
    let matchedBuyId: string | null = null;
    
    if (body.action === "SELL") {
      const { data: buyRecords } = await supabase
        .from("trade_journal")
        .select("*")
        .eq("symbol", body.symbol)
        .eq("action", "BUY")
        .order("trade_date", { ascending: true });
      
      if (buyRecords && buyRecords.length > 0) {
        // FIFO: 가장 오래된 BUY부터 매칭
        const totalBuyShares = buyRecords.reduce((s, r) => s + (r.shares ?? 0), 0);
        const totalBuyCost = buyRecords.reduce((s, r) => s + (r.total_amount ?? 0), 0);
        avgCostBasis = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
        realizedPnl = (body.price - avgCostBasis) * body.shares;
        realizedPnlPct = avgCostBasis > 0 ? ((body.price - avgCostBasis) / avgCostBasis) * 100 : 0;
        
        // 가장 오래된 BUY 매칭
        const oldestBuy = buyRecords[0];
        matchedBuyId = oldestBuy.id;
        const buyDate = new Date(oldestBuy.trade_date);
        const sellDate = new Date(body.trade_date);
        holdingDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / 86400000);
      }
    }
    
    const { data: inserted, error } = await supabase
      .from("trade_journal")
      .insert({
        trade_date: body.trade_date,
        symbol: body.symbol,
        action: body.action,
        shares: body.shares,
        price: body.price,
        total_amount: totalAmount,
        currency: body.currency ?? "USD",
        source: body.source ?? "manual",
        reasoning: body.reasoning,
        market_snapshot: marketSnapshot,
        matched_buy_id: matchedBuyId,
        avg_cost_basis: avgCostBasis,
        realized_pnl: realizedPnl,
        realized_pnl_pct: realizedPnlPct,
        holding_days: holdingDays,
        emotion: body.emotion,
        tags: body.tags ?? [],
        lesson: body.lesson,
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }
    
    // ═══════════════════════════════════════
    // Recommendation Tracking 자동 매칭
    // 최근 3일 내 같은 심볼/액션의 추천을 실행 처리
    // ═══════════════════════════════════════
    let linkedRecommendationId: string | null = null;
    try {
      const tradeDate = new Date(body.trade_date);
      const windowStart = new Date(tradeDate.getTime() - 3 * 86400000).toISOString().split("T")[0];
      const windowEnd = body.trade_date;
      
      const { data: matchingRec } = await supabase
        .from("recommendation_tracking")
        .select("id, symbol, action")
        .eq("symbol", body.symbol)
        .eq("action", body.action)
        .eq("was_executed", false)
        .gte("recommendation_date", windowStart)
        .lte("recommendation_date", windowEnd)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (matchingRec) {
        await supabase
          .from("recommendation_tracking")
          .update({
            was_executed: true,
            executed_at: new Date(body.trade_date).toISOString(),
            executed_price: body.price,
            executed_shares: body.shares,
            execution_source: `trade_journal:${inserted.id}`,
          })
          .eq("id", matchingRec.id);
        
        linkedRecommendationId = matchingRec.id;
      }
    } catch (e) {
      console.error("Tracking 매칭 실패:", e);
    }
    
    return NextResponse.json({
      success: true,
      record: inserted,
      linkedRecommendationId,
      message: body.action === "SELL" && realizedPnl !== null
        ? `매도 기록됨 · 실현 손익 ${realizedPnl >= 0 ? "+" : ""}$${Math.abs(realizedPnl).toFixed(2)} (${realizedPnlPct!.toFixed(2)}%)${linkedRecommendationId ? " · AI 추천과 연결됨 🔗" : ""}`
        : `매매 기록됨${linkedRecommendationId ? " · AI 추천과 연결됨 🔗" : ""}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
    }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createAdmin();
    
    if (!body.id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }
    
    const { id, ...updates } = body;
    
    const { data, error } = await supabase
      .from("trade_journal")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }
    
    return NextResponse.json({ success: true, record: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ success: false, error: "id 필수" }, { status: 400 });
    }
    
    const supabase = createAdmin();
    const { error } = await supabase
      .from("trade_journal")
      .delete()
      .eq("id", id);
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }
    
    return NextResponse.json({ success: true, message: "기록 삭제됨" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg });
  }
}
