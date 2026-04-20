"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface PriceAlert {
  id: number;
  symbol: string;
  name: string | null;
  conditionType: "above" | "below" | "pct_change";
  targetValue: number;
  referencePrice: number | null;
  currency: string;
  note: string | null;
  isActive: boolean;
  isOneTime: boolean;
  createdAt: string;
  currentPrice: number | null;
  dayChangePct: number | null;
  progress: number | null;
  isTriggered: boolean;
  distanceFromTarget: number | null;
}

interface AlertData {
  success: boolean;
  alerts: PriceAlert[];
  triggered: PriceAlert[];
}

// ───────────────────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────────────────
function formatPrice(v: number, currency: string): string {
  if (currency === "KRW") {
    return `₩${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `$${v.toFixed(2)}`;
}

function getConditionLabel(type: string, target: number, currency: string): string {
  if (type === "above") return `≥ ${formatPrice(target, currency)}`;
  if (type === "below") return `≤ ${formatPrice(target, currency)}`;
  if (type === "pct_change") return `${target >= 0 ? "+" : ""}${target}%`;
  return type;
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function PriceAlertsPanel() {
  const { data, isLoading } = useSWR<AlertData>("/api/price-alerts", fetcher, {
    refreshInterval: 60000, // 1분
  });

  const [showForm, setShowForm] = useState(false);

  const handleDelete = async (id: number) => {
    if (!confirm("이 알림을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/price-alerts?id=${id}`, { method: "DELETE" });
      const r = await res.json();
      if (r.success) {
        mutate("/api/price-alerts");
      }
    } catch (e) {
      alert("오류: " + String(e));
    }
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🔔 PRICE ALERTS · 가격 알림
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            조건부 알림 · 특정 가격 도달 시 자동 감지 · 1분 자동 체크
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1 text-[10px] border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)]"
        >
          {showForm ? "✕ 취소" : "+ 알림 추가"}
        </button>
      </div>

      {/* 추가 폼 */}
      {showForm && (
        <AddAlertForm onSuccess={() => { setShowForm(false); mutate("/api/price-alerts"); }} />
      )}

      {isLoading ? (
        <div className="text-[10px] dim text-center py-6 kr">알림 로딩 중...</div>
      ) : !data?.success ? (
        <div className="text-[10px] dim text-center py-6 kr">데이터 로드 실패</div>
      ) : (
        <>
          {/* 발동된 알림 (우선 표시) */}
          {(data.triggered?.length ?? 0) > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-[#ff8844] font-bold kr mb-2 flex items-center gap-2">
                🚨 발동된 알림 ({data.triggered.length}건)
              </div>
              <div className="space-y-1.5">
                {(data.triggered ?? []).map((a) => (
                  <TriggeredAlertRow key={a.id} alert={a} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {/* 대기 중인 알림 */}
          {(data.alerts?.length ?? 0) > 0 && (
            <div>
              <div className="text-[9px] dim kr mb-2">
                📍 대기 중인 알림 ({data.alerts.length}건)
              </div>
              <div className="space-y-1.5">
                {(data.alerts ?? []).map((a) => (
                  <PendingAlertRow key={a.id} alert={a} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {/* 빈 상태 */}
          {(data.alerts?.length ?? 0) === 0 && (data.triggered?.length ?? 0) === 0 && (
            <div className="text-center py-8 border border-dashed border-[var(--border)] rounded">
              <div className="text-[20px] mb-2">🔔</div>
              <div className="text-[10px] dim kr">설정된 알림이 없습니다</div>
              <div className="text-[9px] dim kr mt-1">
                &quot;+ 알림 추가&quot;를 클릭해서 가격 조건을 설정하세요
              </div>
            </div>
          )}

          {/* 활용 팁 */}
          <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
            💡 <span className="bright">사용 예시</span>:<br />
            · NVDA $180 이하 돌파 시 → 역발상 매수 시점<br />
            · SK하이닉스 -5% 하락 시 → Daniel Yoo 저가 매수 진입<br />
            · SMH $280 이상 돌파 시 → 강세 추세 확정
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 대기 중인 알림 행
// ═══════════════════════════════════════════════════════════
function PendingAlertRow({
  alert,
  onDelete,
}: {
  alert: PriceAlert;
  onDelete: (id: number) => void;
}) {
  const conditionIcon =
    alert.conditionType === "above" ? "📈" :
    alert.conditionType === "below" ? "📉" :
    "📊";

  const conditionColor =
    alert.conditionType === "above" ? "text-[#00ff88]" :
    alert.conditionType === "below" ? "text-[#ff3860]" :
    "text-[var(--amber)]";

  return (
    <div className="border border-[var(--border)] rounded p-2 hover:border-[var(--amber-dim)] transition-colors">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="tick font-bold text-[10px]">{alert.symbol}</span>
          {alert.name && alert.name !== alert.symbol && (
            <span className="text-[8px] dim kr truncate max-w-[100px]">{alert.name}</span>
          )}
          <span className={`text-[10px] font-bold ${conditionColor}`}>
            {conditionIcon} {getConditionLabel(alert.conditionType, alert.targetValue, alert.currency)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={`/stock/${encodeURIComponent(alert.symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] text-[var(--amber)] hover:bright"
            title="종목 분석"
          >
            🔍
          </a>
          <button
            onClick={() => onDelete(alert.id)}
            className="text-[#ff8888] hover:text-[#ff3860] text-[10px]"
            title="삭제"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[9px]">
        <span className="dim">현재:</span>
        <span className="tick font-bold">
          {alert.currentPrice !== null ? formatPrice(alert.currentPrice, alert.currency) : "—"}
        </span>
        {alert.dayChangePct !== null && (
          <span className={alert.dayChangePct >= 0 ? "up" : "down"}>
            ({alert.dayChangePct >= 0 ? "+" : ""}
            {alert.dayChangePct.toFixed(2)}%)
          </span>
        )}
        {alert.distanceFromTarget !== null && (
          <span className="ml-auto dim text-[8px] kr">
            목표까지: {alert.conditionType === "pct_change"
              ? `${alert.distanceFromTarget.toFixed(2)}%`
              : formatPrice(Math.abs(alert.distanceFromTarget), alert.currency)}
          </span>
        )}
      </div>

      {/* 진행률 바 */}
      {alert.progress !== null && (
        <div className="mt-1.5">
          <div className="h-1 bg-[var(--border)] rounded overflow-hidden">
            <div
              className={`h-full transition-all ${
                alert.progress > 80 ? "bg-[#ff8844]" :
                alert.progress > 50 ? "bg-[var(--amber)]" :
                "bg-[#00aaff]"
              }`}
              style={{ width: `${alert.progress}%` }}
            />
          </div>
          <div className="text-[7px] dim mt-0.5 kr">
            진행률 {alert.progress.toFixed(0)}%
          </div>
        </div>
      )}

      {alert.note && (
        <div className="text-[8px] dim kr mt-1 italic truncate">📝 {alert.note}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 발동된 알림 행
// ═══════════════════════════════════════════════════════════
function TriggeredAlertRow({
  alert,
  onDelete,
}: {
  alert: PriceAlert;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="border border-[#ff8844] bg-[rgba(255,136,68,0.08)] rounded p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-[#ff8844] text-[11px]">🚨</span>
          <span className="tick font-bold text-[10px]">{alert.symbol}</span>
          {alert.name && alert.name !== alert.symbol && (
            <span className="text-[8px] dim kr truncate max-w-[100px]">{alert.name}</span>
          )}
          <span className="text-[10px] font-bold text-[#ff8844]">
            조건 충족!
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={`/stock/${encodeURIComponent(alert.symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] px-2 py-0.5 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)]"
            title="지금 분석하기"
          >
            🔍 분석
          </a>
          <button
            onClick={() => onDelete(alert.id)}
            className="text-[#ff8888] hover:text-[#ff3860] text-[10px]"
            title="삭제"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="text-[9px] mt-1 kr">
        <span className="dim">조건:</span>{" "}
        <span className="bright">
          {getConditionLabel(alert.conditionType, alert.targetValue, alert.currency)}
        </span>
        <span className="dim mx-2">│</span>
        <span className="dim">현재:</span>{" "}
        <span className="text-[#ff8844] font-bold">
          {alert.currentPrice !== null ? formatPrice(alert.currentPrice, alert.currency) : "—"}
        </span>
      </div>

      {alert.note && (
        <div className="text-[8px] dim kr mt-1 italic">📝 {alert.note}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 알림 추가 폼
// ═══════════════════════════════════════════════════════════
function AddAlertForm({ onSuccess }: { onSuccess: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [conditionType, setConditionType] = useState<"above" | "below" | "pct_change">("below");
  const [targetValue, setTargetValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!symbol || !targetValue) {
      alert("심볼과 목표값은 필수입니다");
      return;
    }

    setLoading(true);
    try {
      const body = {
        symbol: symbol.toUpperCase(),
        conditionType,
        targetValue: parseFloat(targetValue),
        currency,
        note: note || null,
      };
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const r = await res.json();
      if (r.success) {
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

  // 빠른 조건 프리셋
  const presets = [
    { label: "NVDA $180 이하", symbol: "NVDA", condition: "below", target: "180", currency: "USD" },
    { label: "NVDA $220 이상", symbol: "NVDA", condition: "above", target: "220", currency: "USD" },
    { label: "SK하이닉스 -5%", symbol: "000660.KS", condition: "pct_change", target: "-5", currency: "KRW" },
    { label: "삼성전자 ₩250,000", symbol: "005930.KS", condition: "above", target: "250000", currency: "KRW" },
    { label: "SMH $300 돌파", symbol: "SMH", condition: "above", target: "300", currency: "USD" },
  ];

  return (
    <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3 mb-3">
      <div className="text-[10px] tick mb-2 kr">+ 새 가격 알림</div>

      {/* 프리셋 */}
      <div className="mb-2">
        <div className="text-[8px] dim kr mb-1">⚡ 빠른 설정:</div>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setSymbol(p.symbol);
                setConditionType(p.condition as "above" | "below" | "pct_change");
                setTargetValue(p.target);
                setCurrency(p.currency);
              }}
              className="text-[8px] px-2 py-0.5 border border-[var(--border)] hover:border-[var(--amber)] hover:text-[var(--amber)] kr"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[8px] dim kr">심볼 *</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="NVDA, 005930.KS"
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          />
        </div>
        <div>
          <label className="text-[8px] dim kr">조건 *</label>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as "above" | "below" | "pct_change")}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            <option value="below">≤ 이하</option>
            <option value="above">≥ 이상</option>
            <option value="pct_change">± 변동%</option>
          </select>
        </div>
        <div>
          <label className="text-[8px] dim kr">
            {conditionType === "pct_change" ? "변동률(%)" : "목표가"} *
          </label>
          <input
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder={conditionType === "pct_change" ? "-5 또는 10" : "180"}
            step="any"
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
            <option>USD</option>
            <option>KRW</option>
          </select>
        </div>
      </div>

      <div className="mt-2">
        <label className="text-[8px] dim kr">메모 (선택)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="역발상 매수 시점, Daniel Yoo 저가 진입 등"
          className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
        />
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-1.5 text-[10px] border border-[var(--amber)] bg-[var(--amber)] text-[#111] font-bold hover:bg-[#e09900]"
        >
          {loading ? "추가 중..." : "🔔 알림 설정"}
        </button>
      </div>
    </div>
  );
}
