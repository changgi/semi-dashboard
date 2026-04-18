"use client";

const MATRIX = [
  {
    key: "EQUITY",
    title: "주식",
    label: "개별 종목",
    desc: "Direct ownership · 변동성 높음",
    items: [
      { tick: "NVDA", val: "GPU 왕좌", cls: "up" },
      { tick: "TSM", val: "파운드리 독점", color: "var(--amber)" },
      { tick: "AVGO", val: "커스텀 AI", cls: "up" },
      { tick: "AMD", val: "데이터센터 +73%", cls: "up" },
      { tick: "MU", val: "메모리 수혜", color: "var(--green)" },
      { tick: "ASML", val: "EUV 독점", color: "var(--cyan)" },
    ],
  },
  {
    key: "ETF",
    title: "펀드",
    label: "분산 투자",
    desc: "Diversified · 위험 분산",
    items: [
      { tick: "SMH", val: "10Y: 31.3%/yr", cls: "up" },
      { tick: "SOXX", val: "10Y: 28.1%/yr", cls: "up" },
      { tick: "SMHX", val: "팹리스", color: "var(--cyan)" },
      { tick: "DRAM", val: "메모리 집중", color: "var(--amber)" },
      { tick: "SOXL", val: "3x 레버리지 (위험)", cls: "down" },
      { tick: "SOXS", val: "3x 인버스 (위험)", cls: "down" },
    ],
  },
  {
    key: "BONDS",
    title: "채권",
    label: "채권",
    desc: "Fixed income · 현금흐름",
    items: [
      { tick: "NVDA", val: "AA- 등급", color: "var(--green)" },
      { tick: "AVGO", val: "A- 등급", color: "var(--green)" },
      { tick: "TSM", val: "AA- 등급", color: "var(--green)" },
      { tick: "MU", val: "BBB+ (사이클)", color: "var(--amber)" },
      { tick: "INTC", val: "BBB (약세)", cls: "down" },
      { tick: "LQD ETF", val: "투자등급 바스켓", cls: "up" },
    ],
  },
  {
    key: "FUTURES",
    title: "선물",
    label: "선물",
    desc: "Leveraged · 고위험",
    items: [
      { tick: "NQ", val: "나스닥 100", color: "var(--amber)" },
      { tick: "MNQ", val: "마이크로 NQ", cls: "up" },
      { tick: "NVDA OPT", val: "주식 옵션", color: "var(--cyan)" },
      { tick: "---", val: "개별칩 선물 없음", cls: "dim" },
      { tick: "MEM", val: "메모리 현물지표 참조", cls: "dim" },
      { tick: "VIX", val: "헤징용", cls: "down" },
    ],
  },
];

export function InvestmentMatrix() {
  return (
    <div className="panel p-5">
      <div className="section-title mb-4">
        03 · INVESTMENT MATRIX · EQUITY · ETF · BOND · FUTURES
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MATRIX.map((m) => (
          <div
            key={m.key}
            className="matrix-bg border border-[var(--border-bright)] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] tick tracking-widest">{m.key}</div>
              <div className="text-[9px] dim kr">{m.label}</div>
            </div>
            <div className="headline text-[28px] bright mb-2 kr">{m.title}</div>
            <div className="text-[10px] dim mb-4 kr">{m.desc}</div>
            <div className="space-y-2 text-[11px]">
              {m.items.map((item, i) => (
                <div key={i} className={`flex justify-between ${item.cls === "dim" ? "dim" : ""}`}>
                  <span className="tick">{item.tick}</span>
                  <span
                    className={item.cls && item.cls !== "dim" ? item.cls : ""}
                    style={item.color ? { color: item.color } : undefined}
                  >
                    {item.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
