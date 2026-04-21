import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 합산 API
// 같은 심볼의 여러 포지션을 가중평균 단가로 자동 통합
// 
// 예: 360750.KS 1주 @ ₩11,222 + 100주 @ ₩24,460
//  → 360750.KS 101주 @ ₩24,329 (가중평균)
// ═══════════════════════════════════════════════════════════

interface ConsolidatedPosition {
  symbol: string;
  name: string | null;
  symbolMeta?: {
    symbol: string;
    displayName: string;
    country?: string;
    isSemi?: boolean;
    indexes?: string[];
  };
  totalShares: number;
  weightedAvgCost: number;  // 가중평균 단가
  totalCost: number;
  currentPrice: number | null;
  marketValue: number;
  gain: number;
  gainPct: number;
  gainUsd: number;
  currency: string;
  dayChangePct: number | null;
  // 구성 내역 (원본 포지션들)
  breakdown: Array<{
    id: number;
    shares: number;
    avgCost: number;
    purchaseDate: string | null;
    notes: string | null;
    gain: number;
    gainPct: number;
  }>;
}

export async function GET() {
  try {
    const supabase = createAdmin();

    // 모든 활성 포지션 조회
    const { data: holdings, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        positions: [],
        summary: {
          totalValue: 0,
          totalCost: 0,
          totalGain: 0,
          totalGainPct: 0,
          positionCount: 0,
          rawHoldingCount: 0,
        },
      });
    }

    // 실시간 시세 + 환율
    const symbols = [...new Set(holdings.map((h) => h.symbol))];
    const [quotes, fxQuotes, universeData] = await Promise.all([
      fetchYahooQuotes(symbols),
      fetchYahooQuotes(["KRW=X"]),
      supabase.from("symbol_universe").select("symbol, name_ko, country, is_semi, in_sp500, in_nasdaq100, in_kospi100").in("symbol", symbols),
    ]);
    const usdKrw = fxQuotes.get("KRW=X")?.price ?? 1350;
    
    // Symbol Universe 메타 매핑 (한글명 + 인덱스 정보)
    const universeMap = new Map<string, any>();
    for (const u of (universeData.data ?? [])) {
      universeMap.set(u.symbol, u);
    }

    // ─────────────────────────────────────────────
    // 같은 심볼끼리 그룹핑
    // ─────────────────────────────────────────────
    const grouped = new Map<string, typeof holdings>();
    for (const h of holdings) {
      const key = h.symbol;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(h);
    }

    // ─────────────────────────────────────────────
    // 그룹별 합산 계산
    // ─────────────────────────────────────────────
    const consolidated: ConsolidatedPosition[] = [];
    let totalValueUsd = 0;
    let totalCostUsd = 0;

    for (const [symbol, positions] of grouped.entries()) {
      const q = quotes.get(symbol);
      const currentPrice = q?.price ?? null;
      const currency = positions[0].currency || "USD";
      // 이름 우선순위: Symbol Universe 한글명 → 저장된 이름 → 심볼
      const universeMeta = universeMap.get(symbol);
      const name = universeMeta?.name_ko 
        || positions.find((p) => p.name && p.name !== symbol)?.name 
        || positions[0].name
        || symbol;

      // 총 수량 + 총 매입액
      let totalShares = 0;
      let totalCost = 0;
      const breakdown: ConsolidatedPosition["breakdown"] = [];

      for (const p of positions) {
        const shares = Number(p.shares);
        const avgCost = Number(p.avg_cost);
        const posCost = shares * avgCost;
        const posValue = currentPrice !== null ? shares * currentPrice : posCost;
        const posGain = posValue - posCost;
        const posGainPct = posCost > 0 ? (posGain / posCost) * 100 : 0;

        totalShares += shares;
        totalCost += posCost;

        breakdown.push({
          id: p.id,
          shares,
          avgCost,
          purchaseDate: p.purchase_date,
          notes: p.notes,
          gain: Math.round(posGain * 100) / 100,
          gainPct: Math.round(posGainPct * 100) / 100,
        });
      }

      // 가중평균 단가
      const weightedAvgCost = totalShares > 0 ? totalCost / totalShares : 0;
      const marketValue = currentPrice !== null ? totalShares * currentPrice : totalCost;
      const gain = marketValue - totalCost;
      const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;

      // USD 환산
      const valueUsd = currency === "KRW" ? marketValue / usdKrw : marketValue;
      const costUsd = currency === "KRW" ? totalCost / usdKrw : totalCost;
      totalValueUsd += valueUsd;
      totalCostUsd += costUsd;

      consolidated.push({
        symbol,
        name,
        // Symbol Universe 메타 (프론트에서 SymbolDisplay 사용)
        symbolMeta: universeMeta ? {
          symbol,
          displayName: universeMeta.name_ko || name,
          country: universeMeta.country,
          isSemi: universeMeta.is_semi,
          indexes: [
            universeMeta.in_sp500 && "S&P500",
            universeMeta.in_nasdaq100 && "NASDAQ100",
            universeMeta.in_kospi100 && "KOSPI100",
          ].filter(Boolean),
        } : { symbol, displayName: name },
        totalShares: Math.round(totalShares * 10000) / 10000,
        weightedAvgCost: Math.round(weightedAvgCost * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        currentPrice,
        marketValue: Math.round(marketValue * 100) / 100,
        gain: Math.round(gain * 100) / 100,
        gainPct: Math.round(gainPct * 100) / 100,
        gainUsd: Math.round((valueUsd - costUsd) * 100) / 100,
        currency,
        dayChangePct: q?.changePct ?? null,
        breakdown: breakdown.sort((a, b) => {
          // 매수일 있는 것 우선, 없으면 id 순
          if (a.purchaseDate && b.purchaseDate) {
            return a.purchaseDate.localeCompare(b.purchaseDate);
          }
          return a.id - b.id;
        }),
      });
    }

    // 정렬: 평가액 큰 순
    consolidated.sort((a, b) => {
      const aUsd = a.currency === "KRW" ? a.marketValue / usdKrw : a.marketValue;
      const bUsd = b.currency === "KRW" ? b.marketValue / usdKrw : b.marketValue;
      return bUsd - aUsd;
    });

    const totalGain = totalValueUsd - totalCostUsd;
    const totalGainPct = totalCostUsd > 0 ? (totalGain / totalCostUsd) * 100 : 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      positions: consolidated,
      summary: {
        totalValue: Math.round(totalValueUsd * 100) / 100,
        totalCost: Math.round(totalCostUsd * 100) / 100,
        totalGain: Math.round(totalGain * 100) / 100,
        totalGainPct: Math.round(totalGainPct * 100) / 100,
        positionCount: consolidated.length,      // 합산된 포지션 수
        rawHoldingCount: holdings.length,        // 원본 행 수
        usdKrwRate: usdKrw,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      positions: [],
      summary: {
        totalValueUsd: 0,
        totalCostUsd: 0,
        totalGainUsd: 0,
        totalGainPct: 0,
        positionCount: 0,
        rawHoldingCount: 0,
      },
    });
  }
}
