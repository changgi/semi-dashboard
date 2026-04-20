"use client";

import useSWR from "swr";
import { SkeletonBar, SkeletonCards } from "./Skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface Checkpoint {
  name: string;
  status: "positive" | "negative" | "neutral";
  current: string;
  target: string;
  note: string;
}

interface TopPick {
  symbol: string;
  final_vote: string;
  final_score: number;
  agreement_level: number;
}

interface Alert {
  level: "warning" | "opportunity" | "info";
  icon: string;
  title: string;
  message: string;
}

interface SummaryData {
  success: boolean;
  overallView: string;
  overallColor: "green" | "amber" | "red";
  healthScore: number;
  framework: {
    checkpoints: Checkpoint[];
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    totalCount: number;
  };
  agents: {
    topPicks: TopPick[];
    topAvoid: TopPick[];
    totalAnalyzed: number;
  };
  accuracy: {
    avgMape: number;
    avgCoverage: number;
    avgDirectionAcc: number;
    sampleCount: number;
  } | null;
  alerts: Alert[];
  dataStats: {
    totalForecasts: number;
    evaluatedForecasts: number;
  };
  daniel_yoo_summary: {
    view: string;
    recommended_allocation: string;
    top_picks: string;
  };
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function DailySummaryPanel() {
  const { data, isLoading } = useSWR<SummaryData>("/api/daily-summary", fetcher, {
    refreshInterval: 300000, // 5분
  });

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="section-title text-[11px] sm:text-[13px] opacity-60">
              🎯 TODAY&apos;S INVESTMENT VIEW · 로딩 중...
            </div>
            <SkeletonBar className="w-48 h-3 mt-1" />
          </div>
          <SkeletonBar className="w-20 h-10" />
        </div>
        <SkeletonCards count={4} />
        <div className="mt-3 space-y-2">
          <SkeletonBar className="w-full h-12" />
          <SkeletonBar className="w-full h-12" />
        </div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-4 text-[10px] dim text-center kr">
        ⚠️ 요약 데이터 로딩 실패 · 잠시 후 자동 재시도
      </div>
    );
  }

  const overallColorClass =
    data.overallColor === "green"
      ? "text-[#00ff88]"
      : data.overallColor === "amber"
      ? "text-[var(--amber)]"
      : "text-[#ff3860]";

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🎯 TODAY&apos;S INVESTMENT VIEW · 오늘의 투자 종합 판단
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            Daniel Yoo 프레임워크 + 19 AI 에이전트 + 실시간 매크로 · 5분 자동 갱신
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 📄 리포트 버튼 */}
          <a
            href="/report"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-[10px] border border-[var(--amber-dim)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] hover:border-[var(--amber)] transition-colors font-bold"
            title="일일 브리핑 리포트 (PDF 저장 가능)"
          >
            📄 일일 리포트
          </a>
          <div className="text-right">
            <div className={`text-[24px] sm:text-[36px] font-bold ${overallColorClass} leading-none`}>
              {data.healthScore}
              <span className="text-[14px] dim font-normal">/100</span>
            </div>
            <div className={`text-[9px] sm:text-[10px] font-bold kr ${overallColorClass}`}>
              {data.overallView}
            </div>
          </div>
        </div>
      </div>

      {/* 1️⃣ 최상단 긴급 알림 (Alerts) */}
      {data.alerts.length > 0 && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.alerts.map((alert, i) => (
            <div
              key={i}
              className={`border-l-2 rounded-r p-2 ${
                alert.level === "opportunity"
                  ? "border-[#00ff88] bg-[rgba(0,255,136,0.05)]"
                  : alert.level === "warning"
                  ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
                  : "border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)]"
              }`}
            >
              <div className="flex items-start gap-1">
                <span className="text-[12px]">{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[10px] font-bold kr ${
                      alert.level === "opportunity"
                        ? "text-[#00ff88]"
                        : alert.level === "warning"
                        ? "text-[#ff3860]"
                        : "text-[var(--amber)]"
                    }`}
                  >
                    {alert.title}
                  </div>
                  <div className="text-[9px] dim kr leading-relaxed mt-0.5">
                    {alert.message}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2️⃣ 매크로 체크리스트 + 에이전트 추천 (2컬럼) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        {/* 좌: 매크로 체크리스트 */}
        <div className="border border-[var(--border)] rounded p-2 sm:p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] sm:text-[11px] tick kr">
              📊 매크로 체크리스트
            </div>
            <div className="text-[9px] dim">
              <span className="text-[#00ff88]">✓{data.framework.positiveCount}</span>{" "}
              <span className="text-[var(--amber)]">⚖{data.framework.neutralCount}</span>{" "}
              <span className="text-[#ff3860]">✗{data.framework.negativeCount}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {data.framework.checkpoints.map((cp) => (
              <div
                key={cp.name}
                className="flex items-center justify-between gap-2 py-1 border-b border-[var(--border)] last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={
                      cp.status === "positive"
                        ? "up"
                        : cp.status === "negative"
                        ? "down"
                        : "dim"
                    }
                  >
                    {cp.status === "positive" ? "●" : cp.status === "negative" ? "●" : "○"}
                  </span>
                  <span className="text-[9px] sm:text-[10px] bright kr truncate">
                    {cp.name}
                  </span>
                </div>
                <div className="text-right">
                  <div
                    className={`text-[10px] sm:text-[11px] font-bold ${
                      cp.status === "positive"
                        ? "up"
                        : cp.status === "negative"
                        ? "down"
                        : "tick"
                    }`}
                  >
                    {cp.current}
                  </div>
                  <div className="text-[7px] dim kr">{cp.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 우: AI 에이전트 추천 */}
        <div className="border border-[var(--border)] rounded p-2 sm:p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] sm:text-[11px] tick kr">
              🤖 AI 에이전트 추천 (19명 합의)
            </div>
            <div className="text-[8px] dim kr">
              {data.agents.totalAnalyzed}개 분석
            </div>
          </div>

          {/* 매수 추천 */}
          {data.agents.topPicks.length > 0 ? (
            <div className="mb-3">
              <div className="text-[9px] kr up mb-1">✅ 매수 추천 TOP {data.agents.topPicks.length}</div>
              <div className="space-y-1">
                {data.agents.topPicks.map((p) => (
                  <div
                    key={p.symbol}
                    className="flex items-center justify-between py-1 px-2 bg-[rgba(0,255,136,0.05)] rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="tick font-bold text-[11px]">{p.symbol}</span>
                      <span className="text-[8px] dim kr">합의 {p.agreement_level}%</span>
                    </div>
                    <div className="up font-bold text-[11px]">
                      +{p.final_score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[9px] dim kr py-2">매수 강도 종목 없음 (합의 필요)</div>
          )}

          {/* 매도/회피 */}
          {data.agents.topAvoid.length > 0 && (
            <div>
              <div className="text-[9px] kr down mb-1">⚠️ 매도/회피 {data.agents.topAvoid.length}</div>
              <div className="space-y-1">
                {data.agents.topAvoid.map((p) => (
                  <div
                    key={p.symbol}
                    className="flex items-center justify-between py-1 px-2 bg-[rgba(255,56,96,0.05)] rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="tick font-bold text-[11px]">{p.symbol}</span>
                      <span className="text-[8px] dim kr">합의 {p.agreement_level}%</span>
                    </div>
                    <div className="down font-bold text-[11px]">
                      {p.final_score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3️⃣ 예측 모델 신뢰도 + Daniel Yoo 공식 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* 좌: 모델 신뢰도 */}
        <div className="border border-[var(--border)] rounded p-2 sm:p-3">
          <div className="text-[10px] sm:text-[11px] tick kr mb-2">
            🎯 예측 모델 신뢰도 (30일 기준)
          </div>
          {data.accuracy ? (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-[7px] dim kr">MAPE</div>
                <div className={`text-[14px] font-bold ${
                  data.accuracy.avgMape < 5 ? "up" : data.accuracy.avgMape < 10 ? "text-[var(--amber)]" : "down"
                }`}>
                  {data.accuracy.avgMape}%
                </div>
              </div>
              <div>
                <div className="text-[7px] dim kr">구간 적중</div>
                <div className={`text-[14px] font-bold ${
                  Math.abs(data.accuracy.avgCoverage - 80) < 10 ? "up" : "text-[var(--amber)]"
                }`}>
                  {data.accuracy.avgCoverage}%
                </div>
              </div>
              <div>
                <div className="text-[7px] dim kr">방향 적중</div>
                <div className={`text-[14px] font-bold ${
                  data.accuracy.avgDirectionAcc >= 65 ? "up" : data.accuracy.avgDirectionAcc >= 50 ? "text-[var(--amber)]" : "down"
                }`}>
                  {data.accuracy.avgDirectionAcc}%
                </div>
              </div>
              <div>
                <div className="text-[7px] dim kr">샘플</div>
                <div className="text-[14px] font-bold tick">
                  {data.accuracy.sampleCount}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[9px] dim kr py-2 text-center">
              📊 예측 평가 데이터 수집 중...
              <br />
              <span className="text-[8px]">/api/backfill-forecasts 실행 후 즉시 확인 가능</span>
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-[var(--border)] text-[8px] dim kr">
            총 예측 {data.dataStats.totalForecasts.toLocaleString()}개 저장 · 평가 완료{" "}
            {data.dataStats.evaluatedForecasts.toLocaleString()}개
          </div>
        </div>

        {/* 우: Daniel Yoo 핵심 관점 */}
        <div className="border-l-2 border-[var(--amber)] bg-[rgba(255,176,0,0.03)] rounded-r p-2 sm:p-3">
          <div className="text-[10px] sm:text-[11px] tick mb-2">
            🇰🇷 DANIEL YOO&apos;S CORE VIEW
          </div>
          <div className="space-y-2 text-[9px] sm:text-[10px]">
            <div>
              <div className="font-bold bright kr">📈 시장 전망</div>
              <div className="dim kr leading-relaxed">{data.daniel_yoo_summary.view}</div>
            </div>
            <div>
              <div className="font-bold bright kr">⚖️ 권장 자산배분</div>
              <div className="dim kr leading-relaxed">{data.daniel_yoo_summary.recommended_allocation}</div>
            </div>
            <div>
              <div className="font-bold bright kr">🎯 추천 종목</div>
              <div className="dim kr leading-relaxed">{data.daniel_yoo_summary.top_picks}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[8px] dim kr flex-wrap gap-2">
        <div>
          🔗 매크로 · AI 에이전트 · 옵션 · 선물 · 환율 · 예측 통합 분석
        </div>
        <div>
          마지막 업데이트: {new Date().toLocaleTimeString("ko-KR")}
        </div>
      </div>
    </div>
  );
}
