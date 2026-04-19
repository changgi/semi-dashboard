"use client";

import { use } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ═══════════════════════════════════════════════════════════
// 종목 상세 페이지: /stock/[symbol]
// 예: /stock/NVDA, /stock/005930.KS
// ═══════════════════════════════════════════════════════════

export default function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const { data, isLoading } = useSWR(
    `/api/stock-detail?symbol=${encodeURIComponent(symbol)}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-6 text-[10px] dim text-center kr">
        {symbol} 데이터 로딩 중...
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-6">
        <div className="max-w-xl mx-auto text-center">
          <div className="text-[14px] dim kr mb-4">
            ❌ {symbol} 데이터를 불러올 수 없습니다
          </div>
          <div className="text-[10px] dim kr mb-4">{data?.error ?? "알 수 없는 오류"}</div>
          <a
            href="/"
            className="inline-block px-4 py-2 border border-[var(--amber)] text-[var(--amber)] text-[11px]"
          >
            ← 대시보드로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  const up = (data.quote.changePct ?? 0) >= 0;
  const priceColor = up ? "up" : "down";
  const arrow = up ? "▲" : "▼";

  // 가격 포매팅 (KRW면 원화)
  const isKrw = symbol.endsWith(".KS") || symbol.endsWith(".KQ");
  const fmtPrice = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "—";
    if (isKrw) return `₩${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return `$${v.toFixed(2)}`;
  };

  const tooltipStyle = {
    background: "rgba(20,20,20,0.95)",
    border: "1px solid var(--amber-dim)",
    borderRadius: "4px",
    fontSize: 11,
    padding: "8px 10px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* 상단 네비 */}
      <div className="border-b border-[var(--border)] px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
        <a
          href="/"
          className="text-[10px] dim hover:text-[var(--amber)] kr"
        >
          ← 대시보드
        </a>
        <div className="text-[9px] tick">◢ STOCK DETAIL</div>
      </div>

      {/* ═════════ 히어로 섹션 ═════════ */}
      <div className="px-3 sm:px-6 py-5 border-b border-[var(--border)]">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <div>
            <div className="headline text-[36px] sm:text-[56px] bright leading-none">
              {data.symbol}
            </div>
            {data.info.name && (
              <div className="text-[11px] sm:text-[13px] dim kr mt-1">
                {data.info.name}
                {data.info.segment && (
                  <span className="ml-2 text-[9px] text-[var(--amber)]">
                    · {data.info.segment.toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className={`text-[28px] sm:text-[40px] font-bold ${priceColor} leading-none`}>
              {fmtPrice(data.quote.price)}
            </div>
            <div className={`text-[13px] ${priceColor} font-bold mt-1`}>
              {arrow} {Math.abs(data.quote.changePct ?? 0).toFixed(2)}%
              <span className="dim ml-2 font-normal text-[11px]">
                ({up ? "+" : ""}{(data.quote.change ?? 0).toFixed(2)})
              </span>
            </div>
          </div>
        </div>

        {/* 주요 지표 그리드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-4">
          <div className="border border-[var(--border)] rounded p-2">
            <div className="text-[8px] dim kr">일간 고가</div>
            <div className="text-[12px] tick">{fmtPrice(data.quote.dayHigh)}</div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="text-[8px] dim kr">일간 저가</div>
            <div className="text-[12px] tick">{fmtPrice(data.quote.dayLow)}</div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="text-[8px] dim kr">52주 최고</div>
            <div className="text-[12px] tick">{fmtPrice(data.technicals.high52w)}</div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="text-[8px] dim kr">52주 최저</div>
            <div className="text-[12px] tick">{fmtPrice(data.technicals.low52w)}</div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="text-[8px] dim kr">거래량</div>
            <div className="text-[12px] tick">
              {data.quote.volume ? (data.quote.volume / 1e6).toFixed(1) + "M" : "—"}
            </div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="text-[8px] dim kr">52주 위치</div>
            <div className="text-[12px] tick">
              {data.technicals.position52wPct !== null
                ? `${data.technicals.position52wPct.toFixed(0)}%`
                : "—"}
            </div>
            {data.technicals.position52wPct !== null && (
              <div className="w-full h-1 bg-[var(--border)] rounded mt-1 overflow-hidden">
                <div
                  className="h-full bg-[var(--amber)]"
                  style={{ width: `${data.technicals.position52wPct}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="px-3 sm:px-6 py-4 grid grid-cols-12 gap-3">
        {/* ═════════ 기간별 수익률 ═════════ */}
        <div className="col-span-12">
          <div className="panel p-3 sm:p-4">
            <div className="section-title text-[10px] sm:text-[11px] mb-3">
              📊 PERFORMANCE · 기간별 수익률
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: "오늘", value: data.returns.day, short: "1D" },
                { label: "1주일", value: data.returns.week, short: "1W" },
                { label: "1개월", value: data.returns.month, short: "1M" },
                { label: "3개월", value: data.returns.quarter, short: "3M" },
                { label: "YTD", value: data.returns.ytd, short: "YTD" },
                { label: "1년", value: data.returns.year, short: "1Y" },
              ].map((r) => {
                const val = r.value;
                if (val === null || val === undefined) {
                  return (
                    <div key={r.short} className="border border-[var(--border)] rounded p-2 text-center">
                      <div className="text-[8px] dim kr">{r.label}</div>
                      <div className="text-[14px] dim">—</div>
                    </div>
                  );
                }
                return (
                  <div
                    key={r.short}
                    className={`border rounded p-2 text-center ${
                      val >= 0 ? "border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)]" : "border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)]"
                    }`}
                  >
                    <div className="text-[8px] dim kr">{r.label}</div>
                    <div className={`text-[14px] font-bold ${val >= 0 ? "up" : "down"}`}>
                      {val >= 0 ? "+" : ""}
                      {val.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═════════ 가격 차트 (1년) ═════════ */}
        <div className="col-span-12 lg:col-span-8">
          <div className="panel p-3 sm:p-4">
            <div className="section-title text-[10px] sm:text-[11px] mb-3">
              📈 PRICE CHART · 1년 가격 추이 + 이동평균선
            </div>
            {data.priceHistory["1y"].length > 0 && (
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <ComposedChart data={data.priceHistory["1y"]} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#666", fontSize: 9 }}
                      tickFormatter={(d) => {
                        const p = d.split("-");
                        return p.length === 3 ? `${p[1]}/${p[2]}` : d;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#666", fontSize: 9 }}
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => isKrw ? `${(v/1000).toFixed(0)}K` : `$${v.toFixed(0)}`}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--amber)", fontWeight: "bold" }}
                      formatter={(value: number, name: string) => {
                        return [fmtPrice(value), name];
                      }}
                    />
                    {data.technicals.sma50 !== null && (
                      <ReferenceLine
                        y={data.technicals.sma50}
                        stroke="#aaccff"
                        strokeDasharray="4 4"
                        label={{ value: "SMA50", fill: "#aaccff", fontSize: 8, position: "right" }}
                      />
                    )}
                    {data.technicals.sma200 !== null && (
                      <ReferenceLine
                        y={data.technicals.sma200}
                        stroke="#ff9944"
                        strokeDasharray="4 4"
                        label={{ value: "SMA200", fill: "#ff9944", fontSize: 8, position: "right" }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke="var(--amber)"
                      strokeWidth={1.5}
                      fill="url(#priceGrad)"
                      name="종가"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ═════════ 기술적 지표 ═════════ */}
        <div className="col-span-12 lg:col-span-4">
          <div className="panel p-3 sm:p-4">
            <div className="section-title text-[10px] sm:text-[11px] mb-3">
              🔬 TECHNICALS · 기술적 지표
            </div>
            <table className="w-full text-[10px]">
              <tbody>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-1.5 dim kr">SMA 20일</td>
                  <td className="text-right py-1.5 tick">
                    {fmtPrice(data.technicals.sma20)}
                  </td>
                  <td className="text-right py-1.5 text-[8px]">
                    {data.technicals.sma20 && (
                      <span className={data.quote.price >= data.technicals.sma20 ? "up" : "down"}>
                        {data.quote.price >= data.technicals.sma20 ? "↑" : "↓"}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-1.5 dim kr">SMA 50일</td>
                  <td className="text-right py-1.5 tick">
                    {fmtPrice(data.technicals.sma50)}
                  </td>
                  <td className="text-right py-1.5 text-[8px]">
                    {data.technicals.sma50 && (
                      <span className={data.quote.price >= data.technicals.sma50 ? "up" : "down"}>
                        {data.quote.price >= data.technicals.sma50 ? "↑" : "↓"}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-1.5 dim kr">SMA 200일</td>
                  <td className="text-right py-1.5 tick">
                    {fmtPrice(data.technicals.sma200)}
                  </td>
                  <td className="text-right py-1.5 text-[8px]">
                    {data.technicals.sma200 && (
                      <span className={data.quote.price >= data.technicals.sma200 ? "up" : "down"}>
                        {data.quote.price >= data.technicals.sma200 ? "↑" : "↓"}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-1.5 dim kr">RSI (14)</td>
                  <td className="text-right py-1.5 font-bold" colSpan={2}>
                    {data.technicals.rsi !== null ? (
                      <span className={
                        data.technicals.rsi > 70 ? "down" :
                        data.technicals.rsi < 30 ? "up" : "tick"
                      }>
                        {data.technicals.rsi.toFixed(1)}
                        <span className="text-[8px] dim ml-2">
                          {data.technicals.rsi > 70 ? "과매수" :
                           data.technicals.rsi < 30 ? "과매도" : "중립"}
                        </span>
                      </span>
                    ) : "—"}
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-1.5 dim kr">변동성 (20일)</td>
                  <td className="text-right py-1.5 tick font-bold" colSpan={2}>
                    {data.technicals.volatility !== null ? `${data.technicals.volatility.toFixed(1)}%` : "—"}
                  </td>
                </tr>
                {data.analysis?.sector_beta !== undefined && (
                  <tr className="border-b border-[var(--border)]">
                    <td className="py-1.5 dim kr">섹터 베타</td>
                    <td className="text-right py-1.5 tick font-bold" colSpan={2}>
                      {data.analysis.sector_beta?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ═════════ AI 에이전트 + 옵션 ═════════ */}
        <div className="col-span-12 lg:col-span-6">
          <div className="panel p-3 sm:p-4 h-full">
            <div className="section-title text-[10px] sm:text-[11px] mb-3">
              🤖 AI AGENT CONSENSUS · 에이전트 합의
            </div>
            {data.agentConsensus ? (
              <>
                <div className="text-center mb-3">
                  <div className={`text-[36px] font-bold ${
                    data.agentConsensus.final_score >= 15 ? "up" :
                    data.agentConsensus.final_score <= -15 ? "down" :
                    "text-[var(--amber)]"
                  }`}>
                    {data.agentConsensus.final_score >= 0 ? "+" : ""}
                    {data.agentConsensus.final_score}
                  </div>
                  <div className="text-[12px] bright kr">{data.agentConsensus.final_vote}</div>
                  <div className="text-[9px] dim kr mt-1">
                    19명 중 {data.agentConsensus.agreement_level}% 합의
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-2 text-[9px] dim kr text-center">
                  분석: {new Date(data.agentConsensus.timestamp).toLocaleString("ko-KR")}
                </div>
              </>
            ) : (
              <div className="text-[10px] dim text-center py-6 kr">
                아직 에이전트 분석 없음 · snapshot-agents cron 대기
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <div className="panel p-3 sm:p-4 h-full">
            <div className="section-title text-[10px] sm:text-[11px] mb-3">
              📈 OPTIONS MARKET · 옵션 시장 (30일)
            </div>
            {data.options?.available ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="border border-[var(--border)] rounded p-2 text-center">
                    <div className="text-[8px] dim kr">ATM 콜 IV</div>
                    <div className="text-[16px] font-bold tick">{data.options.atmCallIV.toFixed(1)}%</div>
                  </div>
                  <div className="border border-[var(--border)] rounded p-2 text-center">
                    <div className="text-[8px] dim kr">ATM 풋 IV</div>
                    <div className="text-[16px] font-bold tick">{data.options.atmPutIV.toFixed(1)}%</div>
                  </div>
                  <div className="border border-[var(--border)] rounded p-2 text-center">
                    <div className="text-[8px] dim kr">풋/콜 비율</div>
                    <div className={`text-[16px] font-bold ${
                      data.options.putCallRatio < 0.6 ? "up" : data.options.putCallRatio > 1.0 ? "down" : "tick"
                    }`}>
                      {data.options.putCallRatio.toFixed(2)}
                    </div>
                  </div>
                  <div className="border border-[var(--border)] rounded p-2 text-center">
                    <div className="text-[8px] dim kr">예상 30일 변동폭</div>
                    <div className="text-[16px] font-bold tick">±{data.options.expectedMovePct.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="border-l-2 border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] pl-2 text-[9px] kr">
                  📊 <span className="bright">센티먼트</span>: {data.options.sentiment}
                </div>
              </>
            ) : (
              <div className="text-[10px] dim text-center py-6 kr">
                옵션 데이터 없음 · CBOE 지원 대상 아님
              </div>
            )}
          </div>
        </div>

        {/* ═════════ 뉴스 감성 차트 (30일) ═════════ */}
        {data.newsSentiment.length > 0 && (
          <div className="col-span-12 lg:col-span-6">
            <div className="panel p-3 sm:p-4">
              <div className="section-title text-[10px] sm:text-[11px] mb-3">
                📰 NEWS SENTIMENT · 30일 뉴스 감성
              </div>
              <div style={{ width: "100%", height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={data.newsSentiment} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
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
                      tick={{ fill: "#666", fontSize: 8 }}
                      domain={[-1, 1]}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--amber)", fontWeight: "bold" }}
                    />
                    <ReferenceLine y={0} stroke="#666" />
                    <Bar
                      dataKey="avg_sentiment"
                      fill="#00ff88"
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        const color = payload.avg_sentiment >= 0 ? "#00ff88" : "#ff3860";
                        const realY = payload.avg_sentiment >= 0 ? y : y + height;
                        const realHeight = Math.abs(height);
                        return <rect x={x} y={payload.avg_sentiment >= 0 ? y : y} width={width} height={realHeight} fill={color} opacity={0.7} />;
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-[8px] dim kr">
                총 {data.newsSentiment.reduce((s: number, n: any) => s + n.total_count, 0)}개 뉴스 분석 · 평균 감성{" "}
                <span className={
                  data.newsSentiment.reduce((s: number, n: any) => s + n.avg_sentiment, 0) / data.newsSentiment.length >= 0 ? "up" : "down"
                }>
                  {(data.newsSentiment.reduce((s: number, n: any) => s + n.avg_sentiment, 0) / data.newsSentiment.length).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ═════════ 최근 뉴스 ═════════ */}
        {data.news.length > 0 && (
          <div className={`col-span-12 ${data.newsSentiment.length > 0 ? "lg:col-span-6" : ""}`}>
            <div className="panel p-3 sm:p-4">
              <div className="section-title text-[10px] sm:text-[11px] mb-3">
                📰 LATEST NEWS · 최근 뉴스
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {data.news.slice(0, 8).map((n: any) => (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border-l-2 border-[var(--border)] hover:border-[var(--amber)] pl-2 py-1 transition-colors"
                  >
                    <div className="text-[9px] sm:text-[10px] bright kr line-clamp-2 leading-tight">
                      {n.headline}
                    </div>
                    <div className="text-[7px] dim flex items-center gap-2 mt-0.5">
                      <span>{n.source}</span>
                      <span>·</span>
                      <span>{new Date(n.published_at).toLocaleDateString("ko-KR")}</span>
                      {n.sentiment !== null && n.sentiment !== undefined && (
                        <>
                          <span>·</span>
                          <span className={n.sentiment > 0.3 ? "up" : n.sentiment < -0.3 ? "down" : "dim"}>
                            감성 {n.sentiment >= 0 ? "+" : ""}
                            {n.sentiment.toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═════════ 예측 정확도 이력 ═════════ */}
        {data.forecastAccuracy.length > 0 && (
          <div className="col-span-12">
            <div className="panel p-3 sm:p-4">
              <div className="section-title text-[10px] sm:text-[11px] mb-3">
                🎯 FORECAST ACCURACY · 과거 예측 vs 실제 (이 종목)
              </div>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <ComposedChart data={data.forecastAccuracy.slice(-30)} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="target_date"
                      tick={{ fill: "#666", fontSize: 8 }}
                      tickFormatter={(d) => {
                        const p = d.split("-");
                        return p.length === 3 ? `${p[1]}/${p[2]}` : d;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fill: "#666", fontSize: 9 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--amber)", fontWeight: "bold" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual_value"
                      stroke="#00ff88"
                      strokeWidth={2}
                      name="실제"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast_value"
                      stroke="var(--amber)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      name="예측"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ═════════ 빈 데이터 플레이스홀더 ═════════ */}
        {data.news.length === 0 && data.newsSentiment.length === 0 && data.forecastAccuracy.length === 0 && (
          <div className="col-span-12">
            <div className="panel p-4 text-[10px] dim text-center kr">
              💡 뉴스/예측/감성 데이터가 쌓이면 여기에 표시됩니다
            </div>
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="border-t border-[var(--border)] px-3 sm:px-6 py-3 text-[8px] dim text-center kr">
        실시간 시세 1분 갱신 · CBOE 옵션 15분 지연 · 자동 업데이트
      </div>
    </div>
  );
}
