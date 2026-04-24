"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import useSWR from "swr";
import type { DashboardRow } from "@/lib/types";
import { fmtPct } from "@/lib/format";

import { TopBar } from "@/components/TopBar";
import { LiveTicker } from "@/components/LiveTicker";
import { Heatmap } from "@/components/Heatmap";
import { TopPerformer } from "@/components/TopPerformer";
import { InvestmentMatrix } from "@/components/InvestmentMatrix";
import { ChangeRanking } from "@/components/ChangeRanking";
import { SegmentStats } from "@/components/SegmentStats";
import { ValuationPanel, MemflationPanel, RevenueGrowthPanel } from "@/components/StaticPanels";
import { MultiAnalysis } from "@/components/MultiAnalysis";
import { TrendIntegration } from "@/components/TrendIntegration";
import { RiskMatrix, PortfolioProfiles, CatalystTimeline, ExecutiveSummary } from "@/components/AnalysisPanels";
import { NewsFeed } from "@/components/NewsFeed";
import { StockDrawer } from "@/components/StockDrawer";
import { HighDimensionAnalysis } from "@/components/HighDimensionAnalysis";
import { PredictionDashboard } from "@/components/PredictionDashboard";
import { NewsSentimentTrend } from "@/components/NewsSentimentTrend";
import { TradingSignalBoard } from "@/components/TradingSignalBoard";
import { AgentDashboard } from "@/components/AgentDashboard";
import { AgentComparisonTable } from "@/components/AgentComparisonTable";
import { AgentDetailTable } from "@/components/AgentDetailTable";
import { MacroPanel } from "@/components/MacroPanel";
import { MacroChartsPanel } from "@/components/MacroChartsPanel";
import { ForecastAccuracyPanel } from "@/components/ForecastAccuracyPanel";
import { MacroCorrelation } from "@/components/MacroCorrelation";
import { DerivativesPanel } from "@/components/DerivativesPanel";
import { StockDerivativesPanel } from "@/components/StockDerivativesPanel";
import { OptionsScannerPanel } from "@/components/OptionsScannerPanel";
import { DailySummaryPanel } from "@/components/DailySummaryPanel";
import { KoreaSemiPanel } from "@/components/KoreaSemiPanel";
import { BacktestPanel } from "@/components/BacktestPanel";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { InvestmentAdvisor } from "@/components/InvestmentAdvisor";
import { GlobalStockSearch } from "@/components/GlobalStockSearch";
import { SideNavigation } from "@/components/SideNavigation";
import { DashboardSettings } from "@/components/DashboardSettings";
import { SectionWrapper } from "@/components/SectionWrapper";
import { PriceAlertsPanel } from "@/components/PriceAlertsPanel";
import { OptionsImpactPanel } from "@/components/OptionsImpactPanel";
import { OpExCalendarPanel } from "@/components/OpExCalendarPanel";
import { GammaProfilePanel } from "@/components/GammaProfilePanel";
import { UnifiedInsightChart } from "@/components/UnifiedInsightChart";
import { PortfolioRiskPanel } from "@/components/PortfolioRiskPanel";
import { DailyBriefingPanel } from "@/components/DailyBriefingPanel";
import { SectorScannerPanel } from "@/components/SectorScannerPanel";
import { AlertFeedPanel } from "@/components/AlertFeedPanel";
import { ExecutionPlanPanel } from "@/components/ExecutionPlanPanel";
import { JournalPanel } from "@/components/JournalPanel";
import { EconomicCalendarPanel } from "@/components/EconomicCalendarPanel";
import { SimulatorPanel } from "@/components/SimulatorPanel";
import { ToolboxPanel } from "@/components/ToolboxPanel";
import { UrgentEventBanner } from "@/components/UrgentEventBanner";
import { QuickStatusBar } from "@/components/QuickStatusBar";
import { EarningsMonitorPanel } from "@/components/EarningsMonitorPanel";
import { PositionGuidePanel } from "@/components/PositionGuidePanel";
import { PushNotifications } from "@/components/PushNotifications";
import { StrategyAssistantPanel } from "@/components/StrategyAssistantPanel";
import { WeeklyStrategyPanel } from "@/components/WeeklyStrategyPanel";
import { OrderSlipPanel } from "@/components/OrderSlipPanel";
import { KoreaLensPanel } from "@/components/KoreaLensPanel";
import { MorningBriefPanel } from "@/components/MorningBriefPanel";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { RebalanceHelperPanel } from "@/components/RebalanceHelperPanel";
import { PortfolioCRUDPanel } from "@/components/PortfolioCRUDPanel";
import { PortfolioDiagnosisPanel } from "@/components/PortfolioDiagnosisPanel";
import { PortfolioSimulatorPanel } from "@/components/PortfolioSimulatorPanel";
import { OpportunityFinderPanel } from "@/components/OpportunityFinderPanel";
import { OpportunityTrackerPanel } from "@/components/OpportunityTrackerPanel";
import { RecoveryPathPanel } from "@/components/RecoveryPathPanel";
import { TradeIdeasPanel } from "@/components/TradeIdeasPanel";
import { DailyBriefingHero } from "@/components/DailyBriefingHero";
import { AlertBanner } from "@/components/AlertBanner";
import { MarketPulse } from "@/components/MarketPulse";
import { ExitStrategyPanel } from "@/components/ExitStrategyPanel";
import { TradeJournalPanel } from "@/components/TradeJournalPanel";
import { SmartAlertsPanel } from "@/components/SmartAlertsPanel";
import { StockAnalyzerPanel } from "@/components/StockAnalyzerPanel";
import { PositionSizerPanel } from "@/components/PositionSizerPanel";
import { EventCountdown } from "@/components/EventCountdown";
import { ExecutionTracker } from "@/components/ExecutionTracker";
import { FloatingCTA } from "@/components/FloatingCTA";
import { RecoveryPlanPanel } from "@/components/RecoveryPlanPanel";
import { ArchiveReviewPanel } from "@/components/ArchiveReviewPanel";
import { TodaysFocusCard } from "@/components/TodaysFocusCard";
import { MorningRoutinePanel } from "@/components/MorningRoutinePanel";
import DeepAnalysisPanel from "@/components/DeepAnalysisPanel";
import MarketRegimePanel from "@/components/MarketRegimePanel";
import TradeExecutionCard from "@/components/TradeExecutionCard";
import PostEarningsScenarioPanel from "@/components/PostEarningsScenarioPanel";
import PortfolioAnalyticsPanel from "@/components/PortfolioAnalyticsPanel";
import RebalancingPanel from "@/components/RebalancingPanel";
import SignalFusionPanel from "@/components/SignalFusionPanel";
import TechDivergencePanel from "@/components/TechDivergencePanel";
import EarningsRealityCheckPanel from "@/components/EarningsRealityCheckPanel";
import ThirteenFTrackerPanel from "@/components/ThirteenFTrackerPanel";
import OptionsSignalsPanel from "@/components/OptionsSignalsPanel";
import { ResearchDashboardPanel } from "@/components/ResearchDashboardPanel";
import { TimeMachinePanel } from "@/components/TimeMachinePanel";
import { EarningsSchedulePanel } from "@/components/EarningsSchedulePanel";
import { CorrelationHeatmapPanel } from "@/components/CorrelationHeatmapPanel";
import { FloatingDecisionBar } from "@/components/FloatingDecisionBar";
import { RecommendationTicker } from "@/components/RecommendationTicker";
import { HotActionsBar } from "@/components/HotActionsBar";
import { CacheStatusBanner } from "@/components/CacheStatusBanner";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";
import { DataHealthDashboard } from "@/components/DataHealthDashboard";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Dashboard() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [flashMap, setFlashMap] = useState<Map<string, "up" | "down">>(new Map());
  const prevPrices = useRef<Map<string, number>>(new Map());

  // SWR 15초 폴링 — 실시간 데이터의 유일한 소스
  const { data } = useSWR("/api/quotes", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    if (!data?.success) return;
    const incoming = data.data as DashboardRow[];

    // 가격 변동 감지 → flash 애니메이션
    incoming.forEach((r) => {
      if (r.price === null) return;
      const prev = prevPrices.current.get(r.symbol);
      if (prev !== undefined && prev !== r.price) {
        const dir = r.price > prev ? "up" : "down";
        setFlashMap((m) => new Map(m).set(r.symbol, dir));
        setTimeout(() => {
          setFlashMap((m) => {
            const next = new Map(m);
            next.delete(r.symbol);
            return next;
          });
        }, 1200);
      }
      prevPrices.current.set(r.symbol, r.price);
    });

    setRows(incoming);
  }, [data]);

  const handleSelect = useCallback((symbol: string) => setSelectedSymbol(symbol), []);
  const selectedRow = selectedSymbol ? rows.find((r) => r.symbol === selectedSymbol) ?? null : null;

  // 헤드라인 지표
  const gainers = rows.filter((r) => (r.change_percent ?? 0) > 0).length;
  const losers = rows.filter((r) => (r.change_percent ?? 0) < 0).length;
  const totalCap = rows.filter((r) => !r.is_etf).reduce((s, r) => s + (r.market_cap_b ?? 0), 0);

  // 연결 상태: 데이터가 있으면 connected
  const isConnected = rows.length > 0;

  return (
    <div className="relative z-10">
      <TopBar isConnected={isConnected} />
      <RecommendationTicker />
      <HotActionsBar />
      <CacheStatusBanner />
      <LiveTicker rows={rows} />

      {/* ═══════════════ HERO ═══════════════ */}
      <div className="px-3 sm:px-6 py-5 sm:py-8 border-b border-[var(--border)]">
        <div className="grid grid-cols-12 gap-4 sm:gap-6 items-end">
          <div className="col-span-12 lg:col-span-8">
            <div className="text-[9px] sm:text-[10px] tick mb-2">◢ SECTOR REPORT // EQ.SEMI // Q2 2026</div>
            <h1 className="headline text-white text-[36px] sm:text-[56px] md:text-[72px] lg:text-[88px] leading-[0.82]">
              THE<br />
              <span style={{ color: "var(--amber)" }}>MEMFLATION</span><br />
              <span className="serif italic" style={{ fontWeight: 400, color: "var(--text-dim)" }}>supercycle.</span>
            </h1>
            <div className="mt-3 sm:mt-6 max-w-2xl text-[11px] sm:text-[13px] leading-relaxed kr" style={{ color: "var(--text)" }}>
              AI 데이터센터 수요가 HBM으로 집중되며 <span className="tick">DRAM·NAND가 사상 최대 가격 상승</span>을 기록.
              2026년 글로벌 반도체 매출은 <span className="bright">US$1.3조</span>를 돌파하며 지난 20년 중 최대 성장(+64%)을
              기록할 전망.
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="panel p-3 sm:p-4">
                <div className="text-[8px] sm:text-[9px] dim tracking-widest">GLOBAL REV 26E</div>
                <div className="headline text-white text-[24px] sm:text-[36px] mt-1 sm:mt-2">$1.3<span className="text-[14px] sm:text-[18px] dim">T</span></div>
                <div className="text-[9px] sm:text-[10px] up mt-1">▲ +64% YoY</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-[8px] sm:text-[9px] dim tracking-widest">DRAM PRICE 26E</div>
                <div className="headline text-[24px] sm:text-[36px] mt-1 sm:mt-2" style={{ color: "var(--amber)" }}>+125<span className="text-[14px] sm:text-[18px]">%</span></div>
                <div className="text-[9px] sm:text-[10px] dim mt-1">YoY annual</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-[8px] sm:text-[9px] dim tracking-widest">SECTOR EARN</div>
                <div className="headline text-[24px] sm:text-[36px] mt-1 sm:mt-2" style={{ color: "var(--green)" }}>+80<span className="text-[14px] sm:text-[18px]">%</span></div>
                <div className="text-[9px] sm:text-[10px] dim mt-1">BlackRock est.</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-[8px] sm:text-[9px] dim tracking-widest">AI CHIP SHARE</div>
                <div className="headline text-[24px] sm:text-[36px] mt-1 sm:mt-2" style={{ color: "var(--cyan)" }}>~50<span className="text-[14px] sm:text-[18px]">%</span></div>
                <div className="text-[9px] sm:text-[10px] dim mt-1">of total rev.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ MAIN GRID ═══════════════ */}
      <div className="px-3 sm:px-6 py-4 sm:py-6 grid grid-cols-12 gap-3 sm:gap-5">

        {/* ⚡ QUICK STATUS BAR - 3초 파악 */}
        <div className="col-span-12">
          <PanelErrorBoundary panelName="Quick Status" compact>
            <QuickStatusBar />
          </PanelErrorBoundary>
        </div>

        {/* 🚨 URGENT EVENT BANNER - D-3 이내 중요 이벤트 경고 */}
        <div className="col-span-12">
          <PanelErrorBoundary panelName="Urgent Events" compact>
            <UrgentEventBanner />
          </PanelErrorBoundary>
        </div>

        {/* ☀️ MORNING BRIEF - 3분 요약 (대시보드 최상단!) */}
        <div id="morning-brief" className="col-span-12">
          <PanelErrorBoundary panelName="Morning Brief">
            <MorningBriefPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🎯 TODAY'S FOCUS - 오늘 딱 한 가지 (최최최상단) */}
        <div id="todays-focus" className="col-span-12">
          <PanelErrorBoundary panelName="Todays Focus">
            <TodaysFocusCard />
          </PanelErrorBoundary>
        </div>

        {/* 🚨 TRADE EXECUTION CARD - 오늘의 긴급 실행 주문 (TSLL 매도 등) */}
        <div id="trade-execution" className="col-span-12">
          <PanelErrorBoundary panelName="Trade Execution Card">
            <TradeExecutionCard title="🚨 오늘 밤 실행할 주문 · 22:30 KST" />
          </PanelErrorBoundary>
        </div>

        {/* 🎯 POST-EARNINGS SCENARIOS - 실적 발표 시나리오별 행동 강령 */}
        <div id="post-earnings" className="col-span-12">
          <PanelErrorBoundary panelName="Post-Earnings Scenarios">
            <PostEarningsScenarioPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🌐 MARKET REGIME - 시황 국면 진단 */}
        <div id="market-regime" className="col-span-12">
          <PanelErrorBoundary panelName="Market Regime">
            <MarketRegimePanel />
          </PanelErrorBoundary>
        </div>

        {/* 📐 PORTFOLIO ANALYTICS - 포트폴리오 정량 분석 */}
        <div id="portfolio-analytics" className="col-span-12">
          <PanelErrorBoundary panelName="Portfolio Analytics">
            <PortfolioAnalyticsPanel />
          </PanelErrorBoundary>
        </div>

        {/* ⚖️ REBALANCING - 리밸런싱 엔진 (매도 → 현금 → 재투자) */}
        <div id="rebalancing" className="col-span-12">
          <PanelErrorBoundary panelName="Rebalancing">
            <RebalancingPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🐋 SIGNAL FUSION - 스마트머니(DART) + 수급(세시반) + 카일 전략 융합 */}
        <div id="signal-fusion" className="col-span-12">
          <PanelErrorBoundary panelName="Signal Fusion">
            <SignalFusionPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔀 TECH DIVERGENCE - 대니얼유 관점 IT 승자/패자 분화 */}
        <div id="tech-divergence" className="col-span-12">
          <PanelErrorBoundary panelName="Tech Divergence">
            <TechDivergencePanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔍 EARNINGS REALITY CHECK - 실적 발표 사후 자동 검증 */}
        <div id="earnings-reality" className="col-span-12">
          <PanelErrorBoundary panelName="Earnings Reality Check">
            <EarningsRealityCheckPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🦅 13F TRACKER - 미국 투자 전설 포트폴리오 (SEC EDGAR) */}
        <div id="thirteen-f" className="col-span-12">
          <PanelErrorBoundary panelName="13F Tracker">
            <ThirteenFTrackerPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📈 OPTIONS SIGNALS - 옵션 시장 시그널 (P/C, IV Skew, Max Pain, Unusual) */}
        <div id="options-signals" className="col-span-12">
          <PanelErrorBoundary panelName="Options Signals">
            <OptionsSignalsPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔬 DEEP ANALYSIS - 차트+기술+예측+이유 통합 분석 엔진 */}
        <div id="deep-analysis" className="col-span-12">
          <PanelErrorBoundary panelName="Deep Analysis">
            <DeepAnalysisPanel initialSymbol="ORCL" />
          </PanelErrorBoundary>
        </div>

        {/* ⏱ EVENT COUNTDOWN - 시장 이벤트 실시간 카운트다운 */}
        <div id="event-countdown" className="col-span-12">
          <PanelErrorBoundary panelName="Event Countdown">
            <EventCountdown />
          </PanelErrorBoundary>
        </div>

        {/* 📋 EXECUTION TRACKER - 오늘 실행 목록 체크 */}
        <div id="execution-tracker" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <PanelErrorBoundary panelName="Execution Tracker">
              <ExecutionTracker />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* ☀️ MORNING ROUTINE - 아침 5분 체크리스트 */}
        <div id="morning-routine" className="col-span-12 md:col-span-5">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <PanelErrorBoundary panelName="Morning Routine">
              <MorningRoutinePanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* ⏰ MARKET PULSE - 시계 + 다음 이벤트 + 포트 요약 (최상단) */}
        <div id="market-pulse" className="col-span-12">
          <PanelErrorBoundary panelName="Market Pulse">
            <MarketPulse />
          </PanelErrorBoundary>
        </div>

        {/* 🚨 ALERT BANNER - 긴급 경보 (최최상단) */}
        <div id="alert-banner" className="col-span-12">
          <PanelErrorBoundary panelName="Alert Banner">
            <AlertBanner />
          </PanelErrorBoundary>
        </div>

        {/* 🌅 DAILY BRIEFING - 오늘 5분 요약 (최최상단) */}
        <div id="daily-briefing" className="col-span-12">
          <PanelErrorBoundary panelName="Daily Briefing">
            <DailyBriefingHero />
          </PanelErrorBoundary>
        </div>

        {/* 💡 TRADE IDEAS - 오늘의 TOP 매매 아이디어 */}
        <div id="trade-ideas" className="col-span-12">
          <div className="border-2 border-[var(--amber)] rounded p-3 bg-[rgba(255,176,0,0.03)]">
            <div className="text-[12px] tick font-bold kr mb-2">💡 오늘의 매매 아이디어 · AI 통합 추천</div>
            <PanelErrorBoundary panelName="Trade Ideas">
              <TradeIdeasPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 💼 PORTFOLIO MANAGER - 종목 추가/수정/삭제 */}
        <div id="portfolio-crud" className="col-span-12">
          <PanelErrorBoundary panelName="Portfolio CRUD">
            <PortfolioCRUDPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🩺 PORTFOLIO DIAGNOSIS - 자동 진단 + 리스크 + 액션 플랜 */}
        <div id="portfolio-diagnosis" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🩺 포트폴리오 진단 · 자동 분석</div>
            <PanelErrorBoundary panelName="Portfolio Diagnosis">
              <PortfolioDiagnosisPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🎮 SCENARIO SIMULATOR - 가격 변동 + 매도 시뮬레이션 */}
        <div id="portfolio-simulator" className="col-span-12 md:col-span-5">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🎮 시나리오 시뮬레이터</div>
            <PanelErrorBoundary panelName="Portfolio Simulator">
              <PortfolioSimulatorPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🎯 OPPORTUNITY FINDER - 매수 기회 자동 탐지 */}
        <div id="opportunity-finder" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🎯 기회 탐지기 · 수익률 상승 후보</div>
            <PanelErrorBoundary panelName="Opportunity Finder">
              <OpportunityFinderPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🔄 RECOVERY PATH - 손실 복구 전략 */}
        <div id="recovery-path" className="col-span-12 md:col-span-5">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🔄 복구 경로 · 손실 복구 전략</div>
            <PanelErrorBoundary panelName="Recovery Path">
              <RecoveryPathPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 📆 RECOVERY PLAN - 6주 단계별 플랜 (인터랙티브) */}
        <div id="recovery-plan" className="col-span-12">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">📆 복구 플랜 · 주차별 태스크 + 체크</div>
            <PanelErrorBoundary panelName="Recovery Plan">
              <RecoveryPlanPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 📂 ARCHIVE REVIEW - 누적 스냅샷 + 성과 분석 */}
        <div id="archive-review" className="col-span-12">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">📂 아카이브 검토 · 자동 누적 + 조회 + 분석</div>
            <PanelErrorBoundary panelName="Archive Review">
              <ArchiveReviewPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🎯 EXIT STRATEGY - 각 포지션별 익절/손절 레벨 */}
        <div id="exit-strategy" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🎯 출구 전략 · 포지션별 익절/손절 계획</div>
            <PanelErrorBoundary panelName="Exit Strategy">
              <ExitStrategyPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 📔 TRADE JOURNAL - 매매 기록 + 학습 */}
        <div id="trade-journal" className="col-span-12 md:col-span-5">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">📔 매매 저널 · 기록 + 패턴 분석</div>
            <PanelErrorBoundary panelName="Trade Journal">
              <TradeJournalPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🔔 SMART ALERTS - 3-layer 알림 */}
        <div id="smart-alerts" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🔔 스마트 알림 · 뭐+왜+뭘해야</div>
            <PanelErrorBoundary panelName="Smart Alerts">
              <SmartAlertsPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🔍 STOCK ANALYZER - 단일 종목 심층 분석 */}
        <div id="stock-analyzer" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">🔍 종목 심층 분석 · 7차원 AI 평가</div>
            <PanelErrorBoundary panelName="Stock Analyzer">
              <StockAnalyzerPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 📏 POSITION SIZER - 적정 매수량 계산 */}
        <div id="position-sizer" className="col-span-12 md:col-span-5">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">📏 매수량 계산기 · Kelly + 리스크</div>
            <PanelErrorBoundary panelName="Position Sizer">
              <PositionSizerPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 📊 OPPORTUNITY TRACKER - 추천 성과 추적 */}
        <div id="opportunity-tracker" className="col-span-12 md:col-span-7">
          <div className="border border-[var(--border)] rounded p-3 bg-black/20">
            <div className="text-[11px] tick font-bold kr mb-2">📊 추천 성과 추적 · 시스템 신뢰도 검증</div>
            <PanelErrorBoundary panelName="Opportunity Tracker">
              <OpportunityTrackerPanel />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* 🧠 POSITION GUIDE - AI 종합 판단 + 지금 뭐 해야 하나? */}
        <div id="position-guide" className="col-span-12">
          <PanelErrorBoundary panelName="Position Guide">
            <PositionGuidePanel />
          </PanelErrorBoundary>
        </div>

        {/* 💬 STRATEGY ASSISTANT - 5가지 질문 즉답 */}
        <div id="strategy-assistant" className="col-span-12">
          <PanelErrorBoundary panelName="Strategy Assistant">
            <StrategyAssistantPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📅 WEEKLY STRATEGY - 이번 주 종합 전략 */}
        <div id="weekly-strategy" className="col-span-12">
          <PanelErrorBoundary panelName="Weekly Strategy">
            <WeeklyStrategyPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📝 ORDER SLIP - 실행 가능한 주문서 */}
        <div id="order-slip" className="col-span-12">
          <PanelErrorBoundary panelName="Order Slip">
            <OrderSlipPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🇰🇷 KOREA LENS - 한국 투자자 맞춤 */}
        <div id="korea-lens" className="col-span-12">
          <PanelErrorBoundary panelName="Korea Lens">
            <KoreaLensPanel />
          </PanelErrorBoundary>
        </div>

        {/* ⚖️ REBALANCE HELPER - 분산 투자 플랜 */}
        <div id="rebalance-helper" className="col-span-12">
          <PanelErrorBoundary panelName="Rebalance Helper">
            <RebalanceHelperPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔬 RESEARCH DASHBOARD - 축적 데이터 분석 */}
        <div id="research-dashboard" className="col-span-12">
          <PanelErrorBoundary panelName="Research Dashboard">
            <ResearchDashboardPanel />
          </PanelErrorBoundary>
        </div>

        {/* ⏰ TIME MACHINE - 유사 국면 검색 */}
        <div id="time-machine" className="col-span-12">
          <PanelErrorBoundary panelName="Time Machine">
            <TimeMachinePanel />
          </PanelErrorBoundary>
        </div>

        {/* 📅 EARNINGS SCHEDULE - 실적 일정 관리 */}
        <div id="earnings-schedule" className="col-span-12">
          <PanelErrorBoundary panelName="Earnings Schedule">
            <EarningsSchedulePanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔗 CORRELATION HEATMAP - 상관관계 시각화 */}
        <div id="correlation-heatmap" className="col-span-12">
          <PanelErrorBoundary panelName="Correlation Heatmap">
            <CorrelationHeatmapPanel />
          </PanelErrorBoundary>
        </div>

        {/* ☕ MORNING BRIEFING - 매일 아침 5분 종합 브리핑 (최상단) */}
        <div id="daily-briefing" className="col-span-12">
          <PanelErrorBoundary panelName="Daily Briefing">
            <DailyBriefingPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔔 ALERT FEED - 실시간 통합 알림 피드 */}
        <div id="alert-feed" className="col-span-12">
          <PanelErrorBoundary panelName="Alert Feed">
            <AlertFeedPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📋 EXECUTION PLAN - 오늘의 주문 리스트 (체크리스트) */}
        <div id="execution-plan" className="col-span-12">
          <PanelErrorBoundary panelName="Execution Plan">
            <ExecutionPlanPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📅 ECONOMIC CALENDAR - 경제 이벤트 캘린더 */}
        <div id="economic-calendar" className="col-span-12">
          <PanelErrorBoundary panelName="Economic Calendar">
            <EconomicCalendarPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📊 EARNINGS MONITOR - 실적 발표 대응 전략 */}
        <div id="earnings-monitor" className="col-span-12">
          <PanelErrorBoundary panelName="Earnings Monitor">
            <EarningsMonitorPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📔 INVESTMENT JOURNAL - 투자 일지 & 성과 추적 */}
        <div id="journal" className="col-span-12">
          <PanelErrorBoundary panelName="Journal">
            <JournalPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🎮 PORTFOLIO SIMULATOR - What If? 시나리오 분석 */}
        <div id="simulator" className="col-span-12">
          <PanelErrorBoundary panelName="Simulator">
            <SimulatorPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🛠️ INVESTMENT TOOLBOX - 뉴스/이메일/Export */}
        <div id="toolbox" className="col-span-12">
          <PanelErrorBoundary panelName="Toolbox">
            <ToolboxPanel />
          </PanelErrorBoundary>
        </div>

        {/* ⭐ TODAY'S VIEW - 오늘의 투자 종합 판단 (최상단 하이라이트) */}
        <div id="today-view" className="col-span-12">
          <PanelErrorBoundary panelName="Today's View">
            <DailySummaryPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🧠 INVESTMENT ADVISOR - 오늘 할 일 구체적 가이드 */}
        <SectionWrapper id="advisor">
          <PanelErrorBoundary panelName="Investment Advisor">
            <InvestmentAdvisor />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 💼 MY PORTFOLIO - 사용자 보유 종목 실시간 추적 */}
        <SectionWrapper id="portfolio">
          <PanelErrorBoundary panelName="포트폴리오">
            <PortfolioPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 🎯 PORTFOLIO RISK - 내 포트폴리오 통합 리스크 분석 */}
        <div id="portfolio-risk" className="col-span-12">
          <PanelErrorBoundary panelName="Portfolio Risk">
            <PortfolioRiskPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🎯 UNIFIED INSIGHT - 통합 매매 결정 차트 (핵심!) */}
        <div id="unified-insight" className="col-span-12">
          <PanelErrorBoundary panelName="Unified Insight">
            <UnifiedInsightChart />
          </PanelErrorBoundary>
        </div>

        {/* 🔍 SECTOR SCANNER - 섹터 전체 기회/경고 자동 발굴 */}
        <div id="sector-scanner" className="col-span-12">
          <PanelErrorBoundary panelName="Sector Scanner">
            <SectorScannerPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔔 PRICE ALERTS - 가격 알림 */}
        <div id="price-alerts" className="col-span-12">
          <PanelErrorBoundary panelName="Price Alerts">
            <PriceAlertsPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🇰🇷 KOREA SEMI - 한국 반도체 생태계 (한국 투자자 우선) */}
        <SectionWrapper id="korea-semi">
          <PanelErrorBoundary panelName="Korea Semi Watch">
            <KoreaSemiPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 01 · Heatmap (col-8) + 02 · Top Performer (col-4) */}
        <div className="col-span-12 lg:col-span-8">
          <Heatmap rows={rows} onSelect={handleSelect} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <TopPerformer rows={rows} />
        </div>

        {/* 03 · Investment Matrix */}
        <div className="col-span-12">
          <InvestmentMatrix />
        </div>

        {/* 04 · Day Change Ranking + 05 · Forward P/E */}
        <div className="col-span-12 lg:col-span-6">
          <ChangeRanking rows={rows} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <ValuationPanel />
        </div>

        {/* 06 · Memflation + 07 · Revenue Growth */}
        <div className="col-span-12 lg:col-span-6">
          <MemflationPanel />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <RevenueGrowthPanel />
        </div>

        {/* Multi-Dimensional Analysis */}
        <div className="col-span-12">
          <MultiAnalysis rows={rows} />
        </div>

        {/* Integrated Trend */}
        <div className="col-span-12">
          <TrendIntegration rows={rows} />
        </div>

        {/* Segment Stats + ETF Tracker */}
        <div className="col-span-12 lg:col-span-6">
          <SegmentStats rows={rows} />
        </div>
        <div className="col-span-12 lg:col-span-6 panel p-5">
          <div className="section-title mb-4">ETF TRACKER</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {rows.filter((r) => r.is_etf).map((r) => {
              const up = (r.change_percent ?? 0) >= 0;
              const flash = flashMap.get(r.symbol);
              return (
                <button
                  key={r.symbol}
                  onClick={() => handleSelect(r.symbol)}
                  className={`text-left p-4 border border-[var(--border)] hover:border-[var(--amber)] transition-colors ${
                    flash === "up" ? "flash-green" : flash === "down" ? "flash-red" : ""
                  }`}
                >
                  <div className="tick text-[14px]">{r.symbol}</div>
                  <div className="text-[9px] dim kr">{r.name_kr}</div>
                  <div className="bright text-[16px] mt-2 hex-num">${r.price?.toFixed(2) ?? "—"}</div>
                  <div className={`text-[11px] ${up ? "up" : "down"}`}>{up ? "▲" : "▼"} {fmtPct(r.change_percent)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* === ADVANCED ANALYTICS === */}

        {/* 🌍 Macro Dashboard - 반도체 매크로 환경 (원유/국채/VIX/달러/한국) */}
        <SectionWrapper id="macro">
          <PanelErrorBoundary panelName="Macro Dashboard">
            <MacroPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 📈 Macro Charts - 히스토리 + 전망 차트 */}
        <SectionWrapper id="macro-charts">
          <PanelErrorBoundary panelName="Macro Charts">
            <MacroChartsPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 🎯 Forecast Accuracy - 예측 vs 실제 비교 (신뢰도 검증) */}
        <SectionWrapper id="forecast-accuracy">
          <PanelErrorBoundary panelName="Forecast Accuracy">
            <ForecastAccuracyPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 🧪 Backtest - 과거 전략 검증 시뮬레이터 */}
        <SectionWrapper id="backtest">
          <PanelErrorBoundary panelName="Backtest">
            <BacktestPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 🔗 Macro-Semi Correlation Matrix - 매크로-반도체 상관관계 히트맵 */}
        <SectionWrapper id="correlation">
          <PanelErrorBoundary panelName="Correlation Matrix">
            <MacroCorrelation />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 💱 FX · Futures · Options - 환율/선물/옵션 (매크로) */}
        <SectionWrapper id="derivatives">
          <PanelErrorBoundary panelName="FX/Futures/Options">
            <DerivativesPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 💹 Stock Options & Derivatives - 종목별 실제 옵션 체인 + 관련 상품 */}
        <SectionWrapper id="stock-options">
          <PanelErrorBoundary panelName="Stock Options">
            <StockDerivativesPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 📅 OpEx Calendar - 옵션 만기 캘린더 + 매매 타이밍 */}
        <div id="opex-calendar" className="col-span-12">
          <PanelErrorBoundary panelName="OpEx Calendar">
            <OpExCalendarPanel />
          </PanelErrorBoundary>
        </div>

        {/* 🎯 Options Impact - 옵션이 현물에 미칠 영향 예측 */}
        <div id="options-impact" className="col-span-12">
          <PanelErrorBoundary panelName="Options Impact">
            <OptionsImpactPanel />
          </PanelErrorBoundary>
        </div>

        {/* 📐 Gamma Profile - 가격대별 감마 분포 + Flip Level */}
        <div id="gamma-profile" className="col-span-12">
          <PanelErrorBoundary panelName="Gamma Profile">
            <GammaProfilePanel />
          </PanelErrorBoundary>
        </div>

        {/* 🔍 Options Scanner - 전체 반도체 옵션 시장 한눈에 비교 */}
        <SectionWrapper id="options-scanner">
          <PanelErrorBoundary panelName="Options Scanner">
            <OptionsScannerPanel />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 🤖 AI Hedge Fund - 19 Agents Council */}
        <SectionWrapper id="agents">
          <PanelErrorBoundary panelName="AI Agents">
            <AgentDashboard />
          </PanelErrorBoundary>
        </SectionWrapper>

        {/* 📊 AGENT COMPARISON - 여러 종목 비교표 */}
        <div className="col-span-12">
          <PanelErrorBoundary panelName="Agent Comparison">
            <AgentComparisonTable />
          </PanelErrorBoundary>
        </div>

        {/* 🔬 AGENT DETAIL - 종목 상세 표 */}
        <div className="col-span-12"><AgentDetailTable /></div>

        {/* 🎯 Trading Signal Board - 매매 시그널 (핵심) */}
        <div className="col-span-12"><TradingSignalBoard /></div>

        {/* High-Dimensional Analysis (1D~5D) */}
        <div className="col-span-12"><HighDimensionAnalysis /></div>

        {/* Price Prediction Engine */}
        <div className="col-span-12"><PredictionDashboard /></div>

        {/* News Sentiment Analysis */}
        <div className="col-span-12"><NewsSentimentTrend /></div>

        {/* 08 · Risk Matrix */}
        <div className="col-span-12"><RiskMatrix /></div>

        {/* 09 · Portfolio */}
        <div className="col-span-12"><PortfolioProfiles /></div>

        {/* 10 · Timeline */}
        <div className="col-span-12"><CatalystTimeline /></div>

        {/* News */}
        <div className="col-span-12"><NewsFeed /></div>

        {/* Final */}
        <div className="col-span-12"><ExecutiveSummary /></div>

        {/* 💊 Data Health - 시스템 상태 모니터링 (최하단) */}
        <div className="col-span-12"><DataHealthDashboard /></div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border-bright)] px-3 sm:px-6 py-3 flex items-center justify-between text-[8px] sm:text-[10px]">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="tick">◢ EOF</span>
          <span className="dim">│</span>
          <span className="dim">DATA: FINNHUB · 15s POLLING</span>
          <span className="dim">│</span>
          <span className="dim">STORE: SUPABASE (SEOUL)</span>
          <span className="dim">│</span>
          <span className="dim">HOST: VERCEL</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="dim">NOT FINANCIAL ADVICE</span>
          <span className="tick">◤ END</span>
        </div>
      </div>

      {selectedRow && (
        <StockDrawer row={selectedRow} onClose={() => setSelectedSymbol(null)} />
      )}

      {/* 🔔 알림 센터 - 우측 하단 고정 플로팅 */}
      <NotificationCenter />

      {/* 🔍 글로벌 종목 검색 - Ctrl+K 단축키 */}
      <GlobalStockSearch />

      {/* 📍 사이드 네비 - 우측 중앙 섹션 점프 */}
      <SideNavigation />

      {/* ⚙️ 대시보드 설정 - 좌측 하단 */}
      <DashboardSettings />

      {/* 🎯 플로팅 결정 바 - 하단 항상 표시 */}
      <FloatingDecisionBar />

      {/* ⚡ 플로팅 CTA - Today's Focus 가려지면 표시 */}
      <FloatingCTA />

      {/* 🔔 푸시 알림 - 우하단 플로팅 버튼 */}
      <PushNotifications />

      {/* 📱 PWA 설치 안내 - 모바일 */}
      <PWAInstallPrompt />

      {/* ⚙️ Service Worker 등록 - PWA 활성화 */}
      <ServiceWorkerRegister />
    </div>
  );
}
