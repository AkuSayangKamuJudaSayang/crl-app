ALTER TABLE public.invite_codes ADD COLUMN used_by_name varchar(100);
UPDATE public.invite_codes i SET used_by_name=u.full_name FROM public.users u WHERE i.used_by_id=u.id AND i.is_used;
