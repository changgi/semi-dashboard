-- =================================================================
-- Migration 009: Correlation Matrix + Fundamentals
-- 매크로-반도체 상관계수 시계열 + 종목 재무 정보
-- =================================================================

-- 매크로-종목 상관관계 스냅샷 (일별)
CREATE TABLE IF NOT EXISTS public.correlation_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,               -- 반도체 종목
  macro_symbol TEXT NOT NULL,         -- 매크로 심볼 (^TNX, CL=F 등)
  correlation NUMERIC NOT NULL,       -- -1 ~ +1
  period_days INTEGER NOT NULL DEFAULT 252,  -- 계산 기간
  strength TEXT NOT NULL,             -- strong, moderate, weak, negative-*
  interpretation TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT correlation_snapshots_unique UNIQUE (symbol, macro_symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_correlation_symbol
  ON public.correlation_snapshots (symbol, date DESC);

CREATE INDEX IF NOT EXISTS idx_correlation_macro
  ON public.correlation_snapshots (macro_symbol, date DESC);

-- 종목 펀더멘털 (분기별 업데이트 가능)
CREATE TABLE IF NOT EXISTS public.fundamentals (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  pe_ratio NUMERIC,                   -- 주가수익비율
  pb_ratio NUMERIC,                   -- 주가순자산비율
  dividend_yield NUMERIC,             -- 배당수익률 (%)
  revenue_growth NUMERIC,             -- 매출성장률 (%)
  profit_margin NUMERIC,              -- 순이익률 (%)
  debt_to_equity NUMERIC,             -- 부채자본비율
  roe NUMERIC,                        -- 자기자본이익률 (%)
  market_cap NUMERIC,                 -- 시가총액 (billion USD)
  shares_outstanding NUMERIC,
  eps NUMERIC,                        -- 주당순이익
  segment TEXT,                       -- fabless, memory, foundry, equipment, etf
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fundamentals_symbol_unique UNIQUE (symbol)
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_symbol
  ON public.fundamentals (symbol);

-- 반도체 종목 시드 데이터 (현재 하드코딩된 값을 DB로)
INSERT INTO public.fundamentals
  (symbol, pe_ratio, pb_ratio, dividend_yield, revenue_growth, profit_margin, debt_to_equity, roe, market_cap, segment)
VALUES
  ('NVDA', 32, 22,  0.03, 78, 52, 0.4, 115, 4800, 'fabless'),
  ('AMD',  45, 3.2, 0,    24, 11, 0.1, 8,   220,  'fabless'),
  ('AVGO', 28, 9.1, 1.2,  44, 38, 1.3, 45,  1500, 'fabless'),
  ('QCOM', 18, 6.5, 2.1,  9,  26, 0.7, 42,  200,  'fabless'),
  ('ARM',  82, 18,  0,    23, 22, 0.1, 12,  145,  'fabless'),
  ('MRVL', 38, 4.2, 0.3,  49, 15, 0.4, 11,  90,   'fabless'),
  ('TSM',  22, 6.8, 1.4,  32, 41, 0.3, 29,  900,  'foundry'),
  ('MU',   12, 2.8, 0.5,  68, 22, 0.3, 24,  130,  'memory'),
  ('ASML', 35, 20,  0.8,  28, 31, 0.3, 56,  290,  'equipment'),
  ('AMAT', 22, 9.5, 0.9,  8,  26, 0.5, 47,  170,  'equipment'),
  ('LRCX', 24, 12,  1.1,  23, 27, 0.5, 58,  130,  'equipment'),
  ('KLAC', 26, 16,  0.7,  15, 29, 0.8, 72,  100,  'equipment'),
  ('INTC', 48, 1.3, 1.5,  3,  7,  0.5, 3,   130,  'foundry'),
  ('TXN',  29, 10,  2.9, -4,  36, 0.9, 35,  170,  'fabless'),
  ('ADI',  30, 3.5, 1.8, -2,  26, 0.3, 12,  110,  'fabless'),
  ('SMH',  NULL, NULL, NULL, NULL, NULL, NULL, NULL, 25,  'etf'),
  ('SOXX', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 12,  'etf'),
  ('SMHX', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0.3, 'etf'),
  ('SOXL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8,   'etf-3x-leveraged'),
  ('SOXS', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1,   'etf-3x-inverse')
ON CONFLICT (symbol) DO UPDATE SET
  pe_ratio = EXCLUDED.pe_ratio,
  pb_ratio = EXCLUDED.pb_ratio,
  dividend_yield = EXCLUDED.dividend_yield,
  revenue_growth = EXCLUDED.revenue_growth,
  profit_margin = EXCLUDED.profit_margin,
  debt_to_equity = EXCLUDED.debt_to_equity,
  roe = EXCLUDED.roe,
  market_cap = EXCLUDED.market_cap,
  segment = EXCLUDED.segment,
  updated_at = NOW();

COMMENT ON TABLE public.correlation_snapshots IS '매크로-종목 상관계수 일별 스냅샷';
COMMENT ON TABLE public.fundamentals IS '종목 펀더멘털 데이터 (P/E, P/B, ROE, 시가총액 등)';
