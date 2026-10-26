-- Phase 0: schema base idempotent cho 6 bảng hiện có (repo không có DDL).
-- Schema theo reference spec; xác minh lại với DB thật trước khi apply.
-- CREATE TABLE IF NOT EXISTS: bảng đã tồn tại thì skip hoàn toàn (an toàn data).

create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  msv text,
  class_code text,
  role text not null default 'student'
);

create table if not exists public.lessons (
  id integer primary key,
  title text,
  audio_url text,
  passage text,
  total_questions integer,
  order_number integer,
  is_active boolean not null default false
);

create table if not exists public.questions (
  id uuid primary key,
  lesson_id integer,
  question_number integer,
  correct_answer text
);

create table if not exists public.submissions (
  id uuid primary key,
  user_id uuid,
  lesson_id integer,
  correct_count integer,
  total_questions integer,
  score numeric,
  percentage numeric,
  listen_count integer,
  user_answer json,
  submitted_at timestamptz not null default now()
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid,
  question_id uuid,
  user_answer text,
  is_correct boolean
);

create table if not exists public.listen_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  lesson_id integer,
  expires_at timestamptz
);

-- Unique có sẵn trong DB (spec): kiểm tra theo CỘT (không đoán tên),
-- vì bảng tạo ad-hoc có thể đặt tên khác mặc định.
do $$
declare
  r record;
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'listen_attempts'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 2
  ) then
    alter table public.listen_attempts
      add constraint listen_attempts_user_lesson_key
      unique (user_id, lesson_id);
  end if;
end
$$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.questions enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.listen_attempts enable row level security;

-- Helper is_admin(): security definer → chạy với quyền owner (superuser),
-- bypass RLS của chính profiles → KHÔNG tự tham chiếu (tránh infinite
-- recursion khi policy trên profiles đọc lại profiles).
create or replace function public.is_admin() returns boolean
language sql stable
security definer
set search_path = public
as
$$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
grant execute on function public.is_admin() to authenticated;

-- profiles: self-reference → dùng is_admin()
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;

-- Admin sửa profile của SV (VD class_code sai). Sinh viên không tự update
-- (ngăn privilege escalation sửa role; spec: sửa class_code là hành động
-- của admin, không cần UI student).
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated can read lessons" on public.lessons;
create policy "Authenticated can read lessons" on public.lessons
  for select to authenticated using (true);

drop policy if exists "Admins can manage lessons" on public.lessons;
create policy "Admins can manage lessons" on public.lessons
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated can read questions" on public.questions;
create policy "Authenticated can read questions" on public.questions
  for select to authenticated using (true);

drop policy if exists "Admins can manage questions" on public.questions;
create policy "Admins can manage questions" on public.questions
  for all to authenticated
  using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
  with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

-- submissions: trùng đúng với file migration cũ (keep) + thêm read admin
drop policy if exists "Users can read own submissions" on public.submissions;
create policy "Users can read own submissions" on public.submissions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own submissions" on public.submissions;
create policy "Users can insert own submissions" on public.submissions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Admins can read all submissions" on public.submissions;
create policy "Admins can read all submissions" on public.submissions
  for select to authenticated
  using ((select role from public.profiles where id = (select auth.uid())) = 'admin');

drop policy if exists "Users can read own submission answers" on public.submission_answers;
create policy "Users can read own submission answers" on public.submission_answers
  for select to authenticated
  using (exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.user_id = (select auth.uid())
  ));

drop policy if exists "Users can insert own submission answers" on public.submission_answers;
create policy "Users can insert own submission answers" on public.submission_answers
  for insert to authenticated
  with check (exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.user_id = (select auth.uid())
  ));

drop policy if exists "Users can read own listen attempts" on public.listen_attempts;
create policy "Users can read own listen attempts" on public.listen_attempts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own listen attempts" on public.listen_attempts;
create policy "Users can insert own listen attempts" on public.listen_attempts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Admin cần SELECT (hiển thị trạng thái) để DELETE được dòng (makeup quy trình)
drop policy if exists "Admins can read all listen attempts" on public.listen_attempts;
create policy "Admins can read all listen attempts" on public.listen_attempts
  for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins can delete listen attempts" on public.listen_attempts;
create policy "Admins can delete listen attempts" on public.listen_attempts
  for delete to authenticated
  using (public.is_admin());
