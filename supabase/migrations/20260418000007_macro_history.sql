-- =================================================================
-- Migration 007: Macro History
-- 매크로 지표(원유/국채/VIX/달러/지수)의 시계열 저장
-- =================================================================

CREATE TABLE IF NOT EXISTS public.macro_history (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,       -- oil, bond, vol, fx, index, semi, korea
  price NUMERIC NOT NULL,
  change_value NUMERIC,
  change_pct NUMERIC,
  prev_close NUMERIC,
  day_high NUMERIC,
  day_low NUMERIC,
  volume BIGINT,
  market_state TEXT,
  currency TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT macro_history_symbol_ts_unique UNIQUE (symbol, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_macro_history_symbol_ts
  ON public.macro_history (symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_macro_history_category_ts
  ON public.macro_history (category, timestamp DESC);

-- 일별 집계 뷰 (차트용)
CREATE OR REPLACE VIEW public.macro_daily AS
SELECT
  symbol,
  name,
  category,
  DATE(timestamp) AS date,
  (ARRAY_AGG(price ORDER BY timestamp ASC))[1] AS open,
  MAX(price) AS high,
  MIN(price) AS low,
  (ARRAY_AGG(price ORDER BY timestamp DESC))[1] AS close,
  AVG(volume)::BIGINT AS avg_volume,
  COUNT(*) AS tick_count
FROM public.macro_history
GROUP BY symbol, name, category, DATE(timestamp)
ORDER BY date DESC;

-- 자동 정리: 6개월 이상된 분봉 데이터 삭제 (일별 집계는 보존)
-- 실제 삭제는 cron에서 실행 (이 함수는 수동용)
CREATE OR REPLACE FUNCTION public.cleanup_old_macro_ticks(retention_days INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.macro_history
  WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.macro_history IS '매크로 지표 실시간 시계열 (원유/국채/VIX/달러/지수 등)';
