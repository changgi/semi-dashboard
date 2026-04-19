-- =================================================================
-- Migration 012: Portfolio Tracking
-- 사용자 포트폴리오 추적 (브라우저 로컬 저장으로도 가능하지만 서버 백업)
-- =================================================================

-- 포트폴리오 보유 종목
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT,
  shares NUMERIC NOT NULL CHECK (shares > 0),
  avg_cost NUMERIC NOT NULL CHECK (avg_cost > 0),  -- 평균 매수가
  currency TEXT NOT NULL DEFAULT 'USD',             -- USD, KRW
  purchase_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,           -- 매도 시 false
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON public.portfolio_holdings (symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_active ON public.portfolio_holdings (is_active) WHERE is_active = true;

-- 매매 이력 (편차 기록용)
CREATE TABLE IF NOT EXISTS public.portfolio_trades (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'dividend')),
  shares NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  trade_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_date ON public.portfolio_trades (symbol, trade_date DESC);

COMMENT ON TABLE public.portfolio_holdings IS '사용자 현재 보유 종목';
COMMENT ON TABLE public.portfolio_trades IS '매매 이력 (수익률 계산용)';
