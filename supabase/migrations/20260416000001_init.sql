-- ============================================================
-- SEMICONDUCTOR DASHBOARD - INITIAL SCHEMA
-- Region: ap-northeast-2 (Seoul)
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- 1. tickers: 종목 마스터 테이블
-- ------------------------------------------------------------
create table if not exists public.tickers (
  symbol text primary key,
  name text not null,
  name_kr text,
  sector text default 'semiconductor',
  segment text, -- fabless, foundry, memory, equipment, idm, etf
  market_cap_b numeric, -- 단위: billion USD
  is_etf boolean default false,
  logo_url text,
  description_kr text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. quotes: 실시간 시세 (가장 최신 시세만 저장)
-- ------------------------------------------------------------
create table if not exists public.quotes (
  symbol text primary key references public.tickers(symbol) on delete cascade,
  price numeric not null,
  change numeric,
  change_percent numeric,
  day_high numeric,
  day_low numeric,
  prev_close numeric,
  volume bigint,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. price_history: 과거 가격 (차트용)
-- ------------------------------------------------------------
create table if not exists public.price_history (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null references public.tickers(symbol) on delete cascade,
  price numeric not null,
  timestamp timestamptz not null default now(),
  interval_type text default '1min' -- 1min, 5min, 1hour, 1day
);

create index if not exists idx_price_history_symbol_time 
  on public.price_history(symbol, timestamp desc);

create index if not exists idx_price_history_interval 
  on public.price_history(interval_type, timestamp desc);

-- ------------------------------------------------------------
-- 4. alerts: 가격 알림
-- ------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null references public.tickers(symbol) on delete cascade,
  condition text not null check (condition in ('above', 'below', 'change_up', 'change_down')),
  threshold numeric not null,
  email text,
  is_active boolean default true,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_alerts_active on public.alerts(symbol, is_active);

-- ------------------------------------------------------------
-- 5. fetch_log: 데이터 수집 로그 (디버깅용)
-- ------------------------------------------------------------
create table if not exists public.fetch_log (
  id uuid primary key default uuid_generate_v4(),
  fetched_at timestamptz default now(),
  source text,
  symbols_count integer,
  success boolean,
  error_message text,
  duration_ms integer
);

create index if not exists idx_fetch_log_time on public.fetch_log(fetched_at desc);

-- ------------------------------------------------------------
-- RLS (Row Level Security) 정책
-- ------------------------------------------------------------
alter table public.tickers enable row level security;
alter table public.quotes enable row level security;
alter table public.price_history enable row level security;
alter table public.alerts enable row level security;
alter table public.fetch_log enable row level security;

-- 읽기는 모두 허용
create policy "tickers_read_all" on public.tickers for select using (true);
create policy "quotes_read_all" on public.quotes for select using (true);
create policy "price_history_read_all" on public.price_history for select using (true);
create policy "alerts_read_all" on public.alerts for select using (true);
create policy "alerts_insert_all" on public.alerts for insert with check (true);

-- ------------------------------------------------------------
-- Realtime 활성화 (quotes 테이블 실시간 구독)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.quotes;

-- ------------------------------------------------------------
-- Helper View: 현재 시세 + 메타 정보 조인
-- ------------------------------------------------------------
create or replace view public.v_dashboard as
select
  t.symbol,
  t.name,
  t.name_kr,
  t.segment,
  t.market_cap_b,
  t.is_etf,
  q.price,
  q.change,
  q.change_percent,
  q.day_high,
  q.day_low,
  q.prev_close,
  q.volume,
  q.updated_at
from public.tickers t
left join public.quotes q on t.symbol = q.symbol
order by t.market_cap_b desc nulls last;

grant select on public.v_dashboard to anon, authenticated;
