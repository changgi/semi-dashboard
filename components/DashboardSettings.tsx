"use client";

import { useState, useEffect } from "react";

// ───────────────────────────────────────────────────────────
// 대시보드 섹션 정의 (사용자가 끌 수 있는 것만)
// ───────────────────────────────────────────────────────────
export interface DashboardSection {
  id: string;
  icon: string;
  label: string;
  description: string;
  group: "essential" | "analysis" | "options" | "advanced";
  defaultVisible: boolean;
  alwaysVisible?: boolean; // true면 끌 수 없음
}

export const DASHBOARD_SECTIONS: DashboardSection[] = [
  // 핵심 (alwaysVisible)
  { id: "today-view",        icon: "🎯", label: "Today's View",    description: "오늘의 투자 종합 판단",       group: "essential", defaultVisible: true, alwaysVisible: true },
  { id: "advisor",           icon: "🧠", label: "Investment Advisor", description: "오늘 할 일 구체적 가이드", group: "essential", defaultVisible: true },
  { id: "portfolio",         icon: "💼", label: "My Portfolio",    description: "실시간 보유 종목 P&L",      group: "essential", defaultVisible: true },
  { id: "korea-semi",        icon: "🇰🇷", label: "Korea Semi Watch", description: "한국 반도체 생태계",      group: "essential", defaultVisible: true },

  // 분석
  { id: "heatmap-top",       icon: "🔥", label: "Heatmap + Top",    description: "히트맵 + Top Performer",    group: "analysis", defaultVisible: true },
  { id: "investment-matrix", icon: "📊", label: "Investment Matrix", description: "투자 매트릭스",            group: "analysis", defaultVisible: true },
  { id: "change-valuation",  icon: "📈", label: "Change + Valuation", description: "등락률 + Forward P/E",    group: "analysis", defaultVisible: true },
  { id: "memflation",        icon: "💾", label: "Memory + Revenue", description: "메모리 + 매출 성장",      group: "analysis", defaultVisible: false },
  { id: "multi-analysis",    icon: "🔬", label: "Multi-Dimensional", description: "5D 분석",                group: "analysis", defaultVisible: false },
  { id: "trend",             icon: "📉", label: "Trend Integration", description: "통합 트렌드",            group: "analysis", defaultVisible: false },
  { id: "segment-etf",       icon: "🎛️", label: "Segment + ETF",    description: "세그먼트 + ETF",          group: "analysis", defaultVisible: true },

  // 매크로 & 예측
  { id: "macro",             icon: "🌍", label: "Macro Dashboard", description: "매크로 14지표",            group: "analysis", defaultVisible: true },
  { id: "macro-charts",      icon: "📈", label: "Macro Charts",    description: "매크로 차트 + 예측",       group: "analysis", defaultVisible: true },
  { id: "correlation",       icon: "🔗", label: "Correlation",     description: "상관관계 히트맵",          group: "analysis", defaultVisible: false },
  { id: "forecast-accuracy", icon: "🎯", label: "Forecast Accuracy", description: "예측 정확도 검증",       group: "analysis", defaultVisible: true },
  { id: "backtest",          icon: "🧪", label: "Backtest",        description: "전략 백테스트",           group: "analysis", defaultVisible: true },

  // 옵션
  { id: "derivatives",       icon: "💱", label: "FX/Futures/Options", description: "환율/선물/옵션",        group: "options", defaultVisible: true },
  { id: "stock-options",     icon: "💹", label: "Stock Options",   description: "종목별 옵션 체인",         group: "options", defaultVisible: true },
  { id: "options-scanner",   icon: "🔍", label: "Options Scanner", description: "섹터 옵션 스캔",          group: "options", defaultVisible: false },

  // AI & 예측
  { id: "agents",            icon: "🤖", label: "AI Agents",       description: "19명 AI 에이전트",         group: "advanced", defaultVisible: true },
  { id: "agent-comparison",  icon: "📊", label: "Agent Compare",   description: "에이전트 비교",            group: "advanced", defaultVisible: false },
  { id: "agent-detail",      icon: "🔬", label: "Agent Detail",    description: "에이전트 상세",            group: "advanced", defaultVisible: false },
  { id: "trading-signal",    icon: "🎯", label: "Trading Signals", description: "매매 시그널",              group: "advanced", defaultVisible: false },
  { id: "high-dim",          icon: "📐", label: "5D Analysis",     description: "고차원 분석",              group: "advanced", defaultVisible: false },
  { id: "predictions",       icon: "🔮", label: "Predictions",     description: "가격 예측 엔진",           group: "advanced", defaultVisible: false },

  // 부가
  { id: "news-sentiment",    icon: "📰", label: "News Sentiment",  description: "뉴스 감성 트렌드",         group: "advanced", defaultVisible: false },
  { id: "risk-matrix",       icon: "⚠️", label: "Risk Matrix",     description: "리스크 매트릭스",          group: "advanced", defaultVisible: false },
  { id: "portfolio-profiles",icon: "📁", label: "Portfolio Profiles", description: "포트폴리오 프로파일",   group: "advanced", defaultVisible: false },
  { id: "timeline",          icon: "📅", label: "Catalyst Timeline", description: "촉매 타임라인",          group: "advanced", defaultVisible: false },
  { id: "news",              icon: "📰", label: "News Feed",       description: "뉴스 피드",                group: "advanced", defaultVisible: true },
  { id: "executive-summary", icon: "📝", label: "Executive Summary", description: "종합 요약",             group: "advanced", defaultVisible: false },
  { id: "data-health",       icon: "💊", label: "Data Health",     description: "시스템 상태",              group: "advanced", defaultVisible: false },
];

// ───────────────────────────────────────────────────────────
// localStorage 훅
// ───────────────────────────────────────────────────────────
const STORAGE_KEY = "dashboard-settings-v1";

function loadSettings(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function saveSettings(settings: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

// 섹션이 보이는지 확인하는 공용 훅
export function useSectionVisibility() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = loadSettings();
    const initial: Record<string, boolean> = {};
    for (const section of DASHBOARD_SECTIONS) {
      initial[section.id] = stored[section.id] ?? section.defaultVisible;
    }
    setVisibility(initial);

    // 설정 변경 이벤트 수신
    const handler = () => setVisibility(loadSettings());
    window.addEventListener("dashboard-settings-change", handler);
    return () => window.removeEventListener("dashboard-settings-change", handler);
  }, []);

  return (sectionId: string): boolean => {
    const section = DASHBOARD_SECTIONS.find((s) => s.id === sectionId);
    if (section?.alwaysVisible) return true;
    return visibility[sectionId] ?? section?.defaultVisible ?? true;
  };
}

// ═══════════════════════════════════════════════════════════
// 설정 버튼 + 모달 컴포넌트
// ═══════════════════════════════════════════════════════════
export function DashboardSettings() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // 초기 로드
  useEffect(() => {
    const stored = loadSettings();
    const initial: Record<string, boolean> = {};
    for (const section of DASHBOARD_SECTIONS) {
      initial[section.id] = stored[section.id] ?? section.defaultVisible;
    }
    setSettings(initial);
  }, [open]);

  const toggle = (id: string) => {
    setSettings((prev) => ({ ...prev, [id]: !prev[id] }));
    setHasChanges(true);
  };

  const save = () => {
    saveSettings(settings);
    window.dispatchEvent(new CustomEvent("dashboard-settings-change"));
    setHasChanges(false);
    setOpen(false);
  };

  const reset = () => {
    const defaults: Record<string, boolean> = {};
    for (const section of DASHBOARD_SECTIONS) {
      defaults[section.id] = section.defaultVisible;
    }
    setSettings(defaults);
    setHasChanges(true);
  };

  const showAll = () => {
    const all: Record<string, boolean> = {};
    for (const section of DASHBOARD_SECTIONS) {
      all[section.id] = true;
    }
    setSettings(all);
    setHasChanges(true);
  };

  const showMinimum = () => {
    const minimum: Record<string, boolean> = {};
    for (const section of DASHBOARD_SECTIONS) {
      minimum[section.id] = section.group === "essential";
    }
    setSettings(minimum);
    setHasChanges(true);
  };

  const visibleCount = Object.values(settings).filter(Boolean).length;
  const totalCount = DASHBOARD_SECTIONS.length;

  // 그룹별 렌더
  const groups = [
    { id: "essential", label: "필수 섹션",  desc: "매일 보는 핵심 기능",   icon: "⭐" },
    { id: "analysis",  label: "분석 섹션",  desc: "시장 & 종목 분석",      icon: "📊" },
    { id: "options",   label: "옵션 섹션",  desc: "파생상품 분석",         icon: "💹" },
    { id: "advanced",  label: "고급 섹션",  desc: "심화 분석 & 부가",       icon: "🔬" },
  ] as const;

  return (
    <>
      {/* 설정 버튼 (플로팅) */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 bottom-4 sm:left-6 sm:bottom-6 z-40 w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-[var(--amber-dim)] bg-[var(--bg)] hover:bg-[rgba(255,176,0,0.1)] text-[var(--amber)] text-[14px] sm:text-[16px] flex items-center justify-center shadow-xl transition-all hover:scale-105"
        title="대시보드 설정"
      >
        ⚙️
      </button>

      {/* 설정 모달 */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--bg)] border border-[var(--amber-dim)] rounded w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="border-b border-[var(--border)] p-4 flex items-start justify-between">
              <div>
                <div className="text-[14px] tick font-bold">
                  ⚙️ 대시보드 설정
                </div>
                <div className="text-[10px] dim kr mt-1">
                  표시할 섹션 선택 · 현재 {visibleCount}/{totalCount}개 표시 중 · 설정은 브라우저에 저장
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--amber)] hover:bright text-[20px]"
              >
                ✕
              </button>
            </div>

            {/* 빠른 프리셋 */}
            <div className="border-b border-[var(--border)] p-3 flex items-center gap-2 flex-wrap">
              <span className="text-[9px] dim kr">빠른 설정:</span>
              <button
                onClick={showMinimum}
                className="text-[9px] px-2 py-1 border border-[var(--border)] hover:border-[var(--amber)] hover:text-[var(--amber)] kr"
                title="필수 4개만"
              >
                🎯 미니멀
              </button>
              <button
                onClick={reset}
                className="text-[9px] px-2 py-1 border border-[var(--border)] hover:border-[var(--amber)] hover:text-[var(--amber)] kr"
                title="기본 설정으로"
              >
                🔄 기본값
              </button>
              <button
                onClick={showAll}
                className="text-[9px] px-2 py-1 border border-[var(--border)] hover:border-[var(--amber)] hover:text-[var(--amber)] kr"
                title="모두 표시"
              >
                📋 전체
              </button>
            </div>

            {/* 섹션 목록 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {groups.map((group) => {
                const sectionsInGroup = DASHBOARD_SECTIONS.filter((s) => s.group === group.id);
                const visibleInGroup = sectionsInGroup.filter((s) => settings[s.id] ?? s.defaultVisible).length;

                return (
                  <div key={group.id}>
                    <div className="flex items-center justify-between mb-2 border-b border-[var(--border)] pb-1">
                      <div>
                        <span className="text-[11px] tick font-bold">
                          {group.icon} {group.label}
                        </span>
                        <span className="text-[9px] dim kr ml-2">{group.desc}</span>
                      </div>
                      <span className="text-[9px] dim">
                        {visibleInGroup}/{sectionsInGroup.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {sectionsInGroup.map((section) => {
                        const visible = settings[section.id] ?? section.defaultVisible;
                        const locked = section.alwaysVisible;

                        return (
                          <button
                            key={section.id}
                            onClick={() => !locked && toggle(section.id)}
                            disabled={locked}
                            className={`flex items-start gap-2 p-2 border rounded text-left transition-all ${
                              locked
                                ? "border-[var(--amber-dim)] bg-[rgba(255,176,0,0.05)] cursor-not-allowed"
                                : visible
                                ? "border-[#00ff88]/40 bg-[rgba(0,255,136,0.03)] hover:bg-[rgba(0,255,136,0.08)]"
                                : "border-[var(--border)] hover:border-[var(--amber-dim)] opacity-50 hover:opacity-100"
                            }`}
                          >
                            <span className="text-[14px] flex-shrink-0">{section.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className={`text-[10px] font-bold kr ${
                                visible ? "text-[var(--amber)]" : "dim"
                              }`}>
                                {section.label}
                                {locked && <span className="ml-1 text-[7px] text-[var(--amber)]">🔒</span>}
                              </div>
                              <div className="text-[8px] dim kr leading-tight">
                                {section.description}
                              </div>
                            </div>
                            <span className={`text-[14px] flex-shrink-0 ${
                              visible ? "text-[#00ff88]" : "dim"
                            }`}>
                              {visible ? "✓" : "○"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 푸터 */}
            <div className="border-t border-[var(--border)] p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-[9px] dim kr">
                💡 설정은 이 브라우저에 저장됩니다 · 다른 기기는 별도 설정
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="text-[10px] px-3 py-1.5 border border-[var(--border)] dim hover:text-white"
                >
                  취소
                </button>
                <button
                  onClick={save}
                  disabled={!hasChanges}
                  className={`text-[10px] px-4 py-1.5 font-bold ${
                    hasChanges
                      ? "bg-[var(--amber)] text-[#111] hover:bg-[#e09900]"
                      : "bg-[var(--border)] dim cursor-not-allowed"
                  }`}
                >
                  {hasChanges ? "💾 저장하고 적용" : "변경사항 없음"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
