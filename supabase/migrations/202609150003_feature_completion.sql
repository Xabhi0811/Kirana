-- Public presentation settings only. Never store credentials in this table.
create table public.platform_settings (
 id uuid primary key default '00000000-0000-0000-0000-000000000001',
 marketplace_name text not null default 'LocalKart' check(char_length(marketplace_name) between 2 and 100),
 support_email text not null default '' check(char_length(support_email) <= 254),
 announcement text not null default '' check(char_length(announcement) <= 500),
 updated_at timestamptz not null default now(),
 constraint platform_settings_singleton check(id = '00000000-0000-0000-0000-000000000001')
);
alter table public.platform_settings enable row level security;
grant select on public.platform_settings to anon,authenticated;
grant update on public.platform_settings to authenticated;
create policy settings_read on public.platform_settings for select using(true);
create policy settings_admin_update on public.platform_settings for update to authenticated
 using(public.is_admin()) with check(public.is_admin());
create trigger touch_updated before update on public.platform_settings for each row execute function private.touch_updated();
create trigger audit_admin after update on public.platform_settings for each row execute function private.audit_admin();
insert into public.platform_settings default values;

create function public.admin_order_report(days integer default 30)
returns table(day date,orders bigint,delivered bigint,cancelled bigint,delivered_order_value numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Unauthorized'; end if;
 if days is null or days < 1 or days > 90 then raise exception 'Report range must be 1 to 90 days'; end if;
 return query
 with dates as (
  select ((now() at time zone 'UTC')::date - i)::date as date
  from generate_series(0,days-1) i
 ), summary as (
  select (o.created_at at time zone 'UTC')::date as date,
   count(*) as total,
   count(*) filter(where o.status='DELIVERED') as completed,
   count(*) filter(where o.status='CANCELLED') as stopped,
   coalesce(sum(o.total_amount) filter(where o.status='DELIVERED'),0) as value
  from public.orders o
  where o.created_at >= (((now() at time zone 'UTC')::date - (days-1))::timestamp at time zone 'UTC')
    and o.created_at < (((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC')
  group by (o.created_at at time zone 'UTC')::date
 )
 select d.date,coalesce(s.total,0),coalesce(s.completed,0),coalesce(s.stopped,0),coalesce(s.value,0)
 from dates d left join summary s on s.date=d.date order by d.date desc;
end $$;
revoke all on function public.admin_order_report(integer) from public;
grant execute on function public.admin_order_report(integer) to authenticated;
create index orders_created_at_idx on public.orders(created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('category-images','category-images',true,4194304,array['image/jpeg','image/png','image/webp']);
create policy category_images_read on storage.objects for select using(bucket_id='category-images');
create policy category_images_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='category-images' and public.is_admin() and (storage.foldername(name))[1]=auth.uid()::text);
