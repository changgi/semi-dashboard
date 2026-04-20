"use client";

import { useEffect, useState } from "react";

// ═══════════════════════════════════════════════════════════
// PWA Install Prompt
// 
// 브라우저에서 "앱으로 설치" 가능하면 하단에 설치 권장
// iOS는 Safari "공유 → 홈 화면에 추가" 안내
// ═══════════════════════════════════════════════════════════

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "semi_pwa_dismiss_until";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 이미 설치된 PWA인지 체크
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
                       (window.navigator as any).standalone === true;
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    // iOS 감지
    const iosRegex = /iPad|iPhone|iPod/;
    const isIOSDevice = iosRegex.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // dismiss 체크 (7일간 안 보임)
    try {
      const dismissUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissUntil && Number(dismissUntil) > Date.now()) {
        return; // 아직 dismiss 기간
      }
    } catch {}

    // Android/Chrome: beforeinstallprompt 이벤트 대기
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // 10초 후 표시
      setTimeout(() => setVisible(true), 10000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: 이벤트 없으니 수동으로 5초 후 표시
    if (isIOSDevice) {
      setTimeout(() => setVisible(true), 5000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    // 7일간 숨김
    try {
      const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {}
  };

  if (isInstalled || !visible) return null;

  return (
    <div
      className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100vw-1rem)]"
      style={{
        animation: "slideUp 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
      
      <div className="panel p-3 sm:p-4 shadow-2xl border-2 border-[var(--amber)]">
        <div className="flex items-start gap-3">
          <span className="text-[28px] flex-shrink-0">📱</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold tick kr mb-1">
              앱으로 설치하시면 편해요!
            </div>
            <div className="text-[10px] dim kr leading-relaxed">
              {isIOS ? (
                <>
                  홈 화면에 추가:<br />
                  1. 하단 <strong>공유 버튼 (□↑)</strong> 탭<br />
                  2. "<strong>홈 화면에 추가</strong>" 선택<br />
                  3. 앱처럼 바로 실행!
                </>
              ) : (
                <>
                  언제 어디서나 빠르게 접근<br />
                  알림 · 오프라인 캐시 · 홈 화면 아이콘
                </>
              )}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-[14px] dim hover:bright flex-shrink-0"
            title="7일간 숨기기"
          >
            ✕
          </button>
        </div>
        
        {!isIOS && deferredPrompt && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 text-[11px] px-3 py-2 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
            >
              📥 지금 설치
            </button>
            <button
              onClick={handleDismiss}
              className="text-[10px] px-3 py-2 border border-[var(--border)] dim hover:text-[var(--amber)] rounded kr"
            >
              나중에
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
