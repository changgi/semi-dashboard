"use client";

// =========================================
// 05 · Forward P/E Valuation
// =========================================
const PE_DATA = [
  { sym: "AVGO", pe: 41, cls: "red" },
  { sym: "NVDA", pe: 32, cls: "" },
  { sym: "AMD", pe: 28, cls: "" },
  { sym: "ASML", pe: 26, cls: "" },
  { sym: "TSM", pe: 24, cls: "green" },
  { sym: "QCOM", pe: 20, cls: "green" },
  { sym: "MU", pe: 18, cls: "green" },
  { sym: "INTC", pe: 15, cls: "green" },
];

export function ValuationPanel() {
  return (
    <div className="panel p-3 sm:p-5">
      <div className="section-title mb-4">05 · FORWARD P/E VALUATION</div>
      <div className="text-[10px] dim mb-4">LOWER = UNDERVALUED · 24.0x = SECTOR AVG</div>
      <div className="space-y-3">
        {PE_DATA.map((d) => {
          const w = (d.pe / 41) * 100;
          let color = "var(--amber)";
          if (d.cls === "green") color = "var(--green)";
          if (d.cls === "red") color = "var(--red)";
          return (
            <div key={d.sym} className="data-row flex items-center gap-3 py-1">
              <span className="tick w-16">{d.sym}</span>
              <div className="bar-track flex-1">
                <div
                  className={`bar-fill ${d.cls || ""}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span
                className="w-20 text-right text-[13px] font-bold"
                style={{ color }}
              >
                {d.pe}.0x
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-3 text-[10px]">
        <div>
          <div className="dim">BEST VALUE</div>
          <div className="up font-bold text-[14px]">TSM · MU</div>
        </div>
        <div>
          <div className="dim">FAIR</div>
          <div style={{ color: "var(--amber)" }} className="font-bold text-[14px]">
            NVDA · AMD
          </div>
        </div>
        <div>
          <div className="dim">PREMIUM</div>
          <div className="down font-bold text-[14px]">AVGO</div>
        </div>
      </div>
    </div>
  );
}

// =========================================
// 06 · Memflation Memory Price Forecast
// =========================================
const MEM_DATA = [
  { label: "NAND연간", pct: 234, h: 100 },
  { label: "DRAM연간", pct: 125, h: 53 },
  { label: "서버 Q1", pct: 70, h: 30 },
  { label: "일반 Q1", pct: 60, h: 26 },
  { label: "HBM3E", pct: 20, h: 9 },
];

export function MemflationPanel() {
  return (
    <div className="panel p-3 sm:p-5">
      <div className="section-title mb-4">06 · MEMFLATION · MEMORY PRICE FORECAST</div>
      <div className="grid grid-cols-5 gap-2 items-end mb-4" style={{ height: 220 }}>
        {MEM_DATA.map((d) => (
          <div key={d.label} className="flex flex-col items-center justify-end h-full">
            <div className="text-[10px] bright font-bold mb-1">+{d.pct}%</div>
            <div
              className="w-full relative"
              style={{
                height: `${d.h}%`,
                background: "linear-gradient(to top, var(--amber-dim), var(--amber))",
              }}
            >
              {d.h === 100 && (
                <div className="absolute inset-x-0 top-1 text-center text-[9px] text-black font-bold">
                  NAND
                </div>
              )}
            </div>
            <div className="text-[8px] sm:text-[9px] dim mt-2 kr text-center truncate w-full">{d.label}</div>
          </div>
        ))}
      </div>
      <div className="divider-dashed mb-3" />
      <div className="text-[10px] kr leading-relaxed" style={{ color: "var(--text)" }}>
        AI 가속기용 HBM3E·HBM4 수요가 DRAM 생산 캐파의{" "}
        <span className="tick">18~28%</span>를 흡수. 일반 DRAM 공급 부족이{" "}
        <span className="tick">4.9%</span>에 달해 Goldman Sachs는 &ldquo;15년 내 최대 수준&rdquo;으로 평가.
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px]">
        <span className="pulse-dot" />
        <span className="dim">LIVE:</span>
        <span className="bright">SK Hynix 2026 capacity SOLD OUT</span>
      </div>
    </div>
  );
}

// =========================================
// 07 · Revenue Growth 2026E (HTML 기반 반응형)
// =========================================
const GROWTH_DATA = [
  { label: "AMD DC", sub: "데이터센터", pct: 73 },
  { label: "NVDA", sub: "엔비디아", pct: 65 },
  { label: "DRAM", sub: "메모리", pct: 51 },
  { label: "NAND", sub: "플래시", pct: 45 },
  { label: "TSM", sub: "파운드리", pct: 30 },
  { label: "AVGO AI", sub: "커스텀칩", pct: 15 },
];

export function RevenueGrowthPanel() {
  const maxPct = Math.max(...GROWTH_DATA.map((d) => d.pct));

  return (
    <div className="panel p-3 sm:p-5">
      <div className="section-title mb-4">07 · REVENUE GROWTH · 2026E</div>

      {/* 차트 영역 */}
      <div
        className="grid gap-1.5 sm:gap-3 items-end"
        style={{
          gridTemplateColumns: `repeat(${GROWTH_DATA.length}, minmax(0, 1fr))`,
          height: 200,
        }}
      >
        {GROWTH_DATA.map((d) => {
          const heightPct = (d.pct / maxPct) * 85;
          return (
            <div key={d.label} className="flex flex-col items-center justify-end h-full">
              <div
                className="text-[12px] sm:text-[14px] font-bold mb-1.5 text-center whitespace-nowrap"
                style={{ color: "var(--amber)" }}
              >
                +{d.pct}%
              </div>
              <div
                className="w-full"
                style={{
                  height: `${heightPct}%`,
                  background: "linear-gradient(to top, var(--amber-dim), var(--amber))",
                  minHeight: 4,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 라벨 영역 - 완전히 분리된 밝은 박스 */}
      <div
        className="grid gap-1.5 sm:gap-3 mt-3 pt-3 border-t border-[var(--border-bright)]"
        style={{
          gridTemplateColumns: `repeat(${GROWTH_DATA.length}, minmax(0, 1fr))`,
        }}
      >
        {GROWTH_DATA.map((d) => (
          <div key={d.label} className="text-center">
            <div
              className="text-[11px] sm:text-[13px] font-bold tracking-wider"
              style={{ color: "#ffffff" }}
            >
              {d.label}
            </div>
            <div className="text-[8px] sm:text-[10px] dim kr mt-0.5 truncate">
              {d.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-[10px] kr" style={{ color: "var(--text)" }}>
        AMD 데이터센터(+73%), NVIDIA(+65%)가 가장 공격적 성장. 글로벌 DRAM(+51%)·NAND(+45%)는 가격 인상 효과.
      </div>
    </div>
  );
}
