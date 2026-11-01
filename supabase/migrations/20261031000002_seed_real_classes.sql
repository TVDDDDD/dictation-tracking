-- Seed real class codes from actual data
-- 5 basic classes (shared 60 lessons) + 1 advanced class (24 separate lessons)

-- Clear existing placeholder classes
delete from public.classes;

-- Insert real classes
insert into public.classes (code, name, is_advanced, sort_order) values
  ('N196/77DCTD24', 'N196/77DCTD24', false, 1),
  ('N195/77DCTD23', 'N195/77DCTD23', false, 2),
  ('N224/77DCDT24', 'N224/77DCDT24', false, 3),
  ('N227/77DCDT22', 'N227/77DCDT22', false, 4),
  ('N185/77DCOH22', 'N185/77DCOH22', false, 5),
  ('NN1/D2026', 'NN1/D2026', true, 6)
on conflict (code) do update set
  name = excluded.name,
  is_advanced = excluded.is_advanced,
  sort_order = excluded.sort_order;

-- Verify
select * from public.classes order by sort_order;