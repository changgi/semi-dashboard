-- ═══════════════════════════════════════════════════════════
-- Investment Journal & Performance Tracking
-- 
-- 목적:
--   - 매일 주요 시그널과 결정을 자동 기록
--   - 시간 경과 후 실제 결과 자동 검증
--   - 승률/ROI 통계 추적
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 일일 시그널 스냅샷 (매일 아침 자동 저장)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_daily_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  
  -- 시장 상태
  vix NUMERIC(6,2),
  tnx NUMERIC(5,3),
  usd_krw NUMERIC(8,2),
  spy_price NUMERIC(10,2),
  qqq_price NUMERIC(10,2),
  
  -- 오늘의 결정 (Daily Briefing)
  today_action TEXT,              -- buy/sell/hold/hedge
  today_confidence INT,
  today_headline TEXT,
  
  -- 포트폴리오 스냅샷
  portfolio_value_usd NUMERIC(12,2),
  portfolio_gain_pct NUMERIC(6,2),
  position_count INT,
  risk_score INT,
  
  -- 섹터 센티먼트
  sector_direction TEXT,           -- bullish/bearish/neutral
  sector_avg_score INT,
  bullish_count INT,
  bearish_count INT,
  
  -- 주요 시그널 (JSON)
  key_signals JSONB,               -- [{symbol, direction, confidence, reason}]
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_snapshots_date ON journal_daily_snapshots(snapshot_date DESC);


-- ───────────────────────────────────────────────────────────
-- 개별 시그널 추적 (매수/매도 시그널의 실제 결과 검증)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_signal_tracking (
  id BIGSERIAL PRIMARY KEY,
  
  -- 시그널 생성 시점
  signal_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  
  -- 시그널 내용
  direction TEXT NOT NULL,        -- up/down/neutral
  action TEXT NOT NULL,           -- buy/sell/hedge/wait
  confidence INT NOT NULL,
  source TEXT NOT NULL,           -- sector_scanner, unified_insight, options_impact
  reason TEXT,
  
  -- 시그널 생성 시점 데이터
  entry_price NUMERIC(10,2) NOT NULL,
  target_price NUMERIC(10,2),
  stop_loss NUMERIC(10,2),
  take_profit NUMERIC(10,2),
  
  -- 시간 경과 후 실제 결과 (1일, 7일, 30일 후)
  price_1d NUMERIC(10,2),
  price_7d NUMERIC(10,2),
  price_30d NUMERIC(10,2),
  
  -- 적중 여부 (자동 계산)
  hit_1d BOOLEAN,
  hit_7d BOOLEAN,
  hit_30d BOOLEAN,
  max_gain_pct NUMERIC(6,2),       -- 30일 내 최대 상승
  max_loss_pct NUMERIC(6,2),       -- 30일 내 최대 하락
  
  -- 검증 상태
  verification_status TEXT DEFAULT 'pending', -- pending/verified/expired
  verified_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_signals_date ON journal_signal_tracking(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_signals_symbol ON journal_signal_tracking(symbol);
CREATE INDEX IF NOT EXISTS idx_journal_signals_status ON journal_signal_tracking(verification_status);


-- ───────────────────────────────────────────────────────────
-- 매매 실행 로그 (사용자가 실제 매매한 기록)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_trades (
  id BIGSERIAL PRIMARY KEY,
  
  trade_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,            -- buy/sell
  shares NUMERIC(12,4) NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- 연결된 시그널 (있으면)
  linked_signal_id BIGINT REFERENCES journal_signal_tracking(id),
  
  -- 매매 근거
  rationale TEXT,
  
  -- 감정/심리 기록 (옵션)
  emotion TEXT,                    -- confident/anxious/fomo/greedy
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_trades_date ON journal_trades(trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_trades_symbol ON journal_trades(symbol);


-- ───────────────────────────────────────────────────────────
-- 주간 복기 리포트 (주 1회 자동 생성)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_weekly_reviews (
  id BIGSERIAL PRIMARY KEY,
  
  week_start DATE NOT NULL UNIQUE,  -- 월요일
  week_end DATE NOT NULL,
  
  -- 주간 실적
  portfolio_start_value NUMERIC(12,2),
  portfolio_end_value NUMERIC(12,2),
  portfolio_weekly_return_pct NUMERIC(6,2),
  
  -- 시그널 통계
  signals_generated INT DEFAULT 0,
  signals_correct INT DEFAULT 0,
  accuracy_pct NUMERIC(5,2),
  
  -- 핵심 인사이트 (AI 생성)
  key_insights JSONB,              -- [{insight, confidence}]
  
  -- 개선 제안
  recommendations JSONB,            -- [{area, suggestion}]
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ───────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ───────────────────────────────────────────────────────────
ALTER TABLE journal_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_signal_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON journal_daily_snapshots FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON journal_signal_tracking FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON journal_trades FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON journal_weekly_reviews FOR ALL USING (true);


-- ───────────────────────────────────────────────────────────
-- 샘플 데이터 (테스트용)
-- ───────────────────────────────────────────────────────────
-- INSERT INTO journal_daily_snapshots (snapshot_date, vix, today_action, today_confidence, portfolio_value_usd, portfolio_gain_pct, sector_direction)
-- VALUES (CURRENT_DATE, 19.4, 'hold', 55, 1784, 6.85, 'bearish');
