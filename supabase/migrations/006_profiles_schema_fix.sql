-- Align profiles columns with usePreferencesSync.js (priority_filter, active_dimensions).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'active_domains'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'active_dimensions'
  ) then
    alter table public.profiles rename column active_domains to active_dimensions;
  end if;
end $$;

alter table public.profiles
  add column if not exists active_dimensions text[];

alter table public.profiles
  add column if not exists priority_filter text;
