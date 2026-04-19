-- ============================================================
-- MIGRATION 005: Trading Signals Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trading_signals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol text NOT NULL REFERENCES public.tickers(symbol) ON DELETE CASCADE,
  signal text NOT NULL, -- STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
  score numeric NOT NULL, -- -100 ~ +100
  confidence numeric DEFAULT 50,
  current_price numeric,
  -- 매수 시나리오
  buy_entry numeric,
  buy_target_1 numeric,
  buy_target_2 numeric,
  buy_stop_loss numeric,
  buy_risk_reward numeric,
  -- 매도 시나리오
  sell_entry numeric,
  sell_target numeric,
  sell_stop_loss numeric,
  -- 메타
  reasons text[],
  timeframe text DEFAULT 'MEDIUM',
  -- 지표 스냅샷
  rsi numeric,
  macd numeric,
  sma_20 numeric,
  sma_50 numeric,
  bb_position numeric,
  trend text,
  computed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol ON public.trading_signals(symbol, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_signal ON public.trading_signals(signal);

ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signals_read_all" ON public.trading_signals FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_signals;
