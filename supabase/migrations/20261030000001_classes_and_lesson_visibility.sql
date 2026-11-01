-- 1. Bảng classes (seed 6 lớp)
create table if not exists public.classes (
  code text primary key,
  name text not null,
  is_advanced boolean not null default false,
  sort_order integer not null default 0
);

-- Seed dữ liệu mặc định
insert into public.classes (code, name, is_advanced, sort_order) values
  ('NANG_CAO', 'Lớp Nâng Cao', true, 1),
  ('CB01', 'Lớp Cơ Bản 1', false, 2),
  ('CB02', 'Lớp Cơ Bản 2', false, 3),
  ('CB03', 'Lớp Cơ Bản 3', false, 4),
  ('CB04', 'Lớp Cơ Bản 4', false, 5),
  ('CB05', 'Lớp Cơ Bản 5', false, 6)
on conflict (code) do nothing;

-- 2. Thêm cột class_codes vào lessons (mảng text, rỗng = tất cả lớp thấy)
alter table public.lessons
  add column if not exists class_codes text[] not null default '{}';

-- Index GIN cho query @> (contains)
create index if not exists idx_lessons_class_codes_gin on public.lessons using gin (class_codes);

-- Partial unique index: order_number unique per class (cho bài gán lớp cụ thể)
-- Chỉ áp dụng khi class_codes không rỗng
create unique index if not exists uniq_lesson_class_order
  on public.lessons (class_codes, order_number)
  where class_codes != '{}';

-- 3. RLS cho classes
alter table public.classes enable row level security;

drop policy if exists "Anyone can read classes" on public.classes;
create policy "Anyone can read classes" on public.classes
  for select to authenticated, anon using (true);

drop policy if exists "Admins manage classes" on public.classes;
create policy "Admins manage classes" on public.classes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4. Trigger: khi admin tạo/sửa lesson với class_codes không rỗng → tự sync lesson_access
create or replace function public.sync_lesson_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Xóa lesson_access cũ của bài này
  delete from public.lesson_access where lesson_id = NEW.id;

  -- Nếu có class_codes thì insert mới
  if NEW.class_codes is not null and array_length(NEW.class_codes, 1) > 0 then
    insert into public.lesson_access (lesson_id, class_code, granted_by)
    select NEW.id, unnest(NEW.class_codes), auth.uid();
  end if;

  return NEW;
end $$;

drop trigger if exists trigger_sync_lesson_access on public.lessons;
create trigger trigger_sync_lesson_access
  after insert or update on public.lessons
  for each row execute procedure public.sync_lesson_access();

-- 5. Backfill: lesson hiện có chưa có class_codes → treat as visible all (giữ nguyên behavior)
-- Không cần làm gì thêm vì default '{}' = visible all