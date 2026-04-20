import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooSymbolInfo } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// 포트폴리오 종목명 일괄 업데이트 API
// Yahoo Finance에서 올바른 shortName을 가져와 업데이트
// 
// 사용: 
//   미리보기: GET /api/portfolio-refresh-names?key=XXX&dry_run=1
//   실행:    GET /api/portfolio-refresh-names?key=XXX
//   강제:    GET /api/portfolio-refresh-names?key=XXX&force=1  (올바른 이름도 덮어씀)
// ═══════════════════════════════════════════════════════════

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (key !== process.env.CRON_SECRET) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dryRun = searchParams.get("dry_run") === "1";
    const force = searchParams.get("force") === "1";
    const supabase = createAdmin();

    // 모든 활성 포지션 조회
    const { data: holdings, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;

    const updates: Array<{
      id: number;
      symbol: string;
      oldName: string | null;
      newName: string;
      reason: string;
    }> = [];
    const skipped: Array<{ id: number; symbol: string; reason: string }> = [];
    const failed: Array<{ id: number; symbol: string; reason: string }> = [];

    for (const h of holdings ?? []) {
      const { id, symbol, name: currentName } = h;

      // 이름이 이미 적절한지 체크 (force가 아닐 때)
      const nameIsBad =
        !currentName ||
        currentName.trim() === "" ||
        currentName === symbol ||
        /^\d+$/.test(currentName); // 숫자만인 경우

      if (!force && !nameIsBad) {
        skipped.push({
          id,
          symbol,
          reason: `이미 적절한 이름 있음: "${currentName}" (force=1로 강제 갱신 가능)`,
        });
        continue;
      }

      // Yahoo에서 이름 조회
      try {
        const info = await fetchYahooSymbolInfo(symbol);
        const fetchedName = info?.shortName || info?.longName;

        if (!fetchedName) {
          failed.push({
            id,
            symbol,
            reason: "Yahoo에서 종목명을 찾을 수 없음",
          });
          continue;
        }

        updates.push({
          id,
          symbol,
          oldName: currentName,
          newName: fetchedName,
          reason: `"${currentName || "(비어있음)"}" → "${fetchedName}"`,
        });

        // Rate limit 방지
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        failed.push({
          id,
          symbol,
          reason: `조회 중 오류: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }

    // 실제 DB 업데이트 (dry_run이 아닐 때)
    let applied = 0;
    if (!dryRun && updates.length > 0) {
      for (const u of updates) {
        const { error: updateError } = await supabase
          .from("portfolio_holdings")
          .update({
            name: u.newName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", u.id);

        if (!updateError) applied++;
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      force,
      totalHoldings: holdings?.length ?? 0,
      updatesNeeded: updates.length,
      applied,
      updates,
      skipped,
      failed,
      usage: "dry_run=1 to preview, without dry_run to apply, force=1 to overwrite all names",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
