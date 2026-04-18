-- ============================================================
-- MIGRATION 003: News Feed Table
-- ============================================================

create table if not exists public.news (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  summary text,
  url text unique not null,
  source text,
  image_url text,
  related_symbols text[],
  published_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_news_published on public.news(published_at desc);
create index if not exists idx_news_symbols on public.news using gin(related_symbols);

alter table public.news enable row level security;
create policy "news_read_all" on public.news for select using (true);

-- Realtime 활성화
alter publication supabase_realtime add table public.news;
alter publication supabase_realtime add table public.alerts;

-- ------------------------------------------------------------
-- 알림 트리거 로그 (이미 발동된 알림 중복 방지)
-- ------------------------------------------------------------
create table if not exists public.alert_triggers (
  id uuid primary key default uuid_generate_v4(),
  alert_id uuid references public.alerts(id) on delete cascade,
  symbol text not null,
  price_at_trigger numeric,
  triggered_at timestamptz default now()
);

create index if not exists idx_alert_triggers_alert on public.alert_triggers(alert_id, triggered_at desc);

alter table public.alert_triggers enable row level security;
create policy "alert_triggers_read_all" on public.alert_triggers for select using (true);
