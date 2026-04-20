-- ═══════════════════════════════════════════════════════════
-- Data Warehouse - 전략적 자원으로서의 데이터 축적
-- 
-- 목적:
--   - 수집: 매일 자동 스냅샷 (시세/뉴스/시그널)
--   - 누적: 시계열 데이터 장기 보관
--   - 가공: 패턴 인식 + 통계 계산
--   - 연산: 상관관계 + 승률 분석
--   - 전략: 백테스트 가능한 형태
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 1. data_snapshots: 원시 시계열 데이터 (매일 자동 누적)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- 식별자
  symbol TEXT NOT NULL,           -- "NVDA", "SMH", "^VIX" 등
  data_type TEXT NOT NULL,        -- "quote", "options", "news_sentiment", "options_flow"
  
  -- 데이터 본문 (JSON 유연성)
  raw_data JSONB NOT NULL,        -- 원시 응답 전체
  metrics JSONB,                  -- 계산된 지표 (PE, RSI, Put/Call Ratio 등)
  
  -- 메타
  source TEXT,                    -- "yahoo", "finnhub", "cboe", "rss"
  notes TEXT,
  
  CONSTRAINT data_snapshot_unique UNIQUE (captured_date, symbol, data_type)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date_symbol ON data_snapshots (captured_date DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON data_snapshots (data_type, captured_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_metrics ON data_snapshots USING GIN (metrics);

COMMENT ON TABLE data_snapshots IS '매일 자동 캡쳐되는 원시 시계열 데이터. 백테스트/패턴 분석 기반.';


-- ───────────────────────────────────────────────────────────
-- 2. research_findings: 연구 인사이트 (수동 + 자동)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- 분류
  category TEXT NOT NULL,         -- "pattern", "correlation", "event_impact", "earnings_reaction"
  symbols TEXT[] NOT NULL,        -- 관련 종목들
  
  -- 내용
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  insight TEXT NOT NULL,          -- 핵심 인사이트
  
  -- 검증 가능성
  confidence DECIMAL(3, 2),       -- 0.00 ~ 1.00
  supporting_data JSONB,          -- 증거 데이터
  
  -- 태그 검색용
  tags TEXT[],                    -- ["HBM", "FOMC", "갭업", "실적시즌"]
  
  -- 검증 결과
  is_verified BOOLEAN DEFAULT FALSE,
  verification_notes TEXT,
  
  author TEXT DEFAULT 'system'    -- 'system' or 'kyle'
);

CREATE INDEX IF NOT EXISTS idx_findings_category ON research_findings (category, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_findings_symbols ON research_findings USING GIN (symbols);
CREATE INDEX IF NOT EXISTS idx_findings_tags ON research_findings USING GIN (tags);

COMMENT ON TABLE research_findings IS '패턴/상관관계/이벤트 영향 등 투자 인사이트 아카이브';


-- ───────────────────────────────────────────────────────────
-- 3. pattern_library: 반복되는 패턴 분석
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  pattern_name TEXT UNIQUE NOT NULL,  -- "FOMC_후_1주일_반등"
  description TEXT NOT NULL,
  
  -- 조건 정의
  trigger_conditions JSONB,           -- {"event": "FOMC", "market_state": "oversold"}
  
  -- 누적 통계
  occurrences_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 2),             -- %
  avg_return DECIMAL(6, 2),           -- %
  max_return DECIMAL(6, 2),
  min_return DECIMAL(6, 2),
  
  -- 마지막 발생
  last_occurred_date DATE,
  last_result TEXT,                   -- "success" | "failure"
  
  -- 적용 가능 종목
  applicable_symbols TEXT[],
  
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_patterns_active ON pattern_library (is_active, updated_at DESC);

COMMENT ON TABLE pattern_library IS '반복되는 투자 패턴과 승률 축적';


-- ───────────────────────────────────────────────────────────
-- 4. correlation_matrix: 상관관계 축적
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS correlation_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- UNIQUE 제약용 분리 컬럼
  lookback_days INTEGER NOT NULL,     -- 30, 90, 180, 365
  
  symbol_a TEXT NOT NULL,
  symbol_b TEXT NOT NULL,
  
  correlation DECIMAL(5, 4),          -- -1.0000 ~ 1.0000
  sample_size INTEGER,
  
  -- 추가 통계
  beta DECIMAL(6, 4),                 -- symbol_a's beta vs symbol_b
  r_squared DECIMAL(5, 4),
  
  CONSTRAINT unique_correlation UNIQUE (symbol_a, symbol_b, lookback_days, computed_date)
);

CREATE INDEX IF NOT EXISTS idx_corr_symbol_a ON correlation_matrix (symbol_a, lookback_days);
CREATE INDEX IF NOT EXISTS idx_corr_symbol_b ON correlation_matrix (symbol_b, lookback_days);


-- ───────────────────────────────────────────────────────────
-- 5. earnings_reactions: 실적 후 주가 반응 축적
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earnings_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  symbol TEXT NOT NULL,
  earnings_date DATE NOT NULL,
  quarter TEXT NOT NULL,              -- "Q1 2026"
  
  -- 실적 결과
  eps_actual DECIMAL(10, 4),
  eps_estimate DECIMAL(10, 4),
  eps_surprise_pct DECIMAL(6, 2),
  revenue_actual BIGINT,
  revenue_estimate BIGINT,
  revenue_surprise_pct DECIMAL(6, 2),
  
  -- 주가 반응
  price_before_close DECIMAL(12, 4),
  price_after_open DECIMAL(12, 4),
  gap_pct DECIMAL(6, 2),
  day1_return_pct DECIMAL(6, 2),
  day5_return_pct DECIMAL(6, 2),
  day30_return_pct DECIMAL(6, 2),
  
  -- 분류
  reaction_type TEXT,                 -- "gap_up", "gap_down", "reversal", "fade"
  
  notes TEXT,
  
  CONSTRAINT unique_earnings UNIQUE (symbol, earnings_date)
);

CREATE INDEX IF NOT EXISTS idx_earnings_symbol ON earnings_reactions (symbol, earnings_date DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_reaction ON earnings_reactions (reaction_type);


-- ───────────────────────────────────────────────────────────
-- 6. market_regime_history: 시장 국면 기록
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_regime_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_date DATE UNIQUE NOT NULL,
  
  -- 지표
  vix DECIMAL(6, 2),
  vix_regime TEXT,                    -- "calm", "normal", "elevated", "panic"
  tnx DECIMAL(5, 3),                  -- 10년 국채 금리
  spy_close DECIMAL(10, 2),
  spy_200dma DECIMAL(10, 2),
  spy_regime TEXT,                    -- "bull", "bear", "consolidation"
  
  -- 섹터 분위기
  semi_sector_mood TEXT,              -- "bullish", "neutral", "bearish"
  avg_news_sentiment DECIMAL(5, 2),
  
  -- 환율
  usd_krw DECIMAL(8, 2),
  krw_regime TEXT,                    -- "strong_dollar", "weak_dollar", "normal"
  
  -- 종합 판단
  overall_regime TEXT,                -- "risk_on", "risk_off", "transition"
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_regime_date ON market_regime_history (captured_date DESC);


-- ───────────────────────────────────────────────────────────
-- 7. strategy_backtest: 전략별 백테스트 결과 축적
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_backtest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  strategy_name TEXT NOT NULL,        -- "DCA_TIGER", "RSI_oversold", "earnings_gap_fade"
  description TEXT,
  
  -- 기간
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- 성과
  total_trades INTEGER,
  win_rate DECIMAL(5, 2),
  total_return_pct DECIMAL(6, 2),
  annualized_return DECIMAL(6, 2),
  max_drawdown DECIMAL(6, 2),
  sharpe_ratio DECIMAL(5, 3),
  
  -- 세부 조건
  parameters JSONB,                   -- 전략별 파라미터
  trade_log JSONB,                    -- 개별 거래 기록
  
  -- 평가
  verdict TEXT                        -- "recommended", "neutral", "avoid"
);


-- ═══════════════════════════════════════════════════════════
-- 자동 갱신 트리거 (updated_at)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pattern_updated_at ON pattern_library;
CREATE TRIGGER set_pattern_updated_at
BEFORE UPDATE ON pattern_library
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ═══════════════════════════════════════════════════════════
-- 시드 데이터: 카일님 반도체 투자에 유용한 기본 패턴
-- ═══════════════════════════════════════════════════════════
INSERT INTO pattern_library (pattern_name, description, trigger_conditions, applicable_symbols, is_active)
VALUES 
  (
    'FOMC_전일_방어_매수',
    'FOMC 당일 -1일 장 마감 후 VIX 급등 시 SPY/QQQ 저가매수 기회',
    '{"event": "FOMC_minus_1", "vix_change": ">5%", "market_close": "weak"}',
    ARRAY['SPY', 'QQQ', '360750.KS'],
    TRUE
  ),
  (
    'TSM_실적Beat_반도체_상승',
    'TSMC Q별 실적 Beat 후 1주일 내 SMH/SOXX 평균 +3% 상승 경향',
    '{"event": "TSM_earnings_beat", "lookback": "7d"}',
    ARRAY['SMH', 'SOXX', 'NVDA', 'AVGO'],
    TRUE
  ),
  (
    '삼성전자_실적후_미반도체_연동',
    '삼성전자 실적 발표 후 다음날 미국 반도체 ETF 동반 움직임 (약 65% 상관)',
    '{"event": "005930_earnings", "lookback": "1d"}',
    ARRAY['SMH', 'SOXX', '091160.KS'],
    TRUE
  ),
  (
    'VIX_25_돌파_반등',
    'VIX 25 이상 돌파 후 평균 2주 내 SPY +5% 반등 경향',
    '{"vix_threshold": 25, "direction": "up"}',
    ARRAY['SPY', 'QQQ', '360750.KS'],
    TRUE
  ),
  (
    '환율_1500_돌파_환차익_실현',
    'USD/KRW 1500원 돌파 시 해외자산 부분 환전 유리',
    '{"fx_threshold": 1500, "direction": "up"}',
    ARRAY['360750.KS', 'SMH'],
    TRUE
  )
ON CONFLICT (pattern_name) DO NOTHING;


-- ═══════════════════════════════════════════════════════════
-- 시드: 주요 상관관계 (수동 입력)
-- ═══════════════════════════════════════════════════════════
-- 반도체 유니버스 기본 상관관계는 cron이 매일 업데이트
