-- Phase 4 — Entity resolution graph + async export jobs.

-- Resolved entities (places, actors, vessels, topics)
create table if not exists public.entities (
  id            uuid primary key default gen_random_uuid(),
  canonical_id  text not null unique,
  label         text not null,
  kind          text not null check (kind in ('place', 'actor', 'topic', 'asset', 'organization', 'vessel')),
  iso           text,
  lat           double precision,
  lng           double precision,
  aliases       text[] default '{}',
  source_ids    text[] default '{}',
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Entity graph edges (auto + manual)
create table if not exists public.entity_links (
  id            uuid primary key default gen_random_uuid(),
  from_entity   uuid references public.entities(id) on delete cascade not null,
  to_entity     uuid references public.entities(id) on delete cascade not null,
  link_type     text not null check (link_type in ('fact', 'hypothesis', 'correlation')),
  label         text,
  source        text,
  event_id      text,
  confidence    double precision default 0.5,
  created_at    timestamptz default now()
);

create unique index if not exists idx_entity_links_unique
  on public.entity_links (from_entity, to_entity, link_type, coalesce(label, ''));

-- Async PDF/export job queue
create table if not exists public.export_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete set null,
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'complete', 'failed')),
  format        text not null default 'pdf',
  blueprint     jsonb not null,
  result_url    text,
  result_data   bytea,
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  completed_at  timestamptz
);

create index if not exists idx_entities_kind on public.entities (kind);
create index if not exists idx_entities_iso on public.entities (iso) where iso is not null;
create index if not exists idx_entity_links_from on public.entity_links (from_entity);
create index if not exists idx_entity_links_to on public.entity_links (to_entity);
create index if not exists idx_export_jobs_status on public.export_jobs (status, created_at desc);

alter table public.entities enable row level security;
alter table public.entity_links enable row level security;
alter table public.export_jobs enable row level security;

-- Entities are readable by authenticated users; writes via service role
create policy "Authenticated users can read entities"
  on public.entities for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy "Authenticated users can read entity links"
  on public.entity_links for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy "Users can read own export jobs"
  on public.export_jobs for select
  using (auth.uid() = user_id or auth.role() = 'service_role');

create policy "Users can insert own export jobs"
  on public.export_jobs for insert
  with check (auth.uid() = user_id or auth.role() = 'service_role');
