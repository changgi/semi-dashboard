"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface SymbolSignal {
  symbol: string;
  currentPrice: number;
  dayChangePct: number;
  maxPain: number | null;
  maxPainDistance: number | null;
  gexRegime: "positive" | "negative" | "unknown";
  gexValue: number;
  direction: "up" | "down" | "neutral";
  confidence: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  keyInsight: string;
}

interface BriefingData {
  success: boolean;
  reportDate: string;
  executiveSummary: {
    headline: string;
    todayAction: string;
    actionColor: string;
    actionIcon: string;
    urgency: "critical" | "important" | "normal";
    confidence: number;
    keyPoints: string[];
  };
  actionItems: Array<{
    priority: "high" | "medium" | "low";
    icon: string;
    action: string;
    target: string;
    timing: string;
    reason: string;
  }>;
  portfolioSummary: {
    totalValueUsd: number;
    totalGainPct: number;
    positionCount: number;
    riskScore: number;
  };
  symbolSignals: SymbolSignal[];
  macro: {
    vix: number | null;
    tnx: number | null;
    krw: number;
    dxy: number | null;
    oil: number | null;
    vixRegime: "fear" | "elevated" | "normal" | "complacent" | "unknown";
  };
  todayEvents: Array<{ time: string; event: string; impact: string }>;
  nextOpEx: {
    date: string;
    type: "quad" | "monthly";
    daysUntil: number;
    label: string;
  } | null;
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function DailyBriefingPanel() {
  const { data, isLoading } = useSWR<BriefingData>("/api/daily-briefing", fetcher, {
    refreshInterval: 600000, // 10분
  });

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-12">
        <div className="text-[12px] dim kr">📊 일일 브리핑 작성 중...</div>
        <div className="text-[9px] dim mt-1 kr">포트폴리오 + 시장 + 옵션 종합 분석</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">브리핑 생성 실패</div>
      </div>
    );
  }

  const { executiveSummary: exec, macro } = data;

  return (
    <div className="panel p-3 sm:p-5">
      {/* ═════════ 헤더 ═════════ */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <div className="section-title text-[12px] sm:text-[14px]">
            ☕ MORNING BRIEFING · 오늘의 투자 브리핑
          </div>
          <div className="text-[9px] dim mt-0.5 kr">
            {data.reportDate} · 하루 5분이면 충분한 종합 분석
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/report"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] px-3 py-1.5 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr font-bold"
            title="A4 리포트 형식으로 열기 - 브라우저에서 인쇄 → PDF 저장"
          >
            📄 리포트 보기
          </a>
          <button
            onClick={() => {
              window.open("/report?print=1", "_blank");
              // 인쇄 자동 트리거는 페이지에서 처리
            }}
            className="text-[10px] px-3 py-1.5 border border-[var(--amber)] bg-[var(--amber)] text-[#111] hover:bg-[#e09900] rounded kr font-bold"
            title="PDF로 저장"
          >
            📥 PDF 다운로드
          </button>
          <div className="text-right">
            <div className="text-[9px] dim kr">작성 시간</div>
            <div className="text-[9px] tick">
              {new Date(data.reportDate).toLocaleDateString("ko-KR")}
            </div>
          </div>
        </div>
      </div>

      {/* ═════════ 🎯 Executive Summary (핵심!) ═════════ */}
      <div
        className="mb-4 border-2 rounded-lg p-4"
        style={{
          borderColor: exec.actionColor,
          background: `linear-gradient(135deg, ${exec.actionColor}12, transparent)`,
        }}
      >
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] dim kr">오늘의 결정</span>
              {exec.urgency === "critical" && (
                <span className="text-[8px] px-2 py-0.5 bg-[#ff3860] text-white rounded kr animate-pulse">
                  ⚡ 긴급
                </span>
              )}
            </div>
            <div
              className="text-[40px] sm:text-[52px] font-bold leading-none mt-1"
              style={{ color: exec.actionColor }}
            >
              {exec.actionIcon} {exec.todayAction}
            </div>
            <div className="text-[14px] sm:text-[16px] kr mt-2 font-bold" style={{ color: exec.actionColor }}>
              {exec.headline}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[9px] dim kr">신뢰도</div>
            <div className="text-[36px] font-bold" style={{ color: exec.actionColor }}>
              {exec.confidence}%
            </div>
            <div className="w-24 h-2 bg-[var(--border)] rounded overflow-hidden mt-1">
              <div
                className="h-full transition-all"
                style={{ width: `${exec.confidence}%`, background: exec.actionColor }}
              />
            </div>
          </div>
        </div>

        {/* Key Points */}
        {exec.keyPoints.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="text-[10px] tick kr font-bold mb-2">🔑 핵심 포인트</div>
            <div className="space-y-1">
              {exec.keyPoints.map((p, i) => (
                <div key={i} className="text-[10px] sm:text-[11px] kr leading-relaxed">
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═════════ 포트폴리오 + 매크로 요약 ═════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {/* 포트폴리오 */}
        <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-2">
          <div className="text-[8px] dim kr">💼 포트폴리오</div>
          <div className="text-[14px] tick font-bold">
            ${data.portfolioSummary.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div
            className={`text-[10px] font-bold ${
              data.portfolioSummary.totalGainPct >= 0 ? "up" : "down"
            }`}
          >
            {data.portfolioSummary.totalGainPct >= 0 ? "+" : ""}
            {data.portfolioSummary.totalGainPct.toFixed(2)}%
          </div>
          <div className="text-[8px] dim kr mt-1">
            리스크: <span className={data.portfolioSummary.riskScore > 50 ? "down" : "up"}>
              {data.portfolioSummary.riskScore}/100
            </span>
          </div>
        </div>

        {/* VIX */}
        <MacroBox
          label="😱 VIX"
          value={macro.vix !== null ? macro.vix.toFixed(2) : "—"}
          subtitle={
            macro.vixRegime === "fear" ? "공포" :
            macro.vixRegime === "elevated" ? "주의" :
            macro.vixRegime === "normal" ? "정상" :
            macro.vixRegime === "complacent" ? "과열" :
            "-"
          }
          color={
            macro.vixRegime === "fear" ? "red" :
            macro.vixRegime === "elevated" ? "amber" :
            macro.vixRegime === "complacent" ? "purple" :
            "green"
          }
        />

        {/* 10Y TNX */}
        <MacroBox
          label="📊 10Y TNX"
          value={macro.tnx !== null ? `${macro.tnx.toFixed(2)}%` : "—"}
          subtitle={
            macro.tnx === null ? "-" :
            macro.tnx > 4.5 ? "고금리" :
            macro.tnx > 4.0 ? "정상" :
            "완화"
          }
          color={
            macro.tnx === null ? "gray" :
            macro.tnx > 4.5 ? "red" :
            macro.tnx < 3.8 ? "green" :
            "amber"
          }
        />

        {/* USD/KRW */}
        <MacroBox
          label="💱 USD/KRW"
          value={`₩${macro.krw.toFixed(0)}`}
          subtitle={macro.krw > 1400 ? "원화약세" : macro.krw > 1300 ? "정상" : "원화강세"}
          color={macro.krw > 1400 ? "red" : "amber"}
        />

        {/* Oil */}
        <MacroBox
          label="🛢️ WTI"
          value={macro.oil !== null ? `$${macro.oil.toFixed(2)}` : "—"}
          subtitle={
            macro.oil === null ? "-" :
            macro.oil > 90 ? "고유가" :
            macro.oil > 70 ? "정상" :
            "저유가"
          }
          color={macro.oil && macro.oil > 90 ? "red" : "amber"}
        />
      </div>

      {/* ═════════ 🎯 오늘 할 일 (액션 아이템) ═════════ */}
      {data.actionItems.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] tick kr font-bold mb-2">
            🎯 오늘 할 일 체크리스트 ({data.actionItems.length})
          </div>
          <div className="space-y-2">
            {data.actionItems.map((a, i) => (
              <ActionItemRow key={i} action={a} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* ═════════ 핵심 종목 시그널 테이블 ═════════ */}
      <div className="mb-4">
        <div className="text-[11px] tick kr font-bold mb-2">
          📊 핵심 종목 한 눈에 보기
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] sm:text-[10px]">
            <thead>
              <tr className="border-b border-[var(--border)] dim">
                <th className="text-left py-1.5 px-2">종목</th>
                <th className="text-right py-1.5 px-2 kr">현재가</th>
                <th className="text-right py-1.5 px-2 kr">일변동</th>
                <th className="text-right py-1.5 px-2 kr">Max Pain</th>
                <th className="text-center py-1.5 px-2 kr">GEX</th>
                <th className="text-center py-1.5 px-2 kr">방향</th>
                <th className="text-center py-1.5 px-2 kr">신뢰도</th>
                <th className="text-left py-1.5 px-2 kr">핵심 인사이트</th>
              </tr>
            </thead>
            <tbody>
              {data.symbolSignals.map((s) => (
                <SymbolRow key={s.symbol} signal={s} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═════════ 오늘의 이벤트 + 다음 OpEx ═════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 오늘 이벤트 */}
        <div className="border border-[var(--border)] rounded p-3">
          <div className="text-[10px] tick kr font-bold mb-2">
            📅 오늘 주목할 이벤트
          </div>
          {data.todayEvents.length === 0 ? (
            <div className="text-[9px] dim kr">특별한 이벤트 없음</div>
          ) : (
            <div className="space-y-2">
              {data.todayEvents.map((e, i) => (
                <div key={i} className="border-l-2 border-[var(--amber)] bg-[rgba(255,176,0,0.03)] pl-2 py-1">
                  <div className="text-[10px] tick font-bold">{e.event}</div>
                  <div className="text-[8px] dim kr">⏰ {e.time}</div>
                  <div className="text-[9px] kr mt-0.5">💭 {e.impact}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 다음 OpEx */}
        <div className="border border-[var(--border)] rounded p-3">
          <div className="text-[10px] tick kr font-bold mb-2">
            ⏳ 다가오는 주요 만기
          </div>
          {!data.nextOpEx ? (
            <div className="text-[9px] dim kr">해당 기간 내 주요 만기 없음</div>
          ) : (
            <div
              className={`border-l-4 pl-3 py-2 rounded-r ${
                data.nextOpEx.type === "quad"
                  ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
                  : "border-[var(--amber)] bg-[rgba(255,176,0,0.03)]"
              }`}
            >
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[14px] font-bold kr">
                  {data.nextOpEx.label}
                </span>
                <span className="text-[11px] tick">{data.nextOpEx.date}</span>
                <span
                  className={`text-[18px] font-bold ${
                    data.nextOpEx.daysUntil <= 3 ? "text-[#ff3860]" :
                    data.nextOpEx.daysUntil <= 7 ? "text-[var(--amber)]" :
                    "tick"
                  }`}
                >
                  D-{data.nextOpEx.daysUntil}
                </span>
              </div>
              <div className="text-[9px] dim kr mt-1">
                {data.nextOpEx.type === "quad"
                  ? "분기 최대 만기 - 변동성 극심 예상"
                  : "월간 옵션 만기 - Pinning 효과 가능성"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═════════ 하단 안내 ═════════ */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed text-center">
        💡 이 브리핑은 10분마다 자동 갱신 · 포트폴리오 + 옵션 + 매크로 + 만기 통합 분석
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 매크로 박스
// ═══════════════════════════════════════════════════════════
function MacroBox({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string;
  subtitle: string;
  color: "red" | "amber" | "green" | "purple" | "gray";
}) {
  const colors = {
    red: "text-[#ff3860] border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)]",
    amber: "text-[var(--amber)] border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)]",
    green: "text-[#00ff88] border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)]",
    purple: "text-[#ee99ff] border-[#ee99ff]/30 bg-[rgba(238,153,255,0.03)]",
    gray: "text-[#aaa] border-[var(--border)]",
  }[color];

  return (
    <div className={`border rounded p-2 ${colors}`}>
      <div className="text-[8px] dim kr">{label}</div>
      <div className={`text-[14px] font-bold ${colors.split(" ")[0]}`}>{value}</div>
      <div className="text-[8px] dim kr mt-0.5">{subtitle}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 액션 아이템 행
// ═══════════════════════════════════════════════════════════
function ActionItemRow({
  action,
  index,
}: {
  action: BriefingData["actionItems"][0];
  index: number;
}) {
  const priorityColors = {
    high: "border-[#ff3860] bg-[rgba(255,56,96,0.05)]",
    medium: "border-[var(--amber)] bg-[rgba(255,176,0,0.03)]",
    low: "border-[#aaccff] bg-[rgba(170,204,255,0.03)]",
  };

  const priorityLabels = {
    high: "높음",
    medium: "중간",
    low: "낮음",
  };

  const priorityTextColors = {
    high: "text-[#ff3860]",
    medium: "text-[var(--amber)]",
    low: "text-[#aaccff]",
  };

  return (
    <div className={`border-l-4 rounded-r p-2 ${priorityColors[action.priority]}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-[12px] dim font-bold">#{index}</span>
          <span className="text-[14px]">{action.icon}</span>
          <span className={`text-[11px] font-bold ${priorityTextColors[action.priority]}`}>
            {action.action}
          </span>
          <span className="dim text-[9px] kr">→</span>
          <span className="text-[11px] tick font-bold">{action.target}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[8px] px-2 py-0.5 border rounded kr ${priorityTextColors[action.priority]}`}>
            {priorityLabels[action.priority]}
          </span>
          <span className="text-[9px] dim kr">{action.timing}</span>
        </div>
      </div>
      <div className="text-[9px] dim kr mt-1 pl-8">💭 {action.reason}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 종목 행
// ═══════════════════════════════════════════════════════════
function SymbolRow({ signal: s }: { signal: SymbolSignal }) {
  const directionStyle =
    s.direction === "up"
      ? { icon: "📈", color: "up", label: "상승" }
      : s.direction === "down"
      ? { icon: "📉", color: "down", label: "하락" }
      : { icon: "➖", color: "dim", label: "중립" };

  return (
    <tr className="border-b border-[var(--border)] data-row hover:bg-[rgba(255,255,255,0.02)]">
      <td className="py-1.5 px-2">
        <a
          href={`/stock/${encodeURIComponent(s.symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="tick font-bold hover:bright"
        >
          {s.symbol}
        </a>
      </td>
      <td className="text-right py-1.5 px-2 tick">${s.currentPrice.toFixed(2)}</td>
      <td
        className={`text-right py-1.5 px-2 font-bold ${
          s.dayChangePct >= 0 ? "up" : "down"
        }`}
      >
        {s.dayChangePct >= 0 ? "+" : ""}
        {s.dayChangePct.toFixed(2)}%
      </td>
      <td className="text-right py-1.5 px-2 tick">
        {s.maxPain !== null ? `$${s.maxPain.toFixed(2)}` : "—"}
        {s.maxPainDistance !== null && (
          <span
            className={`text-[7px] ml-1 ${
              s.maxPainDistance >= 0 ? "up" : "down"
            }`}
          >
            ({s.maxPainDistance >= 0 ? "+" : ""}
            {s.maxPainDistance.toFixed(1)}%)
          </span>
        )}
      </td>
      <td className="text-center py-1.5 px-2">
        <span
          className={
            s.gexRegime === "positive"
              ? "up"
              : s.gexRegime === "negative"
              ? "down"
              : "dim"
          }
        >
          {s.gexRegime === "positive" ? "✅" : s.gexRegime === "negative" ? "⚠️" : "—"}
        </span>
      </td>
      <td className={`text-center py-1.5 px-2 ${directionStyle.color} font-bold`}>
        {directionStyle.icon} {directionStyle.label}
      </td>
      <td className="text-center py-1.5 px-2 tick">{s.confidence}%</td>
      <td className="py-1.5 px-2 dim kr text-[9px]">{s.keyInsight}</td>
    </tr>
  );
}
