"use client";

import useSWR from "swr";
import { useState } from "react";
import { SymbolDisplay } from "@/components/SymbolDisplay";

import { safeFetcher } from "@/lib/swr-config";
const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface ScanResult {
  symbol: string;
  currentPrice: number;
  dayChangePct: number;
  volume: number | null;
  maxPain: number | null;
  maxPainDistance: number | null;
  gexTotal: number;
  gexRegime: "positive" | "negative";
  putCallRatio: number;
  putCallVolRatio: number;
  expectedMovePct: number;
  opportunities: string[];
  warnings: string[];
  unusualActivity: string[];
  gammaSqueezeScore: number;
  score: number;
  category: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  rationale: string;
}

interface ScannerData {
  success: boolean;
  scannedCount: number;
  sectorSentiment: {
    bullish: number;
    bearish: number;
    neutral: number;
    avgScore: number;
    positiveGex: number;
    negativeGex: number;
  };
  sectorDirection: string;
  results: {
    strongBuys: ScanResult[];
    buys: ScanResult[];
    neutrals: ScanResult[];
    sells: ScanResult[];
    strongSells: ScanResult[];
  };
  unusualActivity: ScanResult[];
  gammaSqueezeCandidates: ScanResult[];
  allResults: ScanResult[];
}

const TABS = [
  { id: "overview",  label: "🎯 요약",         icon: "🎯" },
  { id: "buys",      label: "📈 매수 후보",    icon: "📈" },
  { id: "sells",     label: "📉 매도 경고",    icon: "📉" },
  { id: "unusual",   label: "🔥 비정상 활동",  icon: "🔥" },
  { id: "squeeze",   label: "🚀 Gamma Squeeze", icon: "🚀" },
  { id: "all",       label: "📊 전체",         icon: "📊" },
] as const;

type TabId = typeof TABS[number]["id"];

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function SectorScannerPanel() {
  const [tab, setTab] = useState<TabId>("overview");
  const { data, isLoading } = useSWR<ScannerData>("/api/sector-scanner", fetcher, {
    refreshInterval: 600000, // 10분
  });

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[12px] dim kr">🔍 반도체 섹터 {23}개 종목 옵션 스캔 중...</div>
        <div className="text-[9px] dim mt-2 kr">매수 후보 · 매도 경고 · 비정상 활동 자동 발굴</div>
      </div>
    );
  }

  if (!data?.success || !data.results) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">
          데이터 로딩 실패 - {(data as unknown as { error?: string })?.error || "다시 시도"}
        </div>
      </div>
    );
  }

  // 방어: results 내 배열이 모두 존재하도록 보장
  const rawResults = data.results ?? {};
  const results = {
    strongBuys: rawResults.strongBuys ?? [],
    buys: rawResults.buys ?? [],
    neutrals: rawResults.neutrals ?? [],
    sells: rawResults.sells ?? [],
    strongSells: rawResults.strongSells ?? [],
  };
  const unusualActivity = data.unusualActivity ?? [];
  const gammaSqueezeCandidates = data.gammaSqueezeCandidates ?? [];
  const allResults = data.allResults ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🔍 SECTOR SCANNER · 반도체 섹터 자동 스캔
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            {data.scannedCount}개 종목 옵션 데이터 분석 · 매수/매도/비정상 활동 자동 발굴
          </div>
        </div>
      </div>

      {/* ═════════ 섹터 센티먼트 바 ═════════ */}
      <SectorSentimentBar data={data} />

      {/* ═════════ 탭 ═════════ */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        {TABS.map((t) => {
          const count = getTabCount(data, t.id);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[10px] px-3 py-1.5 border-b-2 transition-all ${
                tab === t.id
                  ? "border-[var(--amber)] text-[var(--amber)] font-bold"
                  : "border-transparent dim hover:text-[var(--amber)]"
              }`}
            >
              {t.label}
              {count !== null && (
                <span className="ml-1 text-[8px] opacity-75">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═════════ 탭 컨텐츠 ═════════ */}
      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "buys" && (
        <BuySellList
          title="📈 매수 후보 (강도 순)"
          results={[...results.strongBuys, ...results.buys]}
          type="buy"
          emptyMsg="현재 강력한 매수 시그널 없음"
        />
      )}
      {tab === "sells" && (
        <BuySellList
          title="📉 매도 경고 (강도 순)"
          results={[...results.strongSells, ...results.sells]}
          type="sell"
          emptyMsg="현재 명확한 매도 경고 없음"
        />
      )}
      {tab === "unusual" && <UnusualActivityTab results={unusualActivity} />}
      {tab === "squeeze" && <GammaSqueezeTab results={gammaSqueezeCandidates} />}
      {tab === "all" && <AllResultsTab results={allResults} />}

      {/* 교육 섹션 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">💡 사용 방법</span>: 탭별로 기회를 확인하고 관심 종목 클릭 → 상세 페이지로 이동<br />
        <span className="bright">⚠️ 주의</span>: 옵션 시그널은 <span className="bright">참고 지표</span>일 뿐 - 반드시 다른 분석과 함께 고려
      </div>
    </div>
  );
}

function getTabCount(data: ScannerData, tabId: TabId): number | null {
  const r = data.results ?? {};
  switch (tabId) {
    case "buys": return (r.strongBuys?.length ?? 0) + (r.buys?.length ?? 0);
    case "sells": return (r.strongSells?.length ?? 0) + (r.sells?.length ?? 0);
    case "unusual": return data.unusualActivity?.length ?? 0;
    case "squeeze": return data.gammaSqueezeCandidates?.length ?? 0;
    case "all": return data.allResults?.length ?? 0;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 섹터 센티먼트 바
// ═══════════════════════════════════════════════════════════
function SectorSentimentBar({ data }: { data: ScannerData }) {
  const total = data.sectorSentiment.bullish + data.sectorSentiment.bearish + data.sectorSentiment.neutral;
  const bullishPct = total > 0 ? (data.sectorSentiment.bullish / total) * 100 : 0;
  const bearishPct = total > 0 ? (data.sectorSentiment.bearish / total) * 100 : 0;
  const neutralPct = total > 0 ? (data.sectorSentiment.neutral / total) * 100 : 0;

  const directionColor =
    data.sectorDirection === "강세 우위" ? "#00ff88" :
    data.sectorDirection === "약세 우위" ? "#ff3860" :
    "#ffaa44";

  return (
    <div
      className="mb-3 border rounded-lg p-3"
      style={{
        borderColor: directionColor,
        background: `linear-gradient(135deg, ${directionColor}10, transparent)`,
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div>
          <div className="text-[9px] dim kr">반도체 섹터 종합 센티먼트</div>
          <div className="text-[20px] font-bold" style={{ color: directionColor }}>
            {data.sectorDirection}
          </div>
          <div className="text-[9px] dim kr">
            평균 점수 <span className="tick font-bold" style={{ color: directionColor }}>{data.sectorSentiment.avgScore >= 0 ? "+" : ""}{data.sectorSentiment.avgScore}</span>
          </div>
        </div>
        <div className="text-right text-[9px] kr">
          <div className="up">🟢 강세 {data.sectorSentiment.bullish}개</div>
          <div className="dim">➖ 중립 {data.sectorSentiment.neutral}개</div>
          <div className="down">🔴 약세 {data.sectorSentiment.bearish}개</div>
        </div>
      </div>

      {/* 센티먼트 바 */}
      <div className="h-3 flex rounded-full overflow-hidden border border-[var(--border)]">
        <div
          className="bg-[#00ff88] flex items-center justify-center text-[8px] text-black font-bold"
          style={{ width: `${bullishPct}%` }}
        >
          {bullishPct > 10 && `${bullishPct.toFixed(0)}%`}
        </div>
        <div
          className="bg-[#888] flex items-center justify-center text-[8px] text-black font-bold"
          style={{ width: `${neutralPct}%` }}
        >
          {neutralPct > 10 && `${neutralPct.toFixed(0)}%`}
        </div>
        <div
          className="bg-[#ff3860] flex items-center justify-center text-[8px] text-white font-bold"
          style={{ width: `${bearishPct}%` }}
        >
          {bearishPct > 10 && `${bearishPct.toFixed(0)}%`}
        </div>
      </div>

      <div className="mt-2 text-[8px] dim kr flex items-center gap-4 flex-wrap">
        <span>✅ 양의 GEX: <span className="up">{data.sectorSentiment.positiveGex}개</span></span>
        <span>⚠️ 음의 GEX: <span className="down">{data.sectorSentiment.negativeGex}개</span></span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 요약 탭
// ═══════════════════════════════════════════════════════════
function OverviewTab({ data }: { data: ScannerData }) {
  const r = data.results ?? { strongBuys: [], buys: [], neutrals: [], sells: [], strongSells: [] };
  const ua = data.unusualActivity ?? [];
  const gs = data.gammaSqueezeCandidates ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <OverviewBox
          title="🚀 Top Opportunities"
          color="#00ff88"
          subtitle="가장 강한 매수 시그널"
          results={(r.strongBuys ?? []).slice(0, 3)}
          emptyMsg="강력한 매수 시그널 없음"
          showBadge="strong_buy"
        />
        <OverviewBox
          title="⚠️ Top Warnings"
          color="#ff3860"
          subtitle="가장 강한 매도 경고"
          results={(r.strongSells ?? []).slice(0, 3)}
          emptyMsg="명확한 매도 경고 없음"
          showBadge="strong_sell"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <OverviewBox
          title="🔥 Unusual Activity"
          color="#ffaa44"
          subtitle="비정상 옵션 거래 포착"
          results={ua.slice(0, 3)}
          emptyMsg="현재 비정상 활동 없음"
          showUnusual
        />
        <OverviewBox
          title="🚀 Gamma Squeeze"
          color="#ee99ff"
          subtitle="급등 잠재력 종목"
          results={gs.slice(0, 3)}
          emptyMsg="Gamma Squeeze 후보 없음"
          showSqueeze
        />
      </div>
    </div>
  );
}

function OverviewBox({
  title,
  color,
  subtitle,
  results,
  emptyMsg,
  showBadge,
  showUnusual,
  showSqueeze,
}: {
  title: string;
  color: string;
  subtitle: string;
  results: ScanResult[];
  emptyMsg: string;
  showBadge?: string;
  showUnusual?: boolean;
  showSqueeze?: boolean;
}) {
  return (
    <div
      className="border rounded-lg p-3"
      style={{
        borderColor: `${color}40`,
        background: `linear-gradient(135deg, ${color}08, transparent)`,
      }}
    >
      <div className="mb-2">
        <div className="text-[11px] font-bold kr" style={{ color }}>{title}</div>
        <div className="text-[8px] dim kr">{subtitle}</div>
      </div>

      {results.length === 0 ? (
        <div className="text-[9px] dim kr text-center py-6">{emptyMsg}</div>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.symbol} className="border-l-2 pl-2 py-1" style={{ borderColor: color }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <a
                  href={`/stock/${r.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80"
                >
                  <SymbolDisplay
                    meta={{ symbol: r.symbol }}
                    size="sm"
                    variant="inline"
                    showFlag={true}
                    showBadges={false}
                    showName={false}
                  />
                </a>
                <div className="text-right">
                  <span className="text-[10px] tick">${r.currentPrice.toFixed(2)}</span>
                  <span
                    className={`text-[9px] ml-1 font-bold ${r.dayChangePct >= 0 ? "up" : "down"}`}
                  >
                    ({r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="text-[9px] kr mt-0.5" style={{ color: `${color}dd` }}>
                {showSqueeze
                  ? `🚀 Squeeze Score ${r.gammaSqueezeScore} · ${r.opportunities[0] || r.rationale}`
                  : showUnusual
                  ? r.unusualActivity[0] || r.rationale
                  : r.rationale}
              </div>
              <div className="text-[8px] dim mt-0.5">점수 {r.score >= 0 ? "+" : ""}{r.score}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 매수/매도 리스트
// ═══════════════════════════════════════════════════════════
function BuySellList({
  title,
  results,
  type,
  emptyMsg,
}: {
  title: string;
  results: ScanResult[];
  type: "buy" | "sell";
  emptyMsg: string;
}) {
  const color = type === "buy" ? "#00ff88" : "#ff3860";

  return (
    <div>
      <div className="text-[10px] tick kr font-bold mb-2">{title}</div>
      {results.length === 0 ? (
        <div className="text-[10px] dim text-center py-8 kr border border-[var(--border)] rounded">
          {emptyMsg}
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.symbol}
              className="border-l-4 rounded-r p-3 hover:bg-[rgba(255,255,255,0.02)]"
              style={{ borderLeftColor: color, background: `${color}05` }}
            >
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={`/stock/${r.symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80"
                  >
                    <SymbolDisplay
                      meta={{ symbol: r.symbol }}
                      size="md"
                      variant="inline"
                      showFlag={true}
                      showBadges={false}
                      showName={false}
                    />
                  </a>
                  <span className="text-[11px] tick">${r.currentPrice.toFixed(2)}</span>
                  <span
                    className={`text-[10px] font-bold ${r.dayChangePct >= 0 ? "up" : "down"}`}
                  >
                    {r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%
                  </span>
                  {r.category === "strong_buy" && (
                    <span className="text-[8px] px-2 py-0.5 bg-[#00ff88] text-black rounded kr font-bold">
                      STRONG BUY
                    </span>
                  )}
                  {r.category === "strong_sell" && (
                    <span className="text-[8px] px-2 py-0.5 bg-[#ff3860] text-white rounded kr font-bold animate-pulse">
                      STRONG SELL
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[9px] dim kr">점수</div>
                  <div className="text-[14px] font-bold" style={{ color }}>
                    {r.score >= 0 ? "+" : ""}{r.score}
                  </div>
                </div>
              </div>

              {/* 메트릭 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] mb-2">
                <div>
                  <span className="dim kr">Max Pain: </span>
                  <span className="tick">
                    {r.maxPain ? `$${r.maxPain.toFixed(2)}` : "—"}
                  </span>
                  {r.maxPainDistance !== null && (
                    <span className={r.maxPainDistance >= 0 ? " up" : " down"}>
                      {" "}({r.maxPainDistance >= 0 ? "+" : ""}{r.maxPainDistance.toFixed(1)}%)
                    </span>
                  )}
                </div>
                <div>
                  <span className="dim kr">GEX: </span>
                  <span className={r.gexRegime === "positive" ? "up" : "down"}>
                    {r.gexTotal >= 0 ? "+" : ""}{(r.gexTotal / 1e9).toFixed(2)}B
                  </span>
                </div>
                <div>
                  <span className="dim kr">P/C (OI): </span>
                  <span className="tick">{r.putCallRatio.toFixed(2)}</span>
                </div>
                <div>
                  <span className="dim kr">IV 변동: </span>
                  <span className="tick">±{r.expectedMovePct.toFixed(1)}%</span>
                </div>
              </div>

              {/* 시그널 태그 */}
              <div className="flex flex-wrap gap-1">
                {(type === "buy" ? r.opportunities : r.warnings).slice(0, 3).map((s, i) => (
                  <span
                    key={i}
                    className="text-[8px] px-2 py-0.5 border rounded kr"
                    style={{ borderColor: `${color}60`, color }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 비정상 활동 탭
// ═══════════════════════════════════════════════════════════
function UnusualActivityTab({ results }: { results: ScanResult[] }) {
  return (
    <div>
      <div className="text-[10px] tick kr font-bold mb-2">
        🔥 비정상 옵션 거래 - 기관 의심 움직임
      </div>
      {results.length === 0 ? (
        <div className="text-[10px] dim text-center py-8 kr border border-[var(--border)] rounded">
          현재 비정상 활동 없음
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.symbol}
              className="border border-[#ffaa44]/40 bg-[rgba(255,170,68,0.03)] rounded p-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-3">
                  <a
                    href={`/stock/${r.symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] tick font-bold hover:bright"
                  >
                    {r.symbol}
                  </a>
                  <span className="text-[11px] tick">${r.currentPrice.toFixed(2)}</span>
                  <span className={`text-[10px] font-bold ${r.dayChangePct >= 0 ? "up" : "down"}`}>
                    {r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[9px] text-[#ffaa44] kr font-bold">
                  거래량 P/C {r.putCallVolRatio}
                </span>
              </div>

              <div className="space-y-1">
                {r.unusualActivity.map((u, i) => (
                  <div key={i} className="text-[10px] kr text-[#ffaa44]">
                    {u}
                  </div>
                ))}
              </div>

              <div className="text-[8px] dim kr mt-2 italic">
                💭 비정상 P/C 비율은 대형 기관의 포지션 구축을 시사할 수 있음
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Gamma Squeeze 탭
// ═══════════════════════════════════════════════════════════
function GammaSqueezeTab({ results }: { results: ScanResult[] }) {
  return (
    <div>
      <div className="text-[10px] tick kr font-bold mb-2">
        🚀 Gamma Squeeze 후보 - 급등 잠재력 종목
      </div>
      <div className="text-[9px] dim kr mb-3 p-2 border border-[var(--border)] rounded bg-[rgba(238,153,255,0.03)]">
        💡 <span className="bright">Gamma Squeeze란?</span> 현재가 위쪽에 대량의 Call OI가 집중되면,
        주가 상승 시 딜러들이 추가 매수를 강제당해 <span className="bright">가속 랠리</span>가 발생하는 현상.
      </div>

      {results.length === 0 ? (
        <div className="text-[10px] dim text-center py-8 kr border border-[var(--border)] rounded">
          현재 Gamma Squeeze 후보 없음
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.symbol}
              className="border border-[#ee99ff]/40 bg-[rgba(238,153,255,0.03)] rounded p-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-3">
                  <a
                    href={`/stock/${r.symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] tick font-bold hover:bright"
                  >
                    {r.symbol}
                  </a>
                  <span className="text-[11px] tick">${r.currentPrice.toFixed(2)}</span>
                  <span className={`text-[10px] font-bold ${r.dayChangePct >= 0 ? "up" : "down"}`}>
                    {r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-[8px] dim kr">Squeeze Score</div>
                  <div className="text-[18px] font-bold text-[#ee99ff]">
                    {r.gammaSqueezeScore}
                  </div>
                </div>
              </div>

              {/* Squeeze Score 게이지 */}
              <div className="h-1.5 bg-[var(--border)] rounded overflow-hidden mb-2">
                <div
                  className="h-full bg-[#ee99ff]"
                  style={{ width: `${r.gammaSqueezeScore}%` }}
                />
              </div>

              <div className="space-y-1">
                {(r.opportunities ?? []).slice(0, 2).map((o, i) => (
                  <div key={i} className="text-[9px] kr text-[#ee99ff]">
                    {o}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 전체 결과 탭
// ═══════════════════════════════════════════════════════════
function AllResultsTab({ results }: { results: ScanResult[] }) {
  return (
    <div>
      <div className="text-[10px] tick kr font-bold mb-2">
        📊 전체 결과 (점수순)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="border-b border-[var(--border)] dim">
              <th className="text-left py-1.5 px-2">종목</th>
              <th className="text-right py-1.5 px-2 kr">현재가</th>
              <th className="text-right py-1.5 px-2 kr">일변동</th>
              <th className="text-right py-1.5 px-2 kr">Max Pain</th>
              <th className="text-center py-1.5 px-2 kr">GEX</th>
              <th className="text-right py-1.5 px-2 kr">P/C</th>
              <th className="text-center py-1.5 px-2 kr">점수</th>
              <th className="text-center py-1.5 px-2 kr">판정</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.symbol} className="border-b border-[var(--border)] hover:bg-[rgba(255,255,255,0.02)]">
                <td className="py-1.5 px-2">
                  <a
                    href={`/stock/${r.symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tick font-bold hover:bright"
                  >
                    {r.symbol}
                  </a>
                </td>
                <td className="text-right py-1.5 px-2 tick">${r.currentPrice.toFixed(2)}</td>
                <td className={`text-right py-1.5 px-2 font-bold ${r.dayChangePct >= 0 ? "up" : "down"}`}>
                  {r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%
                </td>
                <td className="text-right py-1.5 px-2 tick">
                  {r.maxPain ? `$${r.maxPain.toFixed(0)}` : "—"}
                  {r.maxPainDistance !== null && (
                    <span className={`text-[7px] ml-1 ${r.maxPainDistance >= 0 ? "up" : "down"}`}>
                      ({r.maxPainDistance >= 0 ? "+" : ""}{r.maxPainDistance.toFixed(0)}%)
                    </span>
                  )}
                </td>
                <td className="text-center py-1.5 px-2">
                  <span className={r.gexRegime === "positive" ? "up" : "down"}>
                    {r.gexRegime === "positive" ? "✅" : "⚠️"}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tick">{r.putCallRatio.toFixed(2)}</td>
                <td
                  className={`text-center py-1.5 px-2 font-bold ${
                    r.score >= 10 ? "up" : r.score <= -10 ? "down" : "dim"
                  }`}
                >
                  {r.score >= 0 ? "+" : ""}{r.score}
                </td>
                <td className="text-center py-1.5 px-2">
                  <CategoryBadge category={r.category} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: ScanResult["category"] }) {
  const config = {
    strong_buy:  { label: "STRONG BUY",  color: "#00ff88", bg: "#00ff8820" },
    buy:         { label: "BUY",         color: "#00cc88", bg: "#00cc8820" },
    neutral:     { label: "NEUTRAL",     color: "#aaa",    bg: "#aaa20" },
    sell:        { label: "SELL",        color: "#ff6699", bg: "#ff669920" },
    strong_sell: { label: "STRONG SELL", color: "#ff3860", bg: "#ff386020" },
  }[category];

  return (
    <span
      className="text-[7px] px-1.5 py-0.5 rounded kr font-bold"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}40` }}
    >
      {config.label}
    </span>
  );
}
