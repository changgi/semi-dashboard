import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { extractKeywordsForStorage } from "@/lib/keyword-extractor";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/cron/backfill-news-keywords
 *
 * keywords 컬럼이 비어있거나 NULL인 뉴스 레코드를 찾아
 * 제목/요약에서 키워드를 추출해 채운다.
 *
 * 한 번 실행 후 cron에서 빼도 되지만, 매일 돌려도 이미 채워진 레코드는
 * 건너뛰므로 안전. 또한 KEYWORD_GROUPS 사전을 업데이트했을 때
 * 재실행으로 일괄 업데이트 가능.
 *
 * 수동 실행:
 *   curl -H "Authorization: Bearer ${CRON_SECRET}" \
 *        https://semi-dashboard.vercel.app/api/cron/backfill-news-keywords
 *
 * 또는 debugKey:
 *   https://semi-dashboard.vercel.app/api/cron/backfill-news-keywords?key=${CRON_SECRET}&force=1
 */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");
  const force = searchParams.get("force") === "1";
  const batchSize = parseInt(searchParams.get("batch") ?? "200", 10);

  const authorized =
    isVercelCron ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    debugKey === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdmin();
  const startTime = Date.now();

  try {
    // 키워드 비어있는 레코드 조회 (force=1이면 전체)
    let query = supabase
      .from("news")
      .select("id, title, summary, keywords")
      .order("published_at", { ascending: false })
      .limit(batchSize);

    if (!force) {
      // 배열이 null이거나 빈 배열인 경우만
      query = query.or("keywords.is.null,keywords.eq.{}");
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        message: "채울 뉴스가 없습니다 (모두 키워드 있음)",
        scanned: 0,
        updated: 0,
      });
    }

    // 키워드 추출 + 업데이트 준비
    const updates: Array<{ id: string; keywords: string[] }> = [];
    let skipped = 0;
    for (const row of data) {
      const currentKeywords = (row as any).keywords;
      if (!force && Array.isArray(currentKeywords) && currentKeywords.length > 0) {
        skipped++;
        continue;
      }
      const newKeywords = extractKeywordsForStorage(row.title ?? "", row.summary);
      if (newKeywords.length === 0) {
        // 추출 실패해도 빈 배열로 세팅해 NULL 방지
        updates.push({ id: row.id, keywords: [] });
        continue;
      }
      updates.push({ id: row.id, keywords: newKeywords });
    }

    // 개별 update (배열 컬럼은 upsert 충돌 가능 → update가 안전)
    let updated = 0;
    let failed = 0;
    for (const u of updates) {
      const { error: updateErr } = await supabase
        .from("news")
        .update({ keywords: u.keywords })
        .eq("id", u.id);
      if (updateErr) {
        failed++;
        console.error(`Failed to update news ${u.id}:`, updateErr);
      } else {
        updated++;
      }
    }

    const elapsed = Date.now() - startTime;

    // 샘플 결과
    const samples = updates.slice(0, 5).map(u => {
      const original = data.find(d => d.id === u.id);
      return {
        id: u.id,
        title: (original?.title ?? "").slice(0, 80),
        keywords: u.keywords,
      };
    });

    return NextResponse.json({
      success: true,
      scanned: data.length,
      updated,
      failed,
      skipped,
      batchSize,
      force,
      elapsedMs: elapsed,
      samples,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
