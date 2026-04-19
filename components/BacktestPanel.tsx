"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface BucketResult {
  name: string;
  description: string;
  min: number;
  max: number;
  sampleCount: number;
  avgReturn: number | null;
  winRate: number | null;
  maxGain: number | null;
  maxLoss: number | null;
  sharpe: number | null;
  annualizedReturn?: number;
}

interface BacktestData {
  success: boolean;
  symbol: string;
  holdingDays: number;
  scoreThreshold: number;
  range: string;
  totalTradingDays: number;
  benchmark: {
    buyHoldReturn: number;
    avgReturn: number;
    winRate: number;
    sampleCount: number;
  };
  bucketResults: BucketResult[];
  strategy: {
    threshold: number;
    entriesTriggered: number;
    skippedDays: number;
    triggerRate: number;
    avgReturn: number;
    winRate: number;
    maxDrawdown: number;
    outperformance: number;
  };
  timeSeries: Array<{
    date: string;
    score: number;
    returnPct: number;
    entryPrice: number;
  }>;
  methodology: string;
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function BacktestPanel() {
  const [symbol, setSymbol] = useState("SMH");
  const [holding, setHolding] = useState(30);
  const [threshold, setThreshold] = useState(50);
  const [range, setRange] = useState("1y");

  const { data, isLoading } = useSWR<BacktestData>(
    `/api/backtest?symbol=${symbol}&holding=${holding}&threshold=${threshold}&range=${range}`,
    fetcher,
    { refreshInterval: 0 } // 파라미터 변경시에만 재조회
  );

  const symbols = [
    { value: "SMH",  label: "SMH (반도체)" },
    { value: "SOXX", label: "SOXX (반도체)" },
    { value: "QQQ",  label: "QQQ (나스닥100)" },
    { value: "NVDA", label: "NVDA" },
    { value: "TSM",  label: "TSM" },
    { value: "MU",   label: "MU" },
    { value: "AVGO", label: "AVGO" },
    { value: "SOXL", label: "SOXL (+3x)" },
    { value: "091170.KS", label: "KODEX 반도체" },
  ];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🧪 BACKTEST · 전략 백테스트 시뮬레이터
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            과거에 매크로 점수 N+ 일에 진입 & N일 보유했다면? · 실제 역사 데이터로 검증
          </div>
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div>
          <div className="text-[8px] dim kr mb-0.5">종목</div>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            {symbols.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[8px] dim kr mb-0.5">기간</div>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            <option value="1y">1년</option>
            <option value="2y">2년</option>
            <option value="6mo">6개월</option>
          </select>
        </div>
        <div>
          <div className="text-[8px] dim kr mb-0.5">보유 일수</div>
          <select
            value={holding}
            onChange={(e) => setHolding(Number(e.target.value))}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            <option value={7}>7일 (단기)</option>
            <option value={14}>14일</option>
            <option value={30}>30일 (1개월)</option>
            <option value={60}>60일 (2개월)</option>
            <option value={90}>90일 (3개월)</option>
          </select>
        </div>
        <div>
          <div className="text-[8px] dim kr mb-0.5">진입 임계점</div>
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            <option value={30}>30+ (완화)</option>
            <option value={50}>50+ (기본)</option>
            <option value={60}>60+ (엄격)</option>
            <option value={70}>70+ (매우 엄격)</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-[10px] dim py-12 text-center kr">백테스트 실행 중... (과거 데이터 분석)</div>
      ) : !data?.success ? (
        <div className="text-[10px] dim py-12 text-center kr">데이터 없음</div>
      ) : (
        <>
          {/* 전략 성과 vs 벤치마크 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <div className="border border-[var(--amber)] bg-[rgba(255,176,0,0.05)] rounded p-2">
              <div className="text-[8px] dim kr">전략 평균 수익률</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.strategy.avgReturn >= 0 ? "up" : "down"
              }`}>
                {data.strategy.avgReturn >= 0 ? "+" : ""}
                {data.strategy.avgReturn}%
              </div>
              <div className="text-[7px] dim kr">
                매번 {data.holdingDays}일 보유 평균
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="text-[8px] dim kr">전략 승률</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.strategy.winRate >= 70 ? "up" :
                data.strategy.winRate >= 50 ? "text-[var(--amber)]" : "down"
              }`}>
                {data.strategy.winRate}%
              </div>
              <div className="text-[7px] dim kr">
                {data.strategy.entriesTriggered}회 진입 중
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="text-[8px] dim kr">벤치마크 대비</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.strategy.outperformance > 0 ? "up" : "down"
              }`}>
                {data.strategy.outperformance >= 0 ? "+" : ""}
                {data.strategy.outperformance}%
              </div>
              <div className="text-[7px] dim kr">
                벤치 평균 {data.benchmark.avgReturn >= 0 ? "+" : ""}{data.benchmark.avgReturn}%
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="text-[8px] dim kr">Buy & Hold 수익</div>
              <div className={`text-[18px] sm:text-[22px] font-bold ${
                data.benchmark.buyHoldReturn >= 0 ? "up" : "down"
              }`}>
                {data.benchmark.buyHoldReturn >= 0 ? "+" : ""}
                {data.benchmark.buyHoldReturn}%
              </div>
              <div className="text-[7px] dim kr">
                기간 내 단순 보유
              </div>
            </div>
          </div>

          {/* 시각화 - 점수 vs 미래 수익 분포 */}
          {data.timeSeries.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] tick mb-1 kr">
                📈 시계열 - 매크로 점수 (영역) + 진입 후 {data.holdingDays}일 수익률 (점)
              </div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <ComposedChart data={data.timeSeries} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--amber)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#666", fontSize: 8 }}
                      tickFormatter={(d) => {
                        const p = d.split("-");
                        return p.length === 3 ? `${p[1]}/${p[2]}` : d;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="score"
                      tick={{ fill: "var(--amber)", fontSize: 8 }}
                      domain={[0, 100]}
                      orientation="left"
                      width={30}
                    />
                    <YAxis
                      yAxisId="return"
                      tick={{ fill: "#aaa", fontSize: 8 }}
                      orientation="right"
                      width={36}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(20,20,20,0.95)",
                        border: "1px solid var(--amber-dim)",
                        borderRadius: "4px",
                        fontSize: 11,
                        padding: "8px 10px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                      }}
                      labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }}
                      itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
                      formatter={(v: number, name: string) => {
                        if (name === "score") return [v, "매크로 점수"];
                        if (name === "returnPct") return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, `${data.holdingDays}일 수익`];
                        return [v, name];
                      }}
                    />
                    <ReferenceLine
                      yAxisId="score"
                      y={threshold}
                      stroke="var(--amber)"
                      strokeDasharray="3 3"
                      label={{ value: `임계점 ${threshold}`, fill: "var(--amber)", fontSize: 8, position: "right" }}
                    />
                    <ReferenceLine yAxisId="return" y={0} stroke="rgba(255,255,255,0.3)" />
                    <Bar
                      yAxisId="score"
                      dataKey="score"
                      fill="url(#scoreGrad)"
                      stroke="var(--amber)"
                      strokeWidth={0.5}
                    />
                    <Line
                      yAxisId="return"
                      type="monotone"
                      dataKey="returnPct"
                      stroke="#00ff88"
                      strokeWidth={1.5}
                      dot={{ r: 2, fill: "#00ff88" }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 구간별 성과 테이블 */}
          <div className="mb-3">
            <div className="text-[10px] tick mb-2 kr">📊 매크로 점수 구간별 역사적 성과</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] sm:text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--border)] dim">
                    <th className="text-left py-1 px-2 kr">구간</th>
                    <th className="text-left py-1 px-2 kr">조건</th>
                    <th className="text-right py-1 px-2 kr">샘플</th>
                    <th className="text-right py-1 px-2 kr">평균 수익</th>
                    <th className="text-right py-1 px-2 kr">승률</th>
                    <th className="text-right py-1 px-2 kr">최대 수익</th>
                    <th className="text-right py-1 px-2 kr">최대 손실</th>
                    <th className="text-right py-1 px-2 kr">샤프</th>
                    <th className="text-right py-1 px-2 kr">연율환산</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bucketResults.map((b) => {
                    const emoji = b.name === "매우 우호" ? "🚀" :
                                  b.name === "우호" ? "📈" :
                                  b.name === "중립" ? "⚖️" : "📉";
                    return (
                      <tr key={b.name} className="border-b border-[var(--border)] data-row">
                        <td className="py-1.5 px-2 font-bold">
                          {emoji} {b.name}
                        </td>
                        <td className="py-1.5 px-2 dim text-[8px] kr">{b.description}</td>
                        <td className="text-right py-1.5 px-2 dim">{b.sampleCount}</td>
                        {b.sampleCount === 0 ? (
                          <td colSpan={6} className="text-center py-1.5 px-2 dim kr">
                            샘플 없음
                          </td>
                        ) : (
                          <>
                            <td className={`text-right py-1.5 px-2 font-bold ${
                              (b.avgReturn ?? 0) >= 0 ? "up" : "down"
                            }`}>
                              {(b.avgReturn ?? 0) >= 0 ? "+" : ""}{b.avgReturn}%
                            </td>
                            <td className={`text-right py-1.5 px-2 font-bold ${
                              (b.winRate ?? 0) >= 70 ? "up" :
                              (b.winRate ?? 0) >= 50 ? "text-[var(--amber)]" : "down"
                            }`}>
                              {b.winRate}%
                            </td>
                            <td className="text-right py-1.5 px-2 up">+{b.maxGain}%</td>
                            <td className="text-right py-1.5 px-2 down">{b.maxLoss}%</td>
                            <td className={`text-right py-1.5 px-2 ${
                              (b.sharpe ?? 0) >= 1 ? "up" : (b.sharpe ?? 0) >= 0 ? "text-[var(--amber)]" : "down"
                            }`}>
                              {b.sharpe}
                            </td>
                            <td className={`text-right py-1.5 px-2 ${
                              (b.annualizedReturn ?? 0) >= 0 ? "up" : "down"
                            }`}>
                              {(b.annualizedReturn ?? 0) >= 0 ? "+" : ""}{b.annualizedReturn}%
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 해석 + 방법론 */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-2 text-[8px] dim kr leading-relaxed">
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">📖 해석 가이드</div>
              <div>
                • <span className="up">매우 우호 (70+)</span>: 강력 매수 신호, 높은 승률 기대<br />
                • <span className="text-[var(--amber)]">우호 (50-70)</span>: 정상 매수 구간<br />
                • <span className="dim">중립 (30-50)</span>: 선택적 투자<br />
                • <span className="down">부정 (0-30)</span>: 방어적 자세
              </div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">🔬 방법론</div>
              <div>{data.methodology}</div>
              <div className="mt-1">
                ⚠️ 과거 성과가 미래 수익을 보장하지 않음 · 거래 비용 미반영
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
