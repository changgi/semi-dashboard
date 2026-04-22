import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Dashboard Preload API
// 
// 대시보드 첫 방문 시 주요 API를 병렬로 미리 호출해 
// Vercel 함수를 warm-up + 후속 요청 캐시 히트율 증가
// 
// 결과는 무시 - 목적은 워밍업 자체
// ═══════════════════════════════════════════════════════════

const WARMUP_TARGETS = [
  "/api/daily-briefing-v2",
  "/api/trade-ideas",
  "/api/portfolio-diagnosis",
  "/api/exit-strategy",
  "/api/portfolio-alerts",
  "/api/recovery-path",
];

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const baseUrl = new URL(req.url).origin;
  
  // 모든 타겟 병렬 호출 (결과 상관 없음)
  const results = await Promise.allSettled(
    WARMUP_TARGETS.map(async (path) => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(30000),
        });
        return {
          path,
          status: res.status,
          elapsed: 0,
        };
      } catch (e) {
        return {
          path,
          status: 0,
          error: e instanceof Error ? e.message : "unknown",
        };
      }
    })
  );
  
  const summary = {
    totalMs: Date.now() - startTime,
    total: results.length,
    succeeded: results.filter(r => r.status === "fulfilled" && (r.value as any).status === 200).length,
    details: results.map(r => r.status === "fulfilled" ? r.value : { error: "rejected" }),
  };
  
  return NextResponse.json({
    success: true,
    warmedUp: summary.succeeded,
    of: summary.total,
    elapsedMs: summary.totalMs,
  });
}
