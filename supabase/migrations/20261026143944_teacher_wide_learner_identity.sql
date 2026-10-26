CREATE UNIQUE INDEX learners_teacher_lrn_key ON public.learners (teacher_id, lrn);
CREATE UNIQUE INDEX learners_teacher_name_key ON public.learners (teacher_id, (lower(regexp_replace(btrim(normalize(coalesce(first_name,'') || ' ' || coalesce(middle_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(suffix,''), NFKC)), '\s+', ' ', 'g'))));
