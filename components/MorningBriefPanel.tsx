"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  date: string;
  dayName: string;
  portfolioHeadline: string;
  fxHeadline: string;
  marketTldr: string;
  conclusion: string;
  top3Actions: Array<{ icon: string; title: string; action: string; urgency: string }>;
  bigNews: Array<{ symbol: string; title: string; score: number; sentiment: string }>;
  urgentEvents: Array<{ title: string; daysUntil: number; importance: number; impact: string }>;
  thisWeekEarnings: Array<{ symbol: string; daysUntil: number; impact: string }>;
  personalizedTips: string[];
  recentInsights: Array<{ title: string; insight: string; category: string; confidence: number }>;
  rawData: any;
}

// ═══════════════════════════════════════════════════════════
export function MorningBriefPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/morning-brief",
    fetcher,
    { refreshInterval: 300000 } // 5분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr">☀️ 아침 요약 생성 중...</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">데이터 로드 실패</div>
      </div>
    );
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? "🌙 새벽이에요" : hour < 12 ? "☀️ 좋은 아침이에요" : hour < 18 ? "🌤️ 오후에요" : "🌆 저녁이에요";

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="mb-4">
        <div className="text-[9px] dim kr">{greeting}, 카일님 · {data.date} ({data.dayName})</div>
        <div className="section-title text-[12px] sm:text-[14px] mt-1">
          ☀️ MORNING BRIEF · 3분 요약
        </div>
      </div>

      {/* 핵심 한 줄 상태 */}
      <div className="mb-4 p-4 border-2 border-[var(--amber)] bg-[rgba(255,176,0,0.05)] rounded">
        <div className="text-[13px] sm:text-[15px] tick font-bold kr mb-1">
          {data.portfolioHeadline}
        </div>
        {data.fxHeadline && (
          <div className="text-[10px] dim kr">
            {data.fxHeadline}
          </div>
        )}
        <div className="text-[10px] dim kr mt-2 pt-2 border-t border-[var(--amber-dim)]">
          🌍 시장: {data.marketTldr}
        </div>
      </div>

      {/* 한 줄 결론 */}
      <div className="mb-4 p-3 bg-[rgba(255,255,255,0.03)] border border-[var(--border-bright)] rounded">
        <div className="text-[11px] sm:text-[13px] kr font-bold leading-relaxed">
          💡 {data.conclusion}
        </div>
      </div>

      {/* TOP 3 액션 */}
      {(data.top3Actions ?? []).length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] tick font-bold kr mb-2">🎯 오늘의 TOP 3 액션</div>
          <div className="space-y-1.5">
            {(data.top3Actions ?? []).map((a, i) => {
              const color =
                a.urgency === "immediate" ? "#ff3860" :
                a.urgency === "today" ? "#ff6644" :
                a.urgency === "this_week" ? "#ffaa44" :
                "#aaccff";
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 border-l-3 rounded-r"
                  style={{
                    borderLeftColor: color,
                    borderLeftWidth: 3,
                    background: `${color}08`,
                  }}
                >
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ background: color, color: "white" }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px]">{a.icon}</span>
                      <span className="text-[11px] font-bold kr">{a.title}</span>
                    </div>
                    <div className="text-[10px] kr mt-0.5 leading-relaxed" style={{ color }}>
                      👉 {a.action}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 그리드: 이번 주 실적 + 임박 이벤트 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {/* 이번 주 실적 */}
        {(data.thisWeekEarnings ?? []).length > 0 && (
          <div className="border border-[var(--border)] rounded p-3">
            <div className="text-[10px] tick font-bold kr mb-2">📊 이번 주 실적</div>
            <div className="space-y-1">
              {(data.thisWeekEarnings ?? []).map((e, i) => {
                const impactEmoji = e.impact === "direct" ? "🎯" : e.impact === "indirect" ? "🔗" : "👁️";
                return (
                  <div key={i} className="flex items-center justify-between text-[10px] kr">
                    <span>
                      <span className="tick font-bold">{e.symbol}</span> D-{e.daysUntil}
                    </span>
                    <span className="dim">{impactEmoji}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 임박 이벤트 */}
        {(data.urgentEvents ?? []).length > 0 && (
          <div className="border border-[#ff6644]/30 bg-[rgba(255,102,68,0.03)] rounded p-3">
            <div className="text-[10px] font-bold kr mb-2" style={{ color: "#ff6644" }}>🚨 D-5 이내 이벤트</div>
            <div className="space-y-1">
              {(data.urgentEvents ?? []).slice(0, 4).map((e, i) => {
                const emoji = e.daysUntil === 0 ? "🚨" : e.daysUntil <= 1 ? "🔥" : "⏰";
                return (
                  <div key={i} className="text-[10px] kr">
                    <div>{emoji} <span className="tick font-bold">D-{e.daysUntil}</span> {e.title}</div>
                    {e.impact && <div className="text-[8px] dim mt-0.5 pl-5">{e.impact}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 주요 뉴스 */}
      {(data.bigNews ?? []).length > 0 && (
        <div className="mb-4 border border-[var(--border)] rounded p-3">
          <div className="text-[10px] tick font-bold kr mb-2">📰 오늘의 고영향 뉴스</div>
          <div className="space-y-1">
            {(data.bigNews ?? []).map((n, i) => {
              const color = n.sentiment === "positive" ? "#00ff88" : n.sentiment === "negative" ? "#ff3860" : "#aaaaaa";
              const emoji = n.sentiment === "positive" ? "🟢" : n.sentiment === "negative" ? "🔴" : "➖";
              return (
                <div key={i} className="text-[10px] kr leading-relaxed">
                  <span className="flex items-start gap-2">
                    <span>{emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="tick font-bold">[{n.symbol}]</span>{" "}
                      <span>{n.title}</span>
                      <span className="font-bold ml-1" style={{ color }}>
                        ({n.score >= 0 ? "+" : ""}{n.score})
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 🔬 오늘의 자동 인사이트 (축적 데이터 기반) */}
      {(data.recentInsights ?? []).length > 0 && (
        <div className="mb-4 border border-[#aaccff]/30 bg-[rgba(170,204,255,0.03)] rounded p-3">
          <div className="text-[10px] font-bold kr mb-2" style={{ color: "#aaccff" }}>
            🔬 오늘 자동 감지된 인사이트 ({data.recentInsights.length})
          </div>
          {(data.recentInsights ?? []).map((ins, i) => (
            <div key={i} className="text-[10px] kr leading-relaxed mb-2 p-2 bg-black/20 rounded">
              <div className="font-bold" style={{ color: "#aaccff" }}>
                {ins.title}
              </div>
              <div className="mt-0.5 dim">{ins.insight}</div>
              <div className="text-[8px] dim mt-1">
                신뢰도 {Math.round(ins.confidence * 100)}% · 카테고리: {ins.category}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 맞춤 조언 */}
      {(data.personalizedTips ?? []).length > 0 && (
        <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3">
          <div className="text-[10px] tick font-bold kr mb-2">💡 카일님 맞춤 조언</div>
          {(data.personalizedTips ?? []).map((t, i) => (
            <div key={i} className="text-[10px] kr leading-relaxed mb-1">
              • {t}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr text-center">
        💡 5분마다 자동 갱신 · 아래 패널들에서 상세 내용 확인
      </div>
    </div>
  );
}
