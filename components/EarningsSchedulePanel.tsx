"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay, SymbolMeta } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Earning {
  id: string;
  symbol: string;
  company_name: string;
  earnings_date: string;
  earnings_time: string;
  quarter: string;
  importance: number;
  affected_etfs: string[];
  notes: string;
  is_active: boolean;
  daysUntil?: number;
}

interface GroupedDay {
  date: string;
  events: Earning[];
  totalImportance: number;
  maxImportance: number;
}

interface Data {
  success: boolean;
  count: number;
  earnings: Earning[];
  grouped: GroupedDay[];
  stats: { thisWeek: number; thisMonth: number; highImportance: number };
}

// ═══════════════════════════════════════════════════════════
export function EarningsSchedulePanel() {
  const [mode, setMode] = useState<"calendar" | "add">("calendar");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    company_name: "",
    earnings_date: "",
    earnings_time: "AMC",
    quarter: "Q2 2026",
    importance: 3,
    affected_etfs: [] as string[],
    notes: "",
  });
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data, isLoading } = useSWR<Data>(
    "/api/earnings-schedule",
    fetcher,
    { refreshInterval: 300000 }
  );

  // DB 기반 심볼 검색
  const searchUrlE = searchSymbol.length >= 1
    ? `/api/symbol-search?q=${encodeURIComponent(searchSymbol)}&limit=8`
    : null;
  const { data: searchDataE } = useSWR<{ success: boolean; results: SymbolMeta[] }>(
    searchUrlE,
    fetcher
  );
  const suggestions = searchDataE?.results ?? [];

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleAdd = async () => {
    if (!form.symbol || !form.earnings_date) {
      showMsg("error", "종목 + 날짜 필수");
      return;
    }
    try {
      const res = await fetch("/api/earnings-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        showMsg("success", `${form.symbol} ${form.earnings_date} 추가!`);
        setForm({ symbol: "", company_name: "", earnings_date: "", earnings_time: "AMC", quarter: "Q2 2026", importance: 3, affected_etfs: [], notes: "" });
        setSearchSymbol("");
        setMode("calendar");
        mutate("/api/earnings-schedule");
        mutate("/api/earnings-monitor");
      } else {
        showMsg("error", json.error || "추가 실패");
      }
    } catch (e) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleDelete = async (id: string, symbol: string) => {
    if (!confirm(`${symbol} 실적 일정 삭제?`)) return;
    try {
      const res = await fetch("/api/earnings-schedule", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg("success", "삭제 완료");
        mutate("/api/earnings-schedule");
        mutate("/api/earnings-monitor");
      }
    } catch (e) {
      showMsg("error", (e as Error).message);
    }
  };

  const selectSuggestion = (s: any) => {
    setForm(f => ({
      ...f,
      symbol: s.symbol,
      company_name: s.name,
      affected_etfs: s.relatedEtfs ?? [],
    }));
    setSearchSymbol(s.symbol);
    setShowSuggestions(false);
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📅 EARNINGS SCHEDULE · 실적 일정 관리
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            실적 일정 추가/삭제 · 전 패널 자동 반영
          </div>
        </div>
        <div className="flex gap-1">
          {mode === "add" ? (
            <button
              onClick={() => setMode("calendar")}
              className="text-[10px] px-3 py-1 border border-[var(--border)] rounded kr dim"
            >
              ← 캘린더
            </button>
          ) : (
            <button
              onClick={() => setMode("add")}
              className="text-[10px] px-3 py-1 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
            >
              ＋ 일정 추가
            </button>
          )}
        </div>
      </div>

      {/* 메시지 */}
      {msg && (
        <div className={`mb-3 p-2 rounded text-[10px] kr ${
          msg.type === "success" ? "bg-[rgba(0,255,136,0.1)] border border-[#00ff88] up" : "bg-[rgba(255,56,96,0.1)] border border-[#ff3860] down"
        }`}>
          {msg.type === "success" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* 통계 */}
      {mode === "calendar" && data?.stats && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatChip label="이번 주" value={data.stats.thisWeek} color="#ff6644" />
          <StatChip label="이번 달" value={data.stats.thisMonth} color="#ffaa44" />
          <StatChip label="중요도 4+" value={data.stats.highImportance} color="#ff3860" suffix="건" />
        </div>
      )}

      {/* 캘린더 모드 */}
      {mode === "calendar" && (
        <>
          {isLoading ? (
            <div className="text-center py-8 text-[10px] dim kr">로딩 중...</div>
          ) : !data?.grouped?.length ? (
            <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
              <div className="text-[24px] mb-2">📭</div>
              <div className="text-[10px] dim kr">등록된 실적 일정 없음</div>
              <div className="text-[9px] dim kr mt-1">"＋ 일정 추가" 버튼으로 시작</div>
            </div>
          ) : (
            <div className="space-y-2">
              {(data.grouped ?? []).map(day => {
                const dayObj = new Date(day.date);
                const weekday = ["일", "월", "화", "수", "목", "금", "토"][dayObj.getDay()];
                const daysUntil = day.events[0]?.daysUntil ?? 0;
                
                const bgColor = day.maxImportance >= 5 ? "rgba(255,56,96,0.05)" : day.maxImportance >= 4 ? "rgba(255,170,68,0.05)" : "transparent";
                const borderColor = day.maxImportance >= 5 ? "#ff3860" : day.maxImportance >= 4 ? "#ffaa44" : "var(--border)";
                
                return (
                  <div key={day.date} className="border-l-4 rounded-r p-2" style={{ borderLeftColor: borderColor, background: bgColor }}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[11px] tick font-bold">
                        {daysUntil < 0 ? `${Math.abs(daysUntil)}일 전` : daysUntil === 0 ? "오늘!" : `D-${daysUntil}`}
                      </span>
                      <span className="text-[11px] kr">{day.date} ({weekday})</span>
                      <span className="text-[9px] dim kr">· {day.events.length}건</span>
                    </div>
                    {day.events.map(e => (
                      <div key={e.id} className="flex items-center justify-between gap-2 py-1 border-t border-[var(--border)]/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="tick font-bold text-[11px]">{e.symbol}</span>
                            <span className="text-[10px] kr">{e.company_name}</span>
                            <span className="text-[9px] dim">{e.quarter}</span>
                            <span className="text-[8px] px-1 bg-[var(--amber-dim)] text-white rounded">
                              {e.earnings_time}
                            </span>
                            <span>{"★".repeat(e.importance)}</span>
                          </div>
                          {e.notes && <div className="text-[9px] dim kr mt-0.5">{e.notes}</div>}
                          {e.affected_etfs?.length > 0 && (
                            <div className="text-[8px] dim mt-0.5">
                              영향: {e.affected_etfs.join(", ")}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(e.id, e.symbol)}
                          className="text-[9px] px-1.5 py-0.5 border border-[#ff3860]/40 text-[#ff3860] rounded hover:bg-[rgba(255,56,96,0.1)] flex-shrink-0"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 추가 모드 */}
      {mode === "add" && (
        <div className="space-y-3">
          <div className="text-[11px] tick font-bold kr">＋ 새 실적 일정 추가</div>
          
          {/* 심볼 검색 */}
          <div className="relative">
            <label className="text-[9px] dim kr block mb-1">종목 검색</label>
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => {
                setSearchSymbol(e.target.value);
                setShowSuggestions(true);
                setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }));
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="NVDA, TSMC, 삼성전자..."
              className="w-full text-[11px] px-2 py-2 bg-black/40 border border-[var(--border)] rounded kr"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[var(--border)] rounded max-h-64 overflow-y-auto z-10 shadow-lg">
                {suggestions.map(s => (
                  <button
                    key={s.symbol}
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-2 py-2 hover:bg-[rgba(255,176,0,0.1)] border-b border-[var(--border)]/30"
                  >
                    <SymbolDisplay meta={s} size="sm" variant="block" showBadges={true} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 날짜 + 시점 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] dim kr block mb-1">실적 날짜</label>
              <input
                type="date"
                value={form.earnings_date}
                onChange={(e) => setForm(f => ({ ...f, earnings_date: e.target.value }))}
                className="w-full text-[11px] px-2 py-2 bg-black/40 border border-[var(--border)] rounded"
              />
            </div>
            <div>
              <label className="text-[9px] dim kr block mb-1">발표 시점</label>
              <select
                value={form.earnings_time}
                onChange={(e) => setForm(f => ({ ...f, earnings_time: e.target.value }))}
                className="w-full text-[11px] px-2 py-2 bg-black/40 border border-[var(--border)] rounded kr"
              >
                <option value="BMO">BMO (장시작 전)</option>
                <option value="AMC">AMC (마감 후)</option>
                <option value="Morning KST">한국 오전</option>
                <option value="Evening KST">한국 저녁</option>
              </select>
            </div>
          </div>

          {/* 분기 + 중요도 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] dim kr block mb-1">분기</label>
              <input
                type="text"
                value={form.quarter}
                onChange={(e) => setForm(f => ({ ...f, quarter: e.target.value }))}
                placeholder="Q2 2026"
                className="w-full text-[11px] px-2 py-2 bg-black/40 border border-[var(--border)] rounded"
              />
            </div>
            <div>
              <label className="text-[9px] dim kr block mb-1">중요도 (1-5)</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm(f => ({ ...f, importance: n }))}
                    className={`flex-1 py-1 text-[12px] rounded ${
                      form.importance === n 
                        ? "bg-[var(--amber)] text-[#111] font-bold" 
                        : "border border-[var(--border)] dim"
                    }`}
                  >
                    {"★".repeat(n)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-[9px] dim kr block mb-1">메모 (선택)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="예: HBM 주문량 주목"
              className="w-full text-[11px] px-2 py-2 bg-black/40 border border-[var(--border)] rounded kr"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 text-[11px] px-3 py-2 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
            >
              ＋ 추가
            </button>
            <button
              onClick={() => setMode("calendar")}
              className="text-[11px] px-3 py-2 border border-[var(--border)] rounded kr dim"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 Earnings Monitor, Morning Brief 등에 자동 반영<br />
        📊 5분마다 자동 갱신
      </div>
    </div>
  );
}

function StatChip({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <div className="border rounded p-2 text-center" style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[16px] font-bold" style={{ color }}>
        {value}{suffix || ""}
      </div>
    </div>
  );
}
