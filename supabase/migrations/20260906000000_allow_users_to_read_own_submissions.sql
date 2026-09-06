alter table public.submissions enable row level security;
alter table public.profiles enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'submissions')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can read own submissions"
  on public.submissions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own submissions"
  on public.submissions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
