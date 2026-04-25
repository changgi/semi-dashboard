-- ============================================================
-- Migration: ORCL Inflection Thesis Tracker
-- Date: 2026-04-24
-- Version: v8.10
-- ============================================================
--
-- 목적:
--   카일님의 ORCL 장기 테제 검증을 위한 신호 누적 추적
--   불(Bull) 시그널 + 베어(Bear) 시그널을 동등하게 기록해
--   미래 시점에 어느 쪽이 옳았는지 사후 검증 가능
--
-- 카일 테제 (2026-04-24):
--   "AI 인프라(반도체·전력) 완성 → 데이터 활용 단계
--    → 누적 데이터 강자인 ORCL이 빛나는 변곡점 도래"
--
-- 검증 가설:
--   H_BULL: 위 시나리오가 18개월 내 실현된다
--   H_BEAR: SW는 OpenAI/Anthropic이 잠식, ORCL 변곡점 안 옴
--
-- 이 두 가설의 누적 증거를 기록하고, 매일 변곡점 점수를 산출해
-- 시계열로 보존한다. 미래에 ORCL +65% 도달 또는 -50% 추가 하락
-- 시점에 "당시 어떤 신호가 있었는지" 회고 가능.
-- ============================================================

-- 1. 테제 기록 테이블 (카일님이 직접 수정/추가하는 테제)
CREATE TABLE IF NOT EXISTS public.investment_theses (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  thesis_text     TEXT NOT NULL,
  thesis_type     TEXT NOT NULL CHECK (thesis_type IN ('bull', 'bear')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      TEXT DEFAULT 'kyle',
  invalidated_at  TIMESTAMPTZ,             -- 테제 폐기 시점
  invalidated_reason TEXT,
  is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_theses_symbol ON public.investment_theses(symbol);
CREATE INDEX IF NOT EXISTS idx_theses_active ON public.investment_theses(is_active);

-- 2. 신호 카탈로그 (불/베어 시그널 마스터 정의)
CREATE TABLE IF NOT EXISTS public.thesis_signals_catalog (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  signal_key      TEXT NOT NULL UNIQUE,
  signal_name     TEXT NOT NULL,
  signal_type     TEXT NOT NULL CHECK (signal_type IN ('bull', 'bear')),
  stage           TEXT NOT NULL,           -- 'infra' | 'transition' | 'market' | 'price'
  weight          INTEGER NOT NULL DEFAULT 1,
  data_source     TEXT,                    -- 'yahoo', 'manual', 'news', 'earnings'
  threshold_text  TEXT,                    -- 충족 조건 자연어 설명
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 신호 관측 기록 (매일 cron이 채움)
CREATE TABLE IF NOT EXISTS public.thesis_signal_observations (
  id              BIGSERIAL PRIMARY KEY,
  signal_key      TEXT NOT NULL REFERENCES public.thesis_signals_catalog(signal_key),
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_value  NUMERIC,
  is_triggered    BOOLEAN NOT NULL,        -- 신호 충족 여부
  evidence_text   TEXT,                    -- 근거 (수치 + 출처)
  raw_data        JSONB                    -- 원본 데이터 보존 (감사 가능)
);

CREATE INDEX IF NOT EXISTS idx_obs_signal_time
  ON public.thesis_signal_observations(signal_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_triggered
  ON public.thesis_signal_observations(is_triggered, observed_at DESC);

-- 4. 일일 변곡점 점수 (시계열 보존)
CREATE TABLE IF NOT EXISTS public.thesis_daily_scores (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bull_score      NUMERIC NOT NULL,        -- 0-100
  bear_score      NUMERIC NOT NULL,        -- 0-100
  net_score       NUMERIC NOT NULL,        -- bull - bear (-100 to +100)
  
  -- 단계별 점수 (Bull)
  bull_infra      NUMERIC DEFAULT 0,       -- Stage 1: 인프라 완성 신호
  bull_transition NUMERIC DEFAULT 0,       -- Stage 2: 데이터 활용 전환
  bull_market     NUMERIC DEFAULT 0,       -- Stage 3: 시장 인식 변화
  bull_price      NUMERIC DEFAULT 0,       -- Stage 4: 가격 모멘텀
  
  -- 단계별 점수 (Bear)
  bear_competition NUMERIC DEFAULT 0,      -- AI 신생기업 잠식
  bear_fundamentals NUMERIC DEFAULT 0,     -- ORCL 기업 펀더멘털 악화
  bear_macro       NUMERIC DEFAULT 0,      -- 거시 환경 비우호
  bear_price       NUMERIC DEFAULT 0,      -- 가격 약세 지속
  
  -- 메타데이터
  triggered_signals JSONB,                 -- 그날 켜진 신호 목록 (검증용)
  position_value   NUMERIC,                -- 그날 ORCL+ORCX 평가액
  position_pnl_pct NUMERIC                 -- 그날 손익률
);

CREATE INDEX IF NOT EXISTS idx_daily_scores_symbol_time
  ON public.thesis_daily_scores(symbol, computed_at DESC);

-- 5. 사후 검증 기록 (미래에 카일님이 회고 작성)
CREATE TABLE IF NOT EXISTS public.thesis_postmortem (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  reviewed_at     TIMESTAMPTZ DEFAULT NOW(),
  reference_date  DATE NOT NULL,           -- 회고 기준 시점
  outcome         TEXT NOT NULL CHECK (outcome IN ('bull_won', 'bear_won', 'neither', 'pending')),
  actual_pnl_pct  NUMERIC,                 -- 실제 손익
  lessons_learned TEXT,                    -- 카일님이 직접 작성
  signals_correct JSONB,                   -- 옳았던 신호들
  signals_wrong   JSONB                    -- 틀렸던 신호들
);

-- 6. ORCL 시그널 카탈로그 시드 데이터 (Bull)
INSERT INTO public.thesis_signals_catalog (symbol, signal_key, signal_name, signal_type, stage, weight, data_source, threshold_text) VALUES
  -- Bull · Stage 1: 인프라 완성 신호
  ('ORCL', 'orcl_bull_nvda_revenue_decel', 'NVIDIA 매출 성장률 둔화', 'bull', 'infra', 8, 'earnings', '분기 매출 YoY 성장률 50%↓'),
  ('ORCL', 'orcl_bull_hbm_normalize',      'HBM 공급 정상화',         'bull', 'infra', 5, 'news',     'HBM 부족 키워드 빈도 30%↓'),
  ('ORCL', 'orcl_bull_capex_peak',         'Hyperscaler capex 정점', 'bull', 'infra', 7, 'manual',   'MSFT/META/GOOGL/AMZN capex 가이던스 하향'),
  ('ORCL', 'orcl_bull_power_normalize',    '데이터센터 전력 신청 둔화', 'bull', 'infra', 5, 'manual',   '미국 신규 전력 신청 건수 6개월 평균 ↓'),

  -- Bull · Stage 2: 데이터 활용 전환 신호 (가장 중요)
  ('ORCL', 'orcl_bull_oci_accel',          'OCI 매출 가속',           'bull', 'transition', 12, 'earnings', '분기 OCI 성장률 전기 대비 +5%p'),
  ('ORCL', 'orcl_bull_ai_db_revenue',      'AI Database 매출 공시',   'bull', 'transition', 10, 'earnings', 'ORCL 별도 라인 아이템 등장'),
  ('ORCL', 'orcl_bull_multicloud_deals',   'MultiCloud 계약 폭증',    'bull', 'transition', 8,  'news',     '월 5건+ MultiCloud 사례'),
  ('ORCL', 'orcl_bull_ellison_tone',       'Ellison 톤 변화',         'bull', 'transition', 5,  'manual',   '실적 콜에서 application/outcome 키워드 ↑'),

  -- Bull · Stage 3: 시장 인식 변화
  ('ORCL', 'orcl_bull_pe_rerate',          'PER 재평가',              'bull', 'market', 8, 'yahoo', 'PER 25배+ 도달'),
  ('ORCL', 'orcl_bull_eps_upgrade',        '컨센서스 EPS 상향',        'bull', 'market', 7, 'manual', '6개월 연속 컨센서스 상향'),
  ('ORCL', 'orcl_bull_inst_buying',        '기관 신규 매수',          'bull', 'market', 6, '13f',   '13F 신규 진입 5+ 기관'),
  ('ORCL', 'orcl_bull_relative_strength',  'ORCL/SOXX 상대 강도',     'bull', 'market', 4, 'yahoo', '20일 RS 상승 전환'),

  -- Bull · Stage 4: 가격 모멘텀
  ('ORCL', 'orcl_bull_price_above_sma200', 'SMA200 돌파',            'bull', 'price', 5, 'yahoo', '종가 > SMA200'),
  ('ORCL', 'orcl_bull_momentum20d',        '20일 모멘텀 양전환',       'bull', 'price', 4, 'yahoo', '20일 수익률 +5%↑'),
  ('ORCL', 'orcl_bull_volume_breakout',    '거래량 돌파',             'bull', 'price', 3, 'yahoo', '20일 평균 대비 거래량 1.5배+'),

-- 7. ORCL 시그널 카탈로그 (Bear)
  -- Bear · 경쟁 위협
  ('ORCL', 'orcl_bear_openai_db_launch',   'OpenAI 데이터 서비스 출시', 'bear', 'competition', 12, 'news', 'OpenAI/Anthropic 엔터프라이즈 DB 진출'),
  ('ORCL', 'orcl_bear_snowflake_growth',   'Snowflake 등 경쟁사 성장', 'bear', 'competition', 8, 'earnings', 'SNOW/DBX 분기 매출 성장 50%+'),
  ('ORCL', 'orcl_bear_aws_db_dominance',   'AWS DB 점유율 확대',       'bear', 'competition', 7, 'manual', 'RDS/Aurora 점유율 ↑'),
  ('ORCL', 'orcl_bear_open_source',        '오픈소스 DB 채택 확산',    'bear', 'competition', 5, 'news', 'Postgres/MongoDB 엔터프라이즈 채택 ↑'),

  -- Bear · 펀더멘털
  ('ORCL', 'orcl_bear_oci_decel',          'OCI 매출 둔화',           'bear', 'fundamentals', 10, 'earnings', '분기 OCI 성장률 -5%p'),
  ('ORCL', 'orcl_bear_legacy_decline',     '레거시 DB 매출 감소',     'bear', 'fundamentals', 7, 'earnings', '온프레미스 라이센스 매출 -10%'),
  ('ORCL', 'orcl_bear_margin_compression', '마진 압박',               'bear', 'fundamentals', 6, 'earnings', '영업이익률 -2%p YoY'),
  ('ORCL', 'orcl_bear_capex_burden',       'capex 부담',              'bear', 'fundamentals', 5, 'earnings', 'FCF 음전환'),

  -- Bear · 거시
  ('ORCL', 'orcl_bear_recession',          '경기 침체 진입',          'bear', 'macro', 6, 'manual', 'GDP 2분기 연속 음수 또는 NBER 선언'),
  ('ORCL', 'orcl_bear_high_rates',         '고금리 장기화',           'bear', 'macro', 5, 'manual', 'Fed funds rate 5%+ 1년+ 지속'),
  ('ORCL', 'orcl_bear_software_bear',      'SW 섹터 베어',            'bear', 'macro', 5, 'yahoo', 'IGV 6개월 -10%↓'),

  -- Bear · 가격 약세
  ('ORCL', 'orcl_bear_below_sma200',       'SMA200 이탈',             'bear', 'price', 6, 'yahoo', '종가 < SMA200 30일+'),
  ('ORCL', 'orcl_bear_momentum_negative',  '20일 모멘텀 음전환',      'bear', 'price', 4, 'yahoo', '20일 수익률 -5%↓'),
  ('ORCL', 'orcl_bear_lower_lows',         '지속 저점 갱신',          'bear', 'price', 5, 'yahoo', '6개월 신저가 갱신')
ON CONFLICT (signal_key) DO NOTHING;

-- 8. 카일 초기 테제 등록
INSERT INTO public.investment_theses (symbol, thesis_text, thesis_type) VALUES
  ('ORCL',
   'AI 인프라(반도체·전력)가 어느 정도 마무리되고 소프트웨어가 데이터베이스의 힘을 받아 활용해야 될 때 더 큰 시너지가 날 것. ORCL은 누적 빅데이터 처리 강자로서 이 시점에 빛난다.',
   'bull'),
  ('ORCL',
   '강력한 AI 기업들(OpenAI, Anthropic)이 상장하고 생태계를 장악하면 기존 SW 기업들의 파이를 잠식. ORCL을 포함한 SW 섹터 회복 지연.',
   'bear')
ON CONFLICT DO NOTHING;

-- 9. 검증
SELECT
  thesis_type,
  COUNT(*) AS thesis_count
FROM public.investment_theses
WHERE symbol = 'ORCL' AND is_active = TRUE
GROUP BY thesis_type;

SELECT
  signal_type,
  stage,
  COUNT(*) AS signal_count,
  SUM(weight) AS total_weight
FROM public.thesis_signals_catalog
WHERE symbol = 'ORCL'
GROUP BY signal_type, stage
ORDER BY signal_type, stage;
