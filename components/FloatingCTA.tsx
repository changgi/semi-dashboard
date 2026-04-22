"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  focus?: {
    severity: "critical" | "action_needed" | "attention" | "calm";
    headlineEmoji: string;
    primaryAction: {
      title: string;
      urgency: "today" | "this_week" | "monitor";
    };
  };
}

const SEVERITY_COLORS = {
  critical: "#ff3860",
  action_needed: "#ffd93d",
  attention: "#ffb000",
  calm: "#00ff88",
};

export function FloatingCTA() {
  const { data } = useSWR<Data>("/api/todays-focus", fetcher, {
    refreshInterval: 5 * 60 * 1000,
  });
  
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  
  useEffect(() => {
    // 스크롤 시 Today's Focus가 화면 밖으로 나가면 floating 표시
    const handleScroll = () => {
      const focusEl = document.getElementById("todays-focus");
      if (!focusEl) {
        setVisible(true);
        return;
      }
      const rect = focusEl.getBoundingClientRect();
      // Today's Focus 카드가 화면 위로 사라지면 floating 표시
      setVisible(rect.bottom < 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  if (dismissed || !visible || !data?.success || !data.focus) return null;
  
  const severity = data.focus.severity;
  const color = SEVERITY_COLORS[severity];
  const isCritical = severity === "critical" || severity === "action_needed";
  
  const scrollToTop = () => {
    const focusEl = document.getElementById("todays-focus");
    if (focusEl) {
      focusEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  
  const scrollToExecution = () => {
    const execEl = document.getElementById("execution-tracker");
    if (execEl) {
      execEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  
  return (
    <div
      className="fixed z-50 bottom-4 right-4 max-w-[calc(100vw-32px)] md:max-w-[320px]"
      style={{
        animation: "fadeInUp 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 4px 20px ${color}40; }
          50% { box-shadow: 0 4px 30px ${color}80; }
        }
      `}</style>
      
      <div
        className="border-2 rounded-lg p-3 backdrop-blur-md"
        style={{
          background: "rgba(20,20,20,0.95)",
          borderColor: color,
          animation: isCritical ? "pulseGlow 2s infinite" : "none",
        }}
      >
        <div className="flex items-start gap-2 mb-2">
          <span className="text-[18px] leading-none flex-shrink-0">
            {data.focus.headlineEmoji}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="text-[9px] font-bold tracking-widest"
              style={{ color }}
            >
              TODAY'S ACTION
            </div>
            <div
              className="text-[12px] kr font-bold mt-0.5 truncate"
              style={{ fontFamily: "'Noto Serif KR', serif", color: "#e8e8e8" }}
            >
              {data.focus.primaryAction.title}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-[10px] dim hover:text-white flex-shrink-0"
            style={{ fontFamily: "sans-serif" }}
          >
            ✕
          </button>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={scrollToExecution}
            className="flex-1 text-[10px] px-3 py-1.5 rounded font-bold"
            style={{
              background: color,
              color: "#000",
              fontFamily: "'Noto Serif KR', serif",
            }}
          >
            ⚡ 실행하기
          </button>
          <button
            onClick={scrollToTop}
            className="text-[10px] px-3 py-1.5 border rounded"
            style={{
              borderColor: color,
              color,
              fontFamily: "'Noto Serif KR', serif",
            }}
          >
            ↑ 상세
          </button>
        </div>
      </div>
    </div>
  );
}
