-- Trigger: create profile on auth user signup
-- Run in Supabase SQL Editor

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, msv, class_code, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'msv',
    new.raw_user_meta_data->>'class_code',
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$;

-- Drop existing trigger if exists
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Also handle existing users who might not have profiles
insert into public.profiles (id, full_name, msv, class_code, role)
select
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'msv',
  u.raw_user_meta_data->>'class_code',
  coalesce(u.raw_user_meta_data->>'role', 'student')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;