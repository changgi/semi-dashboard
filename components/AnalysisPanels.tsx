"use client";

// =========================================
// 08 · Risk Matrix
// =========================================
const RISKS = [
  { level: "CRITICAL", icon: "◣", color: "var(--red)", title: "대만 지정학", desc: "TSMC 생산의 70%가 대만 집중", bar: "██████████" },
  { level: "CRITICAL", icon: "◣", color: "var(--red)", title: "호르무즈 해협", desc: "헬륨·원자재 공급망 차단 위험", bar: "█████████░" },
  { level: "HIGH", icon: "◢", color: "var(--amber)", title: "밸류에이션", desc: "AVGO P/E 41배 고평가", bar: "███████░░░" },
  { level: "HIGH", icon: "◢", color: "var(--amber)", title: "수출 규제", desc: "중국향 AI 칩 통제 강화", bar: "███████░░░" },
  { level: "MODERATE", icon: "◇", color: "var(--cyan)", title: "비AI 부문 약세", desc: "PC·스마트폰 수요 2028까지 지연", bar: "█████░░░░░" },
];

export function RiskMatrix() {
  return (
    <div className="panel p-5">
      <div className="section-title mb-4">08 · RISK MATRIX · 2026 MACRO &amp; MICRO</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {RISKS.map((r) => (
          <div
            key={r.title}
            className="border border-[var(--border-bright)] p-4 relative"
            style={{ borderLeft: `3px solid ${r.color}` }}
          >
            <div className="text-[9px] tracking-widest" style={{ color: r.color }}>
              {r.icon} {r.level}
            </div>
            <div className="text-[14px] bright font-bold mt-2 kr">{r.title}</div>
            <div className="text-[10px] dim mt-1 kr">{r.desc}</div>
            <div className="mt-3">
              <span className="text-[9px]" style={{ color: r.color }}>
                IMPACT: {r.bar}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================
// 09 · Portfolio 3 Profiles
// =========================================
const PROFILES = [
  {
    id: "01",
    name: "보수형",
    risk: "LOW",
    riskColor: "var(--green)",
    desc: "안정적 ETF 중심 · 개별주 분산",
    bars: [
      { label: "SMH 60", w: 60, bg: "var(--green)" },
      { label: "TSM 20", w: 20, bg: "var(--amber)" },
      { label: "NVDA 20", w: 20, bg: "var(--cyan)" },
    ],
    items: [
      { color: "var(--green)", name: "SMH ETF", pct: "60%" },
      { color: "var(--amber)", name: "TSM", pct: "20%" },
      { color: "var(--cyan)", name: "NVDA", pct: "20%" },
    ],
    ret: "15~25%/yr",
    mdd: "-20%",
  },
  {
    id: "02",
    name: "성장형",
    risk: "MEDIUM",
    riskColor: "var(--amber)",
    desc: "개별주 중심 · AI 수혜 집중",
    bars: [
      { label: "NVDA 30", w: 30, bg: "var(--cyan)" },
      { label: "TSM 25", w: 25, bg: "var(--amber)" },
      { label: "AVGO", w: 15, bg: "var(--magenta)" },
      { label: "AMD", w: 15, bg: "var(--green)" },
      { label: "MU", w: 15, bg: "#ff6600" },
    ],
    items: [
      { color: "var(--cyan)", name: "NVDA", pct: "30%" },
      { color: "var(--amber)", name: "TSM", pct: "25%" },
      { color: "var(--magenta)", name: "AVGO", pct: "15%" },
      { color: "var(--green)", name: "AMD", pct: "15%" },
      { color: "#ff6600", name: "MU", pct: "15%" },
    ],
    ret: "30~50%/yr",
    mdd: "-35%",
  },
  {
    id: "03",
    name: "메모리집중",
    risk: "HIGH",
    riskColor: "var(--red)",
    desc: "Memflation 슈퍼사이클 베팅",
    bars: [
      { label: "MU 40", w: 40, bg: "#ff6600" },
      { label: "SOXX 40", w: 40, bg: "var(--green)" },
      { label: "DRAM", w: 20, bg: "var(--magenta)" },
    ],
    items: [
      { color: "#ff6600", name: "MU", pct: "40%" },
      { color: "var(--green)", name: "SOXX", pct: "40%" },
      { color: "var(--magenta)", name: "DRAM ETF", pct: "20%" },
    ],
    ret: "40~80%/yr",
    mdd: "-50%",
  },
];

export function PortfolioProfiles() {
  return (
    <div className="panel p-5">
      <div className="section-title mb-4">09 · PORTFOLIO ALLOCATION · 3 PROFILES</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PROFILES.map((p) => (
          <div key={p.id}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px] tick tracking-widest">PROFILE {p.id}</div>
                <div className="headline text-[26px] bright kr">{p.name}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] dim">RISK</div>
                <div style={{ color: p.riskColor }} className="text-[14px] font-bold">
                  {p.risk}
                </div>
              </div>
            </div>
            <div className="text-[10px] dim mb-3 kr">{p.desc}</div>
            <div className="flex h-6 overflow-hidden border border-[var(--border-bright)]">
              {p.bars.map((b, i) => (
                <div
                  key={i}
                  style={{ width: `${b.w}%`, background: b.bg }}
                  className="text-center text-[9px] text-black font-bold flex items-center justify-center"
                >
                  {b.label}
                </div>
              ))}
            </div>
            <div className="mt-3 text-[10px] space-y-1">
              {p.items.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    <span style={{ color: item.color }}>■</span> {item.name}
                  </span>
                  <span className="bright">{item.pct}</span>
                </div>
              ))}
            </div>
            <div className="divider-dashed my-3" />
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="dim">예상 수익</span>
                <div className="up font-bold">{p.ret}</div>
              </div>
              <div>
                <span className="dim">MDD</span>
                <div className="down font-bold">{p.mdd}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================
// 10 · Key Catalysts Timeline
// =========================================
const EVENTS = [
  { date: "Q1 DONE", title: "메모리 Q1 쇼크", sub: "서버 DRAM +70%", done: true, blink: false },
  { date: "APR 16", title: "TSM 어닝", sub: "Q1 2026 결과", done: false, blink: true },
  { date: "MAY 20", title: "NVDA 어닝", sub: "Blackwell 매출", done: false, blink: false },
  { date: "Q2 26", title: "Rubin 출시", sub: "NVIDIA 차세대", done: false, blink: false },
  { date: "H2 26", title: "TSMC N2 양산", sub: "2nm 공정", done: false, blink: false },
  { date: "2027", title: "가격 정상화", sub: "Memflation 완화", done: false, blink: false },
];

export function CatalystTimeline() {
  return (
    <div className="panel p-5">
      <div className="section-title mb-4">10 · KEY CATALYSTS · 2026 TIMELINE</div>
      <div className="relative">
        <div className="absolute left-0 right-0 top-6 h-[2px] bg-[var(--border-bright)]" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 relative">
          {EVENTS.map((e) => (
            <div key={e.date} className="text-center">
              <div
                className={`w-3 h-3 rounded-full mx-auto mb-2 ${e.blink ? "blink" : ""}`}
                style={{
                  background: e.done
                    ? "var(--green)"
                    : e.blink
                    ? "var(--amber)"
                    : "var(--text-dim)",
                  boxShadow: e.done
                    ? "0 0 10px var(--green)"
                    : e.blink
                    ? "0 0 10px var(--amber)"
                    : "none",
                }}
              />
              <div className="tick text-[10px]">{e.date}</div>
              <div className="text-[11px] bright font-bold mt-1 kr">{e.title}</div>
              <div className="text-[9px] dim mt-1">{e.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================
// Final · Executive Summary
// =========================================
export function ExecutiveSummary() {
  return (
    <div className="panel p-5 scan relative overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2">
          <div className="section-title mb-3">FINAL · EXECUTIVE SUMMARY</div>
          <div className="headline text-[36px] sm:text-[44px] bright leading-[0.9]">
            AI 투자는 <span style={{ color: "var(--amber)" }}>칩</span>에서 시작해
            <br />
            <span style={{ color: "var(--amber)" }}>메모리</span>로 이동 중.
          </div>
          <div
            className="text-[12px] kr mt-4 leading-relaxed"
            style={{ color: "var(--text)", maxWidth: 560 }}
          >
            2026년 반도체 섹터는 <span className="tick">역사적 슈퍼사이클</span>. AI
            데이터센터 투자로 HBM 수요가 폭발하며 메모리 가격이 급등(Memflation).{" "}
            <span className="tick">NVDA·TSM</span>은 여전히 강력, 그러나{" "}
            <span className="tick">MU·메모리 3사</span>가 1년 수익률 1위를 차지.{" "}
            <span className="tick">지정학·밸류에이션 리스크</span>를 관리하며 분산 투자
            권장.
          </div>
        </div>
        <div className="border border-[var(--border-bright)] p-5">
          <div className="text-[9px] dim tracking-widest mb-3">⚠ DISCLAIMER</div>
          <div className="text-[10px] kr leading-relaxed" style={{ color: "var(--text)" }}>
            본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다. Claude는 금융
            자문가가 아니며, 실제 투자는 본인의 재무 상황·기간·리스크 허용도를 고려해
            결정하시기 바랍니다.
          </div>
          <div className="divider-dashed my-3" />
          <div className="text-[9px] dim">
            <div>SOURCE · Yahoo Finance · Gartner · BlackRock</div>
            <div>· TrendForce · Goldman Sachs · Deloitte</div>
            <div className="mt-2 tick">TERMINAL BUILD · 2026.04.16 · THU</div>
          </div>
        </div>
      </div>
    </div>
  );
}
