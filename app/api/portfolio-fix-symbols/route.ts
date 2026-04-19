import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 심볼 마이그레이션 API
// 잘못된 심볼(예: "360750" → "360750.KS") 자동 수정
// 
// 사용: GET /api/portfolio-fix-symbols?key=4342162bb172cc95a241f19164e64b80
// 권한: CRON_SECRET 요구
// ═══════════════════════════════════════════════════════════

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (key !== process.env.CRON_SECRET) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dryRun = searchParams.get("dry_run") === "1";
    const supabase = createAdmin();

    // 모든 활성 포지션 조회
    const { data: holdings, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;

    const fixes: Array<{
      id: number;
      oldSymbol: string;
      newSymbol: string;
      currency: string;
      reason: string;
    }> = [];
    const issues: Array<{ id: number; symbol: string; issue: string }> = [];

    for (const h of holdings ?? []) {
      const symbol = h.symbol;
      const currency = h.currency || "USD";

      // 이미 . 포함이면 스킵
      if (symbol.includes(".") || symbol.startsWith("^")) continue;

      let newSymbol: string | null = null;
      let reason = "";

      // KRW + 6자리 숫자 → .KS 자동 추가
      if (currency === "KRW" && /^\d{6}$/.test(symbol)) {
        newSymbol = `${symbol}.KS`;
        reason = "한국 종목 코드 → .KS 접미사 추가 (KOSPI 기본)";
      } else if (currency === "USD" && /^\d+$/.test(symbol)) {
        // USD인데 숫자만 → 이상
        issues.push({
          id: h.id,
          symbol,
          issue: "USD 통화지만 심볼이 숫자만 있음. 한국 종목이면 통화를 KRW로 변경 필요",
        });
        continue;
      }

      if (newSymbol) {
        fixes.push({
          id: h.id,
          oldSymbol: symbol,
          newSymbol,
          currency,
          reason,
        });
      }
    }

    // dry_run이 아니면 실제 적용
    let applied = 0;
    if (!dryRun && fixes.length > 0) {
      for (const fix of fixes) {
        const { error } = await supabase
          .from("portfolio_holdings")
          .update({
            symbol: fix.newSymbol,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fix.id);

        if (!error) applied++;
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      totalHoldings: holdings?.length ?? 0,
      fixesNeeded: fixes.length,
      applied,
      fixes,
      issues,
      usage: "dryRun=1 to preview, without dry_run to apply",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
