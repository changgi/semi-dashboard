"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

// ═══════════════════════════════════════════════════════════
// Browser Push Notifications
// 
// 중요 시그널 실시간 푸시:
//   - Strong Buy/Sell 신규 발생
//   - VIX 25 돌파 (공포)
//   - D-Day 이벤트 (FOMC, 실적)
//   - 포트 -10% 급락 등
// 
// 서버 키 없이 브라우저 Notification API로 구현
// ═══════════════════════════════════════════════════════════

interface PushConfig {
  enabled: boolean;
  lastNotified: Record<string, number>; // 중복 방지
  categories: {
    strongSignals: boolean;
    vixExtreme: boolean;
    earningsAlert: boolean;
    portfolioAlert: boolean;
    autoInsights: boolean;  // 🆕 자동 감지 패턴/인사이트
  };
}

const DEFAULT_CONFIG: PushConfig = {
  enabled: false,
  lastNotified: {},
  categories: {
    strongSignals: true,
    vixExtreme: true,
    earningsAlert: true,
    portfolioAlert: true,
    autoInsights: true,
  },
};

const CONFIG_KEY = "semi_push_config";
const NOTIFY_COOLDOWN = 30 * 60 * 1000; // 같은 알림 30분 쿨다운

// ───────────────────────────────────────────────────────────
// 설정 유틸
// ───────────────────────────────────────────────────────────
function loadConfig(): PushConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: PushConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

// ───────────────────────────────────────────────────────────
// 알림 발송
// ───────────────────────────────────────────────────────────
function notify(title: string, body: string, tag: string, icon?: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  
  try {
    new Notification(title, {
      body,
      tag, // 같은 tag는 기존 알림 대체
      icon: icon ?? "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>◢</text></svg>",
      badge: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>",
      requireInteraction: false,
      silent: false,
    });
  } catch (e) {
    console.warn("[notify]", e);
  }
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function PushNotifications() {
  const [config, setConfig] = useState<PushConfig>(DEFAULT_CONFIG);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [visible, setVisible] = useState(false);

  // 초기화
  useEffect(() => {
    const c = loadConfig();
    setConfig(c);
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    } else {
      setPermission("unsupported");
    }
  }, []);

  // 알림 권한 요청
  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === "granted") {
      const newConfig = { ...config, enabled: true };
      setConfig(newConfig);
      saveConfig(newConfig);
      // 테스트 알림
      notify("🎉 알림 활성화 완료!", "중요 투자 시그널을 실시간으로 받을 수 있어요.", "welcome");
    }
  };

  const toggleEnabled = () => {
    const newConfig = { ...config, enabled: !config.enabled };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const toggleCategory = (cat: keyof PushConfig["categories"]) => {
    const newConfig = {
      ...config,
      categories: { ...config.categories, [cat]: !config.categories[cat] },
    };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  // 주기적 체크 (1분마다)
  const { data: sector } = useSWR(
    config.enabled && permission === "granted" ? "/api/sector-scanner" : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: briefing } = useSWR(
    config.enabled && permission === "granted" ? "/api/daily-briefing" : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: calendar } = useSWR(
    config.enabled && permission === "granted" ? "/api/economic-calendar" : null,
    fetcher,
    { refreshInterval: 300000 }
  );

  // 🔬 축적된 자동 인사이트
  const { data: research } = useSWR(
    config.enabled && permission === "granted" ? "/api/research-dashboard" : null,
    fetcher,
    { refreshInterval: 600000 }
  );

  // 시그널 체크 로직
  useEffect(() => {
    if (!config.enabled || permission !== "granted") return;
    if (!sector?.success && !briefing?.success && !calendar?.success) return;

    const now = Date.now();
    const lastNotified = { ...config.lastNotified };
    let updated = false;

    // 1. Strong Buy/Sell 시그널
    if (config.categories.strongSignals && sector?.success) {
      const strongs = [
        ...(sector.results?.strongBuys ?? []).map((r: any) => ({ ...r, dir: "buy" })),
        ...(sector.results?.strongSells ?? []).map((r: any) => ({ ...r, dir: "sell" })),
      ];
      for (const s of strongs.slice(0, 2)) {
        const key = `strong_${s.dir}_${s.symbol}`;
        if (!lastNotified[key] || now - lastNotified[key] > NOTIFY_COOLDOWN) {
          const emoji = s.dir === "buy" ? "📈" : "📉";
          const action = s.dir === "buy" ? "STRONG BUY" : "STRONG SELL";
          notify(
            `${emoji} ${s.symbol} ${action}`,
            `점수 ${s.score > 0 ? "+" : ""}${s.score} · ${(s.rationale || "").slice(0, 80)}`,
            key
          );
          lastNotified[key] = now;
          updated = true;
        }
      }
    }

    // 2. VIX 극단
    if (config.categories.vixExtreme && briefing?.success) {
      const vix = briefing.macro?.vix;
      if (vix !== null && vix !== undefined) {
        if (vix > 25) {
          const key = "vix_fear";
          if (!lastNotified[key] || now - lastNotified[key] > NOTIFY_COOLDOWN * 2) {
            notify(
              "😱 VIX 공포 구간!",
              `VIX ${vix.toFixed(1)} - 역발상 매수 기회 탐색`,
              key
            );
            lastNotified[key] = now;
            updated = true;
          }
        } else if (vix < 13) {
          const key = "vix_complacent";
          if (!lastNotified[key] || now - lastNotified[key] > NOTIFY_COOLDOWN * 2) {
            notify(
              "⚠️ VIX 극저 구간",
              `VIX ${vix.toFixed(1)} - 변동성 확대 임박. 보험 매수 기회`,
              key
            );
            lastNotified[key] = now;
            updated = true;
          }
        }
      }
    }

    // 3. 오늘 이벤트
    if (config.categories.earningsAlert && calendar?.success) {
      const todayEvents = (calendar.allEvents ?? []).filter((e: any) => e.daysUntil === 0 && e.importance >= 4);
      for (const e of todayEvents) {
        const key = `today_${e.id}`;
        if (!lastNotified[key] || now - lastNotified[key] > NOTIFY_COOLDOWN * 4) {
          notify(
            `🚨 오늘 주요 이벤트!`,
            `${e.title} (${e.time ?? ""} ${e.timezone}) - ${e.expectedImpact?.slice(0, 60)}`,
            key
          );
          lastNotified[key] = now;
          updated = true;
        }
      }
    }

    // 4. 🔬 자동 인사이트 (축적 데이터 기반 패턴/이상 감지)
    if (config.categories.autoInsights && research?.success) {
      const todayStr = new Date().toISOString().split("T")[0];
      const todayFindings = (research.recentFindings ?? []).filter((f: any) => f.date === todayStr);
      for (const f of todayFindings.slice(0, 2)) {
        const key = `insight_${f.category}_${f.title.slice(0, 30)}`;
        if (!lastNotified[key] || now - lastNotified[key] > NOTIFY_COOLDOWN * 6) {
          notify(
            `🔬 ${f.title}`,
            `${f.insight.slice(0, 100)} (신뢰도 ${Math.round((f.confidence ?? 0.5) * 100)}%)`,
            key
          );
          lastNotified[key] = now;
          updated = true;
        }
      }
    }

    if (updated) {
      const newConfig = { ...config, lastNotified };
      setConfig(newConfig);
      saveConfig(newConfig);
    }
  }, [sector, briefing, calendar, research, config, permission]);

  // 설정 패널이 가려져있으면 floating button만
  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full border-2 bg-[var(--bg-panel)] hover:bg-[rgba(255,176,0,0.1)] shadow-lg backdrop-blur flex items-center justify-center"
        style={{
          borderColor: config.enabled && permission === "granted" ? "#00ff88" : "var(--amber-dim)",
        }}
        title="푸시 알림 설정"
      >
        <span className="text-[20px]">
          {config.enabled && permission === "granted" ? "🔔" : "🔕"}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] panel p-4 shadow-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="text-[11px] tick kr font-bold">🔔 푸시 알림</div>
          <div className="text-[9px] dim kr">중요 시그널 실시간 알림</div>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-[12px] dim hover:bright"
        >
          ✕
        </button>
      </div>

      {/* 권한 상태 */}
      {permission === "unsupported" ? (
        <div className="text-[10px] dim kr text-center py-4">
          ⚠️ 이 브라우저는 알림을 지원하지 않습니다
        </div>
      ) : permission === "denied" ? (
        <div className="text-[10px] down kr text-center py-4">
          ❌ 알림이 차단됨<br />
          <span className="text-[9px] dim">
            브라우저 주소창 🔒 클릭 → 알림 허용
          </span>
        </div>
      ) : permission === "default" ? (
        <div className="text-center py-2">
          <div className="text-[10px] kr mb-3">
            중요 시그널을 실시간으로 받으시겠어요?
          </div>
          <button
            onClick={requestPermission}
            className="text-[11px] px-4 py-2 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
          >
            🔔 알림 허용
          </button>
        </div>
      ) : (
        <>
          {/* 전체 토글 */}
          <div className="flex items-center justify-between mb-3 p-2 border border-[var(--border)] rounded">
            <div>
              <div className="text-[10px] kr font-bold">
                알림 {config.enabled ? "켜짐" : "꺼짐"}
              </div>
              <div className="text-[8px] dim kr">1분마다 자동 체크</div>
            </div>
            <button
              onClick={toggleEnabled}
              className={`text-[10px] px-3 py-1 rounded kr font-bold ${
                config.enabled
                  ? "bg-[#00ff88] text-[#111]"
                  : "bg-[var(--border)] dim"
              }`}
            >
              {config.enabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* 카테고리별 설정 */}
          {config.enabled && (
            <div className="space-y-1">
              <CategoryToggle
                icon="📈"
                label="강력 매수/매도 시그널"
                value={config.categories.strongSignals}
                onChange={() => toggleCategory("strongSignals")}
              />
              <CategoryToggle
                icon="😱"
                label="VIX 극단 구간 (25+/13-)"
                value={config.categories.vixExtreme}
                onChange={() => toggleCategory("vixExtreme")}
              />
              <CategoryToggle
                icon="📅"
                label="오늘 주요 이벤트"
                value={config.categories.earningsAlert}
                onChange={() => toggleCategory("earningsAlert")}
              />
              <CategoryToggle
                icon="💼"
                label="포트폴리오 급변동"
                value={config.categories.portfolioAlert}
                onChange={() => toggleCategory("portfolioAlert")}
              />
              <CategoryToggle
                icon="🔬"
                label="자동 패턴/인사이트 감지"
                value={config.categories.autoInsights}
                onChange={() => toggleCategory("autoInsights")}
              />
            </div>
          )}

          {/* 테스트 버튼 */}
          {config.enabled && (
            <button
              onClick={() => notify("🧪 테스트 알림", "알림이 정상 작동합니다!", "test_" + Date.now())}
              className="mt-3 w-full text-[9px] px-2 py-1.5 border border-[var(--border)] hover:bg-[rgba(255,255,255,0.05)] rounded kr"
            >
              🧪 테스트 알림 발송
            </button>
          )}
        </>
      )}

      {/* 하단 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr">
        💡 같은 알림은 30분간 중복 방지 · 🔒 서버로 전송 없음 (브라우저 로컬)
      </div>
    </div>
  );
}

function CategoryToggle({ icon, label, value, onChange }: { icon: string; label: string; value: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between p-2 hover:bg-[rgba(255,255,255,0.03)] rounded cursor-pointer">
      <div className="flex items-center gap-2">
        <span className="text-[14px]">{icon}</span>
        <span className="text-[10px] kr">{label}</span>
      </div>
      <input
        type="checkbox"
        checked={value}
        onChange={onChange}
        className="accent-[var(--amber)]"
      />
    </label>
  );
}
