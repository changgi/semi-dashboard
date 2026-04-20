"use client";

// ═══════════════════════════════════════════════════════════
// SymbolDisplay - 통일된 종목 표시 컴포넌트
// 
// 모든 화면에서 동일한 양식으로 종목을 표시:
//   🇺🇸 NVDA · 엔비디아 · [S&P500/NASDAQ100/🎮반도체]
// 
// Props:
//   symbol (필수)
//   displayName (없으면 symbol만)
//   country, isSemi, isEtf, indexes, sector 등
//   size: "xs" | "sm" | "md" | "lg"
//   variant: "inline" | "block" | "badge"
// ═══════════════════════════════════════════════════════════

export interface SymbolMeta {
  symbol: string;
  displayName?: string;
  name_ko?: string;
  name_en?: string;
  country?: string;
  exchange?: string;
  isSemi?: boolean;
  semiCategory?: string;
  isEtf?: boolean;
  indexes?: string[];
  sector?: string;
}

interface Props {
  meta: SymbolMeta | { symbol: string };
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "inline" | "block" | "badge";
  showFlag?: boolean;
  showBadges?: boolean;
  showName?: boolean;
  className?: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸", KR: "🇰🇷", TW: "🇹🇼", JP: "🇯🇵", NL: "🇳🇱",
  UK: "🇬🇧", CA: "🇨🇦", CN: "🇨🇳", DE: "🇩🇪", FR: "🇫🇷",
};

const SIZE_CLASSES = {
  xs: { symbol: "text-[9px]", name: "text-[8px]", badge: "text-[7px]" },
  sm: { symbol: "text-[10px]", name: "text-[9px]", badge: "text-[8px]" },
  md: { symbol: "text-[12px]", name: "text-[11px]", badge: "text-[9px]" },
  lg: { symbol: "text-[14px]", name: "text-[12px]", badge: "text-[10px]" },
};

export function SymbolDisplay({
  meta,
  size = "sm",
  variant = "inline",
  showFlag = true,
  showBadges = true,
  showName = true,
  className = "",
}: Props) {
  const m = meta as SymbolMeta;
  const sizes = SIZE_CLASSES[size];
  const flag = m.country ? COUNTRY_FLAGS[m.country] : "";
  const displayName = m.displayName || m.name_ko || m.name_en;
  
  // 인덱스 뱃지
  const badges: Array<{ label: string; color: string; emoji?: string }> = [];
  if (m.indexes?.includes("S&P500")) badges.push({ label: "S&P500", color: "#00ff88" });
  if (m.indexes?.includes("NASDAQ100")) badges.push({ label: "NDX100", color: "#aaccff" });
  if (m.indexes?.includes("KOSPI100")) badges.push({ label: "KOSPI", color: "#ffaa44" });
  if (m.isSemi) badges.push({ label: "반도체", color: "#ee99ff", emoji: "🎮" });
  if (m.isEtf) badges.push({ label: "ETF", color: "#aaccff", emoji: "📊" });

  if (variant === "badge") {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--border-bright)] rounded ${sizes.symbol} ${className}`}>
        {showFlag && flag && <span>{flag}</span>}
        <span className="tick font-bold">{m.symbol}</span>
        {showName && displayName && displayName !== m.symbol && (
          <span className="dim kr">{displayName}</span>
        )}
      </span>
    );
  }

  if (variant === "block") {
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        {showFlag && flag && <span className={sizes.symbol}>{flag}</span>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`tick font-bold ${sizes.symbol}`}>{m.symbol}</span>
            {showName && displayName && displayName !== m.symbol && (
              <span className={`kr ${sizes.name}`}>{displayName}</span>
            )}
          </div>
          {showBadges && badges.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {badges.map((b, i) => (
                <span
                  key={i}
                  className={`px-1 py-0.5 rounded font-bold kr ${sizes.badge}`}
                  style={{ background: `${b.color}20`, color: b.color, border: `1px solid ${b.color}40` }}
                >
                  {b.emoji ?? ""}{b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // default: inline
  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${className}`}>
      {showFlag && flag && <span className={sizes.symbol}>{flag}</span>}
      <span className={`tick font-bold ${sizes.symbol}`}>{m.symbol}</span>
      {showName && displayName && displayName !== m.symbol && (
        <span className={`kr dim ${sizes.name}`}>{displayName}</span>
      )}
      {showBadges && badges.slice(0, 2).map((b, i) => (
        <span
          key={i}
          className={`px-1 py-0.5 rounded font-bold ${sizes.badge}`}
          style={{ background: `${b.color}20`, color: b.color }}
        >
          {b.emoji ?? ""}{b.label}
        </span>
      ))}
    </span>
  );
}

/**
 * 간단한 심볼만 표시 (flag + symbol + name)
 * 목록/표에서 공간 절약용
 */
export function SymbolCompact({ meta, size = "sm" }: { meta: SymbolMeta | { symbol: string }; size?: "xs" | "sm" | "md" }) {
  return (
    <SymbolDisplay
      meta={meta}
      size={size}
      variant="inline"
      showFlag={true}
      showBadges={false}
      showName={true}
    />
  );
}

/**
 * 심볼만 (뱃지 스타일)
 */
export function SymbolBadge({ meta, size = "xs" }: { meta: SymbolMeta | { symbol: string }; size?: "xs" | "sm" }) {
  return (
    <SymbolDisplay
      meta={meta}
      size={size}
      variant="badge"
      showFlag={true}
      showBadges={false}
      showName={false}
    />
  );
}

/**
 * 상세 표시 (flag + symbol + name + 모든 뱃지)
 */
export function SymbolDetail({ meta, size = "md" }: { meta: SymbolMeta | { symbol: string }; size?: "sm" | "md" | "lg" }) {
  return (
    <SymbolDisplay
      meta={meta}
      size={size}
      variant="block"
      showFlag={true}
      showBadges={true}
      showName={true}
    />
  );
}
