"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface RoutineTask {
  id: string;
  label: string;
  description: string;
  icon: string;
  autoCheckable: boolean;  // 다른 시스템이 자동 처크하는가
  targetPanel?: string;    // 클릭 시 이동
}

const MORNING_ROUTINE: RoutineTask[] = [
  {
    id: "check-briefing",
    label: "🌅 Daily Briefing 읽기",
    description: "오늘의 시장 무드 + AI 조언 확인",
    icon: "📖",
    autoCheckable: false,
    targetPanel: "daily-briefing",
  },
  {
    id: "check-focus",
    label: "🎯 Today's Focus 확인",
    description: "오늘 딱 한 가지 액션",
    icon: "🎯",
    autoCheckable: false,
    targetPanel: "todays-focus",
  },
  {
    id: "check-alerts",
    label: "🚨 경보 점검",
    description: "Critical/Warning 경보 확인",
    icon: "🔔",
    autoCheckable: true,
    targetPanel: "alert-banner",
  },
  {
    id: "check-earnings",
    label: "📅 오늘·내일 실적 일정",
    description: "포트 영향 종목 파악",
    icon: "📅",
    autoCheckable: false,
    targetPanel: "market-pulse",
  },
  {
    id: "execute-p1",
    label: "💡 P1 액션 실행 (있으면)",
    description: "Trade Ideas 1번 우선순위",
    icon: "⚡",
    autoCheckable: false,
    targetPanel: "trade-ideas",
  },
  {
    id: "journal",
    label: "📔 어제 매매 Journal 기록",
    description: "감정 + 이유 + 결과",
    icon: "✍️",
    autoCheckable: false,
    targetPanel: "trade-journal",
  },
];

const EVENING_ROUTINE: RoutineTask[] = [
  {
    id: "review-today",
    label: "📊 오늘 포트 변화 확인",
    description: "수익/손실 + 당일 Top/Bottom",
    icon: "📈",
    autoCheckable: false,
    targetPanel: "market-pulse",
  },
  {
    id: "us-market-prep",
    label: "🇺🇸 美 장 시작 대비",
    description: "중요 이벤트 + 포지션 점검",
    icon: "⏰",
    autoCheckable: false,
    targetPanel: "market-pulse",
  },
  {
    id: "check-exit",
    label: "🎯 Exit Strategy 확인",
    description: "각 포지션 손절선 재점검",
    icon: "🛡️",
    autoCheckable: false,
    targetPanel: "exit-strategy",
  },
  {
    id: "tomorrow-plan",
    label: "📝 내일 실행 계획 수립",
    description: "Tomorrow's Action 메모",
    icon: "📋",
    autoCheckable: false,
    targetPanel: "trade-ideas",
  },
];

const STORAGE_KEY = "semi_routine_";

export function MorningRoutinePanel() {
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "evening">("morning");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [currentDate] = useState(new Date().toISOString().split("T")[0]);
  
  const { data: focusData } = useSWR(
    "/api/todays-focus",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  // 시간대 자동 감지
  useEffect(() => {
    const hour = new Date().getHours();
    setTimeOfDay(hour >= 17 ? "evening" : "morning");
  }, []);
  
  // localStorage에서 오늘 체크 상태 로드
  useEffect(() => {
    try {
      const key = `${STORAGE_KEY}${timeOfDay}_${currentDate}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        setChecked(new Set(JSON.parse(stored)));
      } else {
        setChecked(new Set());
      }
    } catch {}
  }, [timeOfDay, currentDate]);
  
  // 저장
  const saveChecked = (next: Set<string>) => {
    try {
      const key = `${STORAGE_KEY}${timeOfDay}_${currentDate}`;
      localStorage.setItem(key, JSON.stringify([...next]));
    } catch {}
  };
  
  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveChecked(next);
      return next;
    });
  };
  
  const scrollToPanel = (panelId: string | undefined) => {
    if (!panelId) return;
    const el = document.getElementById(panelId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  
  const tasks = timeOfDay === "morning" ? MORNING_ROUTINE : EVENING_ROUTINE;
  const completed = tasks.filter(t => checked.has(t.id)).length;
  const progress = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
  
  // 오늘의 포커스 메시지
  const focusHeadline = focusData?.focus?.headline;
  
  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(126,200,255,0.04)]">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div>
            <div className="text-[11px] tick font-bold kr">
              {timeOfDay === "morning" ? "☀️ 아침 5분 루틴" : "🌙 저녁 체크업"}
            </div>
            <div className="text-[9px] dim kr mt-0.5">
              {new Date().toLocaleDateString("ko-KR", { weekday: "long", month: "short", day: "numeric" })}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTimeOfDay("morning")}
              className={`text-[9px] px-2 py-1 border rounded kr ${
                timeOfDay === "morning"
                  ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim"
              }`}
            >
              ☀️ 아침
            </button>
            <button
              onClick={() => setTimeOfDay("evening")}
              className={`text-[9px] px-2 py-1 border rounded kr ${
                timeOfDay === "evening"
                  ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim"
              }`}
            >
              🌙 저녁
            </button>
          </div>
        </div>
        
        {/* 오늘의 포커스 미리보기 */}
        {focusHeadline && (
          <div className="mt-2 p-2 rounded bg-black/30 text-[10px] kr">
            <span className="dim">오늘 포커스: </span>
            <span className="tick font-bold">{focusHeadline}</span>
          </div>
        )}
        
        {/* 진행도 */}
        <div className="mt-2">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[9px] dim kr">진행도</div>
            <div className="text-[11px] tick font-bold">{completed}/{tasks.length}</div>
          </div>
          <div className="h-2 bg-black/40 rounded overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: progress === 100 
                  ? "#00ff88" 
                  : progress >= 50 
                  ? "var(--amber)" 
                  : "#ff3860",
              }}
            />
          </div>
        </div>
      </div>
      
      {/* 태스크 리스트 */}
      <div className="space-y-1.5">
        {tasks.map((task, i) => {
          const isChecked = checked.has(task.id);
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 p-2 rounded border transition-all"
              style={{
                borderColor: isChecked ? "rgba(0,255,136,0.3)" : "var(--border)",
                background: isChecked ? "rgba(0,255,136,0.04)" : "var(--bg-card, #141414)",
                opacity: isChecked ? 0.7 : 1,
              }}
            >
              {/* 체크박스 */}
              <button
                onClick={() => toggle(task.id)}
                className="w-6 h-6 border-2 rounded flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  borderColor: isChecked ? "#00ff88" : "var(--border)",
                  background: isChecked ? "rgba(0,255,136,0.15)" : "transparent",
                }}
              >
                {isChecked && <span className="text-[14px] up">✓</span>}
              </button>
              
              {/* 순서 번호 */}
              <div
                className="text-[16px] font-bold"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  color: isChecked ? "#00ff88" : "var(--dim)",
                  minWidth: "20px",
                }}
              >
                {i + 1}
              </div>
              
              {/* 내용 */}
              <div className="flex-1 min-w-0">
                <div 
                  className={`text-[11px] kr font-bold ${isChecked ? "line-through dim" : "bright"}`}
                >
                  {task.label}
                </div>
                <div className="text-[9px] dim kr mt-0.5">
                  {task.description}
                </div>
              </div>
              
              {/* 이동 버튼 */}
              {task.targetPanel && (
                <button
                  onClick={() => scrollToPanel(task.targetPanel)}
                  className="text-[9px] px-2 py-1 border border-[var(--border)] rounded tick hover:bg-[rgba(255,176,0,0.08)] flex-shrink-0"
                  title="해당 패널로 이동"
                >
                  →
                </button>
              )}
            </div>
          );
        })}
      </div>
      
      {/* 완료 메시지 */}
      {progress === 100 && (
        <div className="p-3 text-center border-2 border-[#00ff88] rounded bg-[rgba(0,255,136,0.08)]">
          <div className="text-[14px] up font-bold kr">
            ✅ {timeOfDay === "morning" ? "아침 루틴" : "저녁 체크업"} 완료!
          </div>
          <div className="text-[10px] dim kr mt-1">
            {timeOfDay === "morning" 
              ? "오늘 하루도 시스템 기반 투자로 화이팅!" 
              : "내일 아침에 다시 만나요"}
          </div>
        </div>
      )}
      
      <div className="text-[9px] dim kr p-2 border border-[var(--border)]/50 rounded bg-black/10">
        💡 체크 상태는 로컬 저장 · 자정에 자동 초기화 · → 버튼으로 해당 패널 이동
      </div>
    </div>
  );
}
