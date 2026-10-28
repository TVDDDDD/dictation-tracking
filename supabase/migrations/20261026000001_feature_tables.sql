-- Phase 1: 3 bảng mới (lesson_access, practice_sessions, makeup_grants)
-- + alter submissions (attempt_number, unique mới) + RLS.
-- Idempotent: chạy lại được nhiều lần, không phá data có sẵn.
-- Unique constraint cũ của submissions (user_id, lesson_id) được phát hiện
-- qua pg_constraint (không cần biết trước tên constraint thật).

-- ============ 1. lesson_access ============
create table if not exists public.lesson_access (
  id uuid primary key default gen_random_uuid(),
  lesson_id integer not null,
  class_code text not null,
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  constraint lesson_access_lesson_class_key unique (lesson_id, class_code)
);

-- Add created_at/updated_at to lessons if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'lessons' and column_name = 'created_at') then
    alter table public.lessons add column created_at timestamptz not null default now();
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'lessons' and column_name = 'updated_at') then
    alter table public.lessons add column updated_at timestamptz not null default now();
  end if;
end
$$;

alter table public.lesson_access enable row level security;

-- FK để PostgREST embed "profiles ( full_name )" (audit tên admin)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lesson_access_granted_by_fkey'
  ) then
    alter table public.lesson_access
      add constraint lesson_access_granted_by_fkey
      foreign key (granted_by) references public.profiles(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lesson_access_lesson_fkey'
  ) then
    alter table public.lesson_access
      add constraint lesson_access_lesson_fkey
      foreign key (lesson_id) references public.lessons(id);
  end if;
end
$$;

drop policy if exists "Admins manage lesson access" on public.lesson_access;
create policy "Admins manage lesson access" on public.lesson_access
  for all to authenticated
  using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
  with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

-- Sinh viên chỉ đọc được dòng của lớp mình (đủ cho dashboard + guard trang practice)
drop policy if exists "Students can read own class lesson access" on public.lesson_access;
create policy "Students can read own class lesson access" on public.lesson_access
  for select to authenticated
  using ((select class_code from public.profiles where id = (select auth.uid())) = class_code);

-- ============ 2. practice_sessions ============
create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lesson_id integer not null,
  started_at timestamptz not null default now()
);

alter table public.practice_sessions enable row level security;

drop policy if exists "Users can insert own practice sessions" on public.practice_sessions;
create policy "Users can insert own practice sessions" on public.practice_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own practice sessions" on public.practice_sessions;
create policy "Users can read own practice sessions" on public.practice_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Admins can read all practice sessions" on public.practice_sessions;
create policy "Admins can read all practice sessions" on public.practice_sessions
  for select to authenticated
  using ((select role from public.profiles where id = (select auth.uid())) = 'admin');

-- ============ 3. submissions: attempt_number ============
alter table public.submissions
  add column if not exists attempt_number integer not null default 1;

-- Drop unique constraint cũ KHÔNG chứa attempt_number (tên constraint thật
-- không xác định trước → quét pg_constraint, idempotent).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'submissions' and c.contype = 'u'
      and not exists (
        select 1 from unnest(c.conkey) k(attnum)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
        where a.attname = 'attempt_number'
      )
  loop
    execute format('alter table public.submissions drop constraint %I', r.conname);
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'submissions'
      and c.conname = 'submissions_user_lesson_attempt_key'
  ) then
    alter table public.submissions
      add constraint submissions_user_lesson_attempt_key
      unique (user_id, lesson_id, attempt_number);
  end if;
end
$$;

-- ============ 4. makeup_grants (tạo TRƯỚC policy submissions bên dưới) ============
create table if not exists public.makeup_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lesson_id integer not null,
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  constraint makeup_grants_user_lesson_key unique (user_id, lesson_id)
);

alter table public.makeup_grants enable row level security;

drop policy if exists "Users can read own makeup grants" on public.makeup_grants;
create policy "Users can read own makeup grants" on public.makeup_grants
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Admins manage makeup grants" on public.makeup_grants;
create policy "Admins manage makeup grants" on public.makeup_grants
  for all to authenticated
  using ((select role from public.profiles where id = (select auth.uid())) = 'admin')
  with check ((select role from public.profiles where id = (select auth.uid())) = 'admin');

-- FK để PostgREST embed "questions ( correct_answer )" trên submission_answers
-- (chỉ thêm nếu DB thật chưa có FK submission_answers → questions,
-- phát hiện theo cặp bảng, không phụ thuộc tên constraint)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.submission_answers'::regclass
      and c.confrelid = 'public.questions'::regclass
  ) then
    alter table public.submission_answers
      add constraint submission_answers_question_id_fkey
      foreign key (question_id) references public.questions(id);
  end if;
end
$$;

-- RLS: sinh viên chỉ insert được:
--  - attempt 1: BÀI PHẢI MỞ CHO LỚP CỦA MÌNH (lesson_access) HOẶC có
--    makeup_grant (admin cấp trước khi SV làm lần đầu)
--  - attempt 2: cần makeup_grants (tối đa 1 lượt makeup → chặn attempt >= 3)
-- (chặn SV gọi thẳng PostgREST tạo submission cho bài chưa mở)
drop policy if exists "Users can insert own submissions" on public.submissions;
create policy "Users can insert own submissions" on public.submissions
  for insert to authenticated
  with check ((select auth.uid()) = user_id
    and (
      (attempt_number = 1 and (
        exists (
          select 1 from public.lesson_access la
          where la.lesson_id = lesson_id
            and la.class_code = (
              select p.class_code from public.profiles p
              where p.id = (select auth.uid())
            )
        )
        or exists (
          select 1 from public.makeup_grants m
          where m.user_id = (select auth.uid())
            and m.lesson_id = lesson_id
        )
      ))
      or
      (attempt_number = 2 and exists (
        select 1 from public.makeup_grants m
        where m.user_id = (select auth.uid())
          and m.lesson_id = lesson_id
      ))
    ));
