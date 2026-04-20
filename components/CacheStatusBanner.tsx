"use client";

import { useEffect, useState } from "react";

// ═══════════════════════════════════════════════════════════
// 캐시/에러 상태 배너
// 
// Vercel 장애 시 사용자에게 "캐시로 작동 중" 투명하게 알림
// ═══════════════════════════════════════════════════════════

export function CacheStatusBanner() {
  const [stats, setStats] = useState<{ entries: number; sizeKB: number } | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [cacheRecoveryCount, setCacheRecoveryCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 콘솔 인터셉트로 에러/캐시 복구 이벤트 감지
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.warn = (...args) => {
      const msg = args[0];
      if (typeof msg === "string" && msg.includes("[API soft failure]")) {
        setErrorCount((c) => c + 1);
        setVisible(true);
      }
      originalWarn.apply(console, args);
    };

    console.info = (...args) => {
      const msg = args[0];
      if (typeof msg === "string" && msg.includes("[Cache recovery]")) {
        setCacheRecoveryCount((c) => c + 1);
        setVisible(true);
      }
      originalInfo.apply(console, args);
    };

    // 통계 주기적 갱신
    const updateStats = () => {
      if (typeof window !== "undefined" && (window as any).__semi_cache) {
        setStats((window as any).__semi_cache.stats());
      }
    };
    updateStats();
    const id = setInterval(updateStats, 30000);

    return () => {
      console.warn = originalWarn;
      console.info = originalInfo;
      clearInterval(id);
    };
  }, []);

  // 에러 카운트가 3 이상 감소하면 표시 해제
  useEffect(() => {
    if (errorCount + cacheRecoveryCount > 0) {
      const id = setTimeout(() => setVisible(false), 30000);
      return () => clearTimeout(id);
    }
  }, [errorCount, cacheRecoveryCount]);

  if (!visible && errorCount === 0 && cacheRecoveryCount === 0) return null;

  return (
    <div
      className={`fixed top-1 right-1 sm:top-2 sm:right-2 z-50 text-[8px] sm:text-[9px] px-2 sm:px-2.5 py-1 sm:py-1.5 rounded border backdrop-blur-sm transition-all max-w-[calc(100vw-0.5rem)] ${
        cacheRecoveryCount > 0
          ? "bg-[rgba(255,170,68,0.15)] border-[#ffaa44]/50 text-[#ffaa44]"
          : errorCount > 0
          ? "bg-[rgba(255,56,96,0.15)] border-[#ff3860]/50 text-[#ff3860]"
          : "bg-[rgba(0,255,136,0.1)] border-[#00ff88]/50 text-[#00ff88]"
      }`}
    >
      <div className="flex items-center gap-2">
        {cacheRecoveryCount > 0 ? (
          <>
            <span>📦</span>
            <span className="kr font-bold">캐시 데이터로 작동 중</span>
            <span>({cacheRecoveryCount}건 복구)</span>
          </>
        ) : errorCount > 0 ? (
          <>
            <span>⚠️</span>
            <span className="kr">Vercel 일시 장애 감지</span>
            <span>({errorCount}건)</span>
          </>
        ) : (
          <>
            <span>✅</span>
            <span className="kr">정상 작동</span>
          </>
        )}
        {stats && stats.entries > 0 && (
          <span className="dim">· 캐시 {stats.entries}건 ({stats.sizeKB}KB)</span>
        )}
        <button
          onClick={() => setVisible(false)}
          className="ml-1 opacity-60 hover:opacity-100"
          title="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
