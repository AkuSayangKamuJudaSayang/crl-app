CREATE INDEX IF NOT EXISTS school_year_section_insertions_section_fk_idx
  ON public.school_year_section_insertions (school_id, school_section_id);
