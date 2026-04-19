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
import { HotActionsBar } from "@/components/HotActionsBar";
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
      <HotActionsBar />
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
    </div>
  );
}
