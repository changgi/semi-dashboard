"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Correlation {
  macro: string;
  label: string;
  desc: string;
  correlation: number;
  strength: string;
  interpretation: string;
}

interface MatrixRow {
  symbol: string;
  correlations: Correlation[];
}

interface MacroSymbol {
  symbol: string;
  label: string;
  desc: string;
}

// 상관계수를 색상으로 매핑 (-1 ~ +1)
function corrToColor(corr: number): string {
  if (corr > 0.6) return "rgba(0,255,136,0.9)";   // 진한 녹색
  if (corr > 0.3) return "rgba(0,255,136,0.5)";   // 중간 녹색
  if (corr > 0.1) return "rgba(0,255,136,0.2)";   // 연한 녹색
  if (corr > -0.1) return "rgba(128,128,128,0.3)"; // 중립 회색
  if (corr > -0.3) return "rgba(255,56,96,0.2)";   // 연한 적색
  if (corr > -0.6) return "rgba(255,56,96,0.5)";   // 중간 적색
  return "rgba(255,56,96,0.9)";                    // 진한 적색
}

function corrToText(corr: number): string {
  if (corr > 0.6) return "text-[#00ff88]";
  if (corr > 0.3) return "text-[#88dd99]";
  if (corr > -0.3) return "dim";
  if (corr > -0.6) return "text-[#ff8888]";
  return "text-[#ff3860]";
}

export function MacroCorrelation() {
  const { data, isLoading, error } = useSWR("/api/macro-correlation", fetcher, {
    refreshInterval: 600000, // 10분
  });

  const matrix: MatrixRow[] = data?.matrix ?? [];
  const macros: MacroSymbol[] = data?.macros ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🔗 MACRO-SEMI CORRELATION MATRIX
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            매크로 지표와 반도체 종목의 1년간 상관관계 (피어슨 계수)
          </div>
        </div>
      </div>

      {error ? (
        <div className="text-[10px] dim py-6 text-center kr">
          상관관계 데이터 로딩 실패
        </div>
      ) : isLoading && matrix.length === 0 ? (
        <div className="text-[10px] dim py-6 text-center kr">계산 중...</div>
      ) : matrix.length === 0 ? (
        <div className="text-[10px] dim py-6 text-center kr">
          데이터 부족 · 일봉 30개 이상 필요
        </div>
      ) : (
        <>
          {/* 히트맵 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] sm:text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-2 tick whitespace-nowrap">종목</th>
                  {macros.map((m) => (
                    <th key={m.symbol} className="py-1 px-1 sm:px-2 text-center tick whitespace-nowrap">
                      <div className="kr text-[8px] sm:text-[9px]">{m.label}</div>
                      <div className="text-[7px] dim font-normal">{m.symbol}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.symbol} className="border-t border-[var(--border)] data-row">
                    <td className="py-1.5 pr-2 tick font-bold">{row.symbol}</td>
                    {macros.map((m) => {
                      const corr = row.correlations.find((c) => c.macro === m.symbol);
                      if (!corr) {
                        return (
                          <td key={m.symbol} className="py-1.5 px-1 sm:px-2 text-center dim">—</td>
                        );
                      }
                      return (
                        <td
                          key={m.symbol}
                          className="py-1.5 px-1 sm:px-2 text-center relative group cursor-help"
                          style={{
                            background: corrToColor(corr.correlation),
                          }}
                          title={corr.interpretation}
                        >
                          <span className={`font-bold ${corrToText(corr.correlation)}`}>
                            {corr.correlation > 0 ? "+" : ""}
                            {corr.correlation.toFixed(2)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 범례 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[8px] sm:text-[9px]">
            <span className="dim">범례:</span>
            <span className="px-2 py-0.5 rounded" style={{ background: corrToColor(0.7) }}>
              강한 양의 상관
            </span>
            <span className="px-2 py-0.5 rounded" style={{ background: corrToColor(0.4) }}>
              약한 양의 상관
            </span>
            <span className="px-2 py-0.5 rounded" style={{ background: corrToColor(0) }}>
              중립
            </span>
            <span className="px-2 py-0.5 rounded" style={{ background: corrToColor(-0.4) }}>
              약한 음의 상관
            </span>
            <span className="px-2 py-0.5 rounded" style={{ background: corrToColor(-0.7) }}>
              강한 음의 상관
            </span>
          </div>

          {/* 핵심 인사이트 */}
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="text-[9px] sm:text-[10px] tick mb-2">KEY INSIGHTS · 핵심 인사이트</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[8px] sm:text-[9px] dim kr leading-relaxed">
              {/* 가장 강한 양의 상관 */}
              {(() => {
                const allCorrs = matrix.flatMap((r) =>
                  r.correlations.map((c) => ({ sym: r.symbol, ...c }))
                );
                const nasdaqCorrs = allCorrs.filter((c) => c.macro === "^NDX");
                const strongest = nasdaqCorrs.sort(
                  (a, b) => b.correlation - a.correlation
                )[0];
                if (!strongest) return null;
                return (
                  <div className="border border-[var(--border)] rounded p-2">
                    <div className="font-bold text-[#00ff88] mb-1">
                      📈 나스닥 동조 1위
                    </div>
                    <div>
                      <span className="bright">{strongest.sym}</span> · 상관계수 +
                      {strongest.correlation.toFixed(2)} → 나스닥 상승 시 동조 상승
                    </div>
                  </div>
                );
              })()}

              {/* 금리 가장 민감 */}
              {(() => {
                const allCorrs = matrix.flatMap((r) =>
                  r.correlations.map((c) => ({ sym: r.symbol, ...c }))
                );
                const yieldCorrs = allCorrs.filter((c) => c.macro === "^TNX");
                const mostSensitive = yieldCorrs.sort(
                  (a, b) => a.correlation - b.correlation
                )[0];
                if (!mostSensitive) return null;
                return (
                  <div className="border border-[var(--border)] rounded p-2">
                    <div className="font-bold text-[#ff8888] mb-1">
                      📉 금리 하락 수혜 1위
                    </div>
                    <div>
                      <span className="bright">{mostSensitive.sym}</span> · 상관계수{" "}
                      {mostSensitive.correlation.toFixed(2)} → 10Y 금리 하락 시 최대 수혜
                    </div>
                  </div>
                );
              })()}

              {/* VIX 민감도 */}
              {(() => {
                const allCorrs = matrix.flatMap((r) =>
                  r.correlations.map((c) => ({ sym: r.symbol, ...c }))
                );
                const vixCorrs = allCorrs.filter((c) => c.macro === "^VIX");
                const mostDefensive = vixCorrs.sort(
                  (a, b) => a.correlation - b.correlation
                )[0];
                if (!mostDefensive) return null;
                return (
                  <div className="border border-[var(--border)] rounded p-2">
                    <div className="font-bold text-[var(--amber)] mb-1">
                      ⚡ 리스크온 대표 종목
                    </div>
                    <div>
                      <span className="bright">{mostDefensive.sym}</span> · VIX 상관{" "}
                      {mostDefensive.correlation.toFixed(2)} → 시장 안정기 최대 수혜
                    </div>
                  </div>
                );
              })()}

              {/* 원유 */}
              {(() => {
                const allCorrs = matrix.flatMap((r) =>
                  r.correlations.map((c) => ({ sym: r.symbol, ...c }))
                );
                const oilCorrs = allCorrs.filter((c) => c.macro === "CL=F");
                const oilImpact = oilCorrs.sort(
                  (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
                )[0];
                if (!oilImpact) return null;
                return (
                  <div className="border border-[var(--border)] rounded p-2">
                    <div className="font-bold text-[#ff9944] mb-1">
                      🛢️ 유가 민감도 최대
                    </div>
                    <div>
                      <span className="bright">{oilImpact.sym}</span> · WTI 상관{" "}
                      {oilImpact.correlation > 0 ? "+" : ""}
                      {oilImpact.correlation.toFixed(2)} → {oilImpact.interpretation}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 면책 */}
          <div className="mt-3 text-[8px] sm:text-[9px] dim kr leading-relaxed">
            ⚠ 상관계수는 과거 1년간의 일별 로그 수익률 기준. 미래 성과를 보장하지 않으며
            계수는 시간에 따라 변할 수 있음. -1~+1 범위, 0 근처는 독립적.
          </div>
        </>
      )}
    </div>
  );
}
