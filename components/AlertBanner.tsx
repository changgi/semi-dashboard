"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Alert {
  id: string;
  created_at: string;
  severity: "critical" | "warning" | "info";
  title: string;
  summary: string;
  data: {
    type: string;
    symbol?: string;
    affectedValue: number;
  };
}

interface Data {
  success: boolean;
  count: number;
  criticalCount: number;
  warningCount: number;
  alerts: Alert[];
}

const SEVERITY_CONFIG = {
  critical: {
    bg: "rgba(255,56,96,0.1)",
    border: "#ff3860",
    badge: "#ff3860",
    icon: "🚨",
  },
  warning: {
    bg: "rgba(255,217,61,0.08)",
    border: "#ffd93d",
    badge: "#ffd93d",
    icon: "⚠️",
  },
  info: {
    bg: "rgba(126,200,255,0.05)",
    border: "#7ec8ff",
    badge: "#7ec8ff",
    icon: "ℹ️",
  },
};

export function AlertBanner() {
  const { data } = useSWR<Data>(
    "/api/portfolio-alerts",
    fetcher,
    { refreshInterval: 60 * 1000 }  // 1분마다 갱신
  );
  
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  
  if (!data?.success || data.count === 0) return null;
  
  const activeAlerts = data.alerts.filter(a => !dismissed.has(a.id));
  if (activeAlerts.length === 0) return null;
  
  const maxSeverity: "critical" | "warning" | "info" = 
    activeAlerts.some(a => a.severity === "critical") ? "critical" :
    activeAlerts.some(a => a.severity === "warning") ? "warning" :
    "info";
  const cfg = SEVERITY_CONFIG[maxSeverity];
  
  const topAlert = activeAlerts[0];
  
  return (
    <div
      className="rounded border-2 overflow-hidden animate-pulse-slow"
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      {/* 헤더 */}
      <div
        className="px-4 py-3 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[20px]" style={{ filter: maxSeverity === "critical" ? "drop-shadow(0 0 6px #ff3860)" : "none" }}>
            {cfg.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] px-2 py-0.5 rounded font-bold kr"
                style={{ background: cfg.badge, color: "#000" }}
              >
                {maxSeverity.toUpperCase()}
              </span>
              <span className="text-[11px] tick font-bold kr">
                {data.count}건의 경보 (CRITICAL {data.criticalCount} · WARNING {data.warningCount})
              </span>
            </div>
            {!expanded && (
              <div className="text-[10px] kr mt-1" style={{ color: "var(--text)" }}>
                최근: <b style={{ color: cfg.border }}>{topAlert.title}</b>
              </div>
            )}
          </div>
        </div>
        <span className="text-[10px] dim ml-2">
          {expanded ? "▲ 닫기" : "▼ 펼치기"}
        </span>
      </div>
      
      {/* 확장 영역 */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: cfg.border + "40" }}>
          {activeAlerts.slice(0, 10).map(a => {
            const aCfg = SEVERITY_CONFIG[a.severity];
            const timeStr = new Date(a.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
            return (
              <div
                key={a.id}
                className="p-2 rounded border-l-4 flex items-start gap-2 text-[10px]"
                style={{ borderLeftColor: aCfg.border, background: aCfg.bg }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="kr font-bold" style={{ color: aCfg.border }}>
                      {a.title}
                    </span>
                    <span className="dim">{timeStr}</span>
                  </div>
                  <div className="kr mt-1" style={{ color: "var(--text)" }}>
                    {a.summary}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissed(prev => new Set([...prev, a.id]));
                  }}
                  className="text-[10px] dim hover:text-[var(--text)] flex-shrink-0"
                  title="닫기"
                >
                  ✕
                </button>
              </div>
            );
          })}
          {activeAlerts.length > 10 && (
            <div className="text-[9px] dim kr text-center pt-1">
              +{activeAlerts.length - 10}건 추가 경보
            </div>
          )}
        </div>
      )}
      
      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 20px 0 ${cfg.border}33; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
