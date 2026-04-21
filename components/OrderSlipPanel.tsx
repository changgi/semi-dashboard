"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface OrderSlip {
  id: string;
  priority: number;
  category: "sell" | "buy" | "hedge" | "rebalance";
  urgency: "immediate" | "today" | "this_week";
  symbol: string;
  name: string;
  action: string;
  shares: number | string;
  orderType: "market" | "limit";
  targetPrice?: number;
  stopLoss?: number;
  orderText: string;
  orderTextEnglish: string;
  rationale: string;
  expectedOutcome: string;
  riskNote: string;
  estimatedValue: number;
  currency: "KRW" | "USD";
}

interface OrderSlipData {
  success: boolean;
  summary: {
    totalOrders: number;
    sellOrders: number;
    buyOrders: number;
    hedgeOrders: number;
    stopLosses: number;
    totalSellValue: number;
    totalBuyValue: number;
    netFlow: number;
  };
  orders: OrderSlip[];
  disclaimer: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  sell:      { label: "매도",     color: "#ff3860", icon: "📉" },
  buy:       { label: "매수",     color: "#00ff88", icon: "📈" },
  hedge:     { label: "헤지",     color: "#ffaa44", icon: "🛡️" },
  rebalance: { label: "스탑로스", color: "#aaccff", icon: "🎯" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  immediate: { label: "즉시",     color: "#ff3860" },
  today:     { label: "오늘",     color: "#ff6644" },
  this_week: { label: "이번 주",  color: "#ffaa44" },
};

// ═══════════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════════
export function OrderSlipPanel() {
  const [format, setFormat] = useState<"kor" | "eng">("kor");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useSWR<OrderSlipData>(
    "/api/order-slip",
    fetcher,
    { refreshInterval: 600000 } // 10분
  );

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyAllOrders = () => {
    const allText = (data?.orders ?? [])
      .map((o, i) => `${i + 1}. ${format === "kor" ? o.orderText : o.orderTextEnglish}`)
      .join("\n");
    copyToClipboard(allText, "all");
  };

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[11px] dim kr">📝 주문서 생성 중...</div>
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

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📝 ORDER SLIP · 실행 가능한 주문서
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            AI 권장사항 → 증권사 앱에 바로 복사해서 주문
          </div>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <SummaryChip label="📉 매도" value={data.summary?.sellOrders ?? 0} color="#ff3860" />
        <SummaryChip label="🎯 스탑로스" value={data.summary?.stopLosses ?? 0} color="#aaccff" />
        <SummaryChip label="📈 매수" value={data.summary?.buyOrders ?? 0} color="#00ff88" />
        <SummaryChip label="🛡️ 헤지" value={data.summary?.hedgeOrders ?? 0} color="#ffaa44" />
      </div>

      {/* 순 현금 흐름 */}
      {(data.summary?.totalSellValue ?? 0) > 0 && (
        <div className="mb-3 p-3 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[9px] dim kr">예상 현금 흐름</div>
            <div className="text-[16px] font-bold tick">
              {(data.summary?.netFlow ?? 0) >= 0 ? "+" : ""}₩{(data.summary?.netFlow ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="text-[9px] dim kr text-right">
            매도 ₩{(data.summary?.totalSellValue ?? 0).toLocaleString()}<br />
            매수 ₩{(data.summary?.totalBuyValue ?? 0).toLocaleString()}
          </div>
        </div>
      )}

      {/* 포맷 토글 + 전체 복사 */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFormat("kor")}
            className={`text-[10px] px-3 py-1 border rounded kr ${
              format === "kor"
                ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)] font-bold"
                : "border-[var(--border)] dim"
            }`}
          >
            🇰🇷 한국어
          </button>
          <button
            onClick={() => setFormat("eng")}
            className={`text-[10px] px-3 py-1 border rounded kr ${
              format === "eng"
                ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)] font-bold"
                : "border-[var(--border)] dim"
            }`}
          >
            🇺🇸 English
          </button>
        </div>
        <button
          onClick={copyAllOrders}
          className="text-[10px] px-3 py-1.5 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
        >
          {copied === "all" ? "✅ 복사됨!" : "📋 전체 복사"}
        </button>
      </div>

      {/* 주문 목록 */}
      {(data.orders ?? []).length === 0 ? (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
          <div className="text-[24px] mb-2">✅</div>
          <div className="text-[10px] dim kr">현재 추천 주문 없음</div>
        </div>
      ) : (
        <div className="space-y-2">
          {(data.orders ?? []).map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              format={format}
              copied={copied === o.id}
              onCopy={() => copyToClipboard(format === "kor" ? o.orderText : o.orderTextEnglish, o.id)}
            />
          ))}
        </div>
      )}

      {/* 면책 */}
      <div className="mt-3 p-2 border border-[#ff3860]/20 bg-[rgba(255,56,96,0.03)] rounded text-[9px] kr leading-relaxed">
        {data.disclaimer}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="border rounded p-2 text-center"
      style={{ borderColor: `${color}40`, background: `${color}08` }}
    >
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[18px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Order Card
// ─────────────────────────────────────────────────────────
function OrderCard({ order, format, copied, onCopy }: {
  order: OrderSlip;
  format: "kor" | "eng";
  copied: boolean;
  onCopy: () => void;
}) {
  const cat = CATEGORY_CONFIG[order.category];
  const urg = URGENCY_CONFIG[order.urgency];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border-l-4 rounded-r p-3"
      style={{
        borderLeftColor: cat.color,
        background: order.urgency === "immediate" ? `${cat.color}08` : "transparent",
      }}
    >
      {/* 상단: 심볼 + 배지 + 복사 버튼 */}
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px]">{cat.icon}</span>
            <span className="text-[13px] font-bold kr" style={{ color: cat.color }}>
              #{order.priority} {order.action}
            </span>
            <SymbolDisplay
              meta={{ symbol: order.symbol, displayName: order.name }}
              size="sm"
              variant="inline"
              showFlag={true}
              showBadges={false}
            />
            <span
              className="text-[8px] px-1.5 py-0.5 rounded font-bold kr"
              style={{ background: urg.color, color: "white" }}
            >
              {urg.label}
            </span>
          </div>
        </div>
        <button
          onClick={onCopy}
          className="text-[10px] px-2 py-1 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded font-bold flex-shrink-0"
        >
          {copied ? "✅ 복사됨!" : "📋 복사"}
        </button>
      </div>

      {/* 주문 텍스트 (복사 대상) */}
      <div
        className="p-2 bg-black/40 rounded font-mono text-[11px] break-all kr cursor-pointer hover:bg-black/60"
        onClick={onCopy}
      >
        {format === "kor" ? order.orderText : order.orderTextEnglish}
      </div>

      {/* 근거 */}
      <div className="mt-2 text-[10px] dim kr leading-relaxed">
        💭 {order.rationale}
      </div>

      {/* 상세 (토글) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[9px] dim hover:bright kr"
      >
        {expanded ? "▲ 접기" : "▼ 상세 정보"}
      </button>
      
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1.5 text-[10px] kr leading-relaxed">
          <div><span className="dim">🎯 기대:</span> {order.expectedOutcome}</div>
          <div className="down"><span className="dim">⚠️ 리스크:</span> {order.riskNote}</div>
          <div className="tick">
            💰 예상 거래액: {order.currency === "KRW" 
              ? `₩${order.estimatedValue.toLocaleString()}` 
              : `$${order.estimatedValue.toLocaleString()}`}
          </div>
        </div>
      )}
    </div>
  );
}
