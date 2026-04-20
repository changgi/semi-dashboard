"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface SimResult {
  symbol: string;
  mode: string;
  totalInvested: number;
  finalValue: number;
  totalReturn: number;
  totalReturnPct: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  volatility: number;
  bestMonth: { date: string; returnPct: number };
  worstMonth: { date: string; returnPct: number };
  trades: Array<{ date: string; price: number; shares: number; amount: number }>;
  dailyValues: Array<{ date: string; value: number; cost: number; gain: number }>;
}

interface SimulatorData {
  success: boolean;
  results: SimResult[];
  best: { symbol: string; returnPct: number };
  worst: { symbol: string; returnPct: number };
  lowestRisk: { symbol: string; volatility: number };
  bestSharpe: { symbol: string; sharpe: number };
  insights: string[];
}

const CHART_COLORS = ["#ffb000", "#00ff88", "#aaccff", "#ee99ff", "#ff8844"];

const PRESET_SYMBOLS = [
  { label: "S&P 500", value: "SPY" },
  { label: "QQQ (기술)", value: "QQQ" },
  { label: "반도체 (SMH)", value: "SMH" },
  { label: "반도체 (SOXX)", value: "SOXX" },
  { label: "NVDA", value: "NVDA" },
  { label: "AAPL", value: "AAPL" },
  { label: "MSFT", value: "MSFT" },
];

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function SimulatorPanel() {
  const [mode, setMode] = useState<"dca" | "lumpsum">("dca");
  const [symbols, setSymbols] = useState<string[]>(["SPY", "SMH", "QQQ"]);
  const [startDate, setStartDate] = useState("2025-01-01");
  const [monthlyAmount, setMonthlyAmount] = useState(500);
  const [totalAmount, setTotalAmount] = useState(10000);
  const [data, setData] = useState<SimulatorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSymbol = (sym: string) => {
    setSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : prev.length < 5 ? [...prev, sym] : prev
    );
  };

  const runSimulation = async () => {
    if (symbols.length === 0) {
      setError("최소 1개 종목 선택");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          symbols,
          startDate,
          totalAmount,
          monthlyAmount,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setData(d);
      } else {
        setError(d.error || "시뮬레이션 실패");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🎮 PORTFOLIO SIMULATOR · What If? 시나리오
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            과거 데이터로 DCA vs 일시 매수 비교 · 여러 전략 수익률 분석
          </div>
        </div>
      </div>

      {/* ═════════ 설정 폼 ═════════ */}
      <div className="border border-[var(--border)] rounded p-3 mb-3 bg-[rgba(0,0,0,0.2)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 모드 선택 */}
          <div>
            <div className="text-[9px] dim kr mb-1">💼 투자 방식</div>
            <div className="flex gap-1">
              <button
                onClick={() => setMode("dca")}
                className={`flex-1 text-[10px] px-2 py-1.5 border rounded kr ${
                  mode === "dca"
                    ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)] font-bold"
                    : "border-[var(--border)] dim"
                }`}
              >
                📅 매월 적립 (DCA)
              </button>
              <button
                onClick={() => setMode("lumpsum")}
                className={`flex-1 text-[10px] px-2 py-1.5 border rounded kr ${
                  mode === "lumpsum"
                    ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)] font-bold"
                    : "border-[var(--border)] dim"
                }`}
              >
                💰 한 번에 매수
              </button>
            </div>
          </div>

          {/* 날짜 + 금액 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[9px] dim kr mb-1">📅 시작일</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-[10px] px-2 py-1.5 bg-black/30 border border-[var(--border)] text-[var(--amber)] rounded"
              />
            </div>
            <div className="flex-1">
              <div className="text-[9px] dim kr mb-1">
                {mode === "dca" ? "💵 월 적립액 ($)" : "💵 총 투자액 ($)"}
              </div>
              <input
                type="number"
                value={mode === "dca" ? monthlyAmount : totalAmount}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  if (mode === "dca") setMonthlyAmount(v);
                  else setTotalAmount(v);
                }}
                className="w-full text-[10px] px-2 py-1.5 bg-black/30 border border-[var(--border)] text-[var(--amber)] rounded"
              />
            </div>
          </div>
        </div>

        {/* 종목 선택 */}
        <div className="mt-3">
          <div className="text-[9px] dim kr mb-1">
            📊 비교할 종목 선택 ({symbols.length}/5)
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_SYMBOLS.map((s) => (
              <button
                key={s.value}
                onClick={() => toggleSymbol(s.value)}
                className={`text-[9px] px-2.5 py-1 border rounded kr transition-all ${
                  symbols.includes(s.value)
                    ? "border-[var(--amber)] bg-[rgba(255,176,0,0.15)] text-[var(--amber)] font-bold"
                    : "border-[var(--border)] dim hover:text-[var(--amber)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 실행 버튼 */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={runSimulation}
            disabled={loading || symbols.length === 0}
            className="text-[11px] px-4 py-2 border border-[var(--amber)] bg-[var(--amber)] text-[#111] hover:bg-[#e09900] rounded kr font-bold disabled:opacity-50"
          >
            {loading ? "⏳ 시뮬레이션 중..." : "🚀 시뮬레이션 시작"}
          </button>
          {error && <span className="text-[9px] text-[#ff3860] kr">⚠️ {error}</span>}
          
          {/* 프리셋 */}
          <div className="flex items-center gap-1 text-[9px] ml-auto">
            <span className="dim kr">프리셋:</span>
            <button
              onClick={() => {
                setStartDate("2024-04-20");
                setSymbols(["SPY", "SMH", "QQQ"]);
                setMode("dca");
                setMonthlyAmount(500);
              }}
              className="px-2 py-0.5 border border-[var(--border)] rounded hover:text-[var(--amber)] kr"
            >
              지난 1년 DCA
            </button>
            <button
              onClick={() => {
                setStartDate("2023-01-01");
                setSymbols(["SPY", "QQQ", "SMH", "NVDA"]);
                setMode("lumpsum");
                setTotalAmount(10000);
              }}
              className="px-2 py-0.5 border border-[var(--border)] rounded hover:text-[var(--amber)] kr"
            >
              3년 일시 매수
            </button>
          </div>
        </div>
      </div>

      {/* ═════════ 결과 ═════════ */}
      {data && (data.results?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {/* 인사이트 */}
          {(data.insights?.length ?? 0) > 0 && (
            <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3">
              <div className="text-[10px] tick kr font-bold mb-2">💡 핵심 인사이트</div>
              {(data.insights ?? []).map((ins, i) => (
                <div key={i} className="text-[10px] kr mb-1 leading-relaxed">{ins}</div>
              ))}
            </div>
          )}

          {/* Best/Worst/Safest 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <WinnerCard label="🏆 최고 수익" symbol={data.best.symbol} value={`+${data.best.returnPct}%`} color="#00ff88" />
            <WinnerCard label="📉 최저 수익" symbol={data.worst.symbol} value={`${data.worst.returnPct >= 0 ? "+" : ""}${data.worst.returnPct}%`} color="#ff3860" />
            <WinnerCard label="🛡️ 가장 안정" symbol={data.lowestRisk.symbol} value={`변동성 ${data.lowestRisk.volatility}%`} color="#aaccff" />
            <WinnerCard label="📊 최고 Sharpe" symbol={data.bestSharpe.symbol} value={`${data.bestSharpe.sharpe}`} color="#ffb000" />
          </div>

          {/* 차트 */}
          <ComparisonChart results={data.results} />

          {/* 결과 테이블 */}
          <ResultsTable results={data.results} mode={mode} />
        </div>
      )}

      {!data && !loading && (
        <div className="text-[10px] dim text-center py-10 kr border border-dashed border-[var(--border)] rounded">
          👆 위에서 설정하고 "시뮬레이션 시작" 클릭
        </div>
      )}

      {/* 하단 설명 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">💡 DCA (Dollar Cost Averaging)</span>: 매월 정해진 금액 적립 - 시장 타이밍 걱정 없이 장기 투자<br />
        <span className="bright">📊 Sharpe</span>: 위험 대비 수익률 - 높을수록 효율적 · <span className="bright">⚠️ 과거 수익률이 미래를 보장하지 않습니다</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Winner Card
// ═══════════════════════════════════════════════════════════
function WinnerCard({ label, symbol, value, color }: { label: string; symbol: string; value: string; color: string }) {
  return (
    <div
      className="border rounded p-2 text-center"
      style={{ borderColor: `${color}40`, background: `${color}08` }}
    >
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[13px] font-bold tick mt-1">{symbol}</div>
      <div className="text-[11px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Comparison Chart
// ═══════════════════════════════════════════════════════════
function ComparisonChart({ results }: { results: SimResult[] }) {
  // 모든 결과 통합해서 각 날짜별 각 심볼의 value
  const dateMap = new Map<string, Record<string, number>>();
  for (const r of results) {
    for (const dv of r.dailyValues) {
      if (!dateMap.has(dv.date)) dateMap.set(dv.date, { date: dv.date as any });
      dateMap.get(dv.date)![r.symbol] = dv.value;
    }
  }
  const chartData = Array.from(dateMap.values()).sort((a, b) => (a.date as any).localeCompare(b.date as any));

  return (
    <div className="border border-[var(--border)] rounded p-3">
      <div className="text-[10px] tick kr font-bold mb-2">📈 포트폴리오 가치 추이</div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#888" }}
              tickFormatter={(d) => (d ?? "").slice(5)}
            />
            <YAxis tick={{ fontSize: 9, fill: "#888" }} />
            <Tooltip
              contentStyle={{ background: "#111", border: "1px solid #444", fontSize: 10 }}
              formatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {results.map((r, i) => (
              <Line
                key={r.symbol}
                type="monotone"
                dataKey={r.symbol}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Results Table
// ═══════════════════════════════════════════════════════════
function ResultsTable({ results, mode }: { results: SimResult[]; mode: string }) {
  return (
    <div>
      <div className="text-[10px] tick kr font-bold mb-2">📊 상세 결과</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-[var(--border)] dim">
              <th className="text-left py-1.5 px-2">종목</th>
              <th className="text-right py-1.5 px-2 kr">투자금</th>
              <th className="text-right py-1.5 px-2 kr">현재가치</th>
              <th className="text-right py-1.5 px-2 kr">수익</th>
              <th className="text-right py-1.5 px-2 kr">수익률</th>
              <th className="text-right py-1.5 px-2 kr">CAGR</th>
              <th className="text-right py-1.5 px-2 kr">최대낙폭</th>
              <th className="text-right py-1.5 px-2 kr">변동성</th>
              <th className="text-right py-1.5 px-2 kr">Sharpe</th>
            </tr>
          </thead>
          <tbody>
            {results.sort((a, b) => b.totalReturnPct - a.totalReturnPct).map((r) => (
              <tr key={r.symbol} className="border-b border-[var(--border)]">
                <td className="py-1.5 px-2 tick font-bold">{r.symbol}</td>
                <td className="text-right py-1.5 px-2 tick">${r.totalInvested.toLocaleString()}</td>
                <td className="text-right py-1.5 px-2 tick font-bold">${r.finalValue.toLocaleString()}</td>
                <td className={`text-right py-1.5 px-2 font-bold ${r.totalReturn >= 0 ? "up" : "down"}`}>
                  {r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toLocaleString()}
                </td>
                <td className={`text-right py-1.5 px-2 font-bold ${r.totalReturnPct >= 0 ? "up" : "down"}`}>
                  {r.totalReturnPct >= 0 ? "+" : ""}{r.totalReturnPct}%
                </td>
                <td className={`text-right py-1.5 px-2 ${r.cagr >= 0 ? "up" : "down"}`}>
                  {r.cagr >= 0 ? "+" : ""}{r.cagr}%
                </td>
                <td className="text-right py-1.5 px-2 down">{r.maxDrawdown}%</td>
                <td className="text-right py-1.5 px-2 dim">{r.volatility}%</td>
                <td className={`text-right py-1.5 px-2 font-bold ${r.sharpe > 1 ? "up" : r.sharpe > 0 ? "tick" : "down"}`}>
                  {r.sharpe}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
