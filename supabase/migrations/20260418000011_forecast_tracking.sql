-- =================================================================
-- Migration 011: Macro Forecast Tracking
-- 매크로 전망 스냅샷 및 실제값 비교 분석
-- =================================================================

-- 매크로 예측 스냅샷 (매일 저장)
CREATE TABLE IF NOT EXISTS public.macro_forecasts (
  id BIGSERIAL PRIMARY KEY,
  forecast_date DATE NOT NULL,         -- 예측을 수행한 날짜
  symbol TEXT NOT NULL,                -- 매크로 심볼
  current_value NUMERIC NOT NULL,      -- 예측 시점의 실제값
  target_date DATE NOT NULL,           -- 예측 대상 날짜
  horizon_days INTEGER NOT NULL,       -- 예측 기간 (일)
  forecast_value NUMERIC NOT NULL,     -- 예측값
  upper_band NUMERIC NOT NULL,         -- 80% 신뢰 상단
  lower_band NUMERIC NOT NULL,         -- 80% 신뢰 하단
  model_name TEXT NOT NULL DEFAULT 'ornstein-uhlenbeck',
  long_run_mean NUMERIC,               -- 당시 사용한 장기평균
  reversion_speed NUMERIC,             -- 당시 κ 값
  volatility NUMERIC,                  -- 당시 σ 값
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT forecasts_unique UNIQUE (forecast_date, symbol, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_symbol_target 
  ON public.macro_forecasts (symbol, target_date);
CREATE INDEX IF NOT EXISTS idx_forecasts_symbol_forecast
  ON public.macro_forecasts (symbol, forecast_date DESC);

-- 예측 정확도 평가 (실제값 도달 시 계산)
CREATE TABLE IF NOT EXISTS public.forecast_accuracy (
  id BIGSERIAL PRIMARY KEY,
  forecast_id BIGINT REFERENCES public.macro_forecasts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  forecast_date DATE NOT NULL,
  target_date DATE NOT NULL,
  horizon_days INTEGER NOT NULL,
  forecast_value NUMERIC NOT NULL,
  actual_value NUMERIC NOT NULL,
  upper_band NUMERIC NOT NULL,
  lower_band NUMERIC NOT NULL,
  -- 정확도 지표
  absolute_error NUMERIC NOT NULL,      -- |forecast - actual|
  percent_error NUMERIC NOT NULL,       -- (forecast - actual) / actual × 100
  absolute_percent_error NUMERIC NOT NULL,  -- |percent_error|
  in_confidence_band BOOLEAN NOT NULL,  -- 80% 신뢰구간 안에 들어왔나?
  direction_correct BOOLEAN,            -- 방향 예측 맞았나? (상승/하락)
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accuracy_symbol ON public.forecast_accuracy (symbol, target_date DESC);

-- 일별 예측 성능 집계 뷰
CREATE OR REPLACE VIEW public.forecast_performance_summary AS
SELECT
  symbol,
  horizon_days,
  COUNT(*) AS evaluation_count,
  ROUND(AVG(absolute_error)::NUMERIC, 4) AS mae,               -- 평균 절대 오차
  ROUND(AVG(absolute_percent_error)::NUMERIC, 2) AS mape,      -- 평균 절대 백분율 오차 (%)
  ROUND(SQRT(AVG(POWER(absolute_error, 2)))::NUMERIC, 4) AS rmse,  -- RMSE
  ROUND(AVG(percent_error)::NUMERIC, 2) AS bias_pct,           -- 평균 편향 (+면 과대추정)
  ROUND((COUNT(CASE WHEN in_confidence_band THEN 1 END)::NUMERIC / COUNT(*) * 100), 1) AS coverage_pct,  -- 신뢰구간 포함률 (80%이면 완벽)
  ROUND((COUNT(CASE WHEN direction_correct THEN 1 END)::NUMERIC / NULLIF(COUNT(CASE WHEN direction_correct IS NOT NULL THEN 1 END), 0) * 100), 1) AS direction_accuracy_pct  -- 방향 적중률
FROM public.forecast_accuracy
GROUP BY symbol, horizon_days
ORDER BY symbol, horizon_days;

COMMENT ON TABLE public.macro_forecasts IS '매일 저장되는 매크로 예측 스냅샷';
COMMENT ON TABLE public.forecast_accuracy IS '예측 vs 실제 비교 결과';
COMMENT ON VIEW public.forecast_performance_summary IS '예측 모델 성능 집계 (MAE, RMSE, MAPE, 신뢰구간 포함률, 방향 적중률)';
