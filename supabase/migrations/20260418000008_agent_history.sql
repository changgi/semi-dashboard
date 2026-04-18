-- =================================================================
-- Migration 008: Agent Opinions & Portfolio Decisions
-- 19 에이전트의 시계열 판단 기록 + Portfolio Manager 최종 판단
-- =================================================================

-- 개별 에이전트 의견
CREATE TABLE IF NOT EXISTS public.agent_opinions (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  agent TEXT NOT NULL,           -- 에이전트 영문명 (Warren Buffett, Daniel Yoo, ...)
  agent_kr TEXT NOT NULL,        -- 한글명
  category TEXT NOT NULL,        -- 'legendary' | 'specialist'
  vote TEXT NOT NULL,            -- STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
  score INTEGER NOT NULL,        -- -100 ~ +100
  confidence INTEGER NOT NULL,   -- 0 ~ 100
  reasoning TEXT,                -- 판단 근거
  icon TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_opinions_symbol_ts
  ON public.agent_opinions (symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_opinions_agent_ts
  ON public.agent_opinions (agent, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_opinions_symbol_agent_ts
  ON public.agent_opinions (symbol, agent, timestamp DESC);

-- Portfolio Manager 최종 판단 (집계)
CREATE TABLE IF NOT EXISTS public.portfolio_decisions (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  final_vote TEXT NOT NULL,
  final_score INTEGER NOT NULL,
  agreement_level INTEGER NOT NULL,  -- 0-100% 합의 수준
  confidence INTEGER NOT NULL,
  strong_buy_count INTEGER NOT NULL DEFAULT 0,
  buy_count INTEGER NOT NULL DEFAULT 0,
  hold_count INTEGER NOT NULL DEFAULT 0,
  sell_count INTEGER NOT NULL DEFAULT 0,
  strong_sell_count INTEGER NOT NULL DEFAULT 0,
  bullish_agents TEXT[],             -- 매수 진영
  bearish_agents TEXT[],             -- 매도 진영
  key_reasoning TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_decisions_symbol_ts
  ON public.portfolio_decisions (symbol, timestamp DESC);

-- 에이전트 판단 일별 집계 뷰 (변화 추이 차트용)
CREATE OR REPLACE VIEW public.agent_opinions_daily AS
SELECT
  symbol,
  agent,
  agent_kr,
  category,
  DATE(timestamp) AS date,
  AVG(score)::INTEGER AS avg_score,
  MIN(score) AS min_score,
  MAX(score) AS max_score,
  COUNT(*) AS sample_count,
  MODE() WITHIN GROUP (ORDER BY vote) AS dominant_vote
FROM public.agent_opinions
GROUP BY symbol, agent, agent_kr, category, DATE(timestamp)
ORDER BY date DESC;

-- Portfolio Manager 일별 판단 변화
CREATE OR REPLACE VIEW public.portfolio_decisions_daily AS
SELECT
  symbol,
  DATE(timestamp) AS date,
  AVG(final_score)::INTEGER AS avg_score,
  AVG(agreement_level)::INTEGER AS avg_agreement,
  MODE() WITHIN GROUP (ORDER BY final_vote) AS dominant_vote,
  COUNT(*) AS sample_count,
  MAX(timestamp) AS last_updated
FROM public.portfolio_decisions
GROUP BY symbol, DATE(timestamp)
ORDER BY date DESC;

COMMENT ON TABLE public.agent_opinions IS '19 에이전트 개별 의견 시계열';
COMMENT ON TABLE public.portfolio_decisions IS 'Portfolio Manager 종합 판단 시계열';
