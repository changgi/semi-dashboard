"use client";

import useSWR from "swr";
import { useEffect } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ═══════════════════════════════════════════════════════════
// Daily Briefing Report Page
// /report 경로로 접근, 인쇄 최적화 (A4 세로)
// ═══════════════════════════════════════════════════════════

export default function ReportPage() {
  const { data, isLoading } = useSWR<any>("/api/briefing", fetcher);

  useEffect(() => {
    // 제목 동적 설정
    if (typeof document !== "undefined") {
      const today = new Date().toISOString().split("T")[0];
      document.title = `반도체 투자 브리핑 ${today}`;
    }
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading || !data?.success) {
    return (
      <div className="p-10 text-center text-gray-600">
        {isLoading ? "리포트 생성 중..." : "데이터 로딩 실패"}
      </div>
    );
  }

  const overallColor = data.summary.healthScore >= 75 ? "#00aa44"
                    : data.summary.healthScore >= 50 ? "#d19200"
                    : data.summary.healthScore >= 30 ? "#cc6600" : "#cc2222";

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      {/* 인쇄용 CSS */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm 15mm;
          }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
          padding: 20mm 15mm;
          background: white;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
          line-height: 1.5;
          color: #222;
        }
        @media print {
          .report-container {
            padding: 0;
            max-width: none;
            box-shadow: none;
          }
        }
      `}</style>

      {/* 인쇄/공유 버튼 (인쇄 시 숨김) */}
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-amber-500 text-white rounded shadow hover:bg-amber-600 font-bold text-sm"
        >
          🖨️ 인쇄 / PDF 저장
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-4 py-2 bg-gray-700 text-white rounded shadow hover:bg-gray-800 text-sm"
        >
          ← 대시보드로
        </button>
      </div>

      <div className="report-container">
        {/* ═════════ 1. 헤더 ═════════ */}
        <header className="border-b-2 border-gray-800 pb-4 mb-6 avoid-break">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 tracking-widest font-mono">
                ◢ SEMICONDUCTOR DAILY BRIEFING
              </div>
              <h1 className="text-3xl font-bold mt-1 text-gray-900">
                반도체 투자 일일 브리핑
              </h1>
              <div className="text-sm text-gray-600 mt-1">
                {data.reportDate} · {data.reportTime}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">종합 투자 환경 점수</div>
              <div className="text-5xl font-bold leading-none" style={{ color: overallColor }}>
                {data.summary.healthScore}
                <span className="text-lg text-gray-400 font-normal">/100</span>
              </div>
              <div className="text-sm font-bold mt-1" style={{ color: overallColor }}>
                {data.summary.overallView}
              </div>
            </div>
          </div>
        </header>

        {/* ═════════ 2. 핵심 인사이트 ═════════ */}
        <section className="mb-6 avoid-break">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
            🎯 오늘의 핵심 인사이트
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded p-4">
            <ol className="space-y-2 text-sm">
              {data.insights.map((insight: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-600 font-bold">{i + 1}.</span>
                  <span className="text-gray-800">{insight}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ═════════ 3. 매크로 체크리스트 ═════════ */}
        <section className="mb-6 avoid-break">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
            📊 매크로 체크리스트
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="text-left py-2 px-3">지표</th>
                <th className="text-right py-2 px-3">현재값</th>
                <th className="text-left py-2 px-3">목표</th>
                <th className="text-center py-2 px-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {data.checkpoints.map((cp: any, i: number) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-2 px-3 font-semibold">{cp.name}</td>
                  <td className="text-right py-2 px-3 font-mono font-bold">
                    {cp.current}
                  </td>
                  <td className="py-2 px-3 text-gray-600 text-xs">{cp.target}</td>
                  <td className="text-center py-2 px-3">
                    {cp.status === "positive" && (
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-bold">
                        ✓ 긍정
                      </span>
                    )}
                    {cp.status === "neutral" && (
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-bold">
                        ⚖ 중립
                      </span>
                    )}
                    {cp.status === "negative" && (
                      <span className="inline-block px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold">
                        ✗ 부정
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                <td colSpan={3} className="py-2 px-3 text-right">합계</td>
                <td className="text-center py-2 px-3 text-xs">
                  <span className="text-green-700">✓{data.summary.positiveCount}</span>
                  {" · "}
                  <span className="text-gray-600">⚖{data.summary.neutralCount}</span>
                  {" · "}
                  <span className="text-red-700">✗{data.summary.negativeCount}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ═════════ 4. 반도체 섹터 스냅샷 ═════════ */}
        <section className="mb-6 avoid-break">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
            📈 반도체 섹터 스냅샷
          </h2>
          <div className="mb-3 text-sm">
            섹터 평균:{" "}
            <span className={`font-bold ${data.stocks.sectorAvgChange >= 0 ? "text-green-700" : "text-red-700"}`}>
              {data.stocks.sectorAvgChange >= 0 ? "+" : ""}
              {data.stocks.sectorAvgChange}%
            </span>
            <span className="text-gray-500 ml-2">({data.stocks.totalCount}개 종목)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 상승 TOP 5 */}
            <div>
              <div className="text-sm font-bold mb-2 text-green-700">🚀 상승 TOP 5</div>
              <table className="w-full text-sm">
                <tbody>
                  {data.stocks.topGainers.map((s: any, i: number) => (
                    <tr key={s.symbol} className="border-b border-gray-100">
                      <td className="py-1 font-mono font-bold">
                        {i + 1}. {s.symbol}
                      </td>
                      <td className="py-1 text-gray-600 text-xs truncate">{s.name}</td>
                      <td className="py-1 text-right text-green-700 font-bold">
                        +{s.changePct?.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 하락 TOP 5 */}
            <div>
              <div className="text-sm font-bold mb-2 text-red-700">📉 하락 TOP 5</div>
              <table className="w-full text-sm">
                <tbody>
                  {data.stocks.topLosers.map((s: any, i: number) => (
                    <tr key={s.symbol} className="border-b border-gray-100">
                      <td className="py-1 font-mono font-bold">
                        {i + 1}. {s.symbol}
                      </td>
                      <td className="py-1 text-gray-600 text-xs truncate">{s.name}</td>
                      <td className="py-1 text-right text-red-700 font-bold">
                        {s.changePct?.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═════════ 5. AI 에이전트 합의 ═════════ */}
        <section className="mb-6 avoid-break">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
            🤖 AI 에이전트 합의 (19명)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* 매수 추천 */}
            <div>
              <div className="text-sm font-bold mb-2 text-green-700">
                ✅ 매수 추천 TOP {data.agents.topPicks.length}
              </div>
              {data.agents.topPicks.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {data.agents.topPicks.map((p: any) => (
                      <tr key={p.symbol} className="border-b border-gray-100">
                        <td className="py-1 font-mono font-bold">{p.symbol}</td>
                        <td className="py-1 text-right text-green-700 font-bold">
                          +{p.final_score}
                        </td>
                        <td className="py-1 text-right text-xs text-gray-600">
                          합의 {p.agreement_level}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-gray-500">강력 매수 합의 없음</div>
              )}
            </div>

            {/* 매도 회피 */}
            <div>
              <div className="text-sm font-bold mb-2 text-red-700">
                ⚠️ 매도/회피 {data.agents.topAvoid.length}
              </div>
              {data.agents.topAvoid.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {data.agents.topAvoid.map((p: any) => (
                      <tr key={p.symbol} className="border-b border-gray-100">
                        <td className="py-1 font-mono font-bold">{p.symbol}</td>
                        <td className="py-1 text-right text-red-700 font-bold">
                          {p.final_score}
                        </td>
                        <td className="py-1 text-right text-xs text-gray-600">
                          합의 {p.agreement_level}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-gray-500">강력 회피 합의 없음</div>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            총 {data.agents.totalAnalyzed}개 종목 분석 · 점수 ±15 이상만 표시
          </div>
        </section>

        {/* ═════════ 6. 포트폴리오 (있을 때만) ═════════ */}
        {data.portfolio && (
          <section className="mb-6 avoid-break page-break">
            <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
              💼 내 포트폴리오 성과
            </h2>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <div className="text-xs text-gray-500">총 평가액</div>
                <div className="text-2xl font-bold">${data.portfolio.totalValue.toLocaleString()}</div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-xs text-gray-500">총 손익</div>
                <div className={`text-2xl font-bold ${data.portfolio.totalGain >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {data.portfolio.totalGain >= 0 ? "+" : ""}${data.portfolio.totalGain.toLocaleString()}
                </div>
                <div className={`text-sm font-bold ${data.portfolio.totalGainPct >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {data.portfolio.totalGainPct >= 0 ? "+" : ""}
                  {data.portfolio.totalGainPct}%
                </div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-xs text-gray-500">보유 종목</div>
                <div className="text-2xl font-bold">{data.portfolio.positionCount}개</div>
              </div>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left py-2 px-2">종목</th>
                  <th className="text-right py-2 px-2">수량</th>
                  <th className="text-right py-2 px-2">평균가</th>
                  <th className="text-right py-2 px-2">현재가</th>
                  <th className="text-right py-2 px-2">수익률</th>
                  <th className="text-right py-2 px-2">일변동</th>
                </tr>
              </thead>
              <tbody>
                {data.portfolio.positions.map((p: any) => (
                  <tr key={p.symbol} className="border-b border-gray-200">
                    <td className="py-1.5 px-2">
                      <div className="font-mono font-bold text-xs">{p.symbol}</div>
                      <div className="text-xs text-gray-500">{p.name}</div>
                    </td>
                    <td className="text-right py-1.5 px-2 font-mono">{p.shares}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-xs">
                      {p.currency === "KRW" ? "₩" : "$"}
                      {p.currency === "KRW" ? p.avgCost.toLocaleString() : p.avgCost.toFixed(2)}
                    </td>
                    <td className="text-right py-1.5 px-2 font-mono text-xs">
                      {p.currency === "KRW" ? "₩" : "$"}
                      {p.currency === "KRW" ? p.currentPrice.toLocaleString() : p.currentPrice.toFixed(2)}
                    </td>
                    <td className={`text-right py-1.5 px-2 font-bold ${p.gainPct >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {p.gainPct >= 0 ? "+" : ""}
                      {p.gainPct}%
                    </td>
                    <td className={`text-right py-1.5 px-2 text-xs ${(p.dayChangePct ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {p.dayChangePct !== null && p.dayChangePct !== undefined ? `${p.dayChangePct >= 0 ? "+" : ""}${p.dayChangePct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ═════════ 7. 예측 모델 신뢰도 ═════════ */}
        {data.accuracy && (
          <section className="mb-6 avoid-break">
            <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
              🎯 예측 모델 신뢰도 (30일 기준)
            </h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="border border-gray-200 rounded p-3 text-center">
                <div className="text-xs text-gray-500">MAPE</div>
                <div className={`text-2xl font-bold ${
                  data.accuracy.avgMape < 5 ? "text-green-700" :
                  data.accuracy.avgMape < 10 ? "text-amber-600" : "text-red-700"
                }`}>
                  {data.accuracy.avgMape}%
                </div>
                <div className="text-xs text-gray-500">평균 오차</div>
              </div>
              <div className="border border-gray-200 rounded p-3 text-center">
                <div className="text-xs text-gray-500">구간 적중</div>
                <div className={`text-2xl font-bold ${
                  Math.abs(data.accuracy.avgCoverage - 80) < 10 ? "text-green-700" : "text-amber-600"
                }`}>
                  {data.accuracy.avgCoverage}%
                </div>
                <div className="text-xs text-gray-500">80% 이상적</div>
              </div>
              <div className="border border-gray-200 rounded p-3 text-center">
                <div className="text-xs text-gray-500">방향 적중</div>
                <div className={`text-2xl font-bold ${
                  data.accuracy.avgDirectionAcc >= 65 ? "text-green-700" :
                  data.accuracy.avgDirectionAcc >= 50 ? "text-amber-600" : "text-red-700"
                }`}>
                  {data.accuracy.avgDirectionAcc}%
                </div>
                <div className="text-xs text-gray-500">65%+ 우수</div>
              </div>
              <div className="border border-gray-200 rounded p-3 text-center">
                <div className="text-xs text-gray-500">샘플</div>
                <div className="text-2xl font-bold text-gray-700">{data.accuracy.sampleCount}</div>
                <div className="text-xs text-gray-500">검증 건수</div>
              </div>
            </div>
          </section>
        )}

        {/* ═════════ 8. Daniel Yoo 프레임워크 ═════════ */}
        <section className="mb-6 avoid-break">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-l-4 border-amber-500 pl-3">
            🇰🇷 Daniel Yoo 전략 프레임워크
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded p-4 space-y-2 text-sm">
            <div>
              <span className="font-bold text-blue-800">📈 시장 전망: </span>
              <span className="text-gray-800">{data.danielYoo.view}</span>
            </div>
            <div>
              <span className="font-bold text-blue-800">⚖️ 권장 자산배분: </span>
              <span className="text-gray-800">{data.danielYoo.allocation}</span>
            </div>
            <div>
              <span className="font-bold text-blue-800">🎯 추천 종목: </span>
              <span className="text-gray-800">{data.danielYoo.topPicks}</span>
            </div>
          </div>
        </section>

        {/* ═════════ 푸터 ═════════ */}
        <footer className="border-t-2 border-gray-300 pt-4 mt-8 text-xs text-gray-500">
          <div className="flex justify-between items-center">
            <div>
              <div>🔬 <strong>분석 방법론</strong>: Ornstein-Uhlenbeck 평균회귀 · 19 AI 에이전트 · Black-Scholes 옵션 · Daniel Yoo 프레임워크</div>
              <div className="mt-1">📊 <strong>데이터 소스</strong>: Yahoo Finance · CBOE · Finnhub · Supabase (Seoul)</div>
            </div>
            <div className="text-right">
              <div className="font-mono">◢ SEMI DASHBOARD</div>
              <div>NOT FINANCIAL ADVICE</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
