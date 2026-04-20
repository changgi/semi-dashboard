import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooSymbolInfo } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 심볼 마이그레이션 API
// 잘못된 심볼(예: "360750" → "360750.KS") 자동 수정
// + 비어있거나 심볼과 같은 종목명을 Yahoo API에서 자동 조회
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
      oldName: string | null;
      newName: string | null;
      currency: string;
      reason: string;
    }> = [];
    const issues: Array<{ id: number; symbol: string; issue: string }> = [];

    for (const h of holdings ?? []) {
      const symbol = h.symbol;
      const currency = h.currency || "USD";
      const currentName = h.name;

      let newSymbol = symbol;
      let needsSymbolFix = false;
      let reason = "";

      // 심볼 체크
      if (!symbol.includes(".") && !symbol.startsWith("^")) {
        if (currency === "KRW" && /^\d{6}$/.test(symbol)) {
          newSymbol = `${symbol}.KS`;
          needsSymbolFix = true;
          reason = "한국 종목 코드 → .KS 접미사 추가 (KOSPI 기본)";
        } else if (currency === "USD" && /^\d+$/.test(symbol)) {
          issues.push({
            id: h.id,
            symbol,
            issue: "USD 통화지만 심볼이 숫자만 있음. 한국 종목이면 통화를 KRW로 변경 필요",
          });
          continue;
        }
      }

      // 종목명 체크: 비어있거나 심볼과 같으면 조회 필요
      const nameIsBadOrEmpty =
        !currentName ||
        currentName.trim() === "" ||
        currentName === symbol ||
        currentName === newSymbol ||
        /^\d+$/.test(currentName); // 숫자만인 경우

      let fetchedName: string | null = null;
      if (nameIsBadOrEmpty) {
        try {
          const info = await fetchYahooSymbolInfo(newSymbol);
          if (info?.shortName) {
            fetchedName = info.shortName;
          } else if (info?.longName) {
            fetchedName = info.longName;
          }
        } catch {
          // 조회 실패해도 계속
        }
      }

      // 변경이 필요한 경우만 기록
      if (needsSymbolFix || fetchedName) {
        fixes.push({
          id: h.id,
          oldSymbol: symbol,
          newSymbol,
          oldName: currentName,
          newName: fetchedName ?? currentName,
          currency,
          reason: [
            needsSymbolFix ? `심볼: ${reason}` : null,
            fetchedName ? `이름: 자동 조회됨 → "${fetchedName}"` : null,
          ].filter(Boolean).join(" · "),
        });
      }
    }

    // dry_run이 아니면 실제 적용
    let applied = 0;
    if (!dryRun && fixes.length > 0) {
      for (const fix of fixes) {
        const updateFields: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (fix.oldSymbol !== fix.newSymbol) {
          updateFields.symbol = fix.newSymbol;
        }
        if (fix.oldName !== fix.newName) {
          updateFields.name = fix.newName;
        }

        const { error } = await supabase
          .from("portfolio_holdings")
          .update(updateFields)
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
      usage: "dry_run=1 to preview, without dry_run to apply",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
