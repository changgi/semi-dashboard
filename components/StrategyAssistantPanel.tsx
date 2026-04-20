"use client";

import { useState } from "react";

// ═══════════════════════════════════════════════════════════
// Strategy Assistant Panel
// 
// 5가지 자주 묻는 질문을 버튼 한 번으로 답변받기:
//   1. 📉 지금 매도해야 할까?
//   2. 📈 지금 더 매수해야 할까?
//   3. 🛡️ 헤지해야 할까?
//   4. 🎯 내 포트 얼마나 위험해?
//   5. 💡 지금 어떤 기회가 있어?
// ═══════════════════════════════════════════════════════════

interface Answer {
  question: string;
  decision: "yes" | "no" | "partial" | "wait";
  confidence: number;
  oneLiner: string;
  reasoning: string[];
  risks: string[];
  concreteAction: string;
  alternativeOptions?: string[];
  relevantData: {
    label: string;
    value: string;
    color?: string;
  }[];
}

interface Response {
  success: boolean;
  answer: Answer;
  context: {
    totalValueUsd: number;
    totalGainPct: number;
    positionCount: number;
    vix: number | null;
    tnx: number | null;
  };
}

const QUESTIONS = [
  { id: "should_i_sell",      icon: "📉", label: "지금 매도해야 할까?",   color: "#ff3860" },
  { id: "should_i_buy_more",  icon: "📈", label: "지금 더 매수해야 할까?", color: "#00ff88" },
  { id: "should_i_hedge",     icon: "🛡️", label: "헤지해야 할까?",         color: "#ffaa44" },
  { id: "risk_check",         icon: "🎯", label: "내 포트 얼마나 위험해?", color: "#ee99ff" },
  { id: "opportunity_scan",   icon: "💡", label: "지금 어떤 기회가 있어?", color: "#aaccff" },
];

const DECISION_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  yes:     { label: "예",       color: "#00ff88", emoji: "✅" },
  no:      { label: "아니오",   color: "#ff3860", emoji: "❌" },
  partial: { label: "부분적",   color: "#ffaa44", emoji: "🟡" },
  wait:    { label: "대기",     color: "#aaccff", emoji: "⏸️" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function StrategyAssistantPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [response, setResponse] = useState<Response | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  const askQuestion = async (questionId: string) => {
    setLoading(questionId);
    setActiveQuestion(questionId);
    try {
      const res = await fetch("/api/strategy-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionId }),
      });
      const data = await res.json();
      if (data.success) {
        setResponse(data);
      } else {
        alert("답변 생성 실패: " + (data.error ?? "알 수 없는 오류"));
      }
    } catch (e) {
      alert("네트워크 오류: " + (e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            💬 STRATEGY ASSISTANT · 투자 상담
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            버튼 한 번으로 카일님 포트 기반 즉답
          </div>
        </div>
      </div>

      {/* 질문 버튼들 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
        {QUESTIONS.map((q) => {
          const isActive = activeQuestion === q.id;
          const isLoading = loading === q.id;
          return (
            <button
              key={q.id}
              onClick={() => askQuestion(q.id)}
              disabled={loading !== null}
              className={`border rounded p-3 text-left transition-all ${
                isActive
                  ? "border-[var(--amber)] bg-[rgba(255,176,0,0.05)]"
                  : "border-[var(--border)] hover:border-[var(--amber-dim)] hover:bg-[rgba(255,255,255,0.02)]"
              } disabled:opacity-50`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[20px]">{isLoading ? "⏳" : q.icon}</span>
                <span className="text-[11px] kr font-bold" style={{ color: isActive ? "var(--amber)" : "inherit" }}>
                  {q.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 답변 영역 */}
      {!response && !loading && (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
          <div className="text-[24px] mb-2">💬</div>
          <div className="text-[10px] dim kr">
            위 질문 버튼을 클릭하면 즉시 답변이 나와요
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
          <div className="text-[24px] mb-2 blink">🤔</div>
          <div className="text-[10px] dim kr">분석 중... 포트 + 시장 + 매크로 종합</div>
        </div>
      )}

      {response && !loading && (
        <AnswerCard response={response} />
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">💡 답변 기반</span>: 실시간 카일님 포트 + 현재 시장 지표 + 매크로 환경<br />
        <span className="bright">⚠️ 참고용</span>: 최종 투자 결정은 본인 책임
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 답변 카드
// ═══════════════════════════════════════════════════════════
function AnswerCard({ response }: { response: Response }) {
  const { answer, context } = response;
  const decision = DECISION_CONFIG[answer.decision] ?? DECISION_CONFIG.wait;

  return (
    <div className="space-y-3">
      {/* 메인 결정 */}
      <div
        className="p-3 sm:p-4 rounded border-2"
        style={{
          borderColor: decision.color,
          background: `${decision.color}10`,
        }}
      >
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-[32px]">{decision.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] dim kr">결정</div>
            <div className="text-[18px] sm:text-[22px] font-bold kr" style={{ color: decision.color }}>
              {answer.oneLiner}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] dim kr">신뢰도</div>
            <div className="text-[18px] font-bold" style={{ color: decision.color }}>
              {answer.confidence}%
            </div>
          </div>
        </div>

        {/* 구체적 액션 */}
        <div className="mt-3 p-3 bg-black/20 rounded">
          <div className="text-[9px] dim kr mb-1">💪 구체적 액션</div>
          <div className="text-[11px] kr leading-relaxed font-bold" style={{ color: decision.color }}>
            {answer.concreteAction}
          </div>
        </div>
      </div>

      {/* 관련 데이터 */}
      {(answer.relevantData ?? []).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {(answer.relevantData ?? []).map((d, i) => (
            <div key={i} className="border border-[var(--border)] rounded p-2 text-center">
              <div className="text-[8px] dim kr">{d.label}</div>
              <div className="text-[13px] font-bold" style={{ color: d.color || "inherit" }}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 논리 근거 */}
      {(answer.reasoning ?? []).length > 0 && (
        <div className="border border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)] rounded p-3">
          <div className="text-[10px] up font-bold kr mb-2">✅ 판단 근거</div>
          {(answer.reasoning ?? []).map((r, i) => (
            <div key={i} className="text-[10px] kr leading-relaxed mb-1">
              {r}
            </div>
          ))}
        </div>
      )}

      {/* 리스크 */}
      {(answer.risks ?? []).length > 0 && (
        <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)] rounded p-3">
          <div className="text-[10px] down font-bold kr mb-2">⚠️ 고려할 리스크</div>
          {(answer.risks ?? []).map((r, i) => (
            <div key={i} className="text-[10px] kr leading-relaxed mb-1">
              {r}
            </div>
          ))}
        </div>
      )}

      {/* 대안 옵션 */}
      {(answer.alternativeOptions ?? []).length > 0 && (
        <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3">
          <div className="text-[10px] tick font-bold kr mb-2">🎯 대안 옵션</div>
          {(answer.alternativeOptions ?? []).map((o, i) => (
            <div key={i} className="text-[10px] kr leading-relaxed mb-1">
              {i + 1}. {o}
            </div>
          ))}
        </div>
      )}

      {/* 컨텍스트 */}
      <div className="text-[8px] dim kr text-center">
        📊 분석 기준: 포트 ${context.totalValueUsd.toFixed(0)} ({context.totalGainPct >= 0 ? "+" : ""}{context.totalGainPct.toFixed(2)}%) · VIX {context.vix?.toFixed(1) ?? "-"} · TNX {context.tnx?.toFixed(2) ?? "-"}%
      </div>
    </div>
  );
}
