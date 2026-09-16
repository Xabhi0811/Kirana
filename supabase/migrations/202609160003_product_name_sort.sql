-- The public API advertises name sorting for products; apply it before pagination.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.discover_products(double precision,double precision,text,uuid,boolean,boolean,text,integer,uuid,text,text)'::regprocedure) into definition;
  if position('desc,l.d,l.id' in definition) = 0 then
    raise exception 'Unexpected discover_products definition; inspect before applying';
  end if;
  execute replace(definition,'desc,l.d,l.id','desc,case when sort_by=''name'' then l.name end,l.d,l.id');
end $$;
notify pgrst, 'reload schema';
