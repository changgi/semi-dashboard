import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooSymbolInfo, fetchYahooSymbolInfos } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 API
// GET: 현재 보유 종목 + 실시간 수익률 계산
// POST: 종목 추가/수정 (심볼 자동 보정 포함)
// DELETE: 종목 삭제
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// 심볼 자동 보정 헬퍼
// ───────────────────────────────────────────────────────────
/**
 * 사용자 입력 심볼을 Yahoo Finance 포맷으로 자동 보정
 * 
 * 예시:
 *   "360750" + KRW → "360750.KS" (TIGER 미국S&P500 ETF)
 *   "005930" + KRW → "005930.KS" (삼성전자)
 *   "005930.KS" → 그대로 유지
 *   "NVDA" + USD → "NVDA" 유지
 *   "nvda" → "NVDA" (대문자화)
 */
function normalizeSymbol(rawSymbol: string, currency: string = "USD"): {
  normalized: string;
  wasModified: boolean;
  reason?: string;
} {
  const upper = rawSymbol.toUpperCase().trim();

  // 이미 시장 접미사가 있으면 그대로
  if (upper.includes(".")) {
    return { normalized: upper, wasModified: upper !== rawSymbol };
  }

  // 지수(^로 시작)는 그대로
  if (upper.startsWith("^")) {
    return { normalized: upper, wasModified: upper !== rawSymbol };
  }

  // KRW 통화 + 6자리 숫자 → 한국 종목 자동 변환
  if (currency === "KRW" && /^\d{6}$/.test(upper)) {
    // KOSDAQ 종목: 일반적으로 0으로 시작하면서 7, 9 계열 (대부분)
    // KOSPI 종목: 나머지
    // 기본적으로 .KS로 시도 (KOSPI), 실패 시 .KQ로 시도할 수 있지만 단순히 .KS로
    return {
      normalized: `${upper}.KS`,
      wasModified: true,
      reason: `한국 종목 코드로 추정되어 .KS 접미사 자동 추가 (KOSPI). KOSDAQ 종목이면 ${upper}.KQ로 수정하세요.`,
    };
  }

  // USD인데 숫자만 있으면 의심스러움 (에러 감지)
  if (currency === "USD" && /^\d+$/.test(upper)) {
    return {
      normalized: upper,
      wasModified: false,
      reason: "경고: 숫자만 있는 심볼은 일반적이지 않습니다. 통화가 KRW인지 확인하세요.",
    };
  }

  return { normalized: upper, wasModified: upper !== rawSymbol };
}

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

    // 고유 심볼 목록
    const symbols = [...new Set(holdings.map((h) => h.symbol))];

    // ─────────────────────────────────────────────
    // 🚀 병렬 fetch: 시세 + 환율 + 이름 (이름 없는 것만)
    // ─────────────────────────────────────────────
    const needsName = holdings.filter((h) => {
      const name = h.name;
      return !name || name.trim() === "" || name === h.symbol || /^\d+$/.test(name);
    });
    const nameSymbolsToFetch = [...new Set(needsName.map((h) => h.symbol))];

    const [quotes, fxQuotes, symbolInfos] = await Promise.all([
      fetchYahooQuotes(symbols),
      fetchYahooQuotes(["KRW=X"]),
      nameSymbolsToFetch.length > 0
        ? fetchYahooSymbolInfos(nameSymbolsToFetch)
        : Promise.resolve(new Map()),
    ]);

    const usdKrw = fxQuotes.get("KRW=X")?.price ?? 1350;

    // ─────────────────────────────────────────────
    // 🔧 조회한 이름을 DB에 저장 + 메모리 반영
    // ─────────────────────────────────────────────
    if (symbolInfos.size > 0) {
      const updates: Array<{ id: number; name: string }> = [];
      for (const h of needsName) {
        const info = symbolInfos.get(h.symbol);
        const fetchedName = info?.shortName || info?.longName;
        if (fetchedName && typeof fetchedName === "string") {
          updates.push({ id: h.id, name: fetchedName });
          h.name = fetchedName; // 메모리 즉시 반영
        }
      }

      // DB에 백그라운드로 저장 (응답 블록하지 않도록 fire-and-forget)
      if (updates.length > 0) {
        // Supabase는 일괄 update 불편하니 병렬 개별 업데이트
        Promise.all(
          updates.map((u) =>
            supabase
              .from("portfolio_holdings")
              .update({ name: u.name, updated_at: new Date().toISOString() })
              .eq("id", u.id)
          )
        ).catch(() => {}); // 실패해도 응답 지연 없게
      }
    }

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

    // 심볼 자동 보정
    const { normalized: normalizedSymbol, wasModified, reason } = normalizeSymbol(symbol, currency);

    // 종목명 자동 조회 (사용자가 이름을 입력하지 않은 경우)
    let resolvedName = name;
    let nameAutoFetched = false;
    if (!resolvedName || resolvedName.trim() === "") {
      try {
        const info = await fetchYahooSymbolInfo(normalizedSymbol);
        if (info?.shortName) {
          resolvedName = info.shortName;
          nameAutoFetched = true;
        } else if (info?.longName) {
          resolvedName = info.longName;
          nameAutoFetched = true;
        }
      } catch {
        // 이름 조회 실패해도 계속 진행
      }
    }

    const supabase = createAdmin();

    if (id) {
      // 수정
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .update({
          symbol: normalizedSymbol,
          shares,
          avg_cost: avgCost,
          currency,
          purchase_date: purchaseDate || null,
          notes: notes || null,
          name: resolvedName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({
        success: true,
        holding: data,
        action: "updated",
        symbolNormalized: wasModified,
        normalizationReason: reason,
        nameAutoFetched,
      });
    } else {
      // 추가
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .insert({
          symbol: normalizedSymbol,
          shares,
          avg_cost: avgCost,
          currency,
          purchase_date: purchaseDate || null,
          notes: notes || null,
          name: resolvedName || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({
        success: true,
        holding: data,
        action: "created",
        symbolNormalized: wasModified,
        normalizationReason: reason,
        nameAutoFetched,
      });
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
