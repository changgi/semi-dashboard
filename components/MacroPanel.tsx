"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MacroItem {
  symbol: string;
  name: string;
  nameEn: string;
  category: string;
  impact: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketState: string | null;
  sparkline?: number[];
}

interface MacroSignal {
  type: "positive" | "negative" | "neutral";
  title: string;
  message: string;
  source: string;
}

// ─────────────────────────────────────────────────────────
// 카테고리 메타 정보
// ─────────────────────────────────────────────────────────
const CATEGORY_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  oil: { icon: "🛢️", label: "국제 유가", color: "text-[#ff9944]" },
  index: { icon: "📊", label: "미국 증시", color: "text-[var(--amber)]" },
  bond: { icon: "📜", label: "국채 금리", color: "text-[#88dd99]" },
  fx: { icon: "💵", label: "외환", color: "text-[#aabbff]" },
  vol: { icon: "⚡", label: "변동성 지수", color: "text-[#ff6688]" },
  semi: { icon: "💻", label: "반도체 ETF", color: "text-[var(--amber)]" },
  korea: { icon: "🇰🇷", label: "한국 시장", color: "text-[#ffccaa]" },
};

// ─────────────────────────────────────────────────────────
// 매크로 카드
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// 스파크라인 SVG 컴포넌트
// ─────────────────────────────────────────────────────────
function Sparkline({
  data,
  color,
  width = 120,
  height = 32,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const xStep = (width - padding * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = padding + i * xStep;
    const y = padding + (height - padding * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${(padding + (data.length - 1) * xStep).toFixed(1)},${height - padding} L ${padding},${height - padding} Z`;

  const gradId = `spark-grad-${Math.random().toString(36).slice(2)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 마지막 점 강조 */}
      <circle
        cx={padding + (data.length - 1) * xStep}
        cy={padding + (height - padding * 2) * (1 - (data[data.length - 1] - min) / range)}
        r="1.8"
        fill={color}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// 매크로 카드
// ─────────────────────────────────────────────────────────
function MacroCard({ item }: { item: MacroItem }) {
  const up = (item.changePct ?? 0) >= 0;
  const color = up ? "up" : "down";
  const arrow = up ? "▲" : "▼";
  const sparkColor = up ? "#00ff88" : "#ff3860";

  const formatPrice = (price: number | null) => {
    if (price === null) return "—";
    if (price < 10) return price.toFixed(2);
    if (price < 1000) return price.toFixed(2);
    if (price < 10000) return price.toFixed(1);
    return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  // 1개월 변동률 계산 (스파크라인 첫값 vs 마지막값)
  let monthChangePct: number | null = null;
  if (item.sparkline && item.sparkline.length >= 2) {
    const first = item.sparkline[0];
    const last = item.sparkline[item.sparkline.length - 1];
    if (first > 0) monthChangePct = ((last - first) / first) * 100;
  }

  return (
    <div className="border border-[var(--border)] rounded p-2 sm:p-2.5 hover:border-[var(--amber-dim)] transition-colors">
      <div className="flex items-start justify-between mb-1 gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-[11px] font-bold bright truncate kr">
            {item.name}
          </div>
          <div className="text-[7px] sm:text-[8px] dim truncate">
            {item.nameEn} · {item.symbol}
          </div>
        </div>
        {item.marketState && item.marketState !== "REGULAR" && (
          <span className="text-[6px] sm:text-[7px] dim border border-[var(--border)] px-1 rounded">
            {item.marketState}
          </span>
        )}
      </div>

      {/* 가격 + 스파크라인 (가로 배치) */}
      <div className="flex items-end justify-between gap-2 my-1">
        <div>
          <span className="text-[13px] sm:text-[15px] font-bold tick">
            {item.category === "bond" || item.category === "vol"
              ? `${formatPrice(item.price)}${item.category === "bond" ? "%" : ""}`
              : `${formatPrice(item.price)}`}
          </span>
          {/* 변동률 */}
          {item.changePct !== null && (
            <div className={`text-[9px] sm:text-[10px] ${color} font-bold`}>
              {arrow} {Math.abs(item.changePct).toFixed(2)}%
              <span className="dim ml-1 font-normal text-[8px] sm:text-[9px]">
                ({up ? "+" : ""}{(item.change ?? 0).toFixed(2)})
              </span>
            </div>
          )}
        </div>

        {/* 🎯 스파크라인 (1개월) */}
        {item.sparkline && item.sparkline.length >= 2 && (
          <div className="flex flex-col items-end">
            <Sparkline data={item.sparkline} color={sparkColor} width={80} height={28} />
            {monthChangePct !== null && (
              <div className="text-[7px] sm:text-[8px] dim mt-0.5">
                1M: <span className={monthChangePct >= 0 ? "up" : "down"}>
                  {monthChangePct >= 0 ? "+" : ""}
                  {monthChangePct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 반도체 영향 */}
      <div className="text-[7px] sm:text-[8px] dim mt-1.5 pt-1.5 border-t border-[var(--border)] line-clamp-2 kr leading-tight">
        {item.impact}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Daniel Yoo 시그널 박스
// ─────────────────────────────────────────────────────────
function SignalBox({ signal }: { signal: MacroSignal }) {
  const bgClass =
    signal.type === "positive"
      ? "border-[#00ff88] bg-[rgba(0,255,136,0.05)]"
      : signal.type === "negative"
      ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
      : "border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)]";

  const titleColor =
    signal.type === "positive"
      ? "text-[#00ff88]"
      : signal.type === "negative"
      ? "text-[#ff3860]"
      : "text-[var(--amber)]";

  return (
    <div className={`border-l-2 ${bgClass} rounded-r p-2 sm:p-2.5`}>
      <div className={`text-[10px] sm:text-[11px] font-bold ${titleColor} kr mb-0.5`}>
        {signal.title}
      </div>
      <div className="text-[9px] sm:text-[10px] bright kr leading-relaxed">
        {signal.message}
      </div>
      <div className="text-[7px] sm:text-[8px] dim mt-1 kr">
        ↳ {signal.source}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 카테고리 섹션
// ─────────────────────────────────────────────────────────
function CategorySection({
  category,
  items,
}: {
  category: string;
  items: MacroItem[];
}) {
  const meta = CATEGORY_META[category] ?? {
    icon: "📈",
    label: category,
    color: "",
  };

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[14px] sm:text-[16px]">{meta.icon}</span>
        <span className={`text-[10px] sm:text-[11px] font-bold kr ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-[8px] sm:text-[9px] dim">({items.length})</span>
      </div>
      <div
        className={`grid gap-2 ${
          items.length === 1
            ? "grid-cols-1 sm:grid-cols-2"
            : items.length === 2
            ? "grid-cols-2"
            : "grid-cols-2 sm:grid-cols-3"
        }`}
      >
        {items.map((item) => (
          <MacroCard key={item.symbol} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────
export function MacroPanel() {
  const { data, isLoading, error } = useSWR("/api/macro", fetcher, {
    refreshInterval: 60000, // 1분 갱신
  });

  const items: MacroItem[] = data?.items ?? [];
  const byCategory = data?.byCategory ?? {};
  const signals: MacroSignal[] = data?.signals ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🌍 MACRO DASHBOARD · 반도체 매크로 환경
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            원유·국채·VIX·달러·한국시장 실시간 · Daniel Yoo 프레임워크 분석
          </div>
        </div>
        <div className="text-[8px] sm:text-[9px] dim">
          {isLoading ? "로딩..." : "자동 갱신 1분"}
        </div>
      </div>

      {error || (!isLoading && !data?.success) ? (
        <div className="text-[10px] dim py-6 text-center kr">
          매크로 데이터 로딩 실패 (잠시 후 재시도)
        </div>
      ) : isLoading && items.length === 0 ? (
        <div className="text-[10px] dim py-6 text-center kr">데이터 로딩 중...</div>
      ) : (
        <>
          {/* Daniel Yoo 자동 시그널 (상단) */}
          {signals.length > 0 && (
            <div className="mb-4 pb-4 border-b border-[var(--border)]">
              <div className="text-[10px] sm:text-[11px] tick mb-2">
                📰 MARKET SIGNALS · Daniel Yoo 스타일 매크로 분석
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {signals.map((sig, i) => (
                  <SignalBox key={i} signal={sig} />
                ))}
              </div>
            </div>
          )}

          {/* 카테고리별 매크로 카드 */}
          <CategorySection category="oil" items={byCategory.oil ?? []} />
          <CategorySection category="index" items={byCategory.index ?? []} />
          <CategorySection category="bond" items={byCategory.bond ?? []} />
          <CategorySection category="vol" items={byCategory.vol ?? []} />
          <CategorySection category="fx" items={byCategory.fx ?? []} />
          <CategorySection category="semi" items={byCategory.semi ?? []} />
          <CategorySection category="korea" items={byCategory.korea ?? []} />

          {/* Daniel Yoo 핵심 프레임워크 (하단 박스) */}
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="text-[10px] sm:text-[11px] tick mb-2">
              🇰🇷 DANIEL YOO&apos;S FRAMEWORK · 핵심 투자 논리
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[8px] sm:text-[9px] dim kr">
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">🚀 AI 슈퍼사이클</div>
                <div className="leading-relaxed">
                  1994~2000 인터넷 사이클과 유사하나 더 강하고 빠름. 7~8년간 생산성 증가 예상
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">📈 나스닥 +30% 예상</div>
                <div className="leading-relaxed">
                  향후 12개월 나스닥 최소 30% 상승. 반도체 이익증가율 +125% 컨센서스
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">💡 나스닥100 최선호</div>
                <div className="leading-relaxed">
                  PEG 0.63, PER 24.8x, 이익증가율 39%. 10년금리 3.5% 하락 시 +40% 여지
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">🇰🇷 한국 매력도 1~3위</div>
                <div className="leading-relaxed">
                  SK하이닉스 1위 · 마이크론 2위 · 삼성전자 4위 (RIM 모델). 코스피 10,000p 가능
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">⚖️ 자산배분 80/20</div>
                <div className="leading-relaxed">
                  주식 80% (미국 75%) · 채권 20%. 또는 15% 채권 + 5% 대체자산
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">🏭 하드웨어 우선</div>
                <div className="leading-relaxed">
                  XLK, SOXX 등 IT/반도체 ETF 비중 극대화. AI 인프라 구축 단계
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">🎯 적극 매수 전략</div>
                <div className="leading-relaxed">
                  고점 예측 매도·공매도 전략 부적절. 급락 시 바닥 확인 후 재매수가 유효
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="font-bold bright mb-1">🌏 신흥국 25%</div>
                <div className="leading-relaxed">
                  한국 13% · 대만 10% · 중국 2%. TSMC AI 밸류체인 적극 투자 추천
                </div>
              </div>
            </div>
            <div className="text-[7px] sm:text-[8px] dim mt-2 kr">
              출처: Daniel Yoo&apos;s Investment Story (2026.4.20) · LinkedIn · Daniel D.W. Yoo
            </div>
          </div>
        </>
      )}
    </div>
  );
}
