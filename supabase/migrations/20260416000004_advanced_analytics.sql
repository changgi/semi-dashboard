-- ============================================================
-- MIGRATION 004: Advanced Analytics Tables
-- ============================================================

-- 1. 뉴스 감성 분석 컬럼 추가
ALTER TABLE public.news 
  ADD COLUMN IF NOT EXISTS sentiment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sentiment_label text DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS keywords text[];

CREATE INDEX IF NOT EXISTS idx_news_sentiment ON public.news(sentiment);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_label ON public.news(sentiment_label);

-- 2. 뉴스 감성 일별 집계 (빠른 조회용)
CREATE TABLE IF NOT EXISTS public.news_sentiment_daily (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol text NOT NULL,
  date date NOT NULL,
  avg_sentiment numeric DEFAULT 0,
  positive_count integer DEFAULT 0,
  negative_count integer DEFAULT 0,
  neutral_count integer DEFAULT 0,
  total_count integer DEFAULT 0,
  top_keywords text[],
  created_at timestamptz DEFAULT now(),
  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_nsd_symbol_date ON public.news_sentiment_daily(symbol, date DESC);

ALTER TABLE public.news_sentiment_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nsd_read_all" ON public.news_sentiment_daily FOR SELECT USING (true);

-- 3. 가격 예측 테이블
CREATE TABLE IF NOT EXISTS public.predictions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol text NOT NULL REFERENCES public.tickers(symbol) ON DELETE CASCADE,
  horizon text NOT NULL, -- '1d','3d','7d','30d','90d','180d','365d','1095d','1825d'
  predicted_price numeric NOT NULL,
  confidence_low numeric,
  confidence_high numeric,
  confidence_pct numeric DEFAULT 50,
  method text DEFAULT 'ensemble', -- 'momentum','regression','mean_reversion','ensemble'
  current_price numeric,
  predicted_change_pct numeric,
  computed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON public.predictions(symbol, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_horizon ON public.predictions(symbol, horizon);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions_read_all" ON public.predictions FOR SELECT USING (true);

-- 4. 고차원 분석 스냅샷 (일별)
CREATE TABLE IF NOT EXISTS public.analysis_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol text NOT NULL REFERENCES public.tickers(symbol) ON DELETE CASCADE,
  date date NOT NULL,
  -- 1D: 가격
  price numeric,
  change_pct numeric,
  -- 2D: 가격 + 거래량
  volume bigint,
  volume_ratio numeric, -- vs 20일 평균
  -- 3D: + 변동성
  volatility_20d numeric,
  atr_14d numeric,
  -- 4D: + 모멘텀
  rsi_14d numeric,
  macd numeric,
  macd_signal numeric,
  sma_20 numeric,
  sma_50 numeric,
  ema_12 numeric,
  ema_26 numeric,
  -- 5D: + 섹터 상관관계
  sector_correlation numeric,
  sector_beta numeric,
  relative_strength numeric,
  -- 뉴스 감성
  news_sentiment_7d numeric,
  news_count_7d integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_analysis_symbol_date ON public.analysis_snapshots(symbol, date DESC);

ALTER TABLE public.analysis_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analysis_read_all" ON public.analysis_snapshots FOR SELECT USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_snapshots;
