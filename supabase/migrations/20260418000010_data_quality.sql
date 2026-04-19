-- =================================================================
-- Migration 010: Data Quality & Automation Metrics
-- 데이터 수집/처리 품질 모니터링
-- =================================================================

-- 데이터 품질 메트릭 (일별)
CREATE TABLE IF NOT EXISTS public.data_quality_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  metric_name TEXT NOT NULL,            -- 'price_coverage', 'news_volume' 등
  metric_value NUMERIC NOT NULL,
  threshold_warning NUMERIC,
  threshold_critical NUMERIC,
  status TEXT NOT NULL,                 -- 'ok', 'warning', 'critical'
  details JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT data_quality_unique UNIQUE (date, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_data_quality_date
  ON public.data_quality_daily (date DESC);

-- Cron 실행 기록 확장 (기존 fetch_log를 계승)
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_ts
  ON public.cron_runs (job_name, started_at DESC);

-- 시스템 헬스 상태 (가장 최근 실행 요약)
CREATE OR REPLACE VIEW public.system_health AS
WITH latest_runs AS (
  SELECT DISTINCT ON (job_name)
    job_name,
    started_at,
    completed_at,
    duration_ms,
    success,
    records_processed,
    error_message
  FROM public.cron_runs
  ORDER BY job_name, started_at DESC
)
SELECT
  job_name,
  started_at AS last_run,
  success AS last_success,
  records_processed AS last_count,
  duration_ms AS last_duration_ms,
  error_message AS last_error,
  EXTRACT(EPOCH FROM (NOW() - started_at))/60 AS minutes_since_last_run,
  CASE
    WHEN NOT success THEN 'failing'
    WHEN EXTRACT(EPOCH FROM (NOW() - started_at)) > 3600 THEN 'stale'
    WHEN EXTRACT(EPOCH FROM (NOW() - started_at)) > 1800 THEN 'delayed'
    ELSE 'healthy'
  END AS status
FROM latest_runs;

-- 종목별 데이터 완결성
CREATE OR REPLACE VIEW public.symbol_data_completeness AS
SELECT
  t.symbol,
  -- 가격 데이터
  (SELECT COUNT(*) FROM public.price_history WHERE symbol = t.symbol AND interval_type = '1day') AS daily_bars,
  (SELECT MIN(timestamp) FROM public.price_history WHERE symbol = t.symbol AND interval_type = '1day') AS daily_first,
  (SELECT MAX(timestamp) FROM public.price_history WHERE symbol = t.symbol AND interval_type = '1day') AS daily_last,
  -- 분석 스냅샷
  (SELECT COUNT(*) FROM public.analysis_snapshots WHERE symbol = t.symbol) AS analysis_count,
  (SELECT MAX(date) FROM public.analysis_snapshots WHERE symbol = t.symbol) AS analysis_last,
  -- 예측
  (SELECT COUNT(*) FROM public.predictions WHERE symbol = t.symbol) AS prediction_count,
  -- 신호
  (SELECT COUNT(*) FROM public.trading_signals WHERE symbol = t.symbol) AS signal_count,
  -- 에이전트
  (SELECT COUNT(*) FROM public.agent_opinions WHERE symbol = t.symbol) AS agent_opinion_count,
  -- 펀더멘털
  (SELECT CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END FROM public.fundamentals WHERE symbol = t.symbol) AS has_fundamentals
FROM public.tickers t
ORDER BY t.symbol;

COMMENT ON TABLE public.data_quality_daily IS '일별 데이터 품질 메트릭 (coverage, freshness 등)';
COMMENT ON TABLE public.cron_runs IS 'cron 작업 실행 이력 (확장 로그)';
