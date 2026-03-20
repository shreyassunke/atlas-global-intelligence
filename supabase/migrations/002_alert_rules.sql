-- User-defined alert rules. Each row = one notification trigger.
create table if not exists public.alert_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  tier        text,        -- 'critical', 'active', or null (any)
  domain      text,        -- 'conflict', 'natural', etc., or null (any)
  region      text,        -- bounding-box label or 'global'
  channel     text not null, -- 'email' | 'sms'
  destination text not null, -- email address or phone number
  enabled     boolean default true,
  created_at  timestamptz default now()
);

alter table public.alert_rules enable row level security;

create policy "Users can read own alert rules"
  on public.alert_rules for select
  using (auth.uid() = user_id);

create policy "Users can insert own alert rules"
  on public.alert_rules for insert
  with check (auth.uid() = user_id);

create policy "Users can update own alert rules"
  on public.alert_rules for update
  using (auth.uid() = user_id);

create policy "Users can delete own alert rules"
  on public.alert_rules for delete
  using (auth.uid() = user_id);

create index if not exists idx_alert_rules_user on public.alert_rules(user_id);
create index if not exists idx_alert_rules_enabled on public.alert_rules(enabled) where enabled = true;
