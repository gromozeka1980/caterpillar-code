-- Fix author_id default so RLS INSERT policy works
ALTER TABLE levels ALTER COLUMN author_id SET DEFAULT auth.uid();

-- Relax title constraint (will be auto-generated)
ALTER TABLE levels DROP CONSTRAINT IF EXISTS levels_title_check;
ALTER TABLE levels ALTER COLUMN title DROP NOT NULL;
