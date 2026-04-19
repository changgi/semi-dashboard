"use client";

import useSWR from "swr";
import { SkeletonBar, SkeletonCards } from "./Skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─────────────────────────────────────────────────────────
// 스파크라인 헬퍼
// ─────────────────────────────────────────────────────────
function Sparkline({
  data,
  color,
  width = 80,
  height = 28,
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
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linePath} L ${pad + (data.length - 1) * xStep},${height - pad} L ${pad},${height - pad} Z`} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────
interface KrStock {
  symbol: string;
  name: string;
  nameEn: string;
  subtitle: string;
  marketCap: string;
  role: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketState: string | null;
  sparkline: number[];
}

interface KrIndex {
  price: number;
  change: number;
  changePct: number;
  marketState: string;
}

interface KoreaSemiData {
  success: boolean;
  indices: {
    kospi: KrIndex | null;
    kosdaq: KrIndex | null;
  };
  macro: {
    usdKrw?: number;
    usdKrwChange?: number;
    smhChange?: number;
    ndxChange?: number;
  };
  stocks: {
    majors: KrStock[];
    equipment: KrStock[];
    etfs: KrStock[];
  };
  signals: Array<{ level: "positive" | "negative" | "neutral"; icon: string; title: string; message: string }>;
  sectorStats: {
    avgChange: number;
    positiveCount: number;
    negativeCount: number;
    flatCount: number;
    totalCount: number;
  };
  foreignSentiment: "buying" | "selling" | "neutral";
}

// ─────────────────────────────────────────────────────────
// 대형주 카드 (삼성전자, SK하이닉스 강조용)
// ─────────────────────────────────────────────────────────
function MajorCard({ stock }: { stock: KrStock }) {
  const up = (stock.changePct ?? 0) >= 0;
  const color = up ? "up" : "down";
  const sparkColor = up ? "#00ff88" : "#ff3860";

  return (
    <div className="border-l-2 border-[var(--amber)] bg-[rgba(255,176,0,0.03)] rounded-r p-3 hover:bg-[rgba(255,176,0,0.06)] transition-colors">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] sm:text-[16px] font-bold bright kr">{stock.name}</span>
            <span className="text-[8px] dim">{stock.nameEn} · {stock.symbol}</span>
          </div>
          <div className="text-[9px] dim kr mt-1 leading-tight">{stock.subtitle}</div>
        </div>
        <span className="text-[7px] tick border border-[var(--amber-dim)] px-1.5 py-0.5 rounded whitespace-nowrap">
          {stock.marketCap}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          <div className="text-[20px] sm:text-[24px] font-bold tick">
            {stock.price !== null ? `₩${stock.price.toLocaleString()}` : "—"}
          </div>
          {stock.changePct !== null && (
            <div className={`text-[12px] ${color} font-bold`}>
              {up ? "▲" : "▼"} {Math.abs(stock.changePct).toFixed(2)}%
              <span className="dim ml-1 font-normal text-[10px]">
                ({up ? "+" : ""}{(stock.change ?? 0).toLocaleString()}원)
              </span>
            </div>
          )}
        </div>
        {stock.sparkline.length >= 2 && (
          <Sparkline data={stock.sparkline} color={sparkColor} width={100} height={36} />
        )}
      </div>

      {stock.dayHigh !== null && stock.dayLow !== null && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between text-[8px]">
          <div>
            <span className="dim kr">고가 </span>
            <span className="tick">₩{stock.dayHigh.toLocaleString()}</span>
          </div>
          <div>
            <span className="dim kr">저가 </span>
            <span className="tick">₩{stock.dayLow.toLocaleString()}</span>
          </div>
          <div>
            <span className="dim kr">거래량 </span>
            <span className="tick">{stock.volume ? (stock.volume / 1e6).toFixed(1) + "M" : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 장비주/ETF 카드
// ─────────────────────────────────────────────────────────
function StockCard({ stock }: { stock: KrStock }) {
  const up = (stock.changePct ?? 0) >= 0;
  const color = up ? "up" : "down";
  const sparkColor = up ? "#00ff88" : "#ff3860";
  const isLeveraged = stock.role === "leveraged";
  const isInverse = stock.role === "inverse";

  return (
    <div
      className={`border rounded p-2 hover:border-[var(--amber-dim)] transition-colors ${
        isInverse
          ? "border-[#ff3860]/30"
          : isLeveraged
          ? "border-[#00ff88]/30"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between mb-1 gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-bold bright kr truncate">{stock.name}</span>
            {isLeveraged && (
              <span className="text-[7px] px-1 rounded font-bold bg-[rgba(0,255,136,0.15)] text-[#00ff88]">
                +2x
              </span>
            )}
            {isInverse && (
              <span className="text-[7px] px-1 rounded font-bold bg-[rgba(255,56,96,0.15)] text-[#ff3860]">
                -2x
              </span>
            )}
          </div>
          <div className="text-[7px] dim">
            {stock.symbol}
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold tick">
            {stock.price !== null ? `₩${stock.price.toLocaleString()}` : "—"}
          </div>
          {stock.changePct !== null && (
            <div className={`text-[9px] ${color} font-bold`}>
              {up ? "▲" : "▼"} {Math.abs(stock.changePct).toFixed(2)}%
            </div>
          )}
        </div>
        {stock.sparkline.length >= 2 && (
          <Sparkline data={stock.sparkline} color={sparkColor} />
        )}
      </div>
      <div className="text-[7px] dim mt-1.5 pt-1.5 border-t border-[var(--border)] kr leading-tight line-clamp-2">
        {stock.subtitle}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function KoreaSemiPanel() {
  const { data, isLoading } = useSWR<KoreaSemiData>("/api/korea-semi", fetcher, {
    refreshInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="section-title text-[10px] sm:text-[12px] opacity-60">
              🇰🇷 KOREA SEMI WATCH · 로딩 중...
            </div>
            <SkeletonBar className="w-40 h-3 mt-1" />
          </div>
        </div>
        <SkeletonCards count={4} />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <SkeletonBar className="w-full h-24" />
          <SkeletonBar className="w-full h-24" />
        </div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-[10px] dim text-center kr">
        ⚠️ 한국 반도체 데이터 로딩 실패 · 잠시 후 재시도
      </div>
    );
  }

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🇰🇷 KOREA SEMI WATCH · 한국 반도체 생태계
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            삼성/SK하이닉스 (Daniel Yoo 저평가 1·4위) + HBM 장비주 + 반도체 ETF
          </div>
        </div>
        {/* 코스피/코스닥 인라인 표시 */}
        <div className="flex gap-3 text-[10px]">
          {data.indices.kospi && (
            <div>
              <span className="dim kr">KOSPI </span>
              <span className="tick font-bold">{data.indices.kospi.price.toFixed(2)}</span>
              <span className={`ml-1 ${data.indices.kospi.changePct >= 0 ? "up" : "down"}`}>
                {data.indices.kospi.changePct >= 0 ? "+" : ""}
                {data.indices.kospi.changePct.toFixed(2)}%
              </span>
            </div>
          )}
          {data.indices.kosdaq && (
            <div>
              <span className="dim kr">KOSDAQ </span>
              <span className="tick font-bold">{data.indices.kosdaq.price.toFixed(2)}</span>
              <span className={`ml-1 ${data.indices.kosdaq.changePct >= 0 ? "up" : "down"}`}>
                {data.indices.kosdaq.changePct >= 0 ? "+" : ""}
                {data.indices.kosdaq.changePct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 섹터 요약 바 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="border border-[var(--border)] rounded p-2">
          <div className="text-[8px] dim kr">섹터 평균 등락</div>
          <div className={`text-[16px] font-bold ${data.sectorStats.avgChange >= 0 ? "up" : "down"}`}>
            {data.sectorStats.avgChange >= 0 ? "+" : ""}
            {data.sectorStats.avgChange.toFixed(2)}%
          </div>
        </div>
        <div className="border border-[var(--border)] rounded p-2">
          <div className="text-[8px] dim kr">종목 분포</div>
          <div className="text-[14px] font-bold">
            <span className="up">{data.sectorStats.positiveCount}</span>
            <span className="dim mx-1">/</span>
            <span className="down">{data.sectorStats.negativeCount}</span>
            <span className="dim text-[9px] ml-1 kr">
              (총 {data.sectorStats.totalCount})
            </span>
          </div>
        </div>
        <div className="border border-[var(--border)] rounded p-2">
          <div className="text-[8px] dim kr">USD/KRW</div>
          <div className={`text-[16px] font-bold ${
            (data.macro.usdKrw ?? 0) > 1450 ? "up" : "tick"
          }`}>
            ₩{data.macro.usdKrw?.toFixed(0) ?? "—"}
          </div>
          <div className="text-[7px] dim kr">
            {(data.macro.usdKrw ?? 0) > 1400 ? "수출 강력 수혜" : "중립"}
          </div>
        </div>
        <div className="border border-[var(--border)] rounded p-2">
          <div className="text-[8px] dim kr">외국인 추정</div>
          <div className={`text-[14px] font-bold ${
            data.foreignSentiment === "buying" ? "up" : data.foreignSentiment === "selling" ? "down" : "tick"
          }`}>
            {data.foreignSentiment === "buying" ? "🟢 매수 우위" :
             data.foreignSentiment === "selling" ? "🔴 매도 우위" : "⚖️ 중립"}
          </div>
          <div className="text-[7px] dim kr">대형주/지수 차이 기반</div>
        </div>
      </div>

      {/* 시그널 */}
      {data.signals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
          {data.signals.map((sig, i) => (
            <div
              key={i}
              className={`border-l-2 rounded-r p-2 ${
                sig.level === "positive"
                  ? "border-[#00ff88] bg-[rgba(0,255,136,0.05)]"
                  : sig.level === "negative"
                  ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
                  : "border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)]"
              }`}
            >
              <div className="flex items-start gap-1.5">
                <span className="text-[12px]">{sig.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-bold kr ${
                    sig.level === "positive" ? "text-[#00ff88]" :
                    sig.level === "negative" ? "text-[#ff3860]" :
                    "text-[var(--amber)]"
                  }`}>
                    {sig.title}
                  </div>
                  <div className="text-[9px] dim kr leading-relaxed mt-0.5">
                    {sig.message}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 대형주 (삼성/SK하이닉스) */}
      <div className="mb-4">
        <div className="text-[10px] tick mb-2 kr">💎 메모리 대형주 · Daniel Yoo 저평가 글로벌 1·4위</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.stocks.majors.map((s) => (
            <MajorCard key={s.symbol} stock={s} />
          ))}
        </div>
      </div>

      {/* 반도체 장비/소재 */}
      <div className="mb-4">
        <div className="text-[10px] tick mb-2 kr">
          ⚙️ 반도체 장비·소재 · HBM 수혜 {data.stocks.equipment.length}종
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {data.stocks.equipment.map((s) => (
            <StockCard key={s.symbol} stock={s} />
          ))}
        </div>
      </div>

      {/* ETF */}
      <div>
        <div className="text-[10px] tick mb-2 kr">
          📊 반도체·지수 ETF · 분산투자 상품
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.stocks.etfs.map((s) => (
            <StockCard key={s.symbol} stock={s} />
          ))}
        </div>
      </div>

      {/* 투자 가이드 */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 <span className="bright">투자 가이드</span>: 
        Daniel Yoo 프레임워크 기준 SK하이닉스는 글로벌 저평가 1위, 삼성전자는 4위.
        USD/KRW 1400원 이상에서 두 종목 외화환산이익 극대화.
        한미반도체(042700)는 HBM TC Bonder 독점 공급으로 AI 사이클 직접 수혜.
        공격적 투자 시 KODEX 레버리지 / 방어적 헤지 시 KODEX 인버스2X 활용 가능.
      </div>
    </div>
  );
}
