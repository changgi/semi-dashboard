"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

// ═══════════════════════════════════════════════════════════
// Quick Status Bar
// 
// 대시보드 최상단에 3초 안에 파악 가능한 핵심 정보 표시:
//   - 💼 포트폴리오 평가액 (+수익률)
//   - 💱 환율 (+환차익)
//   - 🌍 VIX + 국면
//   - 📅 다음 D-Day
//   - 🔬 오늘 감지된 인사이트 수
// ═══════════════════════════════════════════════════════════

export function QuickStatusBar() {
  const { data: brief } = useSWR(
    "/api/morning-brief",
    fetcher,
    { refreshInterval: 60000 }
  );
  
  const { data: research } = useSWR(
    "/api/research-dashboard",
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: unified } = useSWR(
    "/api/unified-insight",
    fetcher,
    { refreshInterval: 300000 }
  );

  if (!brief?.success) return null;
  
  const raw = brief.rawData || {};
  const regime = research?.currentRegime;
  const nextEarning = (unified?.grouped?.thisWeek ?? [])
    .filter((i: any) => i.type === "earnings")
    .sort((a: any, b: any) => (a.daysUntil ?? 99) - (b.daysUntil ?? 99))[0];
  
  const todayInsights = (unified?.grouped?.today ?? []).filter((i: any) => i.type === "insight").length;
  
  return (
    <div className="mb-3 p-2 sm:p-3 border border-[var(--amber)] bg-[rgba(255,176,0,0.04)] rounded">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-center">
        
        {/* 1. 포트폴리오 */}
        <StatItem
          icon="💼"
          label="포트폴리오"
          value={raw.totalValue ? `$${raw.totalValue.toFixed(0)}` : "-"}
          sub={raw.totalGainPct !== undefined ? `${raw.totalGainPct >= 0 ? "+" : ""}${raw.totalGainPct.toFixed(2)}%` : "-"}
          subClass={raw.totalGainPct >= 0 ? "up" : "down"}
        />
        
        {/* 2. 환율 + 환차익 */}
        <StatItem
          icon="💱"
          label="USD/KRW"
          value={raw.krw ? `₩${Math.round(raw.krw).toLocaleString()}` : "-"}
          sub={brief.fxHeadline ? brief.fxHeadline.split("·")[0]?.replace("💱", "").trim() : "-"}
          subClass="tick"
        />
        
        {/* 3. VIX + 국면 */}
        <StatItem
          icon="🌍"
          label="VIX + 국면"
          value={raw.vix ? raw.vix.toFixed(1) : "-"}
          sub={regime?.overall ?? "-"}
          subClass={
            regime?.overall === "risk_on" ? "up" :
            regime?.overall === "risk_off" ? "down" :
            "tick"
          }
        />
        
        {/* 4. 다음 D-Day */}
        <StatItem
          icon={nextEarning?.daysUntil === 0 ? "🚨" : "📅"}
          label="다음 실적"
          value={nextEarning ? `D-${nextEarning.daysUntil}` : "-"}
          sub={nextEarning 
            ? (nextEarning.symbols?.[0] ?? "").replace(".KS", "") 
            : "대기"}
          subClass="tick font-bold"
        />
        
        {/* 5. 오늘 인사이트 */}
        <StatItem
          icon="🔬"
          label="오늘 인사이트"
          value={`${todayInsights}건`}
          sub={todayInsights > 0 ? "신규 발견" : "축적 중"}
          subClass={todayInsights > 0 ? "up" : "dim"}
        />
      </div>
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  sub,
  subClass,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  subClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div className="flex items-center gap-1 text-[8px] sm:text-[9px] dim kr uppercase tracking-wider">
        <span>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[13px] sm:text-[16px] tick font-bold truncate max-w-full">
        {value}
      </div>
      <div className={`text-[8px] sm:text-[9px] kr ${subClass} truncate max-w-full`}>
        {sub}
      </div>
    </div>
  );
}
