"use client";

import useSWR from "swr";
import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ═══════════════════════════════════════════════════════════
// 통합 일일 리포트 페이지
// /report 경로로 접근, 인쇄 최적화 (A4 세로)
// ?print=1 로 접근 시 자동 인쇄 대화상자 오픈
// ═══════════════════════════════════════════════════════════

function ReportContent() {
  const searchParams = useSearchParams();
  const autoPrint = searchParams?.get("print") === "1";

  const { data: briefing } = useSWR<any>("/api/briefing", fetcher);
  const { data: portfolio } = useSWR<any>("/api/portfolio", fetcher);
  const { data: nvda } = useSWR<any>("/api/options-impact?symbol=NVDA", fetcher);
  const { data: opex } = useSWR<any>("/api/opex-calendar?days=60", fetcher);
  const { data: advisor } = useSWR<any>("/api/advisor", fetcher);

  const allLoaded = briefing && portfolio;

  useEffect(() => {
    if (typeof document !== "undefined") {
      const today = new Date().toISOString().split("T")[0];
      document.title = `카일의 투자 브리핑 ${today}`;
    }
  }, []);

  // 자동 인쇄 (데이터 로드 후)
  useEffect(() => {
    if (autoPrint && allLoaded) {
      const timer = setTimeout(() => {
        window.print();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, allLoaded]);

  const handlePrint = () => {
    window.print();
  };

  if (!allLoaded) {
    return (
      <div className="p-10 text-center text-gray-600">
        <div className="text-xl mb-2">📄 리포트 생성 중...</div>
        <div className="text-sm text-gray-400">
          포트폴리오 · 매크로 · 옵션 · OpEx 데이터 수집 중
        </div>
      </div>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const dayName = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];

  // 판단 로직
  let actionColor = "#3b82f6";
  let actionIcon = "💎";
  let actionName = "보유 유지";
  let headline = "명확한 시그널 없음 - 현재 포지션 유지";
  let confidence = 55;

  if (advisor?.success) {
    const stance = advisor.stance || "";
    if (stance.includes("적극") || stance.includes("공격")) {
      actionName = "매수 권장";
      actionColor = "#16a34a";
      actionIcon = "📈";
      headline = stance;
      confidence = 75;
    } else if (stance.includes("방어") || stance.includes("축소")) {
      actionName = "방어 / 헤지";
      actionColor = "#dc2626";
      actionIcon = "🛡️";
      headline = stance;
      confidence = 70;
    } else if (stance) {
      headline = stance;
    }
  }

  if (briefing?.success && briefing.summary?.overallView) {
    headline = briefing.summary.overallView;
  }

  const healthScore = briefing?.summary?.healthScore ?? 0;
  const healthColor = healthScore >= 75 ? "#16a34a"
                    : healthScore >= 50 ? "#d97706"
                    : healthScore >= 30 ? "#ea580c" : "#dc2626";

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm 12mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
          .avoid-break { page-break-inside: avoid; }
        }
        .report-container {
          max-width: 210mm;
          margin: 0 auto;
          padding: 20mm 18mm;
          background: white;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
          line-height: 1.5;
          color: #1f2937;
        }
        @media print {
          .report-container {
            padding: 0;
            max-width: none;
            box-shadow: none;
          }
        }
      `}</style>

      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 shadow-lg"
        >
          ✕ 닫기
        </button>
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 shadow-lg font-bold"
        >
          📥 PDF 저장 / 인쇄
        </button>
      </div>

      <div className="report-container">
        {/* 헤더 */}
        <div className="text-center border-b-4 border-amber-500 pb-4 mb-6">
          <div className="text-4xl font-bold text-amber-600 mb-2">☕ MORNING BRIEFING</div>
          <div className="text-base text-gray-500">
            카일님의 투자 브리핑 · {dateStr} ({dayName}요일)
          </div>
        </div>

        {/* Executive Summary */}
        <section className="mb-6 avoid-break">
          <h2 className="text-xl font-bold text-amber-600 mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-6 bg-amber-500"></span>
            오늘의 결정
          </h2>

          <div
            className="border-2 rounded-lg p-5"
            style={{
              borderColor: actionColor,
              background: `linear-gradient(135deg, ${actionColor}10, transparent)`,
            }}
          >
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">오늘의 결정</div>
                <div className="text-4xl font-bold leading-tight" style={{ color: actionColor }}>
                  {actionIcon} {actionName}
                </div>
                <div className="text-base font-bold mt-3" style={{ color: actionColor }}>
                  {headline}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">신뢰도</div>
                <div className="text-3xl font-bold" style={{ color: actionColor }}>
                  {confidence}%
                </div>
                <div className="w-24 h-1.5 bg-gray-200 rounded overflow-hidden mt-1">
                  <div className="h-full" style={{ width: `${confidence}%`, background: actionColor }} />
                </div>
              </div>
            </div>

            {briefing?.summary && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs text-gray-500">시장 환경 점수</span>
                  <span className="ml-2 text-lg font-bold" style={{ color: healthColor }}>
                    {healthScore}/100
                  </span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600">✅ 긍정 {briefing.summary.positiveCount}</span>
                  <span className="text-gray-600">⏸️ 중립 {briefing.summary.neutralCount}</span>
                  <span className="text-red-600">⚠️ 부정 {briefing.summary.negativeCount}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 포트폴리오 */}
        {portfolio?.success && (
          <section className="mb-6 avoid-break">
            <h2 className="text-xl font-bold text-amber-600 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-6 bg-amber-500"></span>
              💼 포트폴리오 현황
            </h2>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3 text-center">
              <span className="text-sm text-gray-600">총 평가액</span>
              <span className="text-2xl font-bold text-amber-600 ml-2">
                ${portfolio.summary.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="mx-3 text-gray-300">│</span>
              <span className="text-sm text-gray-600">수익률</span>
              <span
                className={`text-xl font-bold ml-2 ${
                  portfolio.summary.totalGainPct >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {portfolio.summary.totalGainPct >= 0 ? "+" : ""}
                {portfolio.summary.totalGainPct.toFixed(2)}%
              </span>
              <span className="mx-3 text-gray-300">│</span>
              <span className="text-sm text-gray-600">
                환율 ₩{portfolio.summary.usdKrwRate.toFixed(0)}/$
              </span>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-900 text-amber-500">
                  <th className="p-2 text-left">심볼</th>
                  <th className="p-2 text-left">종목명</th>
                  <th className="p-2 text-right">수량</th>
                  <th className="p-2 text-right">평단가</th>
                  <th className="p-2 text-right">현재가</th>
                  <th className="p-2 text-right">수익률</th>
                  <th className="p-2 text-right">평가액</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((h: any) => (
                  <tr key={h.id} className="border-b border-gray-200">
                    <td className="p-2 font-mono font-bold">{h.symbol}</td>
                    <td className="p-2">{h.name || "-"}</td>
                    <td className="p-2 text-right">{h.shares}</td>
                    <td className="p-2 text-right">
                      {h.currency === "KRW" ? `₩${h.avgCost.toLocaleString()}` : `$${h.avgCost.toFixed(2)}`}
                    </td>
                    <td className="p-2 text-right">
                      {h.currency === "KRW" ? `₩${h.currentPrice.toLocaleString()}` : `$${h.currentPrice.toFixed(2)}`}
                    </td>
                    <td className={`p-2 text-right font-bold ${h.gainPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {h.gainPct >= 0 ? "+" : ""}
                      {h.gainPct.toFixed(2)}%
                    </td>
                    <td className="p-2 text-right font-mono">
                      {h.currency === "KRW" ? `₩${h.marketValue.toLocaleString()}` : `$${h.marketValue.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 매크로 */}
        {briefing?.success && briefing.macro && (
          <section className="mb-6 avoid-break">
            <h2 className="text-xl font-bold text-amber-600 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-6 bg-amber-500"></span>
              🌍 매크로 지표
            </h2>

            <div className="grid grid-cols-5 gap-2">
              {briefing.macro.vix?.price && (
                <MacroCard
                  label="😱 VIX"
                  value={briefing.macro.vix.price.toFixed(2)}
                  status={briefing.macro.vix.price > 25 ? "공포" : briefing.macro.vix.price > 20 ? "주의" : "정상"}
                  color={briefing.macro.vix.price > 20 ? "red" : "green"}
                />
              )}
              {briefing.macro.yield10?.price && (
                <MacroCard
                  label="📊 10Y TNX"
                  value={`${briefing.macro.yield10.price.toFixed(2)}%`}
                  status={briefing.macro.yield10.price > 4.5 ? "고금리" : "정상"}
                  color={briefing.macro.yield10.price > 4.5 ? "red" : "amber"}
                />
              )}
              {briefing.macro.dxy?.price && (
                <MacroCard
                  label="💵 DXY"
                  value={briefing.macro.dxy.price.toFixed(2)}
                  status={briefing.macro.dxy.price > 105 ? "강달러" : "정상"}
                  color={briefing.macro.dxy.price > 105 ? "red" : "amber"}
                />
              )}
              {briefing.macro.oil?.price && (
                <MacroCard
                  label="🛢️ WTI"
                  value={`$${briefing.macro.oil.price.toFixed(2)}`}
                  status={briefing.macro.oil.price > 90 ? "고유가" : "정상"}
                  color={briefing.macro.oil.price > 90 ? "red" : "amber"}
                />
              )}
              {portfolio?.summary?.usdKrwRate && (
                <MacroCard
                  label="💱 USD/KRW"
                  value={`₩${portfolio.summary.usdKrwRate.toFixed(0)}`}
                  status={portfolio.summary.usdKrwRate > 1400 ? "원화약세" : "정상"}
                  color={portfolio.summary.usdKrwRate > 1400 ? "red" : "amber"}
                />
              )}
            </div>
          </section>
        )}

        {/* NVDA 옵션 분석 */}
        {nvda?.success && (
          <section className="mb-6 avoid-break page-break">
            <h2 className="text-xl font-bold text-amber-600 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-6 bg-amber-500"></span>
              🎯 NVDA 옵션 분석
            </h2>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 text-center">
              <span className="text-sm text-gray-600">예측 방향:</span>
              <span
                className="text-lg font-bold ml-2"
                style={{
                  color: nvda.prediction.direction === "up" ? "#16a34a" :
                         nvda.prediction.direction === "down" ? "#dc2626" : "#3b82f6",
                }}
              >
                {nvda.prediction.direction === "up" ? "📈 상승" :
                 nvda.prediction.direction === "down" ? "📉 하락" : "➖ 중립"}
              </span>
              <span className="mx-3 text-gray-300">│</span>
              <span className="text-sm">
                목표가 <b>${nvda.prediction.targetPrice.toFixed(2)}</b> (
                {nvda.prediction.targetPct >= 0 ? "+" : ""}
                {nvda.prediction.targetPct.toFixed(2)}%)
              </span>
              <span className="mx-3 text-gray-300">│</span>
              <span className="text-sm">
                신뢰도 <b>{nvda.prediction.confidence}%</b>
              </span>
              <span className="mx-3 text-gray-300">│</span>
              <span className="text-sm text-gray-600">{nvda.prediction.timeHorizon}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">현재가</div>
                <div className="text-xl font-bold">${nvda.currentPrice.toFixed(2)}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Max Pain</div>
                <div className="text-xl font-bold text-purple-600">
                  ${nvda.maxPain?.toFixed(2) ?? "-"}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">GEX</div>
                <div
                  className={`text-xl font-bold ${nvda.gex.total >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {nvda.gex.total >= 0 ? "+" : ""}
                  {(nvda.gex.total / 1e9).toFixed(2)}B
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {nvda.gex.regime === "positive" ? "양의 레짐 (안정)" : "음의 레짐 (위험)"}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">예상 변동폭</div>
                <div className="text-xl font-bold text-amber-600">
                  ±{nvda.expectedMovePct?.toFixed(2)}%
                </div>
              </div>
            </div>

            {nvda.prediction.signals?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-bold text-amber-700 mb-2">🔍 주요 시그널</div>
                <ul className="space-y-1">
                  {nvda.prediction.signals.slice(0, 4).map((s: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700 pl-4">• {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {nvda.prediction.rationale?.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-bold text-amber-700 mb-2">💭 분석 근거</div>
                <ul className="space-y-1">
                  {nvda.prediction.rationale.slice(0, 3).map((r: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700 pl-4">• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* OpEx */}
        {opex?.success && opex.nextMajor && (
          <section className="mb-6 avoid-break">
            <h2 className="text-xl font-bold text-amber-600 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-6 bg-amber-500"></span>
              📅 다가오는 주요 만기
            </h2>

            <div className="border-l-4 border-amber-500 bg-amber-50 pl-4 py-3 mb-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-lg font-bold">{opex.nextMajor.typeLabel}</span>
                <span className="text-sm font-mono">{opex.nextMajor.date}</span>
                <span className="text-2xl font-bold text-amber-600">D-{opex.nextMajor.daysUntil}</span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                변동성: <b>{opex.nextMajor.expectedImpact.volatilityLevel}</b> · 예상: <b>{opex.nextMajor.expectedImpact.typicalMoveRange}</b> · 편향: <b>{opex.nextMajor.expectedImpact.historicalReturnBias}</b>
              </div>
            </div>

            <div className="space-y-2">
              {[
                { k: "before", label: "📍 만기 전", color: "green" },
                { k: "during", label: "📍 만기 당일", color: "amber" },
                { k: "after", label: "📍 만기 후", color: "purple" },
              ].map((g) => (
                <div
                  key={g.k}
                  className={`border-l-4 pl-3 py-2 ${
                    g.color === "green" ? "border-green-500 bg-green-50" :
                    g.color === "amber" ? "border-amber-500 bg-amber-50" :
                    "border-purple-500 bg-purple-50"
                  }`}
                >
                  <div className={`text-sm font-bold mb-0.5 ${
                    g.color === "green" ? "text-green-700" :
                    g.color === "amber" ? "text-amber-700" :
                    "text-purple-700"
                  }`}>
                    {g.label}
                  </div>
                  <div className="text-sm text-gray-700">
                    {opex.nextMajor.tradingGuide[g.k]}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 오늘 할 일 */}
        {advisor?.success && advisor.actions?.length > 0 && (
          <section className="mb-6 avoid-break">
            <h2 className="text-xl font-bold text-amber-600 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-6 bg-amber-500"></span>
              🎯 오늘 할 일 체크리스트
            </h2>

            <div className="space-y-2">
              {advisor.actions.slice(0, 5).map((a: any, i: number) => {
                const pColor =
                  a.priority === "high" ? "border-red-500 bg-red-50" :
                  a.priority === "medium" ? "border-amber-500 bg-amber-50" :
                  "border-blue-500 bg-blue-50";
                const pTextColor =
                  a.priority === "high" ? "text-red-700" :
                  a.priority === "medium" ? "text-amber-700" :
                  "text-blue-700";
                const pLabel =
                  a.priority === "high" ? "🔴 긴급" :
                  a.priority === "medium" ? "🟡 중간" :
                  "🔵 낮음";

                return (
                  <div key={i} className={`border-l-4 ${pColor} p-3`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className={`text-base font-bold ${pTextColor}`}>
                        #{i + 1}. {a.title}
                      </div>
                      <span className={`text-xs px-2 py-0.5 border rounded font-bold ${pTextColor}`}>
                        {pLabel}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {a.desc || a.description}
                    </div>
                    {a.steps && a.steps.length > 0 && (
                      <ol className="text-xs text-gray-600 mt-2 pl-5 list-decimal space-y-0.5">
                        {a.steps.slice(0, 3).map((s: string, si: number) => (
                          <li key={si}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 푸터 */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
          <div>본 브리핑은 {now.toLocaleString("ko-KR")} 기준 실시간 데이터로 자동 작성되었습니다.</div>
          <div className="mt-1">
            투자 결정은 본인 책임하에 이루어져야 합니다. Kyle의 반도체 투자 터미널 ·
            <span className="ml-1 font-mono">semi-dashboard.vercel.app</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Suspense wrapper (useSearchParams 요구)
// ═══════════════════════════════════════════════════════════
export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-600">🔄 로딩 중...</div>}>
      <ReportContent />
    </Suspense>
  );
}

// ═══════════════════════════════════════════════════════════
// 매크로 카드
// ═══════════════════════════════════════════════════════════
function MacroCard({
  label, value, status, color,
}: {
  label: string;
  value: string;
  status: string;
  color: "red" | "amber" | "green";
}) {
  const colors = {
    red: "border-red-300 bg-red-50 text-red-700",
    amber: "border-amber-300 bg-amber-50 text-amber-700",
    green: "border-green-300 bg-green-50 text-green-700",
  };
  return (
    <div className={`border rounded p-2 text-center ${colors[color]}`}>
      <div className="text-xs font-bold">{label}</div>
      <div className="text-base font-bold font-mono">{value}</div>
      <div className="text-xs">{status}</div>
    </div>
  );
}
