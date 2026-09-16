-- Remove application-owned rate limiting without changing installed migrations.
-- Keep the active-account check previously performed by private.limit_action.
do $$
declare
 routine record;
 definition text;
begin
 for routine in
  select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
   and p.proname in ('save_address','place_order','transition_order','open_chat','send_message')
 loop
  definition := pg_get_functiondef(routine.oid);
  if definition !~ 'perform private\.limit_action\(' then
   raise exception 'Rate-limit removal blocked: unexpected application function definition';
  end if;
  definition := regexp_replace(
   definition,
   'perform private\.limit_action\(''[^'']+'',\s*[0-9]+\);',
   'if public.active_role() is null then raise exception ''Unauthorized''; end if;',
   'g'
  );
  if definition ~ 'private\.limit_action' then
   raise exception 'Rate-limit removal blocked: unsupported limiter call';
  end if;
  execute definition;
 end loop;
end $$;

drop function public.throttle_mutation();
drop function private.limit_action(text,integer);
-- This table contains only request counters, not marketplace records.
drop table private.rate_limits;
notify pgrst, 'reload schema';
