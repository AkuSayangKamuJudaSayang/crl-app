ALTER POLICY school_boundary
  ON public.school_year_section_insertions
  USING (school_id = (SELECT current_setting('crl.school_id', true)))
  WITH CHECK (school_id = (SELECT current_setting('crl.school_id', true)));
