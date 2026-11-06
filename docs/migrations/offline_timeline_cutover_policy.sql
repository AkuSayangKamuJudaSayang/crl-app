-- Read only this non-secret rollout timestamp for retained offline journals.
BEGIN;
GRANT SELECT ON public.system_state TO crl_school;
CREATE POLICY crl_school_cutover_metadata ON public.system_state FOR SELECT TO crl_school USING(key='school_flow_cutover');
COMMIT;
