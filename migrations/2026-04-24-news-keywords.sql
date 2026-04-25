-- ============================================================
-- Migration: Add keywords column to news table
-- Date: 2026-04-24
-- Version: v8.9
-- ============================================================
--
-- 목적:
--   뉴스에 자동 추출된 키워드를 미리 저장해 런타임 계산 비용 절감
--   + DB 레벨 키워드 필터링/검색 가능해짐
--
-- 변경:
--   1. news 테이블에 keywords TEXT[] 컬럼 추가 (기본값: 빈 배열)
--   2. GIN 인덱스로 배열 검색 최적화 (예: 특정 키워드 포함 뉴스)
--   3. 기존 뉴스는 NULL → 빈 배열로 채움 (backfill은 별도 cron으로)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 전체 복사 붙여넣기 → Run
-- ============================================================

-- 1. 컬럼 추가 (이미 있으면 스킵)
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. 빠른 검색용 GIN 인덱스 (배열 contains 연산 최적화)
CREATE INDEX IF NOT EXISTS idx_news_keywords
  ON public.news
  USING GIN (keywords);

-- 3. 기존 NULL 레코드를 빈 배열로 통일
UPDATE public.news
   SET keywords = ARRAY[]::TEXT[]
 WHERE keywords IS NULL;

-- 4. 검증: 컬럼 존재 확인
--    실행 결과에 keywords 컬럼이 나와야 정상
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'news'
   AND column_name = 'keywords';

-- 5. 검증: 인덱스 존재 확인
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'news'
   AND indexname = 'idx_news_keywords';
