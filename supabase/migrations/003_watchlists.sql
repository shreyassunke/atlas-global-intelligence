-- Per-user watchlists: topics, entities, or places to monitor on the globe.
create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null,
  kind        text not null check (kind in ('topic', 'entity', 'place')),
  match_value text not null,
  enabled     boolean default true,
  created_at  timestamptz default now()
);

alter table public.watchlists enable row level security;

create policy "Users can read own watchlists"
  on public.watchlists for select
  using (auth.uid() = user_id);

create policy "Users can insert own watchlists"
  on public.watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own watchlists"
  on public.watchlists for update
  using (auth.uid() = user_id);

create policy "Users can delete own watchlists"
  on public.watchlists for delete
  using (auth.uid() = user_id);

create index if not exists idx_watchlists_user on public.watchlists(user_id);
create index if not exists idx_watchlists_enabled on public.watchlists(enabled) where enabled = true;
