"use client";

import { useState, useEffect } from "react";

// ───────────────────────────────────────────────────────────
// 섹션 정의 (page.tsx의 id와 매칭)
// ───────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "today-view",       icon: "🎯", label: "오늘의 View",     group: "daily" },
  { id: "advisor",          icon: "🧠", label: "Advisor",        group: "daily" },
  { id: "portfolio",        icon: "💼", label: "포트폴리오",       group: "daily" },
  { id: "korea-semi",       icon: "🇰🇷", label: "Korea Semi",     group: "daily" },
  { id: "macro",            icon: "🌍", label: "매크로",          group: "analysis" },
  { id: "macro-charts",     icon: "📈", label: "매크로 차트",      group: "analysis" },
  { id: "correlation",      icon: "🔗", label: "상관관계",        group: "analysis" },
  { id: "forecast-accuracy",icon: "🎯", label: "예측 정확도",      group: "analysis" },
  { id: "backtest",         icon: "🧪", label: "백테스트",        group: "analysis" },
  { id: "derivatives",      icon: "💱", label: "FX/선물/옵션",    group: "options" },
  { id: "stock-options",    icon: "💹", label: "종목 옵션",        group: "options" },
  { id: "options-scanner",  icon: "🔍", label: "옵션 스캐너",      group: "options" },
  { id: "agents",           icon: "🤖", label: "AI 에이전트",      group: "ai" },
];

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트 - 우측 중앙 고정 네비
// ═══════════════════════════════════════════════════════════
export function SideNavigation() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string>("today-view");

  // 스크롤 위치 추적
  useEffect(() => {
    const handleScroll = () => {
      // 300px 이상 스크롤하면 표시
      setVisible(window.scrollY > 300);

      // 현재 화면에 가장 많이 보이는 섹션 찾기
      let bestId = "";
      let bestVisibility = 0;

      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const viewportH = window.innerHeight;
        // 화면에 보이는 비율 계산
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, viewportH);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibility = visibleHeight / viewportH;

        if (visibility > bestVisibility) {
          bestVisibility = visibility;
          bestId = section.id;
        }
      }

      if (bestId) setActiveId(bestId);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // 초기 실행
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -80; // 상단 바 고려
      const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  // 그룹 색상
  const groupColors: Record<string, string> = {
    daily:    "border-l-[var(--amber)]",
    analysis: "border-l-[#aaccff]",
    options:  "border-l-[#ee99ff]",
    ai:       "border-l-[#00ff88]",
  };

  return (
    <div
      className="fixed right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col items-end gap-1"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* 상단 이동 버튼 */}
      <button
        onClick={scrollToTop}
        className="w-8 h-8 rounded-full border border-[var(--amber-dim)] bg-[var(--bg)]/80 backdrop-blur hover:bg-[rgba(255,176,0,0.1)] text-[var(--amber)] text-[10px] flex items-center justify-center shadow transition-all mb-2"
        title="최상단으로"
      >
        ↑
      </button>

      {/* 섹션 점프 버튼들 */}
      <div className="bg-[var(--bg)]/80 backdrop-blur-md border border-[var(--amber-dim)] rounded py-1 shadow-xl overflow-hidden">
        {SECTIONS.map((section) => {
          const isActive = activeId === section.id;
          return (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`group flex items-center gap-2 w-full text-left px-2 py-1 border-l-2 transition-all ${
                isActive
                  ? `${groupColors[section.group]} bg-[rgba(255,176,0,0.1)]`
                  : "border-l-transparent hover:bg-[rgba(255,176,0,0.05)]"
              }`}
              title={section.label}
            >
              <span className="text-[12px] flex-shrink-0">{section.icon}</span>
              {/* 호버시 레이블 표시 */}
              <span
                className={`text-[9px] kr whitespace-nowrap transition-all overflow-hidden ${
                  expanded ? "w-auto opacity-100 max-w-[120px]" : "w-0 opacity-0 max-w-0"
                } ${isActive ? "text-[var(--amber)] font-bold" : "dim"}`}
              >
                {section.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
