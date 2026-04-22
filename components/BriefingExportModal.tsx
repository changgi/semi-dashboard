"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════
// Briefing Export Modal
// 
// 기존 HTML 브리핑 파일들을 대체하는 통합 모달:
// - kyle-portfolio-briefing-*.html (종합 브리핑)
// - kyle-portfolio-emergency-*.html (긴급 리포트)
// - kyle-weekly-plan.html (주간 계획)
// 
// 특징:
// - 모든 데이터 실시간 API로 로드
// - 브라우저 인쇄 기능으로 PDF 저장
// - 프린트 최적화 레이아웃 (@media print)
// ═══════════════════════════════════════════════════════════

export function BriefingExportModal({ isOpen, onClose }: Props) {
  const { data: diagnosis } = useSWR<any>(isOpen ? "/api/portfolio-diagnosis" : null, fetcher);
  const { data: ideas } = useSWR<any>(isOpen ? "/api/trade-ideas" : null, fetcher);
  const { data: briefing } = useSWR<any>(isOpen ? "/api/daily-briefing-v2" : null, fetcher);
  const { data: exitStrat } = useSWR<any>(isOpen ? "/api/exit-strategy" : null, fetcher);
  
  const [now] = useState(() => new Date());
  
  if (!isOpen) return null;
  
  const handlePrint = () => {
    window.print();
  };
  
  const diag = diagnosis?.summary;
  const positions = diagnosis?.positions ?? [];
  const actions = diagnosis?.actions ?? [];
  const todayIdeas = (ideas?.ideas ?? []).filter((i: any) => i.urgency === "today");
  const weekIdeas = (ideas?.ideas ?? []).filter((i: any) => i.urgency === "this_week");
  const mood = briefing?.briefing?.marketMood;
  const advice = briefing?.briefing?.advice;
  const marketEvents = briefing?.briefing?.marketEvents ?? [];
  const strategies = exitStrat?.strategies ?? [];
  
  const today = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const todayShort = now.toISOString().split("T")[0];
  
  return (
    <div
      className="fixed inset-0 z-[120] overflow-y-auto print-modal"
      style={{
        background: "rgba(10,10,10,0.98)",
        backdropFilter: "blur(8px)",
      }}
    >
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-page { 
            page-break-after: always; 
            background: white !important;
            color: black !important;
          }
          .print-modal { 
            position: static !important; 
            background: white !important; 
          }
          .print-section {
            background: white !important;
            border: 1px solid #ccc !important;
            color: black !important;
            page-break-inside: avoid;
          }
          .print-section * { color: black !important; }
          .print-section .up-color { color: #008800 !important; }
          .print-section .down-color { color: #cc0000 !important; }
          .print-section .amber-color { color: #b8860b !important; }
        }
      `}</style>
      
      {/* 상단 툴바 (프린트 시 숨김) */}
      <div className="no-print sticky top-0 z-10 bg-black/95 border-b border-[var(--border)] p-3 flex justify-between items-center">
        <div className="text-[11px] tick font-bold kr">📄 종합 브리핑 리포트</div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="text-[11px] px-3 py-1.5 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr"
          >
            🖨 프린트 / PDF 저장
          </button>
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 border border-[var(--border)] rounded dim kr"
          >
            × 닫기
          </button>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
        
        {/* PAGE 1: 커버 + 요약 */}
        <div className="print-page space-y-6">
          {/* 커버 */}
          <div className="print-section text-center py-10 border-4 border-[var(--amber)] rounded">
            <div className="text-[10px] tick tracking-widest kr">PORTFOLIO BRIEFING</div>
            <h1
              className="text-[42px] font-bold my-4 bright"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.02em" }}
            >
              {diag?.healthScore && diag.healthScore < 30 ? "🚨 EMERGENCY" : "📊 DAILY BRIEFING"}
            </h1>
            <div className="text-[14px] kr mb-2" style={{ color: "#e8e8e8" }}>카일님 포트폴리오 진단 · {todayShort}</div>
            <div className="text-[10px] dim kr">{today}</div>
          </div>
          
          {/* 핵심 지표 */}
          <div className="print-section p-5 border border-[var(--border)] rounded bg-black/30">
            <div className="text-[11px] tick font-bold kr mb-3">📊 핵심 지표</div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-[9px] dim kr">현재 평가</div>
                <div
                  className="text-[24px] font-bold bright amber-color"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  ${diag?.totalValueUsd?.toLocaleString() ?? "—"}
                </div>
                <div className="text-[8px] dim kr">원금 ${diag?.totalCostUsd?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[9px] dim kr">손익</div>
                <div
                  className={`text-[24px] font-bold ${diag?.totalGainPct >= 0 ? "up up-color" : "down down-color"}`}
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {diag?.totalGainPct >= 0 ? "+" : ""}{diag?.totalGainPct?.toFixed(1)}%
                </div>
                <div className={`text-[8px] ${diag?.totalGainUsd >= 0 ? "up up-color" : "down down-color"}`}>
                  ${diag?.totalGainUsd?.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[9px] dim kr">건강도</div>
                <div
                  className={`text-[24px] font-bold ${(diag?.healthScore ?? 0) >= 50 ? "up up-color" : "down down-color"}`}
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {diag?.healthScore ?? 0}
                </div>
                <div className="text-[8px] dim">/ 100</div>
              </div>
              <div>
                <div className="text-[9px] dim kr">포지션 수</div>
                <div
                  className="text-[24px] font-bold bright amber-color"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {positions.length}
                </div>
                <div className="text-[8px] dim kr">종목</div>
              </div>
            </div>
          </div>
          
          {/* 시장 무드 + AI 조언 */}
          {(mood || advice) && (
            <div className="print-section p-5 border border-[var(--border)] rounded bg-black/30">
              <div className="text-[11px] tick font-bold kr mb-3">🌅 오늘의 시장 + AI 조언</div>
              {mood && (
                <div className="mb-3">
                  <div className="text-[9px] dim kr">시장 무드</div>
                  <div className="text-[14px] font-bold bright amber-color">{mood.label}</div>
                </div>
              )}
              {advice && (
                <div className="p-3 bg-black/30 rounded border-l-4 border-l-[var(--amber)]">
                  <div className="text-[12px] kr leading-relaxed" style={{ color: "#e8e8e8" }}>
                    💬 {advice}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 보유 포지션 */}
          <div className="print-section p-5 border border-[var(--border)] rounded bg-black/30">
            <div className="text-[11px] tick font-bold kr mb-3">💼 보유 포지션</div>
            <table className="w-full text-[11px] kr">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 dim">종목</th>
                  <th className="text-right py-2 dim">주수</th>
                  <th className="text-right py-2 dim">평단</th>
                  <th className="text-right py-2 dim">현재</th>
                  <th className="text-right py-2 dim">손익률</th>
                  <th className="text-right py-2 dim">평가액</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p: any) => (
                  <tr key={p.symbol} className="border-b border-[var(--border)]/50">
                    <td className="py-2 tick font-bold amber-color">{p.symbol}</td>
                    <td className="text-right py-2">{p.shares}</td>
                    <td className="text-right py-2">${p.avgCost?.toFixed(2)}</td>
                    <td className="text-right py-2">${p.currentPrice?.toFixed(2)}</td>
                    <td className={`text-right py-2 font-bold ${p.gainPct >= 0 ? "up up-color" : "down down-color"}`}>
                      {p.gainPct >= 0 ? "+" : ""}{p.gainPct?.toFixed(1)}%
                    </td>
                    <td className="text-right py-2 tick amber-color">${p.marketValueUsd?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* PAGE 2: 액션 플랜 */}
        <div className="print-page space-y-6">
          <h2
            className="text-[24px] font-bold tick amber-color"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            🎯 ACTION PLAN
          </h2>
          
          {/* 오늘 액션 */}
          {todayIdeas.length > 0 && (
            <div className="print-section p-5 border-2 border-[#ff3860] rounded bg-[rgba(255,56,96,0.05)]">
              <div className="text-[12px] down down-color font-bold kr mb-3">🚨 오늘 실행 ({todayIdeas.length}건)</div>
              <div className="space-y-3">
                {todayIdeas.map((idea: any, i: number) => (
                  <div key={idea.id} className="p-3 border border-[var(--border)] rounded bg-black/20">
                    <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}>
                          {i + 1}.
                        </span>
                        <span
                          className="px-2 py-0.5 rounded font-bold text-[10px]"
                          style={{
                            background: idea.action === "SELL" ? "#ff3860" : "#00ff88",
                            color: "#000",
                          }}
                        >
                          {idea.action}
                        </span>
                        <span className="tick font-bold amber-color text-[14px]">{idea.symbol}</span>
                        <span className="text-[11px] dim kr">{idea.shares}주 · ${idea.estimatedAmount?.toLocaleString()}</span>
                      </div>
                      <span
                        className="text-[14px] font-bold amber-color"
                        style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                      >
                        {idea.confidence}%
                      </span>
                    </div>
                    <div className="text-[10px] kr dim leading-relaxed">
                      💭 {idea.reasoning}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 이번 주 액션 */}
          {weekIdeas.length > 0 && (
            <div className="print-section p-5 border border-[#ffd93d] rounded bg-[rgba(255,217,61,0.04)]">
              <div className="text-[12px] warn amber-color font-bold kr mb-3">⚠️ 이번 주 ({weekIdeas.length}건)</div>
              <div className="space-y-2">
                {weekIdeas.map((idea: any, i: number) => (
                  <div key={idea.id} className="p-2 border border-[var(--border)] rounded bg-black/20">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px]" style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#888" }}>
                        {i + 1}.
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded font-bold text-[9px]"
                        style={{
                          background: idea.action === "SELL" ? "#ff3860" : "#00ff88",
                          color: "#000",
                        }}
                      >
                        {idea.action}
                      </span>
                      <span className="tick amber-color text-[12px] font-bold">{idea.symbol}</span>
                      <span className="text-[10px] dim">{idea.shares}주 · ${idea.estimatedAmount?.toLocaleString()}</span>
                      <span className="text-[9px] dim ml-auto">신뢰 {idea.confidence}%</span>
                    </div>
                    <div className="text-[9px] kr dim pl-4">
                      {idea.reasoning?.substring(0, 120)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 진단 액션 */}
          {actions.length > 0 && (
            <div className="print-section p-5 border border-[var(--border)] rounded bg-black/30">
              <div className="text-[11px] tick font-bold kr mb-3">🩺 포트 진단 액션</div>
              <div className="space-y-2">
                {actions.slice(0, 5).map((a: any, i: number) => (
                  <div key={i} className="p-2 border-l-4 bg-black/20" style={{
                    borderLeftColor: a.priority === 1 ? "#ff3860" : a.priority === 2 ? "#ffd93d" : "#7ec8ff",
                  }}>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] kr font-bold">
                        P{a.priority}. {a.title}
                      </span>
                      <span className="text-[9px] dim kr">{a.urgency}</span>
                    </div>
                    <div className="text-[10px] kr dim mt-1">{a.reasoning}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* PAGE 3: Exit Strategy + Events */}
        <div className="print-page space-y-6">
          <h2
            className="text-[24px] font-bold tick amber-color"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            🎯 EXIT STRATEGY & EVENTS
          </h2>
          
          {/* Exit Strategy */}
          {strategies.length > 0 && (
            <div className="print-section p-5 border border-[var(--border)] rounded bg-black/30">
              <div className="text-[11px] tick font-bold kr mb-3">🎯 출구 전략 · 각 포지션별 손절/익절</div>
              <div className="space-y-2">
                {strategies.map((s: any) => (
                  <div key={s.symbol} className="p-3 border border-[var(--border)] rounded bg-black/20">
                    <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                      <span className="tick amber-color font-bold text-[13px]">{s.symbol}</span>
                      <span
                        className="text-[9px] px-2 py-0.5 rounded font-bold kr"
                        style={{
                          background: s.recommendation?.urgency === "high" ? "#ff3860" :
                                      s.recommendation?.urgency === "medium" ? "#ffd93d" : "#00ff88",
                          color: "#000",
                        }}
                      >
                        {s.recommendation?.urgency?.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <div className="dim kr">현재</div>
                        <div className="tick amber-color font-bold">${s.currentPrice?.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="dim kr">🛑 손절</div>
                        <div className="down down-color font-bold">${s.stopLoss?.price?.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="dim kr">R1</div>
                        <div className="up up-color font-bold">${s.takeProfit?.r1?.price?.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="dim kr">R3</div>
                        <div className="up up-color font-bold">${s.takeProfit?.r3?.price?.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="text-[9px] kr dim mt-1">
                      {s.recommendation?.message?.substring(0, 80)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 다가오는 이벤트 */}
          {marketEvents.length > 0 && (
            <div className="print-section p-5 border border-[var(--border)] rounded bg-black/30">
              <div className="text-[11px] tick font-bold kr mb-3">📅 다가오는 이벤트</div>
              <div className="space-y-1">
                {marketEvents.slice(0, 8).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--border)]/30">
                    <div className="flex items-center gap-2 flex-1">
                      <span
                        className="text-[11px] font-bold amber-color"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", minWidth: "40px" }}
                      >
                        D-{e.daysUntil}
                      </span>
                      <div>
                        <div className="text-[11px] kr font-bold">
                          {e.symbol ?? e.event} · {e.date}
                        </div>
                        <div className="text-[9px] dim kr">{e.description ?? e.companyName}</div>
                      </div>
                    </div>
                    {e.importance && (
                      <div className="text-[9px] dim">★{e.importance}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 원칙 */}
          <div className="print-section p-5 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.05)]">
            <div className="text-[11px] tick font-bold kr mb-3 amber-color">💎 카일님 7가지 투자 원칙</div>
            <ol className="space-y-2 text-[11px] kr" style={{ color: "#e8e8e8" }}>
              <li>1. 하나의 기초자산 비중 25% 이하</li>
              <li>2. 레버리지 ETF 전체 30% 이하</li>
              <li>3. 모든 포지션에 사전 손절가 설정</li>
              <li>4. 매매 후 24시간 내 Journal 기록</li>
              <li>5. 손실 종목 물타기(DCA) 금지 (본주 예외)</li>
              <li>6. 실적 D-2 이내 레버리지 포지션 청산</li>
              <li>7. 감정 개입 시 24시간 대기</li>
            </ol>
          </div>
          
          {/* Footer */}
          <div className="print-section text-center py-6 border-t border-[var(--border)] text-[10px] dim kr">
            Generated from semi-dashboard.vercel.app · {today}<br />
            Kyle Kim · 국가기록원 기록관리교육센터
          </div>
        </div>
      </div>
    </div>
  );
}
