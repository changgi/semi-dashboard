"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ═══════════════════════════════════════════════════════════
// Floating Decision Bar
// 
// 화면 하단에 항상 떠있는 "오늘의 결정" 요약 바
// 스크롤 시 계속 보여서 카일님이 어디서든 오늘 할 일을 잊지 않게
// ═══════════════════════════════════════════════════════════

interface DecisionData {
  action: string;
  actionLabel: string;
  icon: string;
  color: string;
  headline: string;
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export function FloatingDecisionBar() {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [symbol, setSymbol] = useState("NVDA");

  // 통합 인사이트 데이터
  const { data: insight } = useSWR<any>(
    `/api/unified-insight?symbol=${symbol}&days=60`,
    fetcher,
    { refreshInterval: 300000 }
  );

  // 스크롤 감지 (상단에서는 숨김)
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== "undefined") {
        setVisible(window.scrollY > 200);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!insight?.success || !visible) return null;

  const dec = insight.decision;
  const currentPrice = insight.currentPrice;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{
        boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* 확장 패널 */}
      {expanded && (
        <div
          className="border-t-2 bg-[var(--bg)]/95 backdrop-blur-md"
          style={{ borderColor: dec.color }}
        >
          <div className="max-w-7xl mx-auto p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 근거 */}
              {dec.reasons.length > 0 && (
                <div>
                  <div className="text-[10px] text-[#00ff88] font-bold kr mb-1">
                    ✅ 매수 근거 ({dec.reasons.length})
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {dec.reasons.slice(0, 4).map((r: string, i: number) => (
                      <li key={i} className="text-[9px] kr leading-relaxed">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 리스크 */}
              {dec.risks.length > 0 && (
                <div>
                  <div className="text-[10px] text-[#ff3860] font-bold kr mb-1">
                    ⚠️ 리스크 ({dec.risks.length})
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {dec.risks.slice(0, 4).map((r: string, i: number) => (
                      <li key={i} className="text-[9px] kr leading-relaxed">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 가격 레벨 */}
              <div>
                <div className="text-[10px] text-[var(--amber)] font-bold kr mb-1">
                  🎯 주요 가격 레벨
                </div>
                <div className="space-y-1">
                  {dec.stopLoss && (
                    <div className="flex justify-between text-[9px]">
                      <span className="kr">🛑 손절가</span>
                      <span className="tick font-bold down">${dec.stopLoss.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[9px]">
                    <span className="kr">📍 현재가</span>
                    <span className="tick font-bold">${currentPrice.toFixed(2)}</span>
                  </div>
                  {dec.targetPrice && (
                    <div className="flex justify-between text-[9px]">
                      <span className="kr">🎯 목표가</span>
                      <span className="tick font-bold" style={{ color: dec.color }}>
                        ${dec.targetPrice.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {dec.takeProfit && (
                    <div className="flex justify-between text-[9px]">
                      <span className="kr">💰 익절가</span>
                      <span className="tick font-bold up">${dec.takeProfit.toFixed(2)}</span>
                    </div>
                  )}
                  {insight.nearestOpEx && (
                    <div className="flex justify-between text-[9px] pt-1 border-t border-[var(--border)]">
                      <span className="kr">📅 다음 OpEx</span>
                      <span className="tick font-bold text-[var(--amber)]">
                        D-{insight.nearestOpEx.daysUntil}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메인 바 */}
      <div
        className="bg-[var(--bg)]/98 backdrop-blur-md border-t-2 cursor-pointer"
        style={{ borderColor: dec.color }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2 flex-wrap">
          {/* 좌측: 결정 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* 심볼 선택 (좌측) */}
            <select
              value={symbol}
              onChange={(e) => {
                e.stopPropagation();
                setSymbol(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] bg-transparent border border-[var(--border)] rounded px-2 py-0.5 tick font-bold cursor-pointer hover:border-[var(--amber-dim)]"
              title="종목 선택"
            >
              <option value="NVDA">NVDA</option>
              <option value="AMD">AMD</option>
              <option value="TSM">TSM</option>
              <option value="AVGO">AVGO</option>
              <option value="MU">MU</option>
              <option value="SMH">SMH</option>
              <option value="SPY">SPY</option>
              <option value="QQQ">QQQ</option>
            </select>

            {/* 결정 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[16px] sm:text-[20px] font-bold"
                style={{ color: dec.color }}
              >
                {dec.icon} {dec.actionLabel}
              </span>
              <span className="text-[9px] dim kr">
                ({insight.symbol})
              </span>
              {dec.priority === "high" && (
                <span className="text-[8px] px-1.5 py-0.5 bg-[#ff3860] text-white rounded kr animate-pulse font-bold">
                  ⚡ 긴급
                </span>
              )}
            </div>
          </div>

          {/* 중앙: 요약 */}
          <div className="hidden md:block flex-1 min-w-0 text-center">
            <span className="text-[10px] dim kr truncate block">
              💡 {dec.title}
            </span>
          </div>

          {/* 우측: 신뢰도 + 확장 버튼 */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[8px] dim kr">신뢰도</div>
              <div className="text-[14px] font-bold" style={{ color: dec.color }}>
                {dec.confidence}%
              </div>
            </div>

            {/* 인사이트 빠른 액션 버튼 */}
            <a
              href="/report?print=1"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hidden sm:inline-flex text-[9px] px-2 py-1 border border-[var(--amber)] text-[var(--amber)] hover:bg-[var(--amber)] hover:text-[#111] rounded kr font-bold transition-colors"
              title="PDF 리포트 생성"
            >
              📥 PDF
            </a>

            {/* 확장/축소 */}
            <button
              className="text-[14px] p-1 hover:text-[var(--amber)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              title={expanded ? "접기" : "펼치기"}
            >
              {expanded ? "▼" : "▲"}
            </button>

            {/* 닫기 */}
            <button
              className="text-[14px] p-1 hover:text-[#ff3860] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setVisible(false);
              }}
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
