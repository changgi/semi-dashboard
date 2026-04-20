-- ═══════════════════════════════════════════════════════════
-- 🚑 카일님 포트폴리오 종목명 즉시 수정 (1분 해결)
-- ═══════════════════════════════════════════════════════════
-- Supabase SQL Editor에서 이 전체를 복사 → 붙여넣기 → Run
-- ═══════════════════════════════════════════════════════════

UPDATE portfolio_holdings
SET name = 'TIGER 미국S&P500'
WHERE symbol = '360750.KS' AND is_active = true;

-- 결과 확인
SELECT id, symbol, name, shares, avg_cost, currency 
FROM portfolio_holdings
WHERE is_active = true;
