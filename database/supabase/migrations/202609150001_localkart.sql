-- LocalKart: no payment entities. All amounts are product order totals in INR.
set search_path = public, extensions;
create extension if not exists pg_trgm;
create schema if not exists private;
revoke all on schema private from public;

create table public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 100), email text not null unique,
 phone text, role text not null default 'CUSTOMER' check (role in ('CUSTOMER','SHOPKEEPER','ADMIN')),
 avatar_url text, status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), name text not null unique, description text,
 image_url text, parent_id uuid references public.categories(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(parent_id is distinct from id)
);
create table public.addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 label text not null, full_address text not null, latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180), city text not null, state text not null,
 pincode text not null check(pincode ~ '^[0-9]{6}$'), is_default boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index addresses_one_default on public.addresses(user_id) where is_default;
create table public.shops (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id),
 category_id uuid not null references public.categories(id), name text not null check(char_length(name) between 2 and 120),
 description text not null default '', logo_url text, phone text, email text, address text not null,
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 delivery_radius_km numeric(5,2) not null check(delivery_radius_km > 0 and delivery_radius_km <= 50),
 open_time time not null default '08:00', close_time time not null default '21:00',
 status text not null default 'OPEN' check(status in ('OPEN','CLOSED','INACTIVE')),
 approval_status text not null default 'PENDING' check(approval_status in ('PENDING','APPROVED','REJECTED','SUSPENDED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 category_id uuid not null references public.categories(id), name text not null check(char_length(name) between 2 and 150),
 description text not null default '', brand text not null default '', unit text not null, price numeric(12,2) not null check(price >= 0),
 stock_quantity integer not null check(stock_quantity >= 0), image_url text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.shopping_lists (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 100), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.shopping_list_items (
 id uuid primary key default gen_random_uuid(), list_id uuid not null references public.shopping_lists(id) on delete cascade,
 product_id uuid references public.products(id), name text not null, quantity integer not null check(quantity between 1 and 999), unit text not null default 'item',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique default ('LK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 customer_id uuid not null references public.users(id), shop_id uuid not null references public.shops(id),
 address_id uuid references public.addresses(id) on delete set null, delivery_address jsonb not null,
 status text not null default 'PLACED' check(status in ('PLACED','ACCEPTED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
 total_amount numeric(12,2) not null check(total_amount >= 0), notes text not null default '',
 request_key uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(customer_id,request_key)
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid not null references public.products(id), product_name text not null, unit_price numeric(12,2) not null check(unit_price >= 0),
 quantity integer not null check(quantity > 0), total_price numeric(12,2) not null check(total_price >= 0)
);
create table public.order_tracking (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 status text not null, note text not null default '', updated_by uuid not null references public.users(id), created_at timestamptz not null default now()
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 customer_id uuid not null references public.users(id), shop_id uuid not null references public.shops(id),
 rating integer not null check(rating between 1 and 5), comment text not null check(char_length(comment) <= 2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.complaints (
 id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id), user_id uuid not null references public.users(id),
 shop_id uuid references public.shops(id), subject text not null, description text not null,
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','RESOLVED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.chat_rooms (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.users(id), shop_id uuid not null references public.shops(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(customer_id,shop_id)
);
create table public.chat_messages (
 id uuid primary key default gen_random_uuid(), chat_room_id uuid not null references public.chat_rooms(id) on delete cascade,
 sender_id uuid not null references public.users(id), message text not null default '',
 message_type text not null check(message_type in ('TEXT','IMAGE','PRODUCT','PRODUCT_LIST','ORDER')),
 payload jsonb not null default '{}', is_read boolean not null default false, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.users(id), resource text not null,
 resource_id uuid not null, action text not null, changes jsonb, created_at timestamptz not null default now()
);
create table private.rate_limits (user_id uuid not null, action text not null, window_start timestamptz not null, hits integer not null default 1, primary key(user_id,action,window_start));

create index users_phone_idx on public.users(phone);
create index shops_name_idx on public.shops using gin(name gin_trgm_ops);
create index shops_owner_idx on public.shops(owner_id);
create index shops_location_idx on public.shops(latitude,longitude);
create index products_name_idx on public.products using gin(name gin_trgm_ops);
create index products_shop_idx on public.products(shop_id);
create index products_category_idx on public.products(category_id);
create index orders_customer_idx on public.orders(customer_id,created_at desc);
create index orders_shop_idx on public.orders(shop_id,created_at desc);
create index orders_status_idx on public.orders(status);
create index chat_rooms_customer_idx on public.chat_rooms(customer_id);
create index chat_rooms_shop_idx on public.chat_rooms(shop_id);
create index chat_messages_room_idx on public.chat_messages(chat_room_id,created_at desc);
create index addresses_user_idx on public.addresses(user_id);
create index shopping_lists_user_idx on public.shopping_lists(user_id);
create index shopping_list_items_list_idx on public.shopping_list_items(list_id);
create index tracking_order_idx on public.order_tracking(order_id);
create index order_items_order_idx on public.order_items(order_id);
create index reviews_shop_idx on public.reviews(shop_id);

create function public.active_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.users where id = (select auth.uid()) and status = 'ACTIVE'
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(public.active_role() = 'ADMIN',false) $$;
create function public.owns_shop(shop uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.active_role() = 'SHOPKEEPER' and exists(select 1 from public.shops where id=shop and owner_id=(select auth.uid()) and approval_status <> 'SUSPENDED')
$$;
create function public.in_chat(room uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.active_role() is not null and exists(select 1 from public.chat_rooms where id=room and (customer_id=(select auth.uid()) or public.owns_shop(shop_id)))
$$;
create function public.can_read_order(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.active_role() is not null and exists(select 1 from public.orders where id=target and (customer_id=(select auth.uid()) or public.owns_shop(shop_id) or public.is_admin()))
$$;
create function public.distance_km(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
 select 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0, power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)))))
$$;
create function public.category_contains(parent uuid,child uuid) returns boolean language sql stable set search_path = '' as $$
 with recursive descendants as (select id from public.categories where id=parent union select c.id from public.categories c join descendants d on c.parent_id=d.id)
 select exists(select 1 from descendants where id=child)
$$;
create function private.touch_updated() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare tab text; begin foreach tab in array array['users','addresses','categories','shops','products','shopping_lists','shopping_list_items','orders','reviews','complaints','chat_rooms'] loop
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',tab); end loop; end $$;

create function private.handle_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.users(id,name,email,phone,role) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'name',''),'LocalKart member'),new.email,new.raw_user_meta_data->>'phone',
 case when new.raw_user_meta_data->>'role'='SHOPKEEPER' then 'SHOPKEEPER' else 'CUSTOMER' end);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_user();
create function private.sync_email() returns trigger language plpgsql security definer set search_path = '' as $$ begin update public.users set email=new.email where id=new.id; return new; end $$;
create trigger on_auth_email_updated after update of email on auth.users for each row execute function private.sync_email();

create function private.guard_profile() returns trigger language plpgsql security definer set search_path = '' as $$ begin
 if auth.uid() is not null and not public.is_admin() and (new.id <> old.id or new.role <> old.role or new.status <> old.status or (new.email <> old.email and pg_trigger_depth()=1)) then raise exception 'Profile permissions denied'; end if;
 if new.id <> old.id then raise exception 'Profile identity cannot change'; end if; return new;
end $$;
create trigger guard_profile before update on public.users for each row execute function private.guard_profile();
create function private.guard_shop() returns trigger language plpgsql security definer set search_path = '' as $$ begin
 if auth.uid() is not null and not public.is_admin() then
  if tg_op='INSERT' and (new.owner_id <> auth.uid() or new.approval_status <> 'PENDING') then raise exception 'Shop permissions denied'; end if;
  if tg_op='UPDATE' and (new.owner_id <> old.owner_id or new.approval_status <> old.approval_status) then raise exception 'Only administrators can approve shops'; end if;
 end if; return new;
end $$;
create trigger guard_shop before insert or update on public.shops for each row execute function private.guard_shop();
create function private.guard_product() returns trigger language plpgsql set search_path = '' as $$ begin
 if new.shop_id <> old.shop_id then raise exception 'A listing cannot move between shops'; end if; return new;
end $$;
create trigger guard_product before update on public.products for each row execute function private.guard_product();
create function private.guard_category() returns trigger language plpgsql set search_path = '' as $$ begin
 if exists(with recursive ancestors as (select id,parent_id from public.categories where id=new.parent_id union all select c.id,c.parent_id from public.categories c join ancestors a on c.id=a.parent_id) select 1 from ancestors where id=new.id) then raise exception 'Category hierarchy cannot contain a cycle'; end if; return new;
end $$;
create trigger guard_category before insert or update on public.categories for each row execute function private.guard_category();
create function private.audit_admin() returns trigger language plpgsql security definer set search_path = '' as $$ begin
 if public.is_admin() then insert into public.audit_logs(actor_id,resource,resource_id,action,changes) values(auth.uid(),tg_table_name,coalesce(new.id,old.id),tg_op,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new))); end if;
 return coalesce(new,old);
end $$;
do $$ declare tab text; begin foreach tab in array array['users','shops','categories','products','reviews','complaints','orders'] loop
 execute format('create trigger audit_admin after insert or update or delete on public.%I for each row execute function private.audit_admin()',tab); end loop; end $$;

-- Every exposed table has RLS. Sensitive order and chat writes use narrow RPCs below.
do $$ declare tab text; begin foreach tab in array array['users','addresses','categories','shops','products','shopping_lists','shopping_list_items','orders','order_items','order_tracking','reviews','complaints','chat_rooms','chat_messages','audit_logs'] loop
 execute format('alter table public.%I enable row level security',tab); end loop; end $$;
create policy profile_read on public.users for select to authenticated using ((id=auth.uid() and public.active_role() is not null) or public.is_admin());
create policy profile_update on public.users for update to authenticated using ((id=auth.uid() and public.active_role() is not null) or public.is_admin()) with check(id=auth.uid() or public.is_admin());
create policy addresses_own on public.addresses for all to authenticated using(user_id=auth.uid() and public.active_role()='CUSTOMER') with check(user_id=auth.uid() and public.active_role()='CUSTOMER');
create policy categories_read on public.categories for select using(true);
create policy categories_admin on public.categories for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy shops_read on public.shops for select using((approval_status='APPROVED' and status <> 'INACTIVE' and exists(select 1 from public.users u where u.id=owner_id and u.status='ACTIVE')) or public.owns_shop(id) or public.is_admin());
-- Shop public visibility is also secured in discovery RPC. Avoid exposing owner profile through recursive RLS.
drop policy shops_read on public.shops;
create function public.shop_visible(shop uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.shops s join public.users u on u.id=s.owner_id where s.id=shop and s.approval_status='APPROVED' and s.status <> 'INACTIVE' and u.status='ACTIVE')
$$;
create policy shops_read on public.shops for select using(public.shop_visible(id) or public.owns_shop(id) or public.is_admin());
create policy shops_insert on public.shops for insert to authenticated with check(owner_id=auth.uid() and public.active_role()='SHOPKEEPER' and approval_status='PENDING');
create policy shops_update on public.shops for update to authenticated using(public.owns_shop(id) or public.is_admin()) with check(public.owns_shop(id) or public.is_admin());
create policy products_read on public.products for select using((is_active and public.shop_visible(shop_id)) or public.owns_shop(shop_id) or public.is_admin());
create policy products_write on public.products for all to authenticated using(public.owns_shop(shop_id) or public.is_admin()) with check(public.owns_shop(shop_id) or public.is_admin());
create policy lists_own on public.shopping_lists for all to authenticated using(user_id=auth.uid() and public.active_role()='CUSTOMER') with check(user_id=auth.uid() and public.active_role()='CUSTOMER');
create policy list_items_own on public.shopping_list_items for all to authenticated using(exists(select 1 from public.shopping_lists where id=list_id and user_id=auth.uid())) with check(exists(select 1 from public.shopping_lists where id=list_id and user_id=auth.uid()) and public.active_role()='CUSTOMER');
create policy orders_read on public.orders for select to authenticated using(public.can_read_order(id));
create policy order_items_read on public.order_items for select to authenticated using(public.can_read_order(order_id));
create policy tracking_read on public.order_tracking for select to authenticated using(public.can_read_order(order_id));
create policy reviews_read on public.reviews for select using(public.shop_visible(shop_id) or public.owns_shop(shop_id) or customer_id=auth.uid() or public.is_admin());
create policy reviews_insert on public.reviews for insert to authenticated with check(public.active_role()='CUSTOMER' and customer_id=auth.uid() and exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid() and o.shop_id=reviews.shop_id and o.status='DELIVERED'));
create policy reviews_admin_delete on public.reviews for delete to authenticated using(public.is_admin());
create policy complaints_read on public.complaints for select to authenticated using((user_id=auth.uid() and public.active_role() is not null) or public.is_admin());
create policy complaints_insert on public.complaints for insert to authenticated with check(user_id=auth.uid() and public.active_role()='CUSTOMER' and status='OPEN' and (order_id is null or exists(select 1 from public.orders where id=order_id and customer_id=auth.uid() and (complaints.shop_id is null or complaints.shop_id=shop_id))));
create policy complaints_admin_update on public.complaints for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy rooms_read on public.chat_rooms for select to authenticated using(public.in_chat(id));
create policy messages_read on public.chat_messages for select to authenticated using(public.in_chat(chat_room_id));
create policy audit_admin_read on public.audit_logs for select to authenticated using(public.is_admin());

create function private.limit_action(action_name text,max_hits integer) returns void language plpgsql security definer set search_path = '' as $$ declare n integer; begin
 if public.active_role() is null then raise exception 'Unauthorized'; end if;
 insert into private.rate_limits(user_id,action,window_start) values(auth.uid(),action_name,date_trunc('minute',now()))
 on conflict(user_id,action,window_start) do update set hits=private.rate_limits.hits+1 returning hits into n;
 if n > max_hits then raise exception 'Too many requests. Please try again shortly'; end if;
 delete from private.rate_limits where window_start < now()-interval '1 day';
end $$;
create function public.save_address(input jsonb,target uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$ declare result uuid; begin
 perform private.limit_action('address',20);
 if public.active_role() <> 'CUSTOMER' then raise exception 'Customers only'; end if;
 -- Serialize default-address updates for one user.
 perform 1 from public.users where id=auth.uid() for update;
 if target is not null and not exists(select 1 from public.addresses where id=target and user_id=auth.uid()) then raise exception 'Address not found'; end if;
 if coalesce((input->>'is_default')::boolean,false) then update public.addresses set is_default=false where user_id=auth.uid(); end if;
 if target is null then
 insert into public.addresses(user_id,label,full_address,latitude,longitude,city,state,pincode,is_default)
 values(auth.uid(),input->>'label',input->>'full_address',(input->>'latitude')::float8,(input->>'longitude')::float8,input->>'city',input->>'state',input->>'pincode',coalesce((input->>'is_default')::boolean,false)) returning id into result;
 else update public.addresses set label=input->>'label',full_address=input->>'full_address',latitude=(input->>'latitude')::float8,longitude=(input->>'longitude')::float8,city=input->>'city',state=input->>'state',pincode=input->>'pincode',is_default=coalesce((input->>'is_default')::boolean,false) where id=target returning id into result; end if;
 return result;
end $$;

-- Structured search is paginated and filtered before returning data.
create function public.discover_shops(lat double precision,lng double precision,q text default '',category uuid default null,open_only boolean default false,sort_by text default 'distance',page integer default 0,shop uuid default null)
returns table(id uuid,name text,description text,logo_url text,category_id uuid,address text,latitude double precision,longitude double precision,delivery_radius_km numeric,status text,open_time time,close_time time,distance double precision,rating numeric,product_count bigint)
language sql stable security definer set search_path = '' as $$
 with nearby as (select s.*,public.distance_km(lat,lng,s.latitude,s.longitude) d,
 coalesce((select avg(r.rating)::numeric(3,2) from public.reviews r where r.shop_id=s.id),0) r,
 (select count(*) from public.products p where p.shop_id=s.id and p.is_active) pc
 from public.shops s join public.users u on u.id=s.owner_id
 where lat between -90 and 90 and lng between -180 and 180 and s.approval_status='APPROVED' and s.status <> 'INACTIVE' and u.status='ACTIVE'
 and s.latitude between lat-50.0/111 and lat+50.0/111
 and (shop is null or s.id=shop)
 and s.name ilike '%'||left(q,100)||'%' and (category is null or public.category_contains(category,s.category_id)) and (not open_only or s.status='OPEN'))
 select n.id,n.name,n.description,n.logo_url,n.category_id,n.address,n.latitude,n.longitude,n.delivery_radius_km,n.status,n.open_time,n.close_time,n.d,n.r,n.pc from nearby n where n.d<=n.delivery_radius_km
 order by case when sort_by='rating' then n.r end desc,case when sort_by='name' then n.name end,n.d,n.id limit 24 offset greatest(0,least(page,10000))*24
$$;
create function public.discover_products(lat double precision,lng double precision,q text default '',category uuid default null,in_stock boolean default false,open_only boolean default false,sort_by text default 'price',page integer default 0,shop uuid default null,unit_filter text default null,brand_filter text default null)
returns table(id uuid,shop_id uuid,category_id uuid,name text,description text,brand text,unit text,price numeric,stock_quantity integer,image_url text,shop_name text,shop_status text,distance double precision,rating numeric)
language sql stable security definer set search_path = '' as $$
 with listings as (select p.*,s.name sn,s.status ss,public.distance_km(lat,lng,s.latitude,s.longitude) d,s.delivery_radius_km radius,
 coalesce((select avg(r.rating)::numeric(3,2) from public.reviews r where r.shop_id=s.id),0) r
 from public.products p join public.shops s on s.id=p.shop_id join public.users u on u.id=s.owner_id
 where lat between -90 and 90 and lng between -180 and 180 and p.is_active and s.approval_status='APPROVED' and s.status <> 'INACTIVE' and u.status='ACTIVE'
 and s.latitude between lat-50.0/111 and lat+50.0/111
 and p.name ilike '%'||left(q,100)||'%' and (category is null or public.category_contains(category,p.category_id)) and (shop is null or p.shop_id=shop) and (not in_stock or p.stock_quantity>0) and (not open_only or s.status='OPEN')
 and (unit_filter is null or lower(p.unit)=lower(unit_filter)) and (brand_filter is null or lower(p.brand)=lower(brand_filter)))
 select l.id,l.shop_id,l.category_id,l.name,l.description,l.brand,l.unit,l.price,l.stock_quantity,l.image_url,l.sn,l.ss,l.d,l.r from listings l where l.d<=l.radius
 order by case when sort_by='price' then l.price end,case when sort_by='rating' then l.r end desc,l.d,l.id limit 24 offset greatest(0,least(page,10000))*24
$$;

create function public.place_order(shop uuid,address uuid,items jsonb,request_id uuid,order_notes text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.shops; a public.addresses; p public.products; item jsonb; qty integer; result uuid; total numeric=0;
begin
 perform private.limit_action('order',10);
 if public.active_role() <> 'CUSTOMER' then raise exception 'Customers only'; end if;
 -- Same request cannot reserve stock twice, even with concurrent retries.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select id into result from public.orders where customer_id=auth.uid() and request_key=request_id; if found then return result; end if;
 select * into s from public.shops where id=shop for share;
 if s.id is null or s.approval_status <> 'APPROVED' or not public.shop_visible(shop) then raise exception 'Shop unavailable'; end if;
 if s.status <> 'OPEN' then raise exception 'Shop is currently closed'; end if;
 select * into a from public.addresses where id=address and user_id=auth.uid() for share;
 if a.id is null then raise exception 'Invalid address'; end if;
 if public.distance_km(a.latitude,a.longitude,s.latitude,s.longitude)>s.delivery_radius_km then raise exception 'Shop outside delivery radius'; end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid cart'; end if;
 if jsonb_array_length(items) not between 1 and 100 then raise exception 'Invalid cart'; end if;
 if (select count(distinct value->>'product_id') from jsonb_array_elements(items)) <> jsonb_array_length(items) then raise exception 'Duplicate cart items'; end if;
 -- Lock products in deterministic order to prevent overselling and deadlocks.
 for item in select value from jsonb_array_elements(items) order by value->>'product_id' loop
  qty=(item->>'quantity')::integer;
  if qty is null or qty not between 1 and 999 then raise exception 'Invalid quantity'; end if;
  select * into p from public.products where id=(item->>'product_id')::uuid for update;
  if p.id is null or p.shop_id <> shop or not p.is_active then raise exception 'Product unavailable or belongs to another shop'; end if;
  if p.stock_quantity < qty then raise exception 'Product out of stock'; end if;
  if item->>'expected_price' is null or p.price <> (item->>'expected_price')::numeric then raise exception 'Price changed. Please refresh your cart'; end if;
  total=total+p.price*qty;
 end loop;
 insert into public.orders(customer_id,shop_id,address_id,delivery_address,total_amount,notes,request_key)
 values(auth.uid(),shop,address,to_jsonb(a)-'user_id',total,left(order_notes,2000),request_id) returning id into result;
 for item in select value from jsonb_array_elements(items) loop
  qty=(item->>'quantity')::integer; select * into p from public.products where id=(item->>'product_id')::uuid;
  insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,total_price) values(result,p.id,p.name||' '||p.unit,p.price,qty,p.price*qty);
  update public.products set stock_quantity=stock_quantity-qty where id=p.id;
 end loop;
 insert into public.order_tracking(order_id,status,updated_by) values(result,'PLACED',auth.uid()); return result;
end $$;

create function public.transition_order(target uuid,next_status text,status_note text default '') returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; item public.order_items; permitted boolean=false; begin
 perform private.limit_action('order_status',60);
 select * into o from public.orders where id=target for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if next_status='CANCELLED' and o.status in ('PLACED','ACCEPTED') and o.customer_id=auth.uid() and public.active_role()='CUSTOMER' then permitted=true;
 elsif public.owns_shop(o.shop_id) or public.is_admin() then
  permitted=(o.status='PLACED' and next_status in ('ACCEPTED','CANCELLED')) or (o.status='ACCEPTED' and next_status in ('PREPARING','CANCELLED')) or (o.status='PREPARING' and next_status='OUT_FOR_DELIVERY') or (o.status='OUT_FOR_DELIVERY' and next_status='DELIVERED');
 end if;
 if not permitted then raise exception 'Unauthorized or invalid order status transition'; end if;
 if next_status='CANCELLED' then for item in select * from public.order_items where order_id=target order by product_id loop
  update public.products set stock_quantity=stock_quantity+item.quantity where id=item.product_id; end loop; end if;
 update public.orders set status=next_status where id=target;
 insert into public.order_tracking(order_id,status,note,updated_by) values(target,next_status,left(status_note,1000),auth.uid());
end $$;

create function public.open_chat(shop uuid) returns uuid language plpgsql security definer set search_path = '' as $$ declare room uuid; begin
 perform private.limit_action('open_chat',30);
 if public.active_role() <> 'CUSTOMER' or not public.shop_visible(shop) then raise exception 'Shop unavailable'; end if;
 insert into public.chat_rooms(customer_id,shop_id) values(auth.uid(),shop) on conflict(customer_id,shop_id) do update set updated_at=now() returning id into room; return room;
end $$;
create function public.send_message(room uuid,kind text,text_content text default '',reference_id uuid default null,image_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$ declare result uuid; data jsonb='{}'; p public.products; r public.chat_rooms; begin
 perform private.limit_action('message',60);
 if not public.in_chat(room) then raise exception 'Private chat access denied'; end if;
 select * into r from public.chat_rooms where id=room;
 if kind='TEXT' then if char_length(trim(text_content)) not between 1 and 4000 then raise exception 'Invalid message'; end if;
 elsif kind='PRODUCT' then select * into p from public.products where id=reference_id and shop_id=r.shop_id and is_active;
  if p.id is null then raise exception 'Product unavailable'; end if; data=jsonb_build_object('id',p.id,'name',p.name,'unit',p.unit,'price',p.price,'stock_quantity',p.stock_quantity,'image_url',p.image_url);
 elsif kind='PRODUCT_LIST' then
  if not exists(select 1 from public.shopping_lists where id=reference_id and user_id=auth.uid()) then raise exception 'Shopping list not found'; end if;
  data=jsonb_build_object('id',reference_id,'name',(select name from public.shopping_lists where id=reference_id),'items',coalesce((select jsonb_agg(jsonb_build_object('name',name,'quantity',quantity,'unit',unit,'product_id',product_id)) from public.shopping_list_items where list_id=reference_id),'[]'::jsonb));
 elsif kind='ORDER' then
  if not public.can_read_order(reference_id) or not exists(select 1 from public.orders where id=reference_id and customer_id=r.customer_id and shop_id=r.shop_id) then raise exception 'Order not found'; end if;
  data=(select jsonb_build_object('id',id,'order_number',order_number,'status',status,'total_amount',total_amount) from public.orders where id=reference_id);
 elsif kind='IMAGE' then
  if image_path is null or image_path not like auth.uid()::text||'/'||room::text||'/%' or not exists(select 1 from storage.objects where bucket_id='chat-images' and name=image_path) then raise exception 'Invalid image'; end if;
  data=jsonb_build_object('path',image_path);
 else raise exception 'Unsupported message type'; end if;
 insert into public.chat_messages(chat_room_id,sender_id,message,message_type,payload) values(room,auth.uid(),left(text_content,4000),kind,data) returning id into result;
 update public.chat_rooms set updated_at=now() where id=room; return result;
end $$;
create function public.read_messages(room uuid) returns void language plpgsql security definer set search_path = '' as $$ begin
 if not public.in_chat(room) then raise exception 'Private chat access denied'; end if;
 update public.chat_messages set is_read=true where chat_room_id=room and sender_id <> auth.uid() and not is_read;
end $$;
create function public.chat_summaries() returns table(id uuid,shop_id uuid,shop_name text,customer_name text,unread bigint,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$ select r.id,r.shop_id,s.name,u.name,(select count(*) from public.chat_messages m where m.chat_room_id=r.id and m.sender_id<>auth.uid() and not m.is_read),r.updated_at
from public.chat_rooms r join public.shops s on s.id=r.shop_id join public.users u on u.id=r.customer_id where public.in_chat(r.id) order by r.updated_at desc limit 100 $$;

-- No arbitrary RPC execution. Explicit grants are the complete mutation surface.
revoke execute on all functions in schema public from public;
grant execute on function public.active_role(),public.is_admin(),public.owns_shop(uuid),public.in_chat(uuid),public.can_read_order(uuid),public.shop_visible(uuid),public.distance_km(double precision,double precision,double precision,double precision) to anon,authenticated;
grant execute on function public.category_contains(uuid,uuid),public.discover_shops(double precision,double precision,text,uuid,boolean,text,integer,uuid),public.discover_products(double precision,double precision,text,uuid,boolean,boolean,text,integer,uuid,text,text) to anon,authenticated;
grant execute on function public.save_address(jsonb,uuid),public.place_order(uuid,uuid,jsonb,uuid,text),public.transition_order(uuid,text,text),public.open_chat(uuid),public.send_message(uuid,text,text,uuid,text),public.read_messages(uuid),public.chat_summaries() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('shop-images','shop-images',true,4194304,array['image/jpeg','image/png','image/webp']),
 ('product-images','product-images',true,4194304,array['image/jpeg','image/png','image/webp']),
 ('avatars','avatars',true,4194304,array['image/jpeg','image/png','image/webp']),
 ('chat-images','chat-images',false,4194304,array['image/jpeg','image/png','image/webp']);
create policy public_images_read on storage.objects for select using(bucket_id in ('shop-images','product-images','avatars'));
create policy own_images_insert on storage.objects for insert to authenticated with check(
 (storage.foldername(name))[1]=auth.uid()::text and public.active_role() is not null and
 (bucket_id='avatars' or (bucket_id in ('shop-images','product-images') and public.active_role()='SHOPKEEPER') or
 (bucket_id='chat-images' and public.in_chat(((storage.foldername(name))[2])::uuid))));
create policy own_images_delete on storage.objects for delete to authenticated using((storage.foldername(name))[1]=auth.uid()::text and public.active_role() is not null);
create policy chat_images_read on storage.objects for select to authenticated using(bucket_id='chat-images' and public.in_chat(((storage.foldername(name))[2])::uuid));
alter publication supabase_realtime add table public.chat_messages,public.orders,public.order_tracking;

create function public.throttle_mutation() returns void language plpgsql security definer set search_path = '' as $$ begin perform private.limit_action('mutation',60); end $$;
revoke all on function public.throttle_mutation() from public;
grant execute on function public.throttle_mutation() to authenticated;
create function public.dashboard_stats() returns jsonb language plpgsql stable security definer set search_path = '' as $$ begin
 if public.is_admin() then return jsonb_build_object(
 'Customers',(select count(*) from public.users where role='CUSTOMER'), 'Shopkeepers',(select count(*) from public.users where role='SHOPKEEPER'),
 'Shops',(select count(*) from public.shops), 'Pending shops',(select count(*) from public.shops where approval_status='PENDING'),
 'Products',(select count(*) from public.products where is_active), 'Orders',(select count(*) from public.orders),
 'Completed orders',(select count(*) from public.orders where status='DELIVERED'), 'Open complaints',(select count(*) from public.complaints where status<>'RESOLVED'),
 'Order value',(select coalesce(sum(total_amount),0) from public.orders where status='DELIVERED'));
 elsif public.active_role()='SHOPKEEPER' then return jsonb_build_object(
 'Today’s orders',(select count(*) from public.orders where public.owns_shop(shop_id) and created_at>=current_date),
 'Pending orders',(select count(*) from public.orders where public.owns_shop(shop_id) and status='PLACED'),
 'Completed orders',(select count(*) from public.orders where public.owns_shop(shop_id) and status='DELIVERED'),
 'Products',(select count(*) from public.products where public.owns_shop(shop_id) and is_active),
 'Low stock',(select count(*) from public.products where public.owns_shop(shop_id) and stock_quantity<5 and is_active),
 'Unread chats',(select count(*) from public.chat_messages where public.in_chat(chat_room_id) and sender_id<>auth.uid() and not is_read),
 'Rating',(select coalesce(avg(rating),0) from public.reviews where public.owns_shop(shop_id)));
 else raise exception 'Unauthorized'; end if;
end $$;
revoke all on function public.dashboard_stats() from public;
grant execute on function public.dashboard_stats() to authenticated;
