-- ═══════════════════════════════════════════════════════════
-- 가격 알림 시스템 (Price Alerts)
-- 사용자가 원하는 가격 조건에 도달하면 알림 발생
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS price_alerts (
  id            BIGSERIAL PRIMARY KEY,
  symbol        VARCHAR(20) NOT NULL,
  name          VARCHAR(100),
  -- 조건 타입
  condition_type VARCHAR(20) NOT NULL CHECK (condition_type IN ('above', 'below', 'pct_change')),
  -- 목표값 (가격 또는 %변동)
  target_value  NUMERIC(15, 4) NOT NULL,
  -- 기준가 (pct_change일 때 비교 기준)
  reference_price NUMERIC(15, 4),
  -- 통화
  currency      VARCHAR(3) DEFAULT 'USD',
  -- 메모
  note          TEXT,
  -- 상태
  is_active     BOOLEAN DEFAULT true,
  triggered_at  TIMESTAMPTZ,
  triggered_price NUMERIC(15, 4),
  -- 1회성 vs 반복
  is_one_time   BOOLEAN DEFAULT true,
  -- 타임스탬프
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active 
  ON price_alerts(is_active, symbol) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol 
  ON price_alerts(symbol);

-- 알림 발동 이력 (분석 & 디버깅용)
CREATE TABLE IF NOT EXISTS price_alert_triggers (
  id            BIGSERIAL PRIMARY KEY,
  alert_id      BIGINT REFERENCES price_alerts(id) ON DELETE CASCADE,
  symbol        VARCHAR(20) NOT NULL,
  condition_type VARCHAR(20) NOT NULL,
  target_value  NUMERIC(15, 4) NOT NULL,
  triggered_price NUMERIC(15, 4) NOT NULL,
  triggered_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alert_triggers_symbol 
  ON price_alert_triggers(symbol, triggered_at DESC);

COMMENT ON TABLE price_alerts IS '가격 알림 조건';
COMMENT ON TABLE price_alert_triggers IS '가격 알림 발동 이력';
