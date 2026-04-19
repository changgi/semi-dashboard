"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { SkeletonBar, SkeletonCards, SkeletonTable } from "./Skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface Holding {
  id: number;
  symbol: string;
  name: string | null;
  shares: number;
  avgCost: number;
  currentPrice: number | null;
  currency: string;
  purchaseDate: string | null;
  notes: string | null;
  dayChangePct: number | null;
  cost: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  marketValueUsd: number;
  costUsd: number;
  daysHeld: number | null;
}

interface PortfolioData {
  success: boolean;
  holdings: Holding[];
  summary: {
    totalValue: number;
    totalCost: number;
    totalGain: number;
    totalGainPct: number;
    holdingCount: number;
    dayChangePct: number;
    usdKrwRate: number;
    topWinner: { symbol: string; gainPct: number } | null;
    topLoser: { symbol: string; gainPct: number } | null;
  };
  sectorBreakdown: Array<{
    symbol: string;
    name: string | null;
    weight: number;
    gainPct: number;
  }>;
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function PortfolioPanel() {
  const { data, isLoading } = useSWR<PortfolioData>("/api/portfolio", fetcher, {
    refreshInterval: 60000, // 1분
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("이 종목을 포트폴리오에서 제거하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" });
      const r = await res.json();
      if (r.success) {
        mutate("/api/portfolio");
      } else {
        alert("제거 실패: " + r.error);
      }
    } catch (e) {
      alert("오류: " + String(e));
    }
  };

  const formatPrice = (price: number, currency: string) => {
    if (currency === "KRW") {
      return `₩${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            💼 MY PORTFOLIO · 포트폴리오 추적
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            실제 보유 종목 실시간 수익률 · USD/KRW 통합 평가 · 1분 자동 갱신
          </div>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowAddForm(!showAddForm);
          }}
          className="px-3 py-1 text-[10px] border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)]"
        >
          {showAddForm ? "✕ 취소" : "+ 종목 추가"}
        </button>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <AddHoldingForm
          editingHolding={editingId ? data?.holdings.find((h) => h.id === editingId) : null}
          onSuccess={() => {
            setShowAddForm(false);
            setEditingId(null);
            mutate("/api/portfolio");
          }}
        />
      )}

      {/* 로딩 */}
      {isLoading && (
        <div>
          <SkeletonCards count={4} />
          <div className="mt-3">
            <SkeletonBar className="w-32 h-3 mb-2" />
            <SkeletonBar className="w-full h-3 mb-3" />
            <SkeletonTable cols={10} rows={3} />
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {!isLoading && data?.holdings.length === 0 && !showAddForm && (
        <div className="text-center py-8">
          <div className="text-[11px] dim kr mb-2">💼 포트폴리오가 비어있습니다</div>
          <div className="text-[9px] dim kr mb-3">
            &quot;+ 종목 추가&quot; 버튼을 눌러 보유 종목을 입력하세요
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 text-[10px] border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)]"
          >
            첫 종목 추가하기
          </button>
        </div>
      )}

      {/* 포트폴리오 데이터 */}
      {!isLoading && data?.success && data.holdings.length > 0 && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="border border-[var(--amber)] bg-[rgba(255,176,0,0.05)] rounded p-2">
              <div className="text-[8px] dim kr">총 평가액 (USD 환산)</div>
              <div className="text-[16px] sm:text-[22px] font-bold tick">
                ${data.summary.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="text-[7px] dim kr">
                ₩{(data.summary.totalValue * data.summary.usdKrwRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 상당
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="text-[8px] dim kr">총 수익 / 손실</div>
              <div
                className={`text-[16px] sm:text-[22px] font-bold ${
                  data.summary.totalGain >= 0 ? "up" : "down"
                }`}
              >
                {data.summary.totalGain >= 0 ? "+" : ""}${data.summary.totalGain.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className={`text-[10px] font-bold ${data.summary.totalGainPct >= 0 ? "up" : "down"}`}>
                {data.summary.totalGainPct >= 0 ? "+" : ""}
                {data.summary.totalGainPct.toFixed(2)}%
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="text-[8px] dim kr">일별 변동</div>
              <div
                className={`text-[16px] sm:text-[22px] font-bold ${
                  data.summary.dayChangePct >= 0 ? "up" : "down"
                }`}
              >
                {data.summary.dayChangePct >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(data.summary.dayChangePct).toFixed(2)}%
              </div>
              <div className="text-[7px] dim kr">가중평균 (비중 반영)</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="text-[8px] dim kr">보유 종목</div>
              <div className="text-[16px] sm:text-[22px] font-bold tick">
                {data.summary.holdingCount}개
              </div>
              <div className="text-[7px] dim kr flex items-center gap-1">
                {data.summary.topWinner && (
                  <span className="up">🏆 {data.summary.topWinner.symbol}</span>
                )}
                {data.summary.topLoser && (
                  <span className="down">⚠ {data.summary.topLoser.symbol}</span>
                )}
              </div>
            </div>
          </div>

          {/* 섹터 분포 바 */}
          {data.sectorBreakdown.length > 0 && (
            <div className="mb-4">
              <div className="text-[9px] dim kr mb-1">📊 종목별 비중</div>
              <div className="flex h-3 rounded overflow-hidden border border-[var(--border)]">
                {data.sectorBreakdown.map((s, i) => {
                  const colors = [
                    "bg-[#ffb000]", "bg-[#00ff88]", "bg-[#aaccff]",
                    "bg-[#ff8888]", "bg-[#ee99ff]", "bg-[#88ddcc]",
                    "bg-[#ddcc88]", "bg-[#cc88dd]",
                  ];
                  return (
                    <div
                      key={s.symbol}
                      className={`${colors[i % colors.length]} text-[7px] text-[#111] text-center font-bold overflow-hidden whitespace-nowrap`}
                      style={{ width: `${s.weight}%` }}
                      title={`${s.symbol}: ${s.weight.toFixed(1)}%`}
                    >
                      {s.weight > 8 ? s.symbol : ""}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 mt-1 text-[7px]">
                {data.sectorBreakdown.slice(0, 8).map((s) => (
                  <span key={s.symbol} className="dim">
                    <span className="tick">{s.symbol}</span>: {s.weight.toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 종목 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] sm:text-[10px]">
              <thead>
                <tr className="border-b border-[var(--border)] dim">
                  <th className="text-left py-1.5 px-2">심볼</th>
                  <th className="text-left py-1.5 px-2 kr">종목명</th>
                  <th className="text-right py-1.5 px-2 kr">수량</th>
                  <th className="text-right py-1.5 px-2 kr">평균단가</th>
                  <th className="text-right py-1.5 px-2 kr">현재가</th>
                  <th className="text-right py-1.5 px-2 kr">일변동</th>
                  <th className="text-right py-1.5 px-2 kr">평가액</th>
                  <th className="text-right py-1.5 px-2 kr">손익</th>
                  <th className="text-right py-1.5 px-2 kr">수익률</th>
                  <th className="text-right py-1.5 px-2 kr">보유일</th>
                  <th className="text-center py-1.5 px-2 kr">작업</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--border)] data-row">
                    <td className="py-1.5 px-2 tick font-bold">{h.symbol}</td>
                    <td className="py-1.5 px-2 dim kr truncate max-w-[100px]">
                      {h.name || "—"}
                    </td>
                    <td className="text-right py-1.5 px-2 dim">{h.shares}</td>
                    <td className="text-right py-1.5 px-2">
                      {formatPrice(h.avgCost, h.currency)}
                    </td>
                    <td className="text-right py-1.5 px-2 tick">
                      {h.currentPrice !== null ? formatPrice(h.currentPrice, h.currency) : "—"}
                    </td>
                    <td
                      className={`text-right py-1.5 px-2 ${
                        (h.dayChangePct ?? 0) >= 0 ? "up" : "down"
                      }`}
                    >
                      {h.dayChangePct !== null
                        ? `${h.dayChangePct >= 0 ? "+" : ""}${h.dayChangePct.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="text-right py-1.5 px-2 tick">
                      {formatPrice(h.marketValue, h.currency)}
                    </td>
                    <td
                      className={`text-right py-1.5 px-2 font-bold ${
                        h.gain >= 0 ? "up" : "down"
                      }`}
                    >
                      {h.gain >= 0 ? "+" : ""}
                      {formatPrice(Math.abs(h.gain), h.currency).replace("$", h.gain >= 0 ? "+$" : "-$").replace("₩", h.gain >= 0 ? "+₩" : "-₩")}
                    </td>
                    <td
                      className={`text-right py-1.5 px-2 font-bold ${
                        h.gainPct >= 0 ? "up" : "down"
                      }`}
                    >
                      {h.gainPct >= 0 ? "+" : ""}
                      {h.gainPct.toFixed(2)}%
                    </td>
                    <td className="text-right py-1.5 px-2 dim text-[8px]">
                      {h.daysHeld !== null ? `${h.daysHeld}일` : "—"}
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => {
                            setEditingId(h.id);
                            setShowAddForm(true);
                          }}
                          className="text-[var(--amber)] hover:bright"
                          title="수정"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDelete(h.id)}
                          className="text-[#ff8888] hover:text-[#ff3860]"
                          title="삭제"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 해석 */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
            💡 <span className="bright">활용법</span>: 매수 직후 입력하면 수익률 자동 추적.
            USD/KRW 환율은 한국 종목을 USD로 환산할 때 사용됩니다.
            현재 환율: ₩{data.summary.usdKrwRate.toFixed(0)}/$
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 보유 종목 추가/수정 폼
// ═══════════════════════════════════════════════════════════
function AddHoldingForm({
  editingHolding,
  onSuccess,
}: {
  editingHolding?: Holding | null;
  onSuccess: () => void;
}) {
  const [symbol, setSymbol] = useState(editingHolding?.symbol || "");
  const [name, setName] = useState(editingHolding?.name || "");
  const [shares, setShares] = useState(editingHolding?.shares.toString() || "");
  const [avgCost, setAvgCost] = useState(editingHolding?.avgCost.toString() || "");
  const [currency, setCurrency] = useState(editingHolding?.currency || "USD");
  const [purchaseDate, setPurchaseDate] = useState(editingHolding?.purchaseDate || "");
  const [notes, setNotes] = useState(editingHolding?.notes || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!symbol || !shares || !avgCost) {
      alert("심볼, 수량, 평균단가는 필수입니다");
      return;
    }

    setLoading(true);
    try {
      const body = {
        id: editingHolding?.id,
        symbol: symbol.toUpperCase(),
        name: name || null,
        shares: parseFloat(shares),
        avgCost: parseFloat(avgCost),
        currency,
        purchaseDate: purchaseDate || null,
        notes: notes || null,
      };
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const r = await res.json();
      if (r.success) {
        // 심볼이 자동 보정된 경우 알림
        if (r.symbolNormalized && r.holding?.symbol) {
          alert(
            `✅ 추가 완료!\n\n입력: ${symbol}\n자동 보정: ${r.holding.symbol}\n\n${r.normalizationReason || ""}`
          );
        }
        onSuccess();
      } else {
        alert("실패: " + r.error);
      }
    } catch (e) {
      alert("오류: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  // 심볼 자동 추정 (입력 중 실시간 경고)
  const symbolWarning = (() => {
    const upper = symbol.toUpperCase().trim();
    if (!upper) return null;
    if (upper.includes(".") || upper.startsWith("^")) return null;
    if (currency === "KRW" && /^\d{6}$/.test(upper)) {
      return { type: "info", msg: `→ 자동 보정: ${upper}.KS (한국 KOSPI)` };
    }
    if (currency === "USD" && /^\d+$/.test(upper)) {
      return { type: "warning", msg: "⚠️ 숫자만 있는 심볼이 USD로 설정됐어요. 한국 종목이면 통화를 KRW로 변경하세요" };
    }
    return null;
  })();

  // 빠른 추천 종목
  const quickSymbols = [
    // 미국 반도체
    { sym: "NVDA", name: "NVIDIA", cur: "USD" },
    { sym: "TSM", name: "TSMC", cur: "USD" },
    { sym: "MU", name: "Micron", cur: "USD" },
    { sym: "AVGO", name: "Broadcom", cur: "USD" },
    { sym: "SMH", name: "SMH ETF", cur: "USD" },
    // 한국 주요
    { sym: "005930.KS", name: "삼성전자", cur: "KRW" },
    { sym: "000660.KS", name: "SK하이닉스", cur: "KRW" },
    { sym: "042700.KS", name: "한미반도체", cur: "KRW" },
    // 한국 인기 ETF
    { sym: "360750.KS", name: "TIGER 미국S&P500", cur: "KRW" },
    { sym: "379800.KS", name: "KODEX 미국S&P500", cur: "KRW" },
    { sym: "091170.KS", name: "KODEX 반도체", cur: "KRW" },
    { sym: "381170.KS", name: "TIGER 미국테크TOP10", cur: "KRW" },
  ];

  return (
    <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3 mb-3">
      <div className="text-[10px] tick mb-2 kr">
        {editingHolding ? "✎ 종목 수정" : "+ 새 종목 추가"}
      </div>

      {/* 빠른 선택 */}
      {!editingHolding && (
        <div className="mb-2">
          <div className="text-[8px] dim kr mb-1">빠른 선택:</div>
          <div className="flex flex-wrap gap-1">
            {quickSymbols.map((q) => (
              <button
                key={q.sym}
                onClick={() => {
                  setSymbol(q.sym);
                  setName(q.name);
                  setCurrency(q.cur);
                }}
                className="text-[8px] px-2 py-0.5 border border-[var(--border)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
              >
                {q.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[8px] dim kr">심볼 *</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="NVDA, 005930.KS"
            className={`w-full bg-[var(--bg)] border px-2 py-1 text-[10px] ${
              symbolWarning?.type === "warning"
                ? "border-[#ff3860] text-[#ff3860]"
                : symbolWarning?.type === "info"
                ? "border-[#00ff88] text-[#00ff88]"
                : "border-[var(--border)] text-[var(--amber)]"
            }`}
          />
          {symbolWarning && (
            <div
              className={`text-[8px] mt-0.5 kr leading-tight ${
                symbolWarning.type === "warning" ? "text-[#ff3860]" : "text-[#00ff88]"
              }`}
            >
              {symbolWarning.msg}
            </div>
          )}
        </div>
        <div>
          <label className="text-[8px] dim kr">종목명 (선택)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="NVIDIA"
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          />
        </div>
        <div>
          <label className="text-[8px] dim kr">수량 *</label>
          <input
            type="number"
            step="0.0001"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="10"
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          />
        </div>
        <div>
          <label className="text-[8px] dim kr">평균단가 *</label>
          <input
            type="number"
            step="0.01"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder={currency === "KRW" ? "216000" : "180.50"}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          />
        </div>
        <div>
          <label className="text-[8px] dim kr">통화</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            <option value="USD">USD ($)</option>
            <option value="KRW">KRW (₩)</option>
          </select>
        </div>
        <div>
          <label className="text-[8px] dim kr">매수일 (선택)</label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[8px] dim kr">메모 (선택)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="투자 논리, 목표가 등"
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-3 py-1 text-[10px] bg-[var(--amber)] text-[#111] hover:bg-[#e09900] disabled:opacity-50 font-bold"
        >
          {loading ? "저장 중..." : editingHolding ? "수정 저장" : "추가"}
        </button>
      </div>
    </div>
  );
}
