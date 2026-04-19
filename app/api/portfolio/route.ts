import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 API
// GET: 현재 보유 종목 + 실시간 수익률 계산
// POST: 종목 추가/수정
// DELETE: 종목 삭제
// ═══════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = createAdmin();

    // 현재 활성 포지션 조회
    const { data: holdings, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        holdings: [],
        summary: {
          totalValue: 0,
          totalCost: 0,
          totalGain: 0,
          totalGainPct: 0,
          holdingCount: 0,
        },
      });
    }

    // 실시간 시세 병렬 fetch
    const symbols = [...new Set(holdings.map((h) => h.symbol))];
    const quotes = await fetchYahooQuotes(symbols);

    // USD/KRW 환율 (한국 종목 평가용)
    const [fxQuotes] = await Promise.all([fetchYahooQuotes(["KRW=X"])]);
    const usdKrw = fxQuotes.get("KRW=X")?.price ?? 1350;

    // 각 종목 수익 계산
    const enriched = holdings.map((h) => {
      const q = quotes.get(h.symbol);
      const currentPrice = q?.price ?? null;
      const currency = h.currency || "USD";

      const cost = h.shares * h.avg_cost;
      const marketValue = currentPrice !== null ? h.shares * currentPrice : cost;
      const gain = marketValue - cost;
      const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

      // USD 기준 환산 (포트폴리오 합산용)
      const marketValueUsd = currency === "KRW" ? marketValue / usdKrw : marketValue;
      const costUsd = currency === "KRW" ? cost / usdKrw : cost;

      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        avgCost: h.avg_cost,
        currentPrice,
        currency,
        purchaseDate: h.purchase_date,
        notes: h.notes,
        dayChangePct: q?.changePct ?? null,
        cost,
        marketValue,
        gain,
        gainPct: Math.round(gainPct * 100) / 100,
        marketValueUsd,
        costUsd,
        daysHeld: h.purchase_date
          ? Math.floor(
              (Date.now() - new Date(h.purchase_date).getTime()) / (86400000)
            )
          : null,
      };
    });

    // 전체 포트폴리오 요약 (USD 기준)
    const totalValue = enriched.reduce((s, e) => s + e.marketValueUsd, 0);
    const totalCost = enriched.reduce((s, e) => s + e.costUsd, 0);
    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    // 일별 변동 (가중치 적용)
    const weightedDayChange = enriched.reduce((s, e) => {
      if (e.dayChangePct === null) return s;
      const weight = e.marketValueUsd / totalValue;
      return s + e.dayChangePct * weight;
    }, 0);

    // 수익률 정렬
    const sortedByGain = [...enriched].sort((a, b) => b.gainPct - a.gainPct);
    const topWinner = sortedByGain[0];
    const topLoser = sortedByGain[sortedByGain.length - 1];

    // 섹터 분산도 (단순: 종목당 비중)
    const sectorBreakdown = enriched.map((e) => ({
      symbol: e.symbol,
      name: e.name,
      weight: totalValue > 0 ? (e.marketValueUsd / totalValue) * 100 : 0,
      gainPct: e.gainPct,
    }));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      holdings: enriched,
      summary: {
        totalValue: Math.round(totalValue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalGain: Math.round(totalGain * 100) / 100,
        totalGainPct: Math.round(totalGainPct * 100) / 100,
        holdingCount: enriched.length,
        dayChangePct: Math.round(weightedDayChange * 100) / 100,
        usdKrwRate: usdKrw,
        topWinner: topWinner ? { symbol: topWinner.symbol, gainPct: topWinner.gainPct } : null,
        topLoser: topLoser && topLoser.gainPct < 0 ? { symbol: topLoser.symbol, gainPct: topLoser.gainPct } : null,
      },
      sectorBreakdown: sectorBreakdown.sort((a, b) => b.weight - a.weight),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// POST: 보유 종목 추가/수정
// body: { symbol, shares, avgCost, currency?, purchaseDate?, notes?, name? }
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, shares, avgCost, currency = "USD", purchaseDate, notes, name, id } = body;

    if (!symbol || !shares || !avgCost) {
      return NextResponse.json(
        { success: false, error: "symbol, shares, avgCost 필수" },
        { status: 400 }
      );
    }

    if (shares <= 0 || avgCost <= 0) {
      return NextResponse.json(
        { success: false, error: "shares, avgCost는 0보다 커야 함" },
        { status: 400 }
      );
    }

    const supabase = createAdmin();

    if (id) {
      // 수정
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .update({
          symbol: symbol.toUpperCase(),
          shares,
          avg_cost: avgCost,
          currency,
          purchase_date: purchaseDate || null,
          notes: notes || null,
          name: name || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, holding: data, action: "updated" });
    } else {
      // 추가
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .insert({
          symbol: symbol.toUpperCase(),
          shares,
          avg_cost: avgCost,
          currency,
          purchase_date: purchaseDate || null,
          notes: notes || null,
          name: name || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, holding: data, action: "created" });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE: 종목 제거 (실제 삭제 안하고 is_active=false로)
// ═══════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    }

    const supabase = createAdmin();
    const { error } = await supabase
      .from("portfolio_holdings")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
