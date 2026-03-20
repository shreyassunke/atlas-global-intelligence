-- Stores user preferences, synced from the ATLAS client on every change.
create table if not exists public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  selected_sources jsonb,
  globe_mode      text,
  quality_tier    text,
  quality_overrides jsonb,
  colorblind_mode boolean default false,
  severity_floor  int default 1,
  active_domains  text[],
  updated_at      timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can upsert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
