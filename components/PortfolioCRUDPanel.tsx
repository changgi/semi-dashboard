"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay, SymbolMeta } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  avg_cost: number;
  currency: "USD" | "KRW";
  is_active: boolean;
}

interface HoldingsResponse {
  success: boolean;
  count: number;
  holdings: Holding[];
}

// ═══════════════════════════════════════════════════════════
export function PortfolioCRUDPanel() {
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    shares: "",
    avg_cost: "",
    currency: "KRW" as "USD" | "KRW",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [indexFilter, setIndexFilter] = useState<"all" | "sp500" | "nasdaq100" | "kospi100" | "semi" | "etf" | "leverage" | "inverse">("all");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data, isLoading } = useSWR<HoldingsResponse>(
    "/api/portfolio-manage",
    fetcher,
    { refreshInterval: 30000 }
  );

  // DB 기반 자동완성 (S&P500 + NASDAQ100 + KOSPI100 + 반도체 전종목)
  const searchUrl = searchQuery.length >= 1
    ? `/api/symbol-search?q=${encodeURIComponent(searchQuery)}&index=${indexFilter}&limit=10`
    : null;
  const { data: searchResults } = useSWR<{ success: boolean; results: SymbolMeta[] }>(
    searchUrl,
    fetcher
  );
  const suggestions = searchResults?.results ?? [];

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const resetForm = () => {
    setForm({ symbol: "", name: "", shares: "", avg_cost: "", currency: "KRW" });
    setSearchQuery("");
    setShowSuggestions(false);
    setEditingId(null);
  };

  const selectSuggestion = (sym: SymbolMeta) => {
    setForm(f => ({
      ...f,
      symbol: sym.symbol,
      name: sym.displayName || sym.name_ko || sym.symbol,
      currency: sym.country === "KR" ? "KRW" : "USD",
    }));
    setSearchQuery(sym.symbol);
    setShowSuggestions(false);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!form.symbol || !form.shares || !form.avg_cost) {
      showMessage("error", "모든 필드 입력 필요 (종목/수량/평단)");
      return;
    }
    if (isSubmitting) return; // 중복 방지
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/portfolio-manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol,
          name: form.name || form.symbol,
          shares: Number(form.shares),
          avg_cost: Number(form.avg_cost),
          currency: form.currency,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // 성공 메시지 먼저 표시 (5초 유지)
        setMessage({ 
          type: "success", 
          text: `✅ ${form.symbol} ${form.shares}주 추가 완료! (ID: ${json.holding?.id ?? "-"})` 
        });
        setTimeout(() => setMessage(null), 5000);
        
        // 1초 후 목록으로 이동 (사용자가 피드백 볼 시간)
        setTimeout(() => {
          resetForm();
          setMode("list");
        }, 800);
        
        // 데이터 갱신
        mutate("/api/portfolio-manage");
        mutate("/api/portfolio");
        mutate("/api/portfolio-consolidated");
        mutate("/api/morning-brief");
      } else {
        showMessage("error", `❌ ${json.error || "추가 실패"}`);
      }
    } catch (e) {
      showMessage("error", `❌ 네트워크 오류: ${(e as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch("/api/portfolio-manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          shares: form.shares ? Number(form.shares) : undefined,
          avg_cost: form.avg_cost ? Number(form.avg_cost) : undefined,
          name: form.name || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showMessage("success", "수정 완료!");
        resetForm();
        setMode("list");
        mutate("/api/portfolio-manage");
        mutate("/api/portfolio");
      } else {
        showMessage("error", json.error);
      }
    } catch (e) {
      showMessage("error", (e as Error).message);
    }
  };

  const handleDelete = async (id: string, symbol: string) => {
    if (!confirm(`${symbol} 종목을 정말 삭제하시겠습니까?\n(비활성화되며 기록은 남습니다)`)) return;
    try {
      const res = await fetch("/api/portfolio-manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) {
        showMessage("success", `${symbol} 삭제 완료`);
        mutate("/api/portfolio-manage");
        mutate("/api/portfolio");
      } else {
        showMessage("error", json.error);
      }
    } catch (e) {
      showMessage("error", (e as Error).message);
    }
  };

  const startEdit = (h: Holding) => {
    setForm({
      symbol: h.symbol,
      name: h.name,
      shares: String(h.shares),
      avg_cost: String(h.avg_cost),
      currency: h.currency,
    });
    setEditingId(h.id);
    setMode("edit");
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            💼 PORTFOLIO MANAGER · 보유종목 관리
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            종목 추가 · 수정 · 삭제 (전 패널 자동 반영)
          </div>
        </div>
        <div className="flex gap-1">
          {mode !== "list" && (
            <button
              onClick={() => { setMode("list"); resetForm(); }}
              className="text-[10px] px-3 py-1 border border-[var(--border)] rounded kr dim"
            >
              ← 목록
            </button>
          )}
          {mode === "list" && (
            <button
              onClick={() => setMode("add")}
              className="text-[10px] px-3 py-1 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
            >
              ＋ 종목 추가
            </button>
          )}
        </div>
      </div>

      {/* 메시지 */}
      {message && (
        <div
          className={`mb-3 p-2 rounded text-[10px] kr ${
            message.type === "success"
              ? "bg-[rgba(0,255,136,0.1)] border border-[#00ff88] up"
              : "bg-[rgba(255,56,96,0.1)] border border-[#ff3860] down"
          }`}
        >
          {message.type === "success" ? "✅" : "❌"} {message.text}
        </div>
      )}

      {/* 리스트 모드 */}
      {mode === "list" && (
        <>
          {isLoading ? (
            <div className="text-center py-10 text-[10px] dim kr">로딩 중...</div>
          ) : (data?.holdings ?? []).length === 0 ? (
            <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
              <div className="text-[24px] mb-2">📝</div>
              <div className="text-[10px] dim kr">보유 종목이 없습니다.</div>
              <div className="text-[9px] dim kr mt-1">＋ 종목 추가 버튼을 눌러 시작하세요</div>
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.holdings ?? []).map((h) => (
                <div
                  key={h.id}
                  className="border border-[var(--border)] rounded p-2 flex items-center justify-between gap-2 flex-wrap"
                >
                  <div className="flex-1 min-w-0">
                    <SymbolDisplay
                      meta={{
                        symbol: h.symbol,
                        displayName: h.name,
                      }}
                      size="sm"
                      variant="inline"
                      showFlag={true}
                      showBadges={false}
                    />
                    <div className="text-[10px] dim kr mt-0.5">
                      {h.shares}주 × 평단 {h.currency === "KRW" ? `₩${h.avg_cost.toLocaleString()}` : `$${h.avg_cost}`} ({h.currency})
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(h)}
                      className="text-[9px] px-2 py-1 border border-[var(--amber-dim)] rounded kr hover:bg-[rgba(255,176,0,0.1)]"
                    >
                      ✏️ 수정
                    </button>
                    <button
                      onClick={() => handleDelete(h.id, h.symbol)}
                      className="text-[9px] px-2 py-1 border border-[#ff3860]/40 text-[#ff3860] rounded kr hover:bg-[rgba(255,56,96,0.1)]"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 추가/수정 모드 - 개선된 UX */}
      {(mode === "add" || mode === "edit") && (
        <div className="space-y-3">

          {/* ═══ STEP 1: 종목 선택 ═══ */}
          {mode === "add" && !form.symbol && (
            <div>
              <div className="text-[11px] tick font-bold kr mb-2">
                📍 STEP 1 · 종목 선택
              </div>
              
              {/* 큰 검색창 (모바일 최적화) */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px]">🔍</div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  autoFocus
                  placeholder="NVDA, 엔비디아, 삼성전자, TIGER..."
                  className="w-full text-[14px] pl-10 pr-3 py-3 bg-black/40 border-2 border-[var(--amber)] rounded-lg kr focus:outline-none"
                />
              </div>
              
              {/* 필터 버튼 (검색창 아래) */}
              <div className="mt-2 flex gap-1 flex-wrap">
                {[
                  { val: "all",        label: "🌐 전체" },
                  { val: "sp500",      label: "🇺🇸 S&P500" },
                  { val: "nasdaq100",  label: "🚀 NDX100" },
                  { val: "kospi100",   label: "🇰🇷 KOSPI100" },
                  { val: "semi",       label: "🎮 반도체" },
                  { val: "etf",        label: "📊 ETF" },
                  { val: "leverage",   label: "⚡ 레버리지" },
                  { val: "inverse",    label: "📉 인버스" },
                ].map(f => (
                  <button
                    key={f.val}
                    onClick={() => setIndexFilter(f.val as any)}
                    className={`text-[10px] px-2.5 py-1.5 border rounded kr ${
                      indexFilter === f.val
                        ? "border-[var(--amber)] bg-[rgba(255,176,0,0.15)] text-[var(--amber)] font-bold"
                        : "border-[var(--border)] dim"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* 검색 결과 */}
              {searchQuery.length >= 1 && suggestions.length > 0 && (
                <div className="mt-2 bg-[#1a1a1a] border border-[var(--border)] rounded max-h-80 overflow-y-auto">
                  {suggestions.map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => selectSuggestion(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[rgba(255,176,0,0.1)] active:bg-[rgba(255,176,0,0.2)] border-b border-[var(--border)]/30 last:border-b-0"
                    >
                      <SymbolDisplay meta={s} size="md" variant="block" showBadges={true} />
                    </button>
                  ))}
                </div>
              )}

              {/* 빠른 선택 - 필터 없을 때만 */}
              {searchQuery.length === 0 && indexFilter === "all" && (
                <div className="mt-3">
                  <div className="text-[9px] dim kr mb-2">💡 빠른 선택 (자주 쓰는 종목)</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { symbol: "NVDA",       label: "엔비디아",  flag: "🇺🇸" },
                      { symbol: "TSM",        label: "TSMC",      flag: "🇹🇼" },
                      { symbol: "AAPL",       label: "애플",      flag: "🇺🇸" },
                      { symbol: "005930.KS",  label: "삼성전자",  flag: "🇰🇷" },
                      { symbol: "000660.KS",  label: "SK하이닉스", flag: "🇰🇷" },
                      { symbol: "360750.KS",  label: "TIGER S&P",  flag: "🇰🇷" },
                    ].map(q => (
                      <button
                        key={q.symbol}
                        onClick={() => {
                          setSearchQuery(q.symbol);
                          setShowSuggestions(true);
                        }}
                        className="text-[10px] px-2 py-2 border border-[var(--border)] rounded kr hover:bg-[rgba(255,176,0,0.08)]"
                      >
                        {q.flag} {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2: 수량/평단 (종목 선택 후 노출) ═══ */}
          {mode === "add" && form.symbol && (
            <>
              {/* 선택된 종목 카드 */}
              <div className="border-2 border-[var(--amber)] bg-[rgba(255,176,0,0.05)] rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] dim kr mb-1">✓ 선택됨</div>
                    <div className="text-[14px] tick font-bold">
                      {form.symbol}
                    </div>
                    <div className="text-[11px] kr mt-0.5">
                      {form.name} · <span className="dim">{form.currency === "KRW" ? "🇰🇷 원화" : "🇺🇸 달러"}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setForm(f => ({ ...f, symbol: "", name: "" }));
                      setSearchQuery("");
                    }}
                    className="text-[10px] px-2 py-1 border border-[var(--border)] rounded kr dim hover:bg-[rgba(255,255,255,0.05)] flex-shrink-0"
                  >
                    🔄 변경
                  </button>
                </div>
              </div>

              <div className="text-[11px] tick font-bold kr">
                📍 STEP 2 · 수량 & 평단
              </div>

              {/* 수량 + 평단 (큰 입력) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] dim kr block mb-1">📦 수량 *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.shares}
                    onChange={(e) => setForm(f => ({ ...f, shares: e.target.value }))}
                    placeholder="10"
                    min="0"
                    step="any"
                    autoFocus
                    className="w-full text-[16px] px-3 py-2.5 bg-black/40 border-2 border-[var(--border)] focus:border-[var(--amber)] rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] dim kr block mb-1">
                    💰 평단 ({form.currency === "KRW" ? "₩" : "$"}) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.avg_cost}
                    onChange={(e) => setForm(f => ({ ...f, avg_cost: e.target.value }))}
                    placeholder={form.currency === "KRW" ? "24460" : "180.50"}
                    min="0"
                    step="any"
                    className="w-full text-[16px] px-3 py-2.5 bg-black/40 border-2 border-[var(--border)] focus:border-[var(--amber)] rounded-lg outline-none"
                  />
                </div>
              </div>

              {/* 통화 변경 (접기, 기본은 자동 결정됨) */}
              <details className="text-[10px] kr">
                <summary className="dim cursor-pointer select-none py-1">
                  ⚙️ 통화 변경 (기본: 자동 선택됨)
                </summary>
                <div className="mt-2 flex gap-2">
                  {(["KRW", "USD"] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, currency: c }))}
                      className={`flex-1 text-[11px] px-3 py-2 border rounded kr ${
                        form.currency === c
                          ? "border-[var(--amber)] bg-[var(--amber)] text-[#111] font-bold"
                          : "border-[var(--border)] dim"
                      }`}
                    >
                      {c === "KRW" ? "🇰🇷 원화" : "🇺🇸 달러"}
                    </button>
                  ))}
                </div>
              </details>

              {/* 큰 추가 버튼 (모바일 최적화) */}
              <button
                onClick={handleAdd}
                disabled={!form.shares || !form.avg_cost || isSubmitting}
                className="w-full text-[14px] px-4 py-3 border-2 border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded-lg kr font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? "⏳ 추가 중..." : "＋ 포트폴리오에 추가"}
              </button>

              {/* 취소 */}
              <button
                onClick={() => { setMode("list"); resetForm(); }}
                className="w-full text-[11px] px-3 py-2 border border-[var(--border)] rounded kr dim"
              >
                취소
              </button>
            </>
          )}

          {/* ═══ 수정 모드 (기존 유지) ═══ */}
          {mode === "edit" && (
            <>
              <div className="text-[11px] tick font-bold kr">✏️ 종목 수정</div>
              <div className="border border-[var(--border)] rounded p-2 bg-black/20">
                <div className="text-[12px] tick font-bold">{form.symbol}</div>
                <div className="text-[10px] kr dim">{form.name}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] dim kr block mb-1">📦 수량 *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.shares}
                    onChange={(e) => setForm(f => ({ ...f, shares: e.target.value }))}
                    min="0"
                    step="any"
                    className="w-full text-[14px] px-3 py-2.5 bg-black/40 border-2 border-[var(--border)] rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] dim kr block mb-1">
                    💰 평단 ({form.currency === "KRW" ? "₩" : "$"}) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.avg_cost}
                    onChange={(e) => setForm(f => ({ ...f, avg_cost: e.target.value }))}
                    min="0"
                    step="any"
                    className="w-full text-[14px] px-3 py-2.5 bg-black/40 border-2 border-[var(--border)] rounded-lg outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleEdit}
                className="w-full text-[14px] px-4 py-3 border-2 border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded-lg kr font-bold"
              >
                ✓ 저장
              </button>
              <button
                onClick={() => { setMode("list"); resetForm(); }}
                className="w-full text-[11px] px-3 py-2 border border-[var(--border)] rounded kr dim"
              >
                취소
              </button>
            </>
          )}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 S&P500 + NASDAQ100 + KOSPI100 + 반도체 통합 검색 · 전 패널 자동 갱신<br />
        🔄 삭제는 soft delete (복구 가능)
      </div>
    </div>
  );
}
