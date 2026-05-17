-- Add 'link' (and normalise 'pdf' which was already in use) to the
-- instruction_type check constraint on assignments.
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_instruction_type_check;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_instruction_type_check
    CHECK (instruction_type IN ('text', 'image', 'audio', 'pdf', 'link'));
