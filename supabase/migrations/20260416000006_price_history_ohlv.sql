-- ============================================================
-- MIGRATION 006: price_history 확장 (OHLV + unique constraint)
-- 백필된 과거 데이터를 저장하기 위함
-- ============================================================

-- 1. OHLV 컬럼 추가
ALTER TABLE public.price_history 
  ADD COLUMN IF NOT EXISTS day_high numeric,
  ADD COLUMN IF NOT EXISTS day_low numeric,
  ADD COLUMN IF NOT EXISTS volume bigint;

-- 2. 기존 중복 데이터 제거 (있을 경우)
-- symbol + timestamp 기준으로 중복 중 가장 최근 id만 남김
DELETE FROM public.price_history a
USING public.price_history b
WHERE a.id < b.id
  AND a.symbol = b.symbol
  AND a.timestamp = b.timestamp;

-- 3. 고유 제약 추가 (upsert용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'price_history_symbol_timestamp_key'
  ) THEN
    ALTER TABLE public.price_history
      ADD CONSTRAINT price_history_symbol_timestamp_key
      UNIQUE (symbol, timestamp);
  END IF;
END $$;
