"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Correlation {
  pair: string;
  correlation: number;
  strength: string;
  direction: string;
  lookbackDays: number;
  sampleSize: number;
}

interface Data {
  success: boolean;
  topCorrelations: Correlation[];
  stats: any;
}

// ═══════════════════════════════════════════════════════════
// Correlation Heatmap Panel
// 
// 반도체 유니버스 상관관계를 시각적으로 표시
// - 빨강: 음의 상관 (-1.0)
// - 회색: 무상관 (0)
// - 초록: 양의 상관 (+1.0)
// ═══════════════════════════════════════════════════════════

function corrColor(v: number): string {
  const abs = Math.abs(v);
  if (v > 0) {
    // 양의 상관: 회색 → 초록
    const g = Math.floor(255 * abs);
    return `rgb(0, ${g}, 68)`;
  } else {
    // 음의 상관: 회색 → 빨강
    const r = Math.floor(255 * abs);
    return `rgb(${r}, 56, 96)`;
  }
}

function corrEmoji(v: number): string {
  const abs = Math.abs(v);
  if (abs > 0.85) return v > 0 ? "🔥" : "❄️";
  if (abs > 0.6) return v > 0 ? "📈" : "📉";
  if (abs > 0.3) return v > 0 ? "🟢" : "🔴";
  return "➖";
}

function corrInterpretation(c: Correlation): string {
  const abs = Math.abs(c.correlation);
  if (abs > 0.85 && c.correlation > 0) {
    return "💡 거의 같은 움직임 - 분산 효과 낮음";
  }
  if (abs > 0.85 && c.correlation < 0) {
    return "💡 거의 반대 움직임 - 완벽 헤지 효과";
  }
  if (abs > 0.6 && c.correlation > 0) {
    return "📊 유사한 방향성 - 섹터 영향 공유";
  }
  if (abs > 0.6 && c.correlation < 0) {
    return "🛡️ 반대 경향 - 헤지 효과 있음";
  }
  if (abs < 0.3) {
    return "🎯 독립적 - 분산 투자 효과 좋음";
  }
  return "📊 약한 연관성";
}

export function CorrelationHeatmapPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/research-dashboard",
    fetcher,
    { refreshInterval: 600000 }
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr">🔗 상관관계 로딩 중...</div>
      </div>
    );
  }

  const correlations = data?.topCorrelations ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="mb-3">
        <div className="section-title text-[11px] sm:text-[13px]">
          🔗 CORRELATION HEATMAP · 상관관계 분석
        </div>
        <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
          실제 90일 데이터 기반 · 매주 월요일 자동 갱신
        </div>
      </div>

      {/* 컬러 스케일 범례 */}
      <div className="mb-3 flex items-center gap-2 text-[9px] kr flex-wrap">
        <span className="dim">범례:</span>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded" style={{ background: "rgb(255, 56, 96)" }}></span>
          <span>-1.0 (완벽 반대)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-gray-700"></span>
          <span>0 (무관)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded" style={{ background: "rgb(0, 255, 68)" }}></span>
          <span>+1.0 (완벽 동조)</span>
        </div>
      </div>

      {correlations.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
          <div className="text-[24px] mb-2">📊</div>
          <div className="text-[10px] dim kr">
            매주 월요일 자동 수집 중...
          </div>
          <div className="text-[9px] dim kr mt-1">
            수동 실행: Research Dashboard에서 확인
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {correlations.map((c, i) => {
            const color = corrColor(c.correlation);
            const interpretation = corrInterpretation(c);
            const pair = c.pair.split(" - ");
            
            return (
              <div
                key={i}
                className="border rounded p-3"
                style={{
                  borderColor: `${color}50`,
                  background: `${color}08`,
                }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {/* 종목 쌍 */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[18px]">{corrEmoji(c.correlation)}</span>
                    <div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="tick font-bold text-[12px]">{pair[0]}</span>
                        <span className="dim text-[11px]">↔</span>
                        <span className="tick font-bold text-[12px]">{pair[1]}</span>
                      </div>
                      <div className="text-[9px] dim kr mt-0.5">
                        {c.sampleSize}개 데이터 · {c.lookbackDays}일 기준
                      </div>
                    </div>
                  </div>

                  {/* 상관계수 + 강도 */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-[20px] font-bold" style={{ color }}>
                      {c.correlation > 0 ? "+" : ""}{c.correlation.toFixed(3)}
                    </div>
                    <div className="text-[9px] dim kr">{c.strength}</div>
                  </div>
                </div>

                {/* 시각 바 */}
                <div className="mt-2 relative h-2 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: c.correlation >= 0 ? "50%" : `${50 + c.correlation * 50}%`,
                      width: `${Math.abs(c.correlation) * 50}%`,
                      background: color,
                    }}
                  />
                  <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white/30" />
                </div>

                {/* 해석 */}
                <div className="mt-2 text-[10px] kr leading-relaxed" style={{ color }}>
                  {interpretation}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 카일님 포트 인사이트 */}
      {correlations.length > 0 && (
        <div className="mt-3 p-3 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded">
          <div className="text-[10px] tick font-bold kr mb-2">💡 카일님 포트 시사점</div>
          <div className="text-[10px] kr leading-relaxed space-y-1">
            {correlations.find(c => c.pair.includes("360750") && c.pair.includes("SPY"))?.correlation !== undefined && (
              <div>
                • 🎯 TIGER S&P500 ↔ SPY 상관{" "}
                <span className="tick font-bold">
                  +{correlations.find(c => c.pair.includes("360750") && c.pair.includes("SPY"))?.correlation.toFixed(2)}
                </span>
                {" "}- 예상보다 낮음 (환율/시간대 영향)
              </div>
            )}
            {correlations.find(c => c.pair.includes("SMH") && c.pair.includes("QQQ"))?.correlation !== undefined && (
              <div>
                • 🔥 반도체(SMH) ↔ 나스닥(QQQ) +0.89 - 반도체는 나스닥 움직임에 민감
              </div>
            )}
            <div>
              • 📊 상관관계는 매주 월요일 자동 갱신 · 데이터 쌓일수록 정확도 상승
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 상관계수 해석 가이드:<br />
        • <strong>+1.0</strong>: 완벽 동조 (같이 움직임) → 분산 효과 없음<br />
        • <strong>0</strong>: 무관 → 완벽한 분산<br />
        • <strong>-1.0</strong>: 완벽 반대 → 완벽한 헤지
      </div>
    </div>
  );
}
