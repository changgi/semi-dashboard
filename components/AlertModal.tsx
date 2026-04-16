"use client";

import { useEffect, useState } from "react";
import type { Alert } from "@/lib/types";
import { fmtPrice } from "@/lib/format";

export function AlertModal({
  symbol,
  currentPrice,
  onClose,
}: {
  symbol: string;
  currentPrice: number | null;
  onClose: () => void;
}) {
  const [condition, setCondition] = useState<"above" | "below" | "change_up" | "change_down">("above");
  const [threshold, setThreshold] = useState<string>(
    currentPrice ? currentPrice.toFixed(2) : ""
  );
  const [email, setEmail] = useState("");
  const [existing, setExisting] = useState<Alert[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setExisting(res.data.filter((a: Alert) => a.symbol === symbol));
        }
      });
  }, [symbol]);

  const submit = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          condition,
          threshold: parseFloat(threshold),
          email: email || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("✓ ALERT CREATED");
        setExisting([data.data, ...existing]);
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (e) {
      setMessage("✗ Network error");
    }
    setSubmitting(false);
  };

  const deleteAlert = async (id: string) => {
    const res = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setExisting(existing.filter((a) => a.id !== id));
    }
  };

  const conditionLabel = (c: string) => {
    switch (c) {
      case "above": return "↗ 가격 이상";
      case "below": return "↘ 가격 이하";
      case "change_up": return "▲ 상승률 도달";
      case "change_down": return "▼ 하락률 도달";
      default: return c;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel p-6 w-[520px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="section-title">CREATE ALERT · {symbol}</div>
            {currentPrice && (
              <div className="mt-2 text-[11px] dim">
                CURRENT PRICE: <span className="bright">${fmtPrice(currentPrice)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="dim hover:text-white text-lg">
            ×
          </button>
        </div>

        {/* 조건 선택 */}
        <div className="mb-4">
          <div className="text-[10px] dim tracking-widest mb-2">CONDITION</div>
          <div className="grid grid-cols-2 gap-2">
            {(["above", "below", "change_up", "change_down"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCondition(c)}
                className={`p-3 text-[11px] border ${
                  condition === c
                    ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)]"
                    : "border-[var(--border)] dim hover:border-[var(--border-bright)]"
                }`}
              >
                {conditionLabel(c)}
              </button>
            ))}
          </div>
        </div>

        {/* 임계값 */}
        <div className="mb-4">
          <div className="text-[10px] dim tracking-widest mb-2">
            {condition.startsWith("change") ? "PERCENT (%)" : "PRICE (USD)"}
          </div>
          <input
            type="number"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border-bright)] px-3 py-2 text-[13px] bright font-mono focus:outline-none focus:border-[var(--amber)]"
          />
        </div>

        {/* 이메일 */}
        <div className="mb-6">
          <div className="text-[10px] dim tracking-widest mb-2">EMAIL (OPTIONAL)</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full bg-[var(--bg)] border border-[var(--border-bright)] px-3 py-2 text-[12px] bright font-mono focus:outline-none focus:border-[var(--amber)]"
          />
        </div>

        <button
          onClick={submit}
          disabled={submitting || !threshold}
          className="w-full py-3 bg-[var(--amber)] text-black font-bold text-[11px] tracking-widest hover:bg-[var(--green)] disabled:opacity-50"
        >
          {submitting ? "CREATING..." : "◢ CREATE ALERT"}
        </button>

        {message && (
          <div className="mt-3 text-[11px] text-center" style={{
            color: message.startsWith("✓") ? "var(--green)" : "var(--red)"
          }}>
            {message}
          </div>
        )}

        {/* 기존 알림 */}
        {existing.length > 0 && (
          <div className="mt-6 pt-6 border-t border-[var(--border)]">
            <div className="text-[10px] dim tracking-widest mb-3">ACTIVE ALERTS ({existing.length})</div>
            <div className="space-y-2">
              {existing.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-2 border border-[var(--border)] text-[10px]"
                >
                  <div>
                    <span className="tick">{conditionLabel(a.condition)}</span>
                    <span className="ml-2 bright">
                      {a.condition.startsWith("change") ? `${a.threshold}%` : `$${a.threshold}`}
                    </span>
                    {a.email && <span className="dim ml-2">· {a.email}</span>}
                  </div>
                  <button
                    onClick={() => deleteAlert(a.id)}
                    className="down hover:underline"
                  >
                    DELETE
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
