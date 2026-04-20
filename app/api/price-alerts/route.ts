import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooSymbolInfo } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Price Alerts API
// GET: 활성 알림 목록 + 실시간 진행 상태
// POST: 알림 추가
// DELETE: 알림 제거
// PUT: 알림 활성/비활성 토글
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// 심볼 자동 보정
// ───────────────────────────────────────────────────────────
function normalizeSymbol(raw: string, currency: string = "USD"): string {
  const upper = raw.toUpperCase().trim();
  if (upper.includes(".") || upper.startsWith("^")) return upper;
  if (currency === "KRW" && /^\d{6}$/.test(upper)) {
    return `${upper}.KS`;
  }
  return upper;
}

// ═══════════════════════════════════════════════════════════
// GET: 활성 알림 목록 + 실시간 진행 상태
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const supabase = createAdmin();

    const { data: alerts, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({
        success: true,
        alerts: [],
        triggered: [],
      });
    }

    // 실시간 시세 조회
    const uniqueSymbols = [...new Set(alerts.map((a) => a.symbol))];
    const quotes = await fetchYahooQuotes(uniqueSymbols);

    // 각 알림에 진행률 계산
    const enriched = alerts.map((a) => {
      const q = quotes.get(a.symbol);
      const currentPrice = q?.price ?? null;

      let progress: number | null = null;   // 0-100 (100이면 발동)
      let isTriggered = false;
      let distanceFromTarget: number | null = null;

      if (currentPrice !== null) {
        if (a.condition_type === "above") {
          // 현재가가 target 이상이면 발동
          isTriggered = currentPrice >= a.target_value;
          // 기준가가 있으면 진행률 계산
          if (a.reference_price) {
            const total = a.target_value - a.reference_price;
            const done = currentPrice - a.reference_price;
            progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : null;
          }
          distanceFromTarget = a.target_value - currentPrice;
        } else if (a.condition_type === "below") {
          // 현재가가 target 이하면 발동
          isTriggered = currentPrice <= a.target_value;
          if (a.reference_price) {
            const total = a.reference_price - a.target_value;
            const done = a.reference_price - currentPrice;
            progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : null;
          }
          distanceFromTarget = currentPrice - a.target_value;
        } else if (a.condition_type === "pct_change") {
          // 기준가 대비 % 변동
          if (a.reference_price) {
            const actualPct = ((currentPrice - a.reference_price) / a.reference_price) * 100;
            // target이 양수면 상승 %, 음수면 하락 %
            if (a.target_value > 0) {
              isTriggered = actualPct >= a.target_value;
              progress = actualPct > 0 ? Math.min(100, (actualPct / a.target_value) * 100) : 0;
            } else {
              isTriggered = actualPct <= a.target_value;
              progress = actualPct < 0 ? Math.min(100, (actualPct / a.target_value) * 100) : 0;
            }
            distanceFromTarget = actualPct;
          }
        }
      }

      return {
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        conditionType: a.condition_type,
        targetValue: a.target_value,
        referencePrice: a.reference_price,
        currency: a.currency,
        note: a.note,
        isActive: a.is_active,
        isOneTime: a.is_one_time,
        createdAt: a.created_at,
        currentPrice,
        dayChangePct: q?.changePct ?? null,
        progress,
        isTriggered,
        distanceFromTarget,
      };
    });

    // 발동된 알림 분리
    const triggered = enriched.filter((a) => a.isTriggered);
    const pending = enriched.filter((a) => !a.isTriggered);

    return NextResponse.json({
      success: true,
      alerts: pending,
      triggered,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// POST: 알림 추가
// body: { symbol, conditionType, targetValue, currency?, note?, referencePrice?, isOneTime? }
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol,
      conditionType,
      targetValue,
      currency = "USD",
      note,
      referencePrice,
      isOneTime = true,
    } = body;

    if (!symbol || !conditionType || targetValue === undefined || targetValue === null) {
      return NextResponse.json(
        { success: false, error: "symbol, conditionType, targetValue 필수" },
        { status: 400 }
      );
    }

    if (!["above", "below", "pct_change"].includes(conditionType)) {
      return NextResponse.json(
        { success: false, error: "conditionType은 above/below/pct_change 중 하나" },
        { status: 400 }
      );
    }

    // 심볼 자동 보정
    const normalizedSymbol = normalizeSymbol(symbol, currency);

    // 종목명 자동 조회
    let name: string | null = null;
    try {
      const info = await fetchYahooSymbolInfo(normalizedSymbol);
      name = info?.shortName ?? info?.longName ?? null;
    } catch {}

    // 현재가를 기준가로 자동 설정 (없을 때)
    let refPrice = referencePrice;
    if (refPrice === undefined || refPrice === null) {
      const quotes = await fetchYahooQuotes([normalizedSymbol]);
      const cur = quotes.get(normalizedSymbol)?.price;
      if (cur) refPrice = cur;
    }

    const supabase = createAdmin();

    const { data, error } = await supabase
      .from("price_alerts")
      .insert({
        symbol: normalizedSymbol,
        name,
        condition_type: conditionType,
        target_value: targetValue,
        reference_price: refPrice ?? null,
        currency,
        note: note ?? null,
        is_one_time: isOneTime,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      alert: data,
      message: `✅ ${normalizedSymbol} ${conditionType === "above" ? "≥" : conditionType === "below" ? "≤" : "±"}${targetValue} 알림 설정됨`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE: 알림 제거
// ═══════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    }

    const supabase = createAdmin();
    const { error } = await supabase.from("price_alerts").delete().eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true, id: Number(id) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
