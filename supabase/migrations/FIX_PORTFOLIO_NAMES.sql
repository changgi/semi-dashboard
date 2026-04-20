-- ═══════════════════════════════════════════════════════════
-- 🚑 카일님 포트폴리오 즉시 수정 SQL (Supabase SQL Editor용)
-- ═══════════════════════════════════════════════════════════
-- 
-- 사용법:
--   1. Supabase Dashboard → SQL Editor
--   2. 이 파일 내용 전체 복사 → 붙여넣기 → Run
--   3. 하단의 SELECT 결과로 수정 내역 확인
--
-- 실행 결과 (예상):
--   카일님의 360750.KS 2건이 모두 "TIGER S&P500" 이름 획득
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1단계: 한국 반도체/ETF 주요 종목 이름 일괄 매핑
-- ─────────────────────────────────────────────
UPDATE portfolio_holdings
SET 
  name = CASE symbol
    -- 🇰🇷 한국 반도체 대형주
    WHEN '005930.KS' THEN '삼성전자'
    WHEN '000660.KS' THEN 'SK하이닉스'
    
    -- 🔧 한국 반도체 장비주
    WHEN '042700.KS' THEN '한미반도체'
    WHEN '240810.KS' THEN '원익IPS'
    WHEN '036930.KS' THEN '주성엔지니어링'
    WHEN '039030.KS' THEN '이오테크닉스'
    WHEN '058470.KS' THEN '리노공업'
    WHEN '095610.KS' THEN '테스'
    WHEN '000990.KS' THEN 'DB하이텍'
    WHEN '196090.KS' THEN '슈어소프트테크'
    
    -- 📊 한국 주요 ETF
    WHEN '091170.KS' THEN 'KODEX 은행'
    WHEN '091160.KS' THEN 'KODEX 반도체'
    WHEN '091210.KS' THEN 'KODEX 코스닥150 레버리지'
    WHEN '122630.KS' THEN 'KODEX 레버리지'
    WHEN '252670.KS' THEN 'KODEX 200선물인버스2X'
    WHEN '360750.KS' THEN 'TIGER 미국S&P500'
    WHEN '379800.KS' THEN 'KODEX 미국S&P500'
    WHEN '381170.KS' THEN 'TIGER 미국테크TOP10'
    WHEN '381180.KS' THEN 'TIGER 미국필라델피아반도체나스닥'
    WHEN '411420.KS' THEN 'KODEX 미국빅테크10'
    WHEN '461340.KS' THEN 'TIGER 미국S&P500선물'
    WHEN '139660.KS' THEN 'TIGER 200 IT'
    WHEN '139230.KS' THEN 'TIGER 200 중공업'
    WHEN '148020.KS' THEN 'KBSTAR 200'
    WHEN '069500.KS' THEN 'KODEX 200'
    
    -- 🇺🇸 미국 주요 종목
    WHEN 'NVDA'      THEN 'NVIDIA Corporation'
    WHEN 'AMD'       THEN 'Advanced Micro Devices, Inc.'
    WHEN 'TSM'       THEN 'Taiwan Semiconductor'
    WHEN 'AVGO'      THEN 'Broadcom Inc.'
    WHEN 'MU'        THEN 'Micron Technology'
    WHEN 'INTC'      THEN 'Intel Corporation'
    WHEN 'QCOM'      THEN 'Qualcomm Inc.'
    WHEN 'ARM'       THEN 'Arm Holdings'
    WHEN 'MRVL'      THEN 'Marvell Technology'
    WHEN 'TXN'       THEN 'Texas Instruments'
    WHEN 'ADI'       THEN 'Analog Devices'
    
    -- 🇺🇸/🇳🇱 반도체 장비
    WHEN 'ASML'      THEN 'ASML Holding'
    WHEN 'AMAT'      THEN 'Applied Materials'
    WHEN 'LRCX'      THEN 'Lam Research'
    WHEN 'KLAC'      THEN 'KLA Corporation'
    
    -- 🇺🇸 반도체 ETF
    WHEN 'SMH'       THEN 'VanEck Semi ETF'
    WHEN 'SOXX'      THEN 'iShares Semi ETF'
    WHEN 'SOXL'      THEN 'Direxion Semi Bull 3X'
    WHEN 'SOXS'      THEN 'Direxion Semi Bear 3X'
    WHEN 'XLK'       THEN 'Technology Select Sector SPDR'
    
    -- 기존 이름 유지
    ELSE name
  END,
  updated_at = NOW()
WHERE is_active = true
  AND (
    -- 이름이 없거나, 심볼과 같거나, 숫자만 있는 경우만 수정
    name IS NULL 
    OR name = symbol 
    OR name = REPLACE(symbol, '.KS', '')
    OR name = REPLACE(symbol, '.KQ', '')
    OR name ~ '^\d+$'
  );

-- ─────────────────────────────────────────────
-- 2단계: 수정 결과 확인
-- ─────────────────────────────────────────────
SELECT 
  id,
  symbol,
  name,
  shares,
  avg_cost,
  currency,
  CASE 
    WHEN name IS NOT NULL AND name != symbol AND name != REPLACE(symbol, '.KS', '') 
    THEN '✅ 정상' 
    ELSE '⚠️ 여전히 이름 없음'
  END AS status
FROM portfolio_holdings
WHERE is_active = true
ORDER BY id;

-- ─────────────────────────────────────────────
-- 3단계: 통계 확인
-- ─────────────────────────────────────────────
SELECT 
  COUNT(*) AS total_holdings,
  COUNT(CASE WHEN name IS NOT NULL AND name != symbol AND name !~ '^\d+$' THEN 1 END) AS with_good_name,
  COUNT(CASE WHEN name IS NULL OR name = symbol OR name ~ '^\d+$' THEN 1 END) AS without_name
FROM portfolio_holdings
WHERE is_active = true;
