"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface ExpirationEvent {
  date: string;
  dayName: string;
  type: "weekly" | "monthly" | "quad_witching" | "vix_expiration";
  typeLabel: string;
  importance: 1 | 2 | 3 | 4 | 5;
  daysUntil: number;
  expectedImpact: {
    volatilityLevel: "낮음" | "보통" | "높음" | "극심";
    historicalReturnBias: "상승" | "하락" | "중립";
    typicalMoveRange: string;
  };
  tradingGuide: {
    before: string;
    during: string;
    after: string;
  };
  affectedSymbols: string[];
  notes: string[];
}

interface TradingSignal {
  signal: string;
  action: "buy" | "sell" | "hedge" | "wait" | "watch";
  actionLabel: string;
  targetDate: string;
  daysUntil: number;
  rationale: string;
  confidence: number;
}

interface CalendarData {
  success: boolean;
  events: ExpirationEvent[];
  nextMajor: ExpirationEvent | null;
  thisWeek: ExpirationEvent[];
  tradingSignals: TradingSignal[];
  vixLevel: number | null;
  summary: {
    totalEvents: number;
    quadWitchingCount: number;
    monthlyCount: number;
    weeklyCount: number;
    vixCount: number;
  };
}

// ───────────────────────────────────────────────────────────
// 스타일 헬퍼
// ───────────────────────────────────────────────────────────
const typeColors: Record<string, { bg: string; border: string; text: string }> = {
  quad_witching:  { bg: "bg-[rgba(255,56,96,0.08)]",  border: "border-[#ff3860]",    text: "text-[#ff3860]" },
  monthly:        { bg: "bg-[rgba(255,176,0,0.05)]",  border: "border-[var(--amber)]", text: "text-[var(--amber)]" },
  weekly:         { bg: "bg-[rgba(170,204,255,0.03)]", border: "border-[#aaccff]",   text: "text-[#aaccff]" },
  vix_expiration: { bg: "bg-[rgba(238,153,255,0.05)]", border: "border-[#ee99ff]",   text: "text-[#ee99ff]" },
};

const importanceStars = (imp: number) => "★".repeat(imp) + "☆".repeat(5 - imp);

const actionStyles: Record<
  TradingSignal["action"],
  { icon: string; color: string; bg: string }
> = {
  buy:   { icon: "📈", color: "text-[#00ff88]",       bg: "bg-[rgba(0,255,136,0.08)] border-[#00ff88]" },
  sell:  { icon: "📉", color: "text-[#ff3860]",       bg: "bg-[rgba(255,56,96,0.08)] border-[#ff3860]" },
  hedge: { icon: "🛡️", color: "text-[var(--amber)]", bg: "bg-[rgba(255,176,0,0.08)] border-[var(--amber)]" },
  wait:  { icon: "⏸️", color: "text-[#aaccff]",      bg: "bg-[rgba(170,204,255,0.05)] border-[#aaccff]" },
  watch: { icon: "👀", color: "text-[#ee99ff]",      bg: "bg-[rgba(238,153,255,0.05)] border-[#ee99ff]" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function OpExCalendarPanel() {
  const [selectedEvent, setSelectedEvent] = useState<ExpirationEvent | null>(null);
  const [filterType, setFilterType] = useState<"all" | "major" | "this_month">("major");

  const { data, isLoading } = useSWR<CalendarData>(
    "/api/opex-calendar?days=120",
    fetcher,
    { refreshInterval: 3600000 } // 1시간
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">📅 만기 캘린더 로딩 중...</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">데이터 로딩 실패</div>
      </div>
    );
  }

  // 필터링
  const filteredEvents = (() => {
    if (filterType === "all") return data.events;
    if (filterType === "major") return data.events.filter((e) => e.importance >= 4);
    if (filterType === "this_month") return data.events.filter((e) => e.daysUntil <= 30);
    return data.events;
  })();

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[13px]">
            📅 OPEX CALENDAR · 옵션 만기 캘린더 + 매매 타이밍
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            쿼드러플 위칭 · 월간/주간 OpEx · VIX 만기 · 매매 시점 자동 감지
          </div>
        </div>
      </div>

      {/* ═════════ 다음 주요 만기 하이라이트 ═════════ */}
      {data.nextMajor && (
        <NextMajorCard event={data.nextMajor} />
      )}

      {/* ═════════ 매매 시그널 (최우선 표시) ═════════ */}
      {data.tradingSignals.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] tick kr font-bold mb-2">
            🎯 TRADING SIGNALS · 지금 할 일 ({data.tradingSignals.length}건)
          </div>
          <div className="space-y-1.5">
            {data.tradingSignals.slice(0, 3).map((sig, i) => (
              <TradingSignalRow key={i} signal={sig} />
            ))}
          </div>
        </div>
      )}

      {/* ═════════ 이번 주 만기 요약 ═════════ */}
      {data.thisWeek.length > 0 && (
        <div className="mb-3 p-2 bg-[rgba(255,176,0,0.03)] border border-[var(--amber-dim)] rounded">
          <div className="text-[10px] tick kr font-bold mb-1">
            📆 이번 주 만기 ({data.thisWeek.length}건)
          </div>
          <div className="flex flex-wrap gap-2">
            {data.thisWeek.map((e) => (
              <button
                key={e.date}
                onClick={() => setSelectedEvent(e)}
                className={`text-[9px] px-2 py-0.5 border rounded kr ${typeColors[e.type].border} ${typeColors[e.type].text}`}
              >
                {e.date.slice(5)} ({e.dayName}) · {e.typeLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═════════ 필터 버튼 ═════════ */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-[9px] dim kr">필터:</span>
        {[
          { key: "major", label: "🔥 주요 만기만" },
          { key: "this_month", label: "📅 30일 이내" },
          { key: "all", label: "📋 전체" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterType(f.key as "all" | "major" | "this_month")}
            className={`text-[9px] px-2 py-1 border transition-all kr ${
              filterType === f.key
                ? "border-[var(--amber)] bg-[var(--amber)] text-[#111] font-bold"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ═════════ 만기 이벤트 리스트 ═════════ */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {filteredEvents.map((e) => (
          <ExpirationEventRow
            key={e.date + e.type}
            event={e}
            isSelected={selectedEvent?.date === e.date && selectedEvent?.type === e.type}
            onClick={() => setSelectedEvent(e)}
          />
        ))}
      </div>

      {/* ═════════ 선택된 이벤트 상세 ═════════ */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* ═════════ 요약 통계 ═════════ */}
      <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-4 gap-2 text-center">
        <SummaryBox label="쿼드 위칭" value={data.summary.quadWitchingCount} color="red" />
        <SummaryBox label="월간 OpEx" value={data.summary.monthlyCount} color="amber" />
        <SummaryBox label="주간 OpEx" value={data.summary.weeklyCount} color="blue" />
        <SummaryBox label="VIX 만기" value={data.summary.vixCount} color="purple" />
      </div>

      {/* ═════════ 교육 섹션 ═════════ */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">📚 만기 효과 요약</span>:<br />
        · <span className="text-[#ff3860] font-bold">쿼드 위칭</span>: 개별주+지수+선물 동시 만기 → 변동성 극심, 분기 1회<br />
        · <span className="text-[var(--amber)] font-bold">월간 OpEx</span>: 매월 3번째 금요일, Pinning 효과 → 현재가 근처 수렴<br />
        · <span className="text-[#aaccff] font-bold">주간 OpEx</span>: 매주 금요일, 0DTE 변동성 증폭<br />
        · <span className="text-[#ee99ff] font-bold">VIX 만기</span>: 매월 수요일, VIX 관련 ETF 영향<br />
        💡 일반적으로 <span className="bright">만기 다음 월요일</span>이 새로운 방향성 형성 시점
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 다음 주요 만기 카드
// ═══════════════════════════════════════════════════════════
function NextMajorCard({ event }: { event: ExpirationEvent }) {
  const style = typeColors[event.type];
  const urgency =
    event.daysUntil <= 3 ? "🚨" : event.daysUntil <= 7 ? "⚠️" : "📅";

  return (
    <div className={`mb-3 p-3 sm:p-4 border-2 ${style.border} ${style.bg} rounded`}>
      <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
        <div>
          <div className="text-[9px] dim kr">다음 주요 만기</div>
          <div className={`text-[16px] sm:text-[20px] font-bold ${style.text}`}>
            {urgency} {event.typeLabel}
          </div>
          <div className="text-[10px] tick kr mt-1">
            {event.date} ({event.dayName}요일) · {importanceStars(event.importance)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] dim kr">D-</div>
          <div className={`text-[32px] sm:text-[40px] font-bold ${style.text} leading-none`}>
            {event.daysUntil}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
        <div className="text-[9px]">
          <span className="dim kr">변동성</span>{" "}
          <span className="bright kr font-bold">{event.expectedImpact.volatilityLevel}</span>
        </div>
        <div className="text-[9px]">
          <span className="dim kr">예상 변동</span>{" "}
          <span className="bright kr font-bold">{event.expectedImpact.typicalMoveRange}</span>
        </div>
        <div className="text-[9px]">
          <span className="dim kr">편향</span>{" "}
          <span className="bright kr font-bold">{event.expectedImpact.historicalReturnBias}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 매매 시그널 행
// ═══════════════════════════════════════════════════════════
function TradingSignalRow({ signal }: { signal: TradingSignal }) {
  const style = actionStyles[signal.action];

  return (
    <div className={`border ${style.bg} rounded p-2`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold ${style.color}`}>
              {signal.signal}
            </span>
            <span className={`text-[9px] px-2 py-0.5 border rounded ${style.color}`}>
              {style.icon} {signal.actionLabel}
            </span>
            <span className="text-[8px] dim">신뢰도 {signal.confidence}%</span>
          </div>
          <div className="text-[9px] dim kr mt-1 leading-relaxed">
            {signal.rationale}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[8px] dim">목표일</div>
          <div className={`text-[11px] font-bold ${style.color}`}>
            {signal.targetDate.slice(5)}
          </div>
          <div className="text-[8px] dim">
            {signal.daysUntil === 0 ? "오늘" : `D-${signal.daysUntil}`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 만기 이벤트 행
// ═══════════════════════════════════════════════════════════
function ExpirationEventRow({
  event,
  isSelected,
  onClick,
}: {
  event: ExpirationEvent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const style = typeColors[event.type];
  const volBarWidth = {
    낮음: "25%",
    보통: "50%",
    높음: "75%",
    극심: "100%",
  }[event.expectedImpact.volatilityLevel];

  const volBarColor = {
    낮음: "bg-[#aaccff]",
    보통: "bg-[#00ff88]",
    높음: "bg-[var(--amber)]",
    극심: "bg-[#ff3860]",
  }[event.expectedImpact.volatilityLevel];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border-l-2 ${style.border} ${style.bg} rounded-r p-2 transition-all hover:bg-[rgba(255,255,255,0.03)] ${
        isSelected ? "ring-1 ring-[var(--amber)]" : ""
      }`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* 날짜 */}
        <div className="flex-shrink-0 text-center">
          <div className="text-[8px] dim">D-</div>
          <div className={`text-[20px] font-bold ${style.text} leading-none`}>
            {event.daysUntil}
          </div>
          <div className="text-[7px] dim kr">
            {event.date.slice(5)}
          </div>
        </div>

        {/* 타입 + 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold ${style.text}`}>
              {event.typeLabel}
            </span>
            <span className="text-[8px] dim">({event.dayName}요일)</span>
            <span className="text-[8px] text-[var(--amber)]">{importanceStars(event.importance)}</span>
          </div>
          <div className="text-[8px] dim kr mt-0.5">
            변동: {event.expectedImpact.typicalMoveRange} · 편향:{" "}
            <span
              className={
                event.expectedImpact.historicalReturnBias === "상승"
                  ? "up"
                  : event.expectedImpact.historicalReturnBias === "하락"
                  ? "down"
                  : "dim"
              }
            >
              {event.expectedImpact.historicalReturnBias}
            </span>
          </div>
          {/* 변동성 바 */}
          <div className="mt-1 h-1 bg-[var(--border)] rounded overflow-hidden">
            <div className={`h-full ${volBarColor}`} style={{ width: volBarWidth }} />
          </div>
        </div>

        {/* 힌트 */}
        <div className="text-[8px] dim text-right">
          <div>클릭 →</div>
          <div>상세</div>
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// 상세 모달
// ═══════════════════════════════════════════════════════════
function EventDetailModal({
  event,
  onClose,
}: {
  event: ExpirationEvent;
  onClose: () => void;
}) {
  const style = typeColors[event.type];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-[var(--bg)] border-2 ${style.border} rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`sticky top-0 border-b border-[var(--border)] p-3 flex items-start justify-between ${style.bg}`}>
          <div>
            <div className={`text-[14px] font-bold ${style.text}`}>
              {event.typeLabel}
            </div>
            <div className="text-[11px] dim kr mt-1">
              {event.date} ({event.dayName}요일) · D-{event.daysUntil} ·{" "}
              <span className="text-[var(--amber)]">{importanceStars(event.importance)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-[16px] dim hover:bright">
            ✕
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* 예상 영향 */}
          <div>
            <div className="text-[10px] tick kr font-bold mb-2">📊 예상 영향</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-[var(--border)] rounded p-2">
                <div className="text-[8px] dim kr">변동성</div>
                <div className={`text-[12px] font-bold ${style.text}`}>
                  {event.expectedImpact.volatilityLevel}
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="text-[8px] dim kr">예상 변동폭</div>
                <div className="text-[12px] tick font-bold">
                  {event.expectedImpact.typicalMoveRange}
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="text-[8px] dim kr">역사적 편향</div>
                <div
                  className={`text-[12px] font-bold ${
                    event.expectedImpact.historicalReturnBias === "상승"
                      ? "up"
                      : event.expectedImpact.historicalReturnBias === "하락"
                      ? "down"
                      : "tick"
                  }`}
                >
                  {event.expectedImpact.historicalReturnBias}
                </div>
              </div>
            </div>
          </div>

          {/* 매매 가이드 */}
          <div>
            <div className="text-[10px] tick kr font-bold mb-2">🎯 매매 가이드</div>
            <div className="space-y-2">
              <div className="border-l-2 border-[#00ff88] bg-[rgba(0,255,136,0.03)] pl-2 py-1 rounded-r">
                <div className="text-[9px] text-[#00ff88] font-bold kr">📍 만기 전</div>
                <div className="text-[10px] kr mt-0.5 leading-relaxed">{event.tradingGuide.before}</div>
              </div>
              <div className="border-l-2 border-[var(--amber)] bg-[rgba(255,176,0,0.03)] pl-2 py-1 rounded-r">
                <div className="text-[9px] text-[var(--amber)] font-bold kr">📍 만기 당일</div>
                <div className="text-[10px] kr mt-0.5 leading-relaxed">{event.tradingGuide.during}</div>
              </div>
              <div className="border-l-2 border-[#ee99ff] bg-[rgba(238,153,255,0.03)] pl-2 py-1 rounded-r">
                <div className="text-[9px] text-[#ee99ff] font-bold kr">📍 만기 후</div>
                <div className="text-[10px] kr mt-0.5 leading-relaxed">{event.tradingGuide.after}</div>
              </div>
            </div>
          </div>

          {/* 영향받는 종목 */}
          {event.affectedSymbols.length > 0 && (
            <div>
              <div className="text-[10px] tick kr font-bold mb-2">🎯 영향받는 종목</div>
              <div className="flex flex-wrap gap-1">
                {event.affectedSymbols.map((sym) => (
                  <a
                    key={sym}
                    href={`/stock/${encodeURIComponent(sym)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] px-2 py-0.5 border border-[var(--amber-dim)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr"
                  >
                    {sym}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 노트 */}
          {event.notes.length > 0 && (
            <div>
              <div className="text-[10px] tick kr font-bold mb-1">📝 알아두기</div>
              <ul className="space-y-1">
                {event.notes.map((note, i) => (
                  <li key={i} className="text-[9px] dim kr flex gap-2 leading-relaxed">
                    <span className="text-[var(--amber)] flex-shrink-0">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 요약 박스
// ═══════════════════════════════════════════════════════════
function SummaryBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "red" | "amber" | "blue" | "purple";
}) {
  const colorClass = {
    red: "text-[#ff3860] border-[#ff3860]/30",
    amber: "text-[var(--amber)] border-[var(--amber-dim)]",
    blue: "text-[#aaccff] border-[#aaccff]/30",
    purple: "text-[#ee99ff] border-[#ee99ff]/30",
  }[color];

  return (
    <div className={`border ${colorClass} rounded p-2`}>
      <div className={`text-[20px] font-bold ${colorClass.split(" ")[0]}`}>
        {value}
      </div>
      <div className="text-[8px] dim kr mt-0.5">{label}</div>
    </div>
  );
}
