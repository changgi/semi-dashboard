"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─────────────────────────────────────────────────────────
// 스파크라인 헬퍼 (MacroPanel과 동일)
// ─────────────────────────────────────────────────────────
function Sparkline({ data, color, width = 70, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const xStep = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + (height - pad * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${points.join(" L ")}`;
  const gradId = `spk-${Math.random().toString(36).slice(2)}`;
  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linePath} L ${pad + (data.length - 1) * xStep},${height - pad} L ${pad},${height - pad} Z`} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────
// 환율 섹션
// ───────────────────────────────────────────────────────────
interface FxItem {
  symbol: string;
  name: string;
  nameKr: string;
  category: string;
  impact: string;
  price: number | null;
  changePct: number | null;
  change: number | null;
  sparkline: number[];
}

function FxSection() {
  const { data, isLoading } = useSWR<{ success: boolean; items: FxItem[]; krwAnalysis: { sentiment: string; message: string; price: number } | null }>(
    "/api/fx",
    fetcher,
    { refreshInterval: 60000 }
  );

  const items = data?.items ?? [];
  const won = items.filter((i) => i.category === "won");
  const major = items.filter((i) => i.category === "major");
  const asia = items.filter((i) => i.category === "asia");

  const formatFx = (price: number | null) => {
    if (price === null) return "—";
    if (price < 10) return price.toFixed(4);
    if (price < 1000) return price.toFixed(2);
    return price.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  const FxCard = ({ item }: { item: FxItem }) => {
    const up = (item.changePct ?? 0) >= 0;
    const color = up ? "up" : "down";
    const sparkColor = up ? "#00ff88" : "#ff3860";
    return (
      <div className="border border-[var(--border)] rounded p-2 hover:border-[var(--amber-dim)] transition-colors">
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0">
            <div className="text-[10px] font-bold bright truncate kr">{item.nameKr}</div>
            <div className="text-[7px] dim">{item.name}</div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[13px] font-bold tick">{formatFx(item.price)}</div>
            {item.changePct !== null && (
              <div className={`text-[9px] ${color} font-bold`}>
                {up ? "▲" : "▼"} {Math.abs(item.changePct).toFixed(2)}%
              </div>
            )}
          </div>
          {item.sparkline.length >= 2 && <Sparkline data={item.sparkline} color={sparkColor} />}
        </div>
        <div className="text-[7px] dim mt-1.5 pt-1.5 border-t border-[var(--border)] line-clamp-2 kr leading-tight">
          {item.impact}
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="text-[10px] dim py-6 text-center kr">로딩 중...</div>;

  return (
    <div>
      {/* USD/KRW 하이라이트 배너 */}
      {data?.krwAnalysis && (
        <div
          className={`mb-3 border-l-2 rounded-r p-2 ${
            data.krwAnalysis.sentiment === "positive_samsung"
              ? "border-[#00ff88] bg-[rgba(0,255,136,0.05)]"
              : data.krwAnalysis.sentiment === "negative_samsung"
              ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
              : "border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)]"
          }`}
        >
          <div className="text-[10px] bright kr font-bold">
            🇰🇷 USD/KRW {data.krwAnalysis.price.toFixed(0)}원
          </div>
          <div className="text-[9px] dim kr mt-0.5">{data.krwAnalysis.message}</div>
        </div>
      )}

      {/* 원화 통화쌍 */}
      {won.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] tick mb-1 kr">🇰🇷 원화 환율</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {won.map((item) => <FxCard key={item.symbol} item={item} />)}
          </div>
        </div>
      )}

      {/* 주요 통화쌍 */}
      {major.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] tick mb-1 kr">🌐 주요 통화쌍</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {major.map((item) => <FxCard key={item.symbol} item={item} />)}
          </div>
        </div>
      )}

      {/* 아시아 지수 */}
      {asia.length > 0 && (
        <div>
          <div className="text-[9px] tick mb-1 kr">🌏 관련 아시아 지수</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {asia.map((item) => <FxCard key={item.symbol} item={item} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 선물 섹션
// ───────────────────────────────────────────────────────────
interface FutureItem {
  symbol: string;
  name: string;
  nameKr: string;
  category: string;
  contract: string;
  unit: string;
  impact: string;
  price: number | null;
  changePct: number | null;
  sparkline: number[];
}

function FuturesSection() {
  const { data, isLoading } = useSWR<{ success: boolean; items: FutureItem[]; signals: Array<{ title: string; message: string; type: string }> }>(
    "/api/futures",
    fetcher,
    { refreshInterval: 60000 }
  );

  const items = data?.items ?? [];
  const index = items.filter((i) => i.category === "index");
  const energy = items.filter((i) => i.category === "energy");
  const metal = items.filter((i) => i.category === "metal");

  const formatPx = (price: number | null) => {
    if (price === null) return "—";
    if (price < 10) return price.toFixed(2);
    if (price < 1000) return price.toFixed(2);
    return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const FutCard = ({ item }: { item: FutureItem }) => {
    const up = (item.changePct ?? 0) >= 0;
    const color = up ? "up" : "down";
    const sparkColor = up ? "#00ff88" : "#ff3860";
    return (
      <div className="border border-[var(--border)] rounded p-2 hover:border-[var(--amber-dim)] transition-colors">
        <div className="flex items-start justify-between mb-1 gap-1">
          <div className="min-w-0">
            <div className="text-[10px] font-bold bright truncate kr">{item.nameKr}</div>
            <div className="text-[7px] dim">
              {item.contract} · {item.symbol}
            </div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[13px] font-bold tick">{formatPx(item.price)}</div>
            {item.changePct !== null && (
              <div className={`text-[9px] ${color} font-bold`}>
                {up ? "▲" : "▼"} {Math.abs(item.changePct).toFixed(2)}%
              </div>
            )}
          </div>
          {item.sparkline.length >= 2 && <Sparkline data={item.sparkline} color={sparkColor} />}
        </div>
        <div className="text-[7px] dim mt-1.5 pt-1.5 border-t border-[var(--border)] line-clamp-2 kr leading-tight">
          <span className="font-bold">{item.unit}</span> · {item.impact}
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="text-[10px] dim py-6 text-center kr">로딩 중...</div>;

  return (
    <div>
      {/* 선물 시그널 */}
      {data?.signals && data.signals.length > 0 && (
        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.signals.map((sig, i) => (
            <div
              key={i}
              className={`border-l-2 rounded-r p-2 ${
                sig.type === "positive"
                  ? "border-[#00ff88] bg-[rgba(0,255,136,0.05)]"
                  : sig.type === "negative"
                  ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
                  : "border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)]"
              }`}
            >
              <div className="text-[10px] bright kr font-bold">{sig.title}</div>
              <div className="text-[9px] dim kr mt-0.5">{sig.message}</div>
            </div>
          ))}
        </div>
      )}

      {index.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] tick mb-1 kr">📊 지수 선물 (E-mini 계열)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {index.map((item) => <FutCard key={item.symbol} item={item} />)}
          </div>
        </div>
      )}

      {energy.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] tick mb-1 kr">🛢️ 에너지 선물</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {energy.map((item) => <FutCard key={item.symbol} item={item} />)}
          </div>
        </div>
      )}

      {metal.length > 0 && (
        <div>
          <div className="text-[9px] tick mb-1 kr">🥇 금속 선물</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {metal.map((item) => <FutCard key={item.symbol} item={item} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 옵션 분석 섹션
// ───────────────────────────────────────────────────────────
interface OptionData {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  intrinsic: number;
  timeValue: number;
}

interface ChainEntry {
  strike: number;
  moneynessPct: number;
  status: "ITM" | "ATM" | "OTM";
  call: OptionData;
  put: OptionData;
}

interface OptionChain {
  daysToExpiry: number;
  label: string;
  expiryDate: string;
  chain: ChainEntry[];
}

interface OptionsResponse {
  success: boolean;
  symbol: string;
  currentPrice: number;
  changePct: number;
  volatility: { hv20: number; hv60: number; iv: number };
  riskFreeRate: number;
  optionChains: OptionChain[];
  atm30: ChainEntry;
  putCallRatio: number;
  sentiment: string;
  model: string;
  disclaimer: string;
}

function OptionsSection() {
  const symbols = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "LRCX", "KLAC", "ARM", "INTC"];
  const [selected, setSelected] = useState("NVDA");
  const [expiryIdx, setExpiryIdx] = useState(1); // 30일

  const { data, isLoading } = useSWR<OptionsResponse>(
    `/api/options?symbol=${selected}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const currentChain = data?.optionChains?.[expiryIdx];

  return (
    <div>
      {/* 컨트롤 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[9px] dim kr">종목:</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
        >
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-[9px] dim kr">만기:</span>
        <div className="flex gap-1">
          {data?.optionChains?.map((c, i) => (
            <button
              key={c.daysToExpiry}
              onClick={() => setExpiryIdx(i)}
              className={`px-2 py-1 text-[9px] border ${
                expiryIdx === i
                  ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-[10px] dim py-6 text-center kr">옵션 계산 중...</div>
      ) : !data?.success ? (
        <div className="text-[10px] dim py-6 text-center kr">데이터 없음</div>
      ) : (
        <>
          {/* 기초자산 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-[9px] sm:text-[10px]">
            <div className="border border-[var(--border)] rounded p-2">
              <div className="dim kr">현재가</div>
              <div className="tick font-bold text-[14px]">${data.currentPrice.toFixed(2)}</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="dim kr">20일 변동성</div>
              <div className="tick font-bold text-[14px]">{data.volatility.hv20.toFixed(1)}%</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="dim kr">60일 변동성</div>
              <div className="tick font-bold text-[14px]">{data.volatility.hv60.toFixed(1)}%</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="dim kr">무위험이자율</div>
              <div className="tick font-bold text-[14px]">{data.riskFreeRate.toFixed(2)}%</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="dim kr">풋/콜 비율</div>
              <div className={`font-bold text-[14px] ${data.putCallRatio > 0.55 ? "down" : data.putCallRatio < 0.45 ? "up" : "tick"}`}>
                {data.putCallRatio.toFixed(3)}
              </div>
            </div>
          </div>

          {/* 센티먼트 */}
          <div className="mb-3 border-l-2 border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded-r p-2">
            <div className="text-[9px] dim kr">
              📊 옵션 기반 센티먼트: <span className="bright">{data.sentiment}</span> · 만기{" "}
              {currentChain?.label ?? "—"} ({currentChain?.expiryDate ?? "—"})
            </div>
          </div>

          {/* 옵션 체인 테이블 */}
          {currentChain && (
            <div className="overflow-x-auto">
              <table className="w-full text-[9px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th colSpan={5} className="text-center py-1 tick text-[#00ff88]">
                      ◀ 콜옵션 (Call)
                    </th>
                    <th className="text-center py-1 tick kr bg-[rgba(255,176,0,0.05)]">행사가</th>
                    <th colSpan={5} className="text-center py-1 tick text-[#ff8888]">
                      풋옵션 (Put) ▶
                    </th>
                  </tr>
                  <tr className="border-b border-[var(--border)] dim">
                    <th className="py-1 text-right kr">프리미엄</th>
                    <th className="py-1 text-right kr">델타</th>
                    <th className="py-1 text-right kr">감마</th>
                    <th className="py-1 text-right kr">세타</th>
                    <th className="py-1 text-right kr">베가</th>
                    <th className="py-1 text-center tick bg-[rgba(255,176,0,0.05)]">$</th>
                    <th className="py-1 text-right kr">프리미엄</th>
                    <th className="py-1 text-right kr">델타</th>
                    <th className="py-1 text-right kr">감마</th>
                    <th className="py-1 text-right kr">세타</th>
                    <th className="py-1 text-right kr">베가</th>
                  </tr>
                </thead>
                <tbody>
                  {currentChain.chain.map((row) => {
                    const isAtm = row.status === "ATM";
                    const bg = isAtm ? "bg-[rgba(255,176,0,0.08)]" : "";
                    return (
                      <tr key={row.strike} className={`border-b border-[var(--border)] data-row ${bg}`}>
                        <td className="text-right py-1 tick">{row.call.price.toFixed(2)}</td>
                        <td className="text-right py-1 dim">{row.call.delta.toFixed(3)}</td>
                        <td className="text-right py-1 dim">{row.call.gamma.toFixed(4)}</td>
                        <td className="text-right py-1 down">{row.call.theta.toFixed(2)}</td>
                        <td className="text-right py-1 dim">{row.call.vega.toFixed(2)}</td>
                        <td className={`text-center py-1 font-bold ${isAtm ? "text-[var(--amber)]" : "tick"}`}>
                          ${row.strike.toFixed(2)}
                          <span className="text-[7px] dim ml-1">
                            ({row.moneynessPct >= 0 ? "+" : ""}
                            {row.moneynessPct.toFixed(1)}%)
                          </span>
                        </td>
                        <td className="text-right py-1 tick">{row.put.price.toFixed(2)}</td>
                        <td className="text-right py-1 dim">{row.put.delta.toFixed(3)}</td>
                        <td className="text-right py-1 dim">{row.put.gamma.toFixed(4)}</td>
                        <td className="text-right py-1 down">{row.put.theta.toFixed(2)}</td>
                        <td className="text-right py-1 dim">{row.put.vega.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Greeks 설명 */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8px] dim kr">
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">Δ 델타 (Delta)</div>
              <div className="leading-tight">기초자산 1달러 변동 시 옵션 가격 변동 · 콜 0~1, 풋 -1~0</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">Γ 감마 (Gamma)</div>
              <div className="leading-tight">델타 변화율 · ATM에서 최대 · 방향 가속도</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">Θ 세타 (Theta)</div>
              <div className="leading-tight">하루 지날 때 가치 감소 · 시간 소멸 · 옵션 매수자 불리</div>
            </div>
            <div className="border border-[var(--border)] rounded p-2">
              <div className="font-bold bright mb-1">ν 베가 (Vega)</div>
              <div className="leading-tight">변동성 1% 변동 시 가격 변동 · IV 민감도</div>
            </div>
          </div>

          <div className="mt-2 text-[7px] dim kr">
            ⚠ {data.disclaimer} · 모델: {data.model} · 20일 역사 변동성을 IV로 사용
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 통합 패널
// ═══════════════════════════════════════════════════════════
export function DerivativesPanel() {
  const [tab, setTab] = useState<"fx" | "futures" | "options">("fx");

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            💱 FX · FUTURES · OPTIONS
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            환율 · 지수/원자재 선물 · 종목별 옵션 분석 (Black-Scholes)
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTab("fx")}
            className={`px-3 py-1 text-[10px] border ${
              tab === "fx"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            💱 환율
          </button>
          <button
            onClick={() => setTab("futures")}
            className={`px-3 py-1 text-[10px] border ${
              tab === "futures"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            🎯 선물
          </button>
          <button
            onClick={() => setTab("options")}
            className={`px-3 py-1 text-[10px] border ${
              tab === "options"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            📈 옵션
          </button>
        </div>
      </div>

      {tab === "fx" && <FxSection />}
      {tab === "futures" && <FuturesSection />}
      {tab === "options" && <OptionsSection />}
    </div>
  );
}
