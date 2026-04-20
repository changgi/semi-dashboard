"use client";

import useSWR from "swr";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface OrderPlan {
  id: string;
  action: "buy" | "sell" | "reduce" | "hedge";
  symbol: string;
  symbolName: string;
  orderType: "market" | "limit";
  currentPrice: number;
  suggestedPrice: number | null;
  estimatedShares: number;
  estimatedDollarAmount: number;
  estimatedWonAmount: number;
  priority: number;
  urgency: "immediate" | "today" | "this_week";
  reasoning: string[];
  expectedReturn: {
    target: number;
    upside: number;
    stopLoss: number;
    downside: number;
    riskRewardRatio: number;
  };
  kellyFraction: number;
  confidence: number;
}

interface ExecutionPlanData {
  success: boolean;
  totalCapital: number;
  totalCapitalUsd: number;
  availableCash: number;
  orders: OrderPlan[];
  expectedPortfolio: {
    beforeTotal: number;
    afterTotal: number;
    beforePositions: number;
    afterPositions: number;
    diversificationScore: number;
  };
  summary: {
    totalBuyAmount: number;
    totalSellAmount: number;
    netFlow: number;
    executionOrder: string[];
    keyRecommendations: string[];
  };
  risks: string[];
  opportunities: string[];
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  buy:    { label: "매수",  color: "#00ff88", bg: "#00ff8810", icon: "📈" },
  sell:   { label: "매도",  color: "#ff3860", bg: "#ff386010", icon: "📉" },
  reduce: { label: "축소",  color: "#ffaa44", bg: "#ffaa4410", icon: "✂️" },
  hedge:  { label: "헤지",  color: "#ee99ff", bg: "#ee99ff10", icon: "🛡️" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  immediate:  { label: "즉시", color: "#ff3860" },
  today:      { label: "오늘", color: "#ffaa44" },
  this_week:  { label: "금주", color: "#aaccff" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function ExecutionPlanPanel() {
  const { data, isLoading, mutate } = useSWR<ExecutionPlanData>(
    "/api/execution-plan",
    fetcher,
    { refreshInterval: 600000 } // 10분
  );

  const [checkedOrders, setCheckedOrders] = useState<Set<string>>(new Set());

  const toggleCheck = (id: string) => {
    setCheckedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-12">
        <div className="text-[11px] dim kr">📋 실행 플랜 생성 중...</div>
        <div className="text-[9px] dim mt-1 kr">포트폴리오 + 옵션 + 섹터 분석 통합</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">
          {(data as unknown as { error?: string })?.error || "데이터 로딩 실패"}
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📋 EXECUTION PLAN · 오늘의 주문 리스트
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            포트폴리오 + 옵션 시그널 → 구체적 주문 (Kelly Criterion 사이징)
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="text-[9px] px-2 py-1 border border-[var(--border)] dim hover:text-[var(--amber)] rounded kr"
        >
          ↻ 새로고침
        </button>
      </div>

      {/* ═════════ 요약 박스 ═════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <SummaryBox
          label="💰 총 자본"
          value={`$${data.totalCapitalUsd.toLocaleString()}`}
          subtitle={`₩${(data.totalCapital / 10000).toFixed(0)}만`}
          color="amber"
        />
        <SummaryBox
          label="📋 주문 수"
          value={`${data.orders.length}건`}
          subtitle={
            data.orders.filter(o => o.urgency === "immediate" || o.urgency === "today").length +
            "건 오늘 실행"
          }
          color="green"
        />
        <SummaryBox
          label="📈 순 흐름"
          value={
            data.summary.netFlow > 0
              ? `+₩${(data.summary.netFlow / 1000).toFixed(0)}K`
              : data.summary.netFlow < 0
              ? `-₩${(Math.abs(data.summary.netFlow) / 1000).toFixed(0)}K`
              : "±0"
          }
          subtitle={data.summary.netFlow > 0 ? "순매수" : data.summary.netFlow < 0 ? "순매도" : "중립"}
          color={data.summary.netFlow > 0 ? "green" : data.summary.netFlow < 0 ? "red" : "gray"}
        />
        <SummaryBox
          label="🎯 분산도"
          value={`${data.expectedPortfolio.diversificationScore}/100`}
          subtitle={
            data.expectedPortfolio.diversificationScore >= 80 ? "우수" :
            data.expectedPortfolio.diversificationScore >= 50 ? "보통" :
            "개선 필요"
          }
          color={
            data.expectedPortfolio.diversificationScore >= 80 ? "green" :
            data.expectedPortfolio.diversificationScore >= 50 ? "amber" :
            "red"
          }
        />
      </div>

      {/* ═════════ 핵심 추천 ═════════ */}
      {data.summary.keyRecommendations.length > 0 && (
        <div className="mb-3 p-3 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded">
          <div className="text-[10px] tick kr font-bold mb-2">
            🎯 핵심 추천 사항
          </div>
          <div className="space-y-1">
            {data.summary.keyRecommendations.map((k, i) => (
              <div key={i} className="text-[10px] kr">{k}</div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════ 주문 리스트 ═════════ */}
      {data.orders.length === 0 ? (
        <div className="text-[10px] dim text-center py-10 kr border border-[var(--border)] rounded">
          ✅ 현재 추천 주문 없음 - 포지션 유지 권장
        </div>
      ) : (
        <div>
          <div className="text-[10px] tick kr font-bold mb-2">
            📋 주문 체크리스트 ({data.orders.length}건)
          </div>
          <div className="space-y-2">
            {data.orders.map((order, idx) => (
              <OrderCard
                key={order.id}
                order={order}
                index={idx + 1}
                checked={checkedOrders.has(order.id)}
                onToggle={() => toggleCheck(order.id)}
              />
            ))}
          </div>

          {/* 진행률 */}
          <div className="mt-3 p-2 border border-[var(--border)] rounded flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[9px] dim kr mb-1">진행률</div>
              <div className="h-2 bg-[var(--border)] rounded overflow-hidden">
                <div
                  className="h-full bg-[var(--amber)] transition-all"
                  style={{
                    width: `${(checkedOrders.size / data.orders.length) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="text-[11px] tick font-bold">
              {checkedOrders.size} / {data.orders.length}
            </div>
          </div>
        </div>
      )}

      {/* ═════════ 리스크/기회 ═════════ */}
      {(data.risks.length > 0 || data.opportunities.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {data.risks.length > 0 && (
            <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)] rounded p-2">
              <div className="text-[10px] text-[#ff3860] font-bold kr mb-1">⚠️ 리스크</div>
              {data.risks.map((r, i) => (
                <div key={i} className="text-[9px] kr leading-relaxed">• {r}</div>
              ))}
            </div>
          )}
          {data.opportunities.length > 0 && (
            <div className="border border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)] rounded p-2">
              <div className="text-[10px] text-[#00ff88] font-bold kr mb-1">💎 기회</div>
              {data.opportunities.map((o, i) => (
                <div key={i} className="text-[9px] kr leading-relaxed">• {o}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 하단 설명 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">📐 Kelly Criterion</span>: 수학적 최적 포지션 크기 (안전 계수 0.25 적용)<br />
        <span className="bright">⚠️ 주의</span>: 모든 추천은 <span className="bright">참고용</span> · 실제 매매는 본인 판단으로 실행
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
  subtitle,
  color,
}: {
  label: string;
  value: string;
  subtitle: string;
  color: "amber" | "green" | "red" | "gray";
}) {
  const colors = {
    amber: "text-[var(--amber)] border-[var(--amber-dim)]",
    green: "text-[#00ff88] border-[#00ff88]/30",
    red:   "text-[#ff3860] border-[#ff3860]/30",
    gray:  "text-[#aaa] border-[var(--border)]",
  }[color];

  return (
    <div className={`border rounded p-2 ${colors.split(" ")[1]} bg-[rgba(0,0,0,0.2)]`}>
      <div className="text-[8px] dim kr">{label}</div>
      <div className={`text-[14px] font-bold ${colors.split(" ")[0]}`}>{value}</div>
      <div className="text-[8px] dim kr mt-0.5">{subtitle}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 주문 카드
// ═══════════════════════════════════════════════════════════
function OrderCard({
  order,
  index,
  checked,
  onToggle,
}: {
  order: OrderPlan;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const actCfg = ACTION_CONFIG[order.action] ?? ACTION_CONFIG.buy;
  const urgCfg = URGENCY_CONFIG[order.urgency];

  return (
    <div
      className={`border-l-4 rounded-r p-3 transition-all ${
        checked ? "opacity-50" : "hover:bg-[rgba(255,255,255,0.02)]"
      }`}
      style={{
        borderLeftColor: actCfg.color,
        background: checked ? "transparent" : actCfg.bg,
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onToggle}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              checked
                ? "bg-[var(--amber)] border-[var(--amber)] text-[#111]"
                : "border-[var(--border)] hover:border-[var(--amber)]"
            }`}
          >
            {checked && <span className="text-[12px] font-bold">✓</span>}
          </button>
          <span className="text-[14px] font-bold dim">#{index}</span>
          <span className="text-[18px]">{actCfg.icon}</span>
          <span
            className="text-[14px] font-bold px-2 py-0.5 rounded"
            style={{ color: actCfg.color, background: actCfg.bg }}
          >
            {actCfg.label}
          </span>
          <a
            href={`/stock/${encodeURIComponent(order.symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] tick font-bold hover:bright"
          >
            {order.symbol}
          </a>
          <span className="text-[10px] dim kr">{order.symbolName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] px-2 py-0.5 border rounded kr font-bold"
            style={{ color: urgCfg.color, borderColor: urgCfg.color }}
          >
            {urgCfg.label}
          </span>
          <span className="text-[9px] dim kr">
            신뢰도 <span className="tick font-bold">{order.confidence}%</span>
          </span>
        </div>
      </div>

      {/* 주문 상세 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <div>
          <div className="text-[8px] dim kr">현재가</div>
          <div className="text-[12px] tick font-bold">
            ${order.currentPrice.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[8px] dim kr">수량</div>
          <div className="text-[12px] tick font-bold">
            {order.estimatedShares > 0 ? `${order.estimatedShares}주` : "-"}
          </div>
        </div>
        <div>
          <div className="text-[8px] dim kr">예상 금액</div>
          <div className="text-[12px] tick font-bold" style={{ color: actCfg.color }}>
            ${order.estimatedDollarAmount.toFixed(2)}
          </div>
          <div className="text-[8px] dim">
            ₩{Math.round(order.estimatedWonAmount).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[8px] dim kr">지정가</div>
          <div className="text-[12px] tick font-bold">
            {order.suggestedPrice ? `$${order.suggestedPrice.toFixed(2)}` : "시장가"}
          </div>
          <div className="text-[8px] dim kr">
            {order.orderType === "limit" ? "지정가 주문" : "시장가 주문"}
          </div>
        </div>
      </div>

      {/* 예상 수익 */}
      {(order.action === "buy" || order.action === "hedge") && order.expectedReturn.target > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2 p-2 bg-[rgba(0,0,0,0.3)] rounded border border-[var(--border)]">
          <div className="text-center">
            <div className="text-[8px] dim kr">🛑 손절</div>
            <div className="text-[11px] down font-bold">
              ${order.expectedReturn.stopLoss.toFixed(2)}
            </div>
            <div className="text-[8px] down">
              {order.expectedReturn.downside.toFixed(1)}%
            </div>
          </div>
          <div className="text-center border-x border-[var(--border)]">
            <div className="text-[8px] dim kr">🎯 목표</div>
            <div className="text-[11px] font-bold" style={{ color: actCfg.color }}>
              ${order.expectedReturn.target.toFixed(2)}
            </div>
            <div className="text-[8px]" style={{ color: actCfg.color }}>
              +{order.expectedReturn.upside.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-[8px] dim kr">⚖️ R/R</div>
            <div className="text-[11px] tick font-bold">
              {order.expectedReturn.riskRewardRatio.toFixed(1)}:1
            </div>
            <div className="text-[8px] dim kr">Kelly {(order.kellyFraction * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* 이유 */}
      <div className="text-[9px] dim kr leading-relaxed">
        <span className="bright">💭 이유:</span>
        <ul className="mt-1 space-y-0.5 pl-3">
          {order.reasoning.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
