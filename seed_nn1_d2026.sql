-- ============================================
-- SEED 32 STUDENTS FOR CLASS NN1/D2026
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Verify class exists (from migration 20261031000002_seed_real_classes.sql)
SELECT code, name FROM classes WHERE code = 'NN1/D2026';

-- If not exists, create it:
-- INSERT INTO classes (code, name, sort_order) VALUES ('NN1/D2026', 'NN1/D2026', 1);

-- 2. Insert 32 students (placeholder names - REPLACE with real list)
-- Format: MSV = SV + 4-digit number (SV0001..SV0032)
-- Password will be set via Supabase Auth invite or first login

DO $$
DECLARE
  i INT;
  student_id UUID;
  student_email TEXT;
BEGIN
  FOR i IN 1..32 LOOP
    student_id := gen_random_uuid();
    student_email := 'sv' || lpad(i::text, 4, '0') || '@student.local'; -- placeholder email
    
    -- Insert into auth.users (Supabase Auth)
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change_token_new,
      recovery_token
    ) VALUES (
      student_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      student_email,
      crypt('temp_password_123', gen_salt('bf')), -- temporary password
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "SV ' || lpad(i::text, 2, '0') || ' NN1"}',
      NOW(),
      NOW(),
      '',
      '',
      ''
    ) ON CONFLICT (id) DO NOTHING;

    -- Insert into profiles
    INSERT INTO profiles (
      id,
      full_name,
      msv,
      class_code,
      role,
      created_at
    ) VALUES (
      student_id,
      'SV ' || lpad(i::text, 2, '0') || ' NN1',
      'SV' || lpad(i::text, 4, '0'),
      'NN1/D2026',
      'student',
      NOW()
    ) ON CONFLICT (msv) DO NOTHING;
  END LOOP;
END $$;

-- 3. Verify
SELECT class_code, COUNT(*) as student_count
FROM profiles
WHERE class_code = 'NN1/D2026' AND role = 'student'
GROUP BY class_code;