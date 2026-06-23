-- Shared L2 cache for slow/medium intelligence feeds (global, not per-user).
create table if not exists public.feed_snapshots (
  source_id   text primary key,
  payload     jsonb not null,
  event_count int default 0,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  status      text default 'fresh' check (status in ('fresh', 'stale', 'error'))
);

alter table public.feed_snapshots enable row level security;

drop policy if exists "Public read feed snapshots" on public.feed_snapshots;
create policy "Public read feed snapshots"
  on public.feed_snapshots for select
  using (true);

-- Writes only via service role (API routes). No insert/update policy for clients.

create index if not exists idx_feed_snapshots_expires
  on public.feed_snapshots (expires_at);
