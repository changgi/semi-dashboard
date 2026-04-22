// ================================================
// 숫자 포맷팅 유틸 (통일된 포맷)
// ================================================

export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(n: number | null | undefined, withSign = true): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtChange(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

export function fmtMarketCap(b: number | null | undefined): string {
  if (b === null || b === undefined || isNaN(b)) return "—";
  if (b >= 1000) return `$${(b / 1000).toFixed(2)}T`;
  return `$${b.toFixed(0)}B`;
}

export function fmtVolume(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

// USD 금액 (큰 숫자는 압축, 작은 숫자는 소수점)
// fmtUsd(10441.23) → "$10,441"
// fmtUsd(10441.23, { decimals: 2 }) → "$10,441.23"
// fmtUsd(1500000, { compact: true }) → "$1.5M"
export function fmtUsd(n: number | null | undefined, opts?: {
  decimals?: number;
  compact?: boolean;
  showSign?: boolean;
}): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const decimals = opts?.decimals ?? 0;
  const sign = opts?.showSign && n > 0 ? "+" : "";
  
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `${sign}$${(n / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${sign}$${(n / 1_000).toFixed(1)}K`;
  }
  
  return `${sign}$${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// KRW 금액 (만원 단위 기본)
// fmtKrw(12345678) → "₩1,234만"
// fmtKrw(12345678, { unit: 'won' }) → "₩12,345,678"
export function fmtKrw(n: number | null | undefined, opts?: {
  unit?: 'won' | 'man' | 'eok';
}): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const unit = opts?.unit ?? 'man';
  
  if (unit === 'eok') {
    return `₩${(n / 100_000_000).toFixed(2)}억`;
  }
  if (unit === 'man') {
    const man = Math.round(n / 10_000);
    return `₩${man.toLocaleString("ko-KR")}만`;
  }
  return `₩${n.toLocaleString("ko-KR")}`;
}

// 압축된 숫자 (K/M/B)
// fmtCompact(1234) → "1.2K"
// fmtCompact(1234567) → "1.2M"
export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ================================================
// 시간 포맷
// ================================================

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

// 한국어 상대 시간
// relativeTime(30초 전) → "30초 전"
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "방금";
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}일 전`;
  return `${Math.floor(seconds / 604800)}주 전`;
}

// D-day
export function fmtDday(futureDate: string | Date): string {
  const target = typeof futureDate === "string" ? new Date(futureDate) : futureDate;
  const now = new Date();
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return "D-DAY";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

// ================================================
// 색상
// ================================================

export function getChangeColor(change: number | null | undefined): string {
  if (change === null || change === undefined || change === 0) return "text-text-dim";
  return change > 0 ? "text-green" : "text-red";
}

// 변동률 → CSS 색상값 (인라인 스타일용)
export function getChangeColorHex(change: number | null | undefined): string {
  if (change === null || change === undefined || change === 0) return "#888";
  return change > 0 ? "#00ff88" : "#ff3860";
}
