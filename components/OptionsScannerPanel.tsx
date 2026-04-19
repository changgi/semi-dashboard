"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ScanSymbol {
  symbol: string;
  currentPrice: number;
  expiry: string;
  daysToExpiry: number;
  atmStrike: number;
  atmCallIV: number;
  atmPutIV: number;
  avgCallIV: number;
  avgPutIV: number;
  ivSkew: number;
  putCallOI: number;
  putCallVol: number;
  callOI: number;
  putOI: number;
  callVol: number;
  putVol: number;
  expectedMove: number;
  expectedMovePct: number;
  sentiment: "strong_bullish" | "bullish" | "neutral" | "bearish" | "strong_bearish";
}

interface ScannerData {
  success: boolean;
  totalSymbols: number;
  summary: {
    avgIV: number;
    avgPutCall: number;
    avgExpectedMovePct: number;
  };
  highlights: {
    mostBullish: ScanSymbol[];
    mostBearish: ScanSymbol[];
    highestIV: ScanSymbol[];
    extremeMove: ScanSymbol[];
  };
  all: ScanSymbol[];
}

const sentimentMeta: Record<ScanSymbol["sentiment"], { label: string; color: string; emoji: string }> = {
  strong_bullish: { label: "강매수", color: "text-[#00ff88]", emoji: "🚀" },
  bullish:        { label: "매수",   color: "text-[#66dd88]", emoji: "📈" },
  neutral:        { label: "중립",   color: "dim",            emoji: "⚖️" },
  bearish:        { label: "매도",   color: "text-[#ff8888]", emoji: "📉" },
  strong_bearish: { label: "강매도", color: "text-[#ff3860]", emoji: "🔻" },
};

export function OptionsScannerPanel() {
  const { data, isLoading } = useSWR<ScannerData>("/api/options-scanner", fetcher, {
    refreshInterval: 300000, // 5분
  });

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🔍 OPTIONS MARKET SCANNER · 반도체 옵션 시장 전수 스캔
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            {data?.totalSymbols ?? 14}개 종목 동시 분석 · IV/풋콜비/예상 변동 비교 · CBOE 실시간 (15분 지연)
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-[10px] dim py-6 text-center kr">14개 종목 옵션 시장 스캔 중...</div>
      ) : !data?.success ? (
        <div className="text-[10px] dim py-6 text-center kr">데이터 없음</div>
      ) : (
        <>
          {/* 섹터 전체 요약 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="border border-[var(--border)] rounded p-2 sm:p-3">
              <div className="text-[8px] dim kr">섹터 평균 ATM IV</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.summary.avgIV > 45 ? "down" : data.summary.avgIV > 30 ? "text-[var(--amber)]" : "up"
              }`}>
                {data.summary.avgIV.toFixed(1)}%
              </div>
              <div className="text-[7px] dim kr">
                {data.summary.avgIV > 45 ? "고변동성 경계" : data.summary.avgIV > 30 ? "중간 수준" : "낮음 안정"}
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2 sm:p-3">
              <div className="text-[8px] dim kr">섹터 평균 풋/콜</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.summary.avgPutCall > 0.9 ? "down" : data.summary.avgPutCall < 0.5 ? "up" : "tick"
              }`}>
                {data.summary.avgPutCall.toFixed(2)}
              </div>
              <div className="text-[7px] dim kr">
                {data.summary.avgPutCall > 0.9 ? "약세 편중" : data.summary.avgPutCall < 0.5 ? "강세 편중" : "중립"}
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2 sm:p-3">
              <div className="text-[8px] dim kr">평균 예상 30일 변동폭</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.summary.avgExpectedMovePct > 10 ? "down" : "tick"
              }`}>
                ±{data.summary.avgExpectedMovePct.toFixed(1)}%
              </div>
              <div className="text-[7px] dim kr">
                옵션 가격이 내재한 ±1σ 변동 기대치
              </div>
            </div>
          </div>

          {/* 하이라이트 카드들 (4열) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            {/* 강세 종목 */}
            {data.highlights.mostBullish.length > 0 && (
              <div className="border border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)] rounded p-2">
                <div className="text-[10px] font-bold text-[#00ff88] mb-2 kr">
                  🚀 옵션 시장 강세 신호 (풋/콜 &lt; 0.5)
                </div>
                <div className="space-y-1.5">
                  {data.highlights.mostBullish.map((s) => (
                    <div
                      key={s.symbol}
                      className="flex items-center justify-between text-[9px] sm:text-[10px] gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tick font-bold min-w-[42px]">{s.symbol}</span>
                        <span className="dim">${s.currentPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="dim text-[8px] kr">P/C</span>
                        <span className="up font-bold">{s.putCallOI}</span>
                        <span className="dim text-[8px]">·</span>
                        <span className="dim text-[8px]">IV {s.atmCallIV.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 약세 종목 */}
            {data.highlights.mostBearish.length > 0 && (
              <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)] rounded p-2">
                <div className="text-[10px] font-bold text-[#ff3860] mb-2 kr">
                  🔻 옵션 시장 약세 신호 (풋/콜 &gt; 1.0)
                </div>
                <div className="space-y-1.5">
                  {data.highlights.mostBearish.map((s) => (
                    <div
                      key={s.symbol}
                      className="flex items-center justify-between text-[9px] sm:text-[10px] gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tick font-bold min-w-[42px]">{s.symbol}</span>
                        <span className="dim">${s.currentPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="dim text-[8px] kr">P/C</span>
                        <span className="down font-bold">{s.putCallOI}</span>
                        <span className="dim text-[8px]">·</span>
                        <span className="dim text-[8px]">IV {s.atmCallIV.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 높은 IV 종목 */}
            {data.highlights.highestIV.length > 0 && (
              <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-2">
                <div className="text-[10px] font-bold text-[var(--amber)] mb-2 kr">
                  ⚡ 높은 내재변동성 (IV &gt; 40%)
                </div>
                <div className="space-y-1.5">
                  {data.highlights.highestIV.map((s) => (
                    <div
                      key={s.symbol}
                      className="flex items-center justify-between text-[9px] sm:text-[10px] gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tick font-bold min-w-[42px]">{s.symbol}</span>
                        <span className="dim">${s.currentPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--amber)] font-bold">
                          {s.atmCallIV.toFixed(1)}%
                        </span>
                        <span className="dim text-[8px]">·</span>
                        <span className="dim text-[8px]">
                          ±{s.expectedMovePct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 큰 움직임 예상 */}
            {data.highlights.extremeMove.length > 0 && (
              <div className="border border-[#aaccff]/30 bg-[rgba(170,204,255,0.03)] rounded p-2">
                <div className="text-[10px] font-bold text-[#aaccff] mb-2 kr">
                  🎯 큰 움직임 예상 (30일 예상 ±8%+)
                </div>
                <div className="space-y-1.5">
                  {data.highlights.extremeMove.map((s) => (
                    <div
                      key={s.symbol}
                      className="flex items-center justify-between text-[9px] sm:text-[10px] gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tick font-bold min-w-[42px]">{s.symbol}</span>
                        <span className="dim">${s.currentPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#aaccff] font-bold">
                          ±{s.expectedMovePct.toFixed(1)}%
                        </span>
                        <span className="dim text-[8px]">
                          (≈${s.expectedMove.toFixed(2)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 전체 비교 테이블 */}
          <div>
            <div className="text-[10px] tick mb-2 kr">📊 전체 비교 (30일 만기 기준)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[8px] sm:text-[9px]">
                <thead>
                  <tr className="border-b border-[var(--border)] dim">
                    <th className="text-left py-1 px-1">심볼</th>
                    <th className="text-right py-1 px-2 kr">현재가</th>
                    <th className="text-right py-1 px-2 kr">ATM 콜 IV</th>
                    <th className="text-right py-1 px-2 kr">ATM 풋 IV</th>
                    <th className="text-right py-1 px-2 kr">IV 스큐</th>
                    <th className="text-right py-1 px-2">P/C OI</th>
                    <th className="text-right py-1 px-2">P/C Vol</th>
                    <th className="text-right py-1 px-2 kr">예상 ±1σ</th>
                    <th className="text-center py-1 px-2 kr">센티먼트</th>
                  </tr>
                </thead>
                <tbody>
                  {data.all
                    .sort((a, b) => a.putCallOI - b.putCallOI)
                    .map((s) => {
                      const meta = sentimentMeta[s.sentiment];
                      return (
                        <tr
                          key={s.symbol}
                          className="border-b border-[var(--border)] data-row"
                        >
                          <td className="py-1.5 px-1 tick font-bold">{s.symbol}</td>
                          <td className="text-right py-1.5 px-2">
                            ${s.currentPrice.toFixed(2)}
                          </td>
                          <td
                            className={`text-right py-1.5 px-2 ${
                              s.atmCallIV > 45 ? "down" : s.atmCallIV > 30 ? "text-[var(--amber)]" : "tick"
                            }`}
                          >
                            {s.atmCallIV.toFixed(1)}%
                          </td>
                          <td
                            className={`text-right py-1.5 px-2 ${
                              s.atmPutIV > 45 ? "down" : s.atmPutIV > 30 ? "text-[var(--amber)]" : "tick"
                            }`}
                          >
                            {s.atmPutIV.toFixed(1)}%
                          </td>
                          <td
                            className={`text-right py-1.5 px-2 ${
                              s.ivSkew > 2 ? "down" : s.ivSkew < -2 ? "up" : "dim"
                            }`}
                          >
                            {s.ivSkew >= 0 ? "+" : ""}
                            {s.ivSkew.toFixed(1)}%
                          </td>
                          <td
                            className={`text-right py-1.5 px-2 font-bold ${
                              s.putCallOI < 0.5 ? "up" : s.putCallOI > 1.0 ? "down" : "tick"
                            }`}
                          >
                            {s.putCallOI.toFixed(2)}
                          </td>
                          <td
                            className={`text-right py-1.5 px-2 ${
                              s.putCallVol < 0.5 ? "up" : s.putCallVol > 1.0 ? "down" : "dim"
                            }`}
                          >
                            {s.putCallVol.toFixed(2)}
                          </td>
                          <td className="text-right py-1.5 px-2 tick">
                            ±{s.expectedMovePct.toFixed(1)}%
                          </td>
                          <td className={`text-center py-1.5 px-2 ${meta.color}`}>
                            {meta.emoji} {meta.label}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 해석 가이드 */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-4 gap-2 text-[8px] dim kr">
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">📈 풋/콜 OI</div>
              <div className="leading-tight">
                &lt;0.5 강세 · 0.5-1.0 중립 · &gt;1.0 약세. 미결제약정 기반 장기 포지션 추정
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">⚡ ATM IV</div>
              <div className="leading-tight">
                30% 미만 안정 · 30-45% 중간 · 45%+ 고변동성. 옵션 매도 유리 여부 판단
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">↕️ IV 스큐</div>
              <div className="leading-tight">
                풋 IV - 콜 IV. 양수면 downside 헤지 수요, 음수면 업사이드 기대
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">🎯 예상 ±1σ</div>
              <div className="leading-tight">
                ATM 스트래들 가격 = 옵션 시장이 가격에 반영한 30일 변동 폭
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
