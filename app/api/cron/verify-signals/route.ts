import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes, fetchYahooHistory } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Signal Verification Cron
// 
// 매일 실행. pending 상태 시그널들의 실제 결과 계산:
//   - 1일 후 가격 (생성 1일 경과한 시그널)
//   - 7일 후 가격 (생성 7일 경과한 시그널)
//   - 30일 후 가격 (생성 30일 경과한 시그널 → 검증 완료)
//   - 최대 상승/하락 기록
// ═══════════════════════════════════════════════════════════

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return auth === `Bearer ${secret}`;
}

function daysBetween(d1: string, d2: Date): number {
  const date1 = new Date(d1);
  return Math.floor((d2.getTime() - date1.getTime()) / 86400000);
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdmin();
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // 1. 검증 대기 중인 시그널 조회 (최대 30일 이내 생성된 것)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 35); // 여유 5일
    
    const { data: signals, error } = await supabase
      .from("journal_signal_tracking")
      .select("*")
      .eq("verification_status", "pending")
      .gte("signal_date", thirtyDaysAgo.toISOString().split("T")[0]);

    if (error) throw error;

    if (!signals || signals.length === 0) {
      return NextResponse.json({
        success: true,
        message: "검증 대상 시그널 없음",
        checked: 0,
      });
    }

    // 2. 심볼별로 그룹핑
    const bySymbol = new Map<string, typeof signals>();
    for (const s of signals) {
      if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, []);
      bySymbol.get(s.symbol)!.push(s);
    }

    // 3. 각 심볼의 과거 30일 가격 이력 조회
    let updatedCount = 0;
    let verifiedCount = 0;

    for (const [symbol, symbolSignals] of bySymbol.entries()) {
      try {
        // 3-1. 현재가 조회
        const quotes = await fetchYahooQuotes([symbol]);
        const currentPrice = quotes.get(symbol)?.price;
        if (!currentPrice) continue;

        // 3-2. 과거 45일 이력 조회 (시그널 날짜 기준 30일 후까지 커버)
        const history = await fetchYahooHistory(symbol, "2mo");
        if (!history || history.length === 0) continue;

        // 3-3. 각 시그널에 대해 검증
        for (const sig of symbolSignals) {
          const daysSince = daysBetween(sig.signal_date, today);
          const updates: any = {};

          // N일 후 가격 찾기
          const findPriceAfterDays = (n: number): number | null => {
            const target = new Date(sig.signal_date);
            target.setDate(target.getDate() + n);
            const targetStr = target.toISOString().split("T")[0];
            // 주말 제외, 가장 가까운 거래일
            for (let i = 0; i < 5; i++) {
              const check = new Date(target);
              check.setDate(check.getDate() + i);
              const checkStr = check.toISOString().split("T")[0];
              const h = history.find((h) => h.date === checkStr);
              if (h) return h.close;
            }
            return null;
          };

          // 1일 후
          if (daysSince >= 1 && sig.price_1d === null) {
            const p = findPriceAfterDays(1);
            if (p !== null) {
              updates.price_1d = p;
              updates.hit_1d = sig.direction === "up"
                ? p > sig.entry_price
                : p < sig.entry_price;
            }
          }

          // 7일 후
          if (daysSince >= 7 && sig.price_7d === null) {
            const p = findPriceAfterDays(7);
            if (p !== null) {
              updates.price_7d = p;
              updates.hit_7d = sig.direction === "up"
                ? p > sig.entry_price
                : p < sig.entry_price;
            }
          }

          // 30일 후 → 검증 완료
          if (daysSince >= 30 && sig.price_30d === null) {
            const p = findPriceAfterDays(30);
            if (p !== null) {
              updates.price_30d = p;
              updates.hit_30d = sig.direction === "up"
                ? p > sig.entry_price
                : p < sig.entry_price;
              
              // 30일 내 최대 상승/하락
              const signalDate = new Date(sig.signal_date);
              const range = history.filter((h) => {
                const hDate = new Date(h.date);
                return hDate >= signalDate && daysBetween(h.date, today) <= 30;
              });
              if (range.length > 0) {
                const maxPrice = Math.max(...range.map((h) => h.close));
                const minPrice = Math.min(...range.map((h) => h.close));
                updates.max_gain_pct = Math.round(((maxPrice - sig.entry_price) / sig.entry_price) * 10000) / 100;
                updates.max_loss_pct = Math.round(((minPrice - sig.entry_price) / sig.entry_price) * 10000) / 100;
              }
              
              updates.verification_status = "verified";
              updates.verified_at = new Date().toISOString();
              verifiedCount++;
            } else if (daysSince > 40) {
              // 데이터 없는데 40일 경과 → expired
              updates.verification_status = "expired";
            }
          }

          // 업데이트 적용
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            await supabase
              .from("journal_signal_tracking")
              .update(updates)
              .eq("id", sig.id);
            updatedCount++;
          }
        }
      } catch (e) {
        console.error(`[verify-signals] ${symbol} error:`, e);
      }
    }

    // 4. 전체 통계 계산
    const { data: verified } = await supabase
      .from("journal_signal_tracking")
      .select("hit_7d, hit_30d, direction")
      .eq("verification_status", "verified");

    const totalVerified = verified?.length ?? 0;
    const correct30d = verified?.filter((s) => s.hit_30d).length ?? 0;
    const accuracy = totalVerified > 0 ? Math.round((correct30d / totalVerified) * 100) : 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      signals_checked: signals.length,
      signals_updated: updatedCount,
      newly_verified: verifiedCount,
      total_verified: totalVerified,
      overall_accuracy: `${accuracy}%`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true });
  }
}
