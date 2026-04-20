"use client";

import { useEffect } from "react";

// ═══════════════════════════════════════════════════════════
// Service Worker Registration
// PWA 기능 활성화 + 오프라인 지원
// ═══════════════════════════════════════════════════════════
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // 프로덕션에서만 등록 (개발 시엔 비활성)
    if (window.location.hostname === "localhost") return;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        console.info("[SW] 등록 완료:", reg.scope);

        // 주기적 업데이트 체크 (1시간마다)
        setInterval(() => {
          reg.update().catch(() => {});
        }, 3600000);
      } catch (e) {
        console.warn("[SW] 등록 실패:", e);
      }
    };

    // 페이지 로드 완료 후 등록
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }
  }, []);

  return null;
}
