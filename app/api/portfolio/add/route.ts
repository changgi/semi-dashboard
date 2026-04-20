import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { getSymbolInfo } from "@/lib/semi-universe";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 종목 추가 API
// POST /api/portfolio/add
// Body: { symbol, shares, avgCost, currency?, name? }
// ═══════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, shares, avgCost } = body;
    let { currency, name } = body;

    // 검증
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ success: false, error: "symbol 필수" }, { status: 400 });
    }
    if (!shares || isNaN(Number(shares)) || Number(shares) <= 0) {
      return NextResponse.json({ success: false, error: "shares (수량) 필수, 양수" }, { status: 400 });
    }
    if (!avgCost || isNaN(Number(avgCost)) || Number(avgCost) <= 0) {
      return NextResponse.json({ success: false, error: "avgCost (평단가) 필수, 양수" }, { status: 400 });
    }

    // 심볼 정규화 (대문자)
    const upperSymbol = symbol.toUpperCase().trim();
    
    // 반도체 유니버스에서 메타 자동 채우기
    if (!name) {
      const info = getSymbolInfo(upperSymbol);
      name = info?.name ?? upperSymbol;
    }
    
    // 통화 자동 감지
    if (!currency) {
      currency = upperSymbol.endsWith(".KS") || upperSymbol.endsWith(".KQ") ? "KRW" : "USD";
    }

    // 현재가 조회로 종목 유효성 검증
    const quotes = await fetchYahooQuotes([upperSymbol]);
    const q = quotes.get(upperSymbol);
    if (!q || !q.price) {
      return NextResponse.json({
        success: false,
        error: `${upperSymbol} 심볼을 찾을 수 없습니다. Yahoo Finance 형식 확인 (예: AAPL, 005930.KS)`,
      }, { status: 400 });
    }

    // Supabase에 추가
    const supabase = createAdmin();
    const { data, error } = await supabase
      .from("portfolio_holdings")
      .insert({
        symbol: upperSymbol,
        name,
        shares: Number(shares),
        avg_cost: Number(avgCost),
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
      message: `✅ ${name} (${upperSymbol}) ${shares}주 추가 완료`,
      holding: data,
      currentPrice: q.price,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
