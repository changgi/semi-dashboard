"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─────────────────────────────────────────────────────────
// 스파크라인 (내부 재사용)
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
// 타입
// ───────────────────────────────────────────────────────────
interface OptContract {
  bid: number;
  ask: number;
  last: number;
  mid: number;
  iv: number;
  volume: number;
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  theo: number;
  changePct: number;
}

interface OptChainRow {
  strike: number;
  moneynessPct: number;
  status: "ITM" | "ATM" | "OTM";
  call: OptContract | null;
  put: OptContract | null;
}

interface OptionChain {
  expiry: string;
  daysToExpiry: number;
  chain: OptChainRow[];
  atmStrike: number;
}

interface StockOptionsData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  priceChange: number;
  open: number;
  high: number;
  low: number;
  bid: number;
  ask: number;
  optionChains: OptionChain[];
  nearTermExpiry: string;
  atmEntry: OptChainRow | null;
  atmCallIV: number;
  atmPutIV: number;
  ivSkew: number;
  putCallRatioOI: number;
  putCallRatioVol: number;
  totalCallOI: number;
  totalPutOI: number;
  totalCallVol: number;
  totalPutVol: number;
  sentiment: string;
  totalOptions: number;
  expiryCount: number;
  dataSource: string;
}

interface RelatedItem {
  symbol: string;
  name: string;
  nameKr: string;
  price: number | null;
  changePct: number | null;
  sparkline: number[];
  weight?: string;
  type?: string;
  leverage?: string;
  relation?: string;
}

interface StockRelatedData {
  success: boolean;
  symbol: string;
  sectorEtfs: RelatedItem[];
  leveragedEtfs: RelatedItem[];
  indexFutures: RelatedItem[];
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function StockDerivativesPanel() {
  const symbols = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "LRCX", "KLAC", "ARM", "INTC"];
  const [selected, setSelected] = useState("NVDA");
  const [view, setView] = useState<"options" | "related">("options");
  const [selectedExpiryIdx, setSelectedExpiryIdx] = useState(2); // 기본 3번째 (약 1개월)

  const { data: optData, isLoading: optLoading } = useSWR<StockOptionsData>(
    `/api/stock-options?symbol=${selected}`,
    fetcher,
    { refreshInterval: 900000 } // 15분
  );

  const { data: relData, isLoading: relLoading } = useSWR<StockRelatedData>(
    `/api/stock-related?symbol=${selected}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const currentChain = optData?.optionChains?.[selectedExpiryIdx];

  const formatPx = (v: number | null | undefined) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    if (v < 0.01) return v.toFixed(4);
    if (v < 10) return v.toFixed(2);
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            💹 STOCK OPTIONS & DERIVATIVES
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            종목별 실제 옵션 체인 (CBOE) + 관련 ETF/선물/레버리지 상품
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="dim text-[10px] kr">종목:</span>
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setSelectedExpiryIdx(2); // 리셋
            }}
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px]"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              onClick={() => setView("options")}
              className={`px-3 py-1 text-[10px] border ${
                view === "options"
                  ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
              }`}
            >
              📈 옵션 체인
            </button>
            <button
              onClick={() => setView("related")}
              className={`px-3 py-1 text-[10px] border ${
                view === "related"
                  ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
              }`}
            >
              🎯 관련 상품
            </button>
          </div>
        </div>
      </div>

      {/* 옵션 체인 뷰 */}
      {view === "options" && (
        <>
          {optLoading ? (
            <div className="text-[10px] dim py-6 text-center kr">CBOE 옵션 데이터 로딩 중...</div>
          ) : !optData?.success ? (
            <div className="text-[10px] dim py-6 text-center kr">
              옵션 데이터 없음 · CBOE에서 {selected} 옵션 미지원
            </div>
          ) : (
            <>
              {/* 옵션 시장 요약 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3 text-[9px]">
                <div className="border border-[var(--border)] rounded p-2">
                  <div className="dim kr">기초자산</div>
                  <div className="tick font-bold text-[13px]">${optData.currentPrice.toFixed(2)}</div>
                  <div className={`text-[8px] ${optData.priceChange >= 0 ? "up" : "down"}`}>
                    {optData.priceChange >= 0 ? "+" : ""}
                    {optData.priceChange.toFixed(2)}
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded p-2">
                  <div className="dim kr">ATM 콜 IV</div>
                  <div className="tick font-bold text-[13px]">{optData.atmCallIV.toFixed(1)}%</div>
                </div>
                <div className="border border-[var(--border)] rounded p-2">
                  <div className="dim kr">ATM 풋 IV</div>
                  <div className="tick font-bold text-[13px]">{optData.atmPutIV.toFixed(1)}%</div>
                </div>
                <div className="border border-[var(--border)] rounded p-2">
                  <div className="dim kr">IV 스큐</div>
                  <div
                    className={`font-bold text-[13px] ${
                      optData.ivSkew > 2 ? "down" : optData.ivSkew < -2 ? "up" : "tick"
                    }`}
                  >
                    {optData.ivSkew >= 0 ? "+" : ""}
                    {optData.ivSkew.toFixed(1)}%
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded p-2">
                  <div className="dim kr">풋/콜 OI</div>
                  <div
                    className={`font-bold text-[13px] ${
                      optData.putCallRatioOI > 0.9
                        ? "down"
                        : optData.putCallRatioOI < 0.5
                        ? "up"
                        : "tick"
                    }`}
                  >
                    {optData.putCallRatioOI.toFixed(2)}
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded p-2">
                  <div className="dim kr">총 옵션</div>
                  <div className="tick font-bold text-[13px]">
                    {optData.totalOptions.toLocaleString()}
                  </div>
                  <div className="text-[7px] dim">{optData.expiryCount}개 만기</div>
                </div>
              </div>

              {/* 센티먼트 배너 */}
              <div className="mb-3 border-l-2 border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded-r p-2">
                <div className="text-[9px] dim kr leading-relaxed">
                  📊 <span className="bright">센티먼트</span>:{" "}
                  <span
                    className={
                      optData.putCallRatioOI > 0.9
                        ? "down"
                        : optData.putCallRatioOI < 0.5
                        ? "up"
                        : "text-[var(--amber)]"
                    }
                  >
                    {optData.sentiment}
                  </span>
                  {" · "}
                  총 콜 OI {optData.totalCallOI.toLocaleString()} vs 총 풋 OI{" "}
                  {optData.totalPutOI.toLocaleString()}
                  {" · "}
                  당일 거래량 콜 {optData.totalCallVol.toLocaleString()} vs 풋{" "}
                  {optData.totalPutVol.toLocaleString()}
                </div>
              </div>

              {/* 만기 선택 탭 */}
              <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                {optData.optionChains.map((c, i) => (
                  <button
                    key={c.expiry}
                    onClick={() => setSelectedExpiryIdx(i)}
                    className={`px-2 py-1 text-[9px] whitespace-nowrap border ${
                      selectedExpiryIdx === i
                        ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                        : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
                    }`}
                  >
                    {c.expiry}
                    <span className="dim ml-1">({c.daysToExpiry}일)</span>
                  </button>
                ))}
              </div>

              {/* 옵션 체인 테이블 */}
              {currentChain && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[8px] sm:text-[9px]">
                    <thead>
                      <tr className="border-b-2 border-[var(--border)]">
                        <th colSpan={7} className="text-center py-1 tick text-[#00ff88] kr">
                          ◀ 콜옵션 Call
                        </th>
                        <th className="text-center py-1 tick kr bg-[rgba(255,176,0,0.1)] font-bold">
                          행사가
                        </th>
                        <th colSpan={7} className="text-center py-1 tick text-[#ff8888] kr">
                          풋옵션 Put ▶
                        </th>
                      </tr>
                      <tr className="border-b border-[var(--border)] dim">
                        <th className="py-1 text-right kr">OI</th>
                        <th className="py-1 text-right kr">거래량</th>
                        <th className="py-1 text-right">IV%</th>
                        <th className="py-1 text-right kr">Δ</th>
                        <th className="py-1 text-right kr">Bid</th>
                        <th className="py-1 text-right kr">Ask</th>
                        <th className="py-1 text-right kr">중간</th>
                        <th className="py-1 text-center tick bg-[rgba(255,176,0,0.05)]">Strike</th>
                        <th className="py-1 text-right kr">중간</th>
                        <th className="py-1 text-right kr">Bid</th>
                        <th className="py-1 text-right kr">Ask</th>
                        <th className="py-1 text-right kr">Δ</th>
                        <th className="py-1 text-right">IV%</th>
                        <th className="py-1 text-right kr">거래량</th>
                        <th className="py-1 text-right kr">OI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentChain.chain.map((row) => {
                        const isAtm = row.status === "ATM";
                        const bg = isAtm ? "bg-[rgba(255,176,0,0.08)]" : "";
                        return (
                          <tr
                            key={row.strike}
                            className={`border-b border-[var(--border)] data-row ${bg}`}
                          >
                            {/* 콜 데이터 */}
                            <td className="text-right py-1 dim">
                              {row.call?.openInterest.toLocaleString() ?? "—"}
                            </td>
                            <td className="text-right py-1 dim">
                              {row.call?.volume.toLocaleString() ?? "—"}
                            </td>
                            <td className="text-right py-1">
                              {row.call?.iv ? (row.call.iv * 100).toFixed(1) : "—"}
                            </td>
                            <td className="text-right py-1 dim">
                              {row.call?.delta.toFixed(3) ?? "—"}
                            </td>
                            <td className="text-right py-1 tick">
                              {row.call ? formatPx(row.call.bid) : "—"}
                            </td>
                            <td className="text-right py-1 tick">
                              {row.call ? formatPx(row.call.ask) : "—"}
                            </td>
                            <td className="text-right py-1 bright font-bold">
                              {row.call ? formatPx(row.call.mid) : "—"}
                            </td>
                            {/* 행사가 */}
                            <td
                              className={`text-center py-1 font-bold ${
                                isAtm ? "text-[var(--amber)]" : "tick"
                              } bg-[rgba(255,176,0,0.03)]`}
                            >
                              ${row.strike.toFixed(2)}
                              <span className="text-[7px] dim ml-1">
                                ({row.moneynessPct >= 0 ? "+" : ""}
                                {row.moneynessPct.toFixed(1)}%)
                              </span>
                            </td>
                            {/* 풋 데이터 */}
                            <td className="text-right py-1 bright font-bold">
                              {row.put ? formatPx(row.put.mid) : "—"}
                            </td>
                            <td className="text-right py-1 tick">
                              {row.put ? formatPx(row.put.bid) : "—"}
                            </td>
                            <td className="text-right py-1 tick">
                              {row.put ? formatPx(row.put.ask) : "—"}
                            </td>
                            <td className="text-right py-1 dim">
                              {row.put?.delta.toFixed(3) ?? "—"}
                            </td>
                            <td className="text-right py-1">
                              {row.put?.iv ? (row.put.iv * 100).toFixed(1) : "—"}
                            </td>
                            <td className="text-right py-1 dim">
                              {row.put?.volume.toLocaleString() ?? "—"}
                            </td>
                            <td className="text-right py-1 dim">
                              {row.put?.openInterest.toLocaleString() ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 범례 + 출처 */}
              <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-[7px] sm:text-[8px] dim kr">
                <div>
                  <span className="text-[var(--amber)]">ATM</span>: 행사가 ≈ 현재가 · 
                  <span className="text-[#00ff88]"> ITM</span>: 내가격 (콜: 현재가 &gt; 행사가) · 
                  <span className="text-[#ff8888]"> OTM</span>: 외가격
                </div>
                <div>
                  🔗 출처: {optData.dataSource} · 15분 지연 · 무위험이자율 4.25% 기준
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 관련 상품 뷰 */}
      {view === "related" && (
        <>
          {relLoading ? (
            <div className="text-[10px] dim py-6 text-center kr">관련 상품 로딩 중...</div>
          ) : !relData?.success ? (
            <div className="text-[10px] dim py-6 text-center kr">데이터 없음</div>
          ) : (
            <>
              {/* 섹터 ETF */}
              {relData.sectorEtfs.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] tick mb-2 kr">
                    📊 섹터·산업 ETF · {selected} 포함 ETF
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {relData.sectorEtfs.map((item) => (
                      <RelatedCard key={item.symbol} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* 레버리지 ETF */}
              {relData.leveragedEtfs.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] tick mb-2 kr">
                    ⚡ 레버리지/인버스 ETF · 고위험 고수익 상품
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {relData.leveragedEtfs.map((item) => (
                      <RelatedCard key={item.symbol} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* 지수 선물 */}
              {relData.indexFutures.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] tick mb-2 kr">
                    🎯 관련 지수 선물 · 상관관계 분석
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {relData.indexFutures.map((item) => (
                      <RelatedCard key={item.symbol} item={item} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
                💡 <span className="bright">활용법</span>: {selected}에 대한 레버리지 투자를 원한다면 
                SOXL(+3x)/SOXS(-3x)를 활용하거나, 지수 선물(NQ=F)로 헤지 가능. 
                섹터 ETF는 개별 종목 집중 리스크를 완화하는 대안.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 관련 상품 카드
// ───────────────────────────────────────────────────────────
function RelatedCard({ item }: { item: RelatedItem }) {
  const up = (item.changePct ?? 0) >= 0;
  const color = up ? "up" : "down";
  const sparkColor = up ? "#00ff88" : "#ff3860";
  const isLeveraged = !!item.leverage;
  const isInverse = item.leverage?.startsWith("-");

  return (
    <div
      className={`border rounded p-2 hover:border-[var(--amber-dim)] transition-colors ${
        isInverse ? "border-[#ff3860]/30" : isLeveraged ? "border-[#00ff88]/30" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between mb-1 gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold bright kr truncate">{item.nameKr}</span>
            {item.leverage && (
              <span
                className={`text-[7px] px-1 rounded font-bold ${
                  isInverse
                    ? "bg-[rgba(255,56,96,0.15)] text-[#ff3860]"
                    : "bg-[rgba(0,255,136,0.15)] text-[#00ff88]"
                }`}
              >
                {item.leverage}
              </span>
            )}
          </div>
          <div className="text-[7px] dim">
            {item.symbol} · {item.name}
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold tick">
            ${item.price ? item.price.toFixed(2) : "—"}
          </div>
          {item.changePct !== null && (
            <div className={`text-[9px] ${color} font-bold`}>
              {up ? "▲" : "▼"} {Math.abs(item.changePct).toFixed(2)}%
            </div>
          )}
        </div>
        {item.sparkline.length >= 2 && (
          <Sparkline data={item.sparkline} color={sparkColor} />
        )}
      </div>
      <div className="text-[7px] dim mt-1.5 pt-1.5 border-t border-[var(--border)] kr leading-tight">
        {item.weight && (
          <span className="font-bold">편입비중 {item.weight} · </span>
        )}
        {item.relation && <span>{item.relation}</span>}
        {item.type && !item.weight && !item.relation && (
          <span>
            {item.type === "market-cap"
              ? "시가총액 가중"
              : item.type === "equal-weight"
              ? "동등가중"
              : item.type === "country"
              ? "국가 ETF"
              : item.type}
          </span>
        )}
      </div>
    </div>
  );
}
