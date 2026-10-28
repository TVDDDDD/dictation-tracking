-- Fix submissions.id default (run in Supabase SQL Editor)
ALTER TABLE public.submissions ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Fix questions.id default
ALTER TABLE public.questions ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add created_at/updated_at to lessons if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'created_at') THEN
    ALTER TABLE public.lessons ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'updated_at') THEN
    ALTER TABLE public.lessons ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END
$$;