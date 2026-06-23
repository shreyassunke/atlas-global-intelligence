-- Investigation workspaces: scoped globe config + persistent event timeline.

create table if not exists public.workspaces (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users on delete cascade not null,
  name              text not null,
  description       text,
  focus_regions     text[] default '{}',
  keywords          text[] default '{}',
  active_dimensions text[] default '{}',
  priority_filter   text default 'p1p2',
  data_layers       jsonb default '{}',
  focus_bbox        jsonb,
  status            text default 'monitoring'
                    check (status in ('monitoring', 'active', 'archived')),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.workspace_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade not null,
  event_id      text not null,
  event_data    jsonb not null,
  captured_at   timestamptz default now(),
  dimension     text,
  severity      int,
  priority      text,
  title         text,
  source        text,
  lat           double precision,
  lng           double precision,
  unique (workspace_id, event_id)
);

-- Row-level security
alter table public.workspaces enable row level security;
alter table public.workspace_events enable row level security;

create policy "Users can read own workspaces"
  on public.workspaces for select
  using (auth.uid() = user_id);

create policy "Users can insert own workspaces"
  on public.workspaces for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workspaces"
  on public.workspaces for update
  using (auth.uid() = user_id);

-- No delete policy: archive via status update only.

create policy "Users can read own workspace events"
  on public.workspace_events for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can insert own workspace events"
  on public.workspace_events for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can update own workspace events"
  on public.workspace_events for update
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.user_id = auth.uid()
    )
  );

-- Indexes
create index if not exists idx_workspace_events_workspace_captured
  on public.workspace_events (workspace_id, captured_at desc);

create index if not exists idx_workspaces_user_active
  on public.workspaces (user_id, status)
  where status != 'archived';
