"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

/**
 * PostEarningsScenarioPanel
 *
 * 실적 발표 전후 시나리오 기반 액션 플랜.
 * - 대상 실적 이벤트 (가장 임박한 것)
 * - Big Beat / Beat / In-line / Miss / Big Miss 5 시나리오
 * - 각 시나리오별 구체 액션 + 감정 관리 + 타이밍
 * - 결정 노트 저장 (localStorage)
 */

type EarningsEvent = {
  symbol: string;
  companyName: string;
  dateKst: string;
  timing: "BMO" | "AMC";
  epsConsensus?: number;
  revenueConsensus?: number;
};

type Props = {
  // 특정 이벤트 고정 (옵션, 기본은 가장 임박한 실적)
  event?: EarningsEvent;
};

const DEFAULT_EVENT: EarningsEvent = {
  symbol: "TSLA",
  companyName: "Tesla",
  dateKst: "2026-04-23 05:00",
  timing: "AMC",
  epsConsensus: 0.55,
  revenueConsensus: 25.3,
};

type Scenario = {
  id: "big_beat" | "beat" | "in_line" | "miss" | "big_miss";
  label: string;
  emoji: string;
  color: string;
  condition: string;
  stockMove: string;
  actions: { category: string; items: string[] }[];
};

function buildScenarios(ev: EarningsEvent): Scenario[] {
  const sym = ev.symbol;
  const eps = ev.epsConsensus ?? 0;
  const rev = ev.revenueConsensus ?? 0;
  // TSLA 특화, 다른 종목은 일반화
  if (sym === "TSLA") {
    return [
      {
        id: "big_beat",
        label: "A · BIG BEAT",
        emoji: "🚀",
        color: "emerald",
        condition: `EPS > $${(eps + 0.1).toFixed(2)} · Auto GM > 18% · FSD/Robotaxi 긍정`,
        stockMove: "TSLA +10% 이상",
        actions: [
          { category: "감정 관리", items: [
            "\"TSLL 팔지 말 걸\" → NO, 결과론. 리스크 관리 원칙 준수가 옳았음",
            "TSLA +10%면 TSLL +20% = 약 $200 기회비용 vs 있을 수 있었던 -30% 손실($300) 방어",
            "확보한 현금 $1,000+는 더 나은 선택의 자원",
          ]},
          { category: "포지션 조치", items: [
            "ORCL 본주 HOLD — 테크 리스크온 수혜",
            "ORCX 매도는 MSFT 실적 확인 후 (AI 인프라 모멘텀 연장 가능)",
            "ORCU 15주는 오늘 09:30 KST 예정대로 매도",
          ]},
          { category: "다음 기회", items: [
            "TIGER S&P500 분할 매수 4/24로 앞당김 고려 (일부 $300 선집입)",
            "탐욕 경계 — 전체 현금의 1/3만 우선 진입",
          ]},
        ],
      },
      {
        id: "beat",
        label: "B · BEAT",
        emoji: "✅",
        color: "blue",
        condition: `EPS $${eps.toFixed(2)}~$${(eps + 0.1).toFixed(2)} · 컨센서스 부합 이상`,
        stockMove: "TSLA +3%~+8%",
        actions: [
          { category: "오늘의 액션", items: [
            "계획대로 진행 — 변경 없음",
            "ORCU 15주 오늘 09:30 KST 매도",
            "ORCX 4/24 MSFT 실적 후 판단",
          ]},
          { category: "감정 관리", items: [
            "\"별일 없었네\" = 가장 건강한 마인드",
            "Journal 기록만 신경쓰기",
          ]},
          { category: "다음 이벤트", items: [
            "오늘 23:00 KST MSFT 애프터 실적 — Azure 성장률 핵심",
            "MSFT 긍정 시 ORCL 수혜 → ORCX 정리 타이밍 재조정",
          ]},
        ],
      },
      {
        id: "in_line",
        label: "C · IN-LINE/MISS",
        emoji: "⚖️",
        color: "amber",
        condition: `EPS $${(eps - 0.1).toFixed(2)}~$${eps.toFixed(2)} · 가이던스 미지근`,
        stockMove: "TSLA -5% ~ +3%",
        actions: [
          { category: "판단", items: [
            "TSLL 매도 결정 옳음 — 2x 레버리지는 횡보에서도 시간 감가",
            "테크 방향성 불명확 → 보수적 대응",
          ]},
          { category: "오늘의 액션", items: [
            "ORCU 15주 매도 (09:30 KST 예정대로)",
            "ORCX 매도 판단은 MSFT 실적까지 보류",
            "AMZU 지켜보기 (4/30 AMZN 실적까지 7일)",
            "TIGER S&P500 매수는 4/28로 유지",
          ]},
          { category: "오늘 저녁", items: [
            "MSFT 실적 Azure YoY ≥ 30%면 긍정",
            "MSFT 미스 + TSLA 미스 조합 시 ORCX 정리 앞당김 검토",
          ]},
        ],
      },
      {
        id: "big_miss",
        label: "D · BIG MISS",
        emoji: "🚨",
        color: "rose",
        condition: `EPS < $${(eps - 0.1).toFixed(2)} · 마진 압축 · 가이던스 하향`,
        stockMove: "TSLA -10% 이상",
        actions: [
          { category: "🎯 TSLL 매도 결정 검증", items: [
            "카일님 결정 옳았다 — $300 추가 손실 회피 성공",
            "TSLL -30% 했다면 78주 × $9 = $702 (현재 확보한 $1,004 대비)",
            "이 기록 Trade Journal에 반드시 기입",
          ]},
          { category: "🚨 방어 액션 (오전)", items: [
            "ORCU 15주 즉시 매도 (09:30 KST 첫 타임) — 그대로 진행",
            "ORCX 매도 앞당김 검토 — 일부 50주 먼저 정리",
            "AMZU 일부 정리 검토 (2x 레버리지 공통 위험)",
            "TIGER S&P500 매수 연기 — 시장 바닥 확인 후",
          ]},
          { category: "❌ 절대 금지", items: [
            "TSLA 하락 = 물타기 유혹 — NO. 레버리지 ETF 물타기는 죽음",
            "\"패닉 셀은 나쁘다\"는 편견 금물 — 이 경우엔 리스크 관리",
            "ORCL 본주(31주)는 건드리지 말 것 — 장기 보유",
          ]},
        ],
      },
    ];
  }

  // 일반 실적 이벤트
  return [
    { id: "big_beat", label: "A · BIG BEAT", emoji: "🚀", color: "emerald",
      condition: `EPS > $${(eps * 1.15).toFixed(2)}`, stockMove: "주가 +10% 이상",
      actions: [
        { category: "기본 액션", items: ["관련 섹터 전반 상승 수혜 확인", "포트폴리오 내 유사 종목 재평가"] },
      ],
    },
    { id: "beat", label: "B · BEAT", emoji: "✅", color: "blue",
      condition: `EPS $${eps.toFixed(2)} 이상`, stockMove: "+3%~+8%",
      actions: [{ category: "기본 액션", items: ["기존 포지션 유지", "가이던스 상향 여부 추가 확인"] }],
    },
    { id: "in_line", label: "C · IN-LINE", emoji: "⚖️", color: "amber",
      condition: `EPS $${(eps * 0.9).toFixed(2)}~$${eps.toFixed(2)}`, stockMove: "-3%~+3%",
      actions: [{ category: "기본 액션", items: ["중립, 방향성 추가 재료 대기"] }],
    },
    { id: "big_miss", label: "D · BIG MISS", emoji: "🚨", color: "rose",
      condition: `EPS < $${(eps * 0.9).toFixed(2)}`, stockMove: "-10% 이상",
      actions: [{ category: "방어 액션", items: ["관련 섹터 레버리지 ETF 리스크 재평가", "현금 비중 확대"] }],
    },
  ];
}

export default function PostEarningsScenarioPanel({ event = DEFAULT_EVENT }: Props) {
  const scenarios = buildScenarios(event);
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 카운트다운
  const [remaining, setRemaining] = useState("--:--:--");
  useEffect(() => {
    const targetKst = new Date(`${event.dateKst}:00+09:00`).getTime();
    const tick = () => {
      const diff = targetKst - Date.now();
      if (diff <= 0) { setRemaining("실적 발표됨"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [event.dateKst]);

  // 복원
  useEffect(() => {
    const key = `scenario_note_${event.symbol}_${event.dateKst.slice(0, 10)}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      setSelected(parsed.selected ?? "");
      setNote(parsed.note ?? "");
      setSavedAt(parsed.savedAt ?? null);
    }
  }, [event.symbol, event.dateKst]);

  const saveNote = () => {
    const key = `scenario_note_${event.symbol}_${event.dateKst.slice(0, 10)}`;
    const record = { selected, note, savedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(record));
    setSavedAt(record.savedAt);
  };

  const colorMap: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/5",
    blue: "border-blue-500/40 bg-blue-500/5",
    amber: "border-amber-500/40 bg-amber-500/5",
    rose: "border-rose-500/40 bg-rose-500/5",
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">🎯 Post-Earnings Scenarios</div>
          <h3 className="text-lg font-bold text-white mt-1">
            {event.companyName} ({event.symbol}) 실적 대응
          </h3>
          <div className="text-[11px] text-slate-500 mt-1">
            {event.dateKst} KST · {event.timing === "AMC" ? "장마감후" : "장전"}
            {event.epsConsensus && ` · 컨센 EPS $${event.epsConsensus}`}
            {event.revenueConsensus && ` · 매출 $${event.revenueConsensus}B`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">발표까지</div>
          <div className="font-mono text-xl font-bold text-amber-400">{remaining}</div>
        </div>
      </div>

      {/* 체크리스트 */}
      <div className="mb-4 bg-slate-800/30 border border-slate-700 rounded-xl p-3">
        <div className="text-xs font-bold text-amber-400 mb-2 uppercase tracking-wider">📋 발표 직후 확인 항목</div>
        <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
          <li>• EPS 실제 vs ${event.epsConsensus}</li>
          <li>• 매출 실제 vs ${event.revenueConsensus}B</li>
          <li>• 애프터마켓 주가 변동률</li>
          <li>• Q2 가이던스</li>
          <li>• 마진 (영업이익률)</li>
          <li>• 특이 코멘트 (CEO 발언)</li>
        </ul>
      </div>

      {/* 시나리오 카드들 */}
      <div className="space-y-3">
        {scenarios.map(sc => {
          const isSelected = selected === sc.id;
          return (
            <div
              key={sc.id}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                isSelected ? colorMap[sc.color] + " scale-[1.01]" : "border-slate-700 bg-slate-800/30 opacity-70 hover:opacity-100"
              }`}
            >
              <button
                onClick={() => setSelected(isSelected ? "" : sc.id)}
                className="w-full p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{sc.emoji}</span>
                  <div className="text-left">
                    <div className="text-sm font-bold text-white">{sc.label}</div>
                    <div className="text-[11px] text-slate-400">{sc.condition}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-bold text-${sc.color}-400`}>{sc.stockMove}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{isSelected ? "▲ 선택됨" : "▼ 펼치기"}</div>
                </div>
              </button>

              {isSelected && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-slate-700/50">
                  {sc.actions.map((cat, i) => (
                    <div key={i} className="mt-2">
                      <div className={`text-[11px] font-bold text-${sc.color}-400 uppercase tracking-wider mb-1`}>
                        {cat.category}
                      </div>
                      <ul className="space-y-1">
                        {cat.items.map((item, j) => (
                          <li key={j} className="flex gap-2 text-[12px] text-slate-300">
                            <span className="text-slate-500">▸</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 결정 노트 */}
      <div className="mt-4 bg-purple-500/5 border border-purple-500/30 rounded-xl p-3">
        <div className="text-xs font-bold text-purple-400 mb-2 uppercase tracking-wider">📝 결정 노트</div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={`예시: TSLA EPS $0.58, 매출 $25.8B, Auto GM 17.2% → 시나리오 B 선택 → ORCU 매도 진행 → 감정: 차분함`}
          rows={4}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
        />
        <button
          onClick={saveNote}
          disabled={!selected || !note.trim()}
          className="w-full mt-2 bg-purple-500 hover:bg-purple-400 disabled:bg-slate-700 disabled:text-slate-500 text-white disabled:cursor-not-allowed px-3 py-2 rounded-lg text-xs font-bold"
        >
          결정 저장
        </button>
        {savedAt && (
          <div className="text-[10px] text-emerald-400 mt-2 text-center">
            ✅ 저장됨 · {new Date(savedAt).toLocaleString("ko-KR")}
          </div>
        )}
      </div>

      {/* 원칙 */}
      <div className="mt-3 p-3 bg-blue-500/5 border-l-4 border-blue-500 rounded-r-lg">
        <div className="text-[11px] text-blue-400 font-bold mb-1">💎 오늘의 원칙</div>
        <div className="text-[12px] text-slate-300 leading-relaxed">
          결과가 아닌 <b className="text-white">결정의 질</b>을 평가하라.
          같은 상황에서 같은 결정을 반복할 수 있는 일관성이 투자자의 성장이다.
        </div>
      </div>
    </div>
  );
}
