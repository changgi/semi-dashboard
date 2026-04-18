-- ============================================================
-- SEED DATA: 반도체 섹터 주요 종목
-- ============================================================

insert into public.tickers (symbol, name, name_kr, segment, market_cap_b, is_etf, description_kr) values
-- === 개별 종목 ===
('NVDA', 'NVIDIA Corporation', '엔비디아', 'fabless', 4800, false, 'AI GPU 절대 강자. CUDA 생태계로 해자 구축'),
('TSM', 'Taiwan Semiconductor', 'TSMC', 'foundry', 1900, false, '세계 최대 파운드리. 2nm 공정 선도'),
('AVGO', 'Broadcom Inc.', '브로드컴', 'fabless', 1800, false, '커스텀 AI 칩 + VMware 소프트웨어'),
('AMD', 'Advanced Micro Devices', 'AMD', 'fabless', 420, false, 'Instinct MI 데이터센터 GPU 급성장'),
('MU', 'Micron Technology', '마이크론', 'memory', 510, false, '메모리 3사 중 한 축. HBM 수혜 최대'),
('ASML', 'ASML Holding', 'ASML', 'equipment', 380, false, 'EUV 리소그래피 장비 독점'),
('INTC', 'Intel Corporation', '인텔', 'idm', 280, false, '파운드리 전환 중. 레거시 IDM'),
('QCOM', 'Qualcomm', '퀄컴', 'fabless', 150, false, '스마트폰 모뎀/AP + 자동차'),
('ARM', 'Arm Holdings', 'ARM', 'fabless', 170, false, 'CPU IP 라이선스. 저전력 아키텍처'),
('MRVL', 'Marvell Technology', '마벨', 'fabless', 120, false, '데이터센터 네트워킹 ASIC'),
('AMAT', 'Applied Materials', '어플라이드', 'equipment', 150, false, '반도체 제조 장비'),
('LRCX', 'Lam Research', '램리서치', 'equipment', 95, false, '에칭/증착 장비'),
('KLAC', 'KLA Corporation', 'KLA', 'equipment', 85, false, '검사/계측 장비'),
('TXN', 'Texas Instruments', 'TI', 'idm', 170, false, '아날로그/임베디드'),
('ADI', 'Analog Devices', '아날로그디바이시스', 'idm', 110, false, '아날로그 반도체'),

-- === ETF ===
('SMH', 'VanEck Semiconductor ETF', 'SMH ETF', 'etf', 25, true, '미국 상장 25개 반도체, NVDA 19%'),
('SOXX', 'iShares Semiconductor ETF', 'SOXX ETF', 'etf', 15, true, 'NYSE 반도체 지수 30종목'),
('SMHX', 'Sprott Semiconductor ETF', 'SMHX ETF', 'etf', 2, true, '팹리스 집중 ETF'),
('SOXL', 'Direxion Semi Bull 3X', 'SOXL', 'etf', 8, true, '3배 레버리지 (고위험)'),
('SOXS', 'Direxion Semi Bear 3X', 'SOXS', 'etf', 1, true, '3배 인버스 (고위험)')
on conflict (symbol) do update set
  name = excluded.name,
  name_kr = excluded.name_kr,
  segment = excluded.segment,
  market_cap_b = excluded.market_cap_b,
  is_etf = excluded.is_etf,
  description_kr = excluded.description_kr;
