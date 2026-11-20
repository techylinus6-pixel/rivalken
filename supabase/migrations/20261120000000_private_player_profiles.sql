create table public.player_profiles (
  player_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_profile text not null,
  encryption_salt text not null,
  iv text not null,
  crypto_version smallint not null check (crypto_version = 1)
);

alter table public.player_profiles enable row level security;

revoke all on table public.player_profiles from anon, authenticated;
grant select, insert, update on table public.player_profiles to authenticated;

create policy "Players can read their own encrypted profile"
  on public.player_profiles
  for select
  to authenticated
  using ((select auth.uid()) = player_id);

create policy "Players can create their own encrypted profile"
  on public.player_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = player_id);

create policy "Players can update their own encrypted profile"
  on public.player_profiles
  for update
  to authenticated
  using ((select auth.uid()) = player_id)
  with check ((select auth.uid()) = player_id);
