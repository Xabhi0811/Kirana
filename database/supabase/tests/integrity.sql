-- Read-only regression evidence. Each count must be zero.
select 'orders_total_mismatch' as check_name,count(*)::integer as violations from public.orders o
where o.total_amount<>(select coalesce(sum(total_price),0) from public.order_items i where i.order_id=o.id)
union all select 'empty_orders',count(*)::integer from public.orders o where not exists(select 1 from public.order_items i where i.order_id=o.id)
union all select 'line_total_mismatch',count(*)::integer from public.order_items where total_price<>unit_price*quantity
union all select 'negative_stock',count(*)::integer from public.products where stock_quantity<0
union all select 'review_relationship',count(*)::integer from public.reviews r join public.orders o on o.id=r.order_id where o.status<>'DELIVERED' or o.customer_id<>r.customer_id or o.shop_id<>r.shop_id
union all select 'complaint_relationship',count(*)::integer from public.complaints c join public.orders o on o.id=c.order_id where c.user_id<>o.customer_id or (c.shop_id is not null and c.shop_id<>o.shop_id)
union all select 'message_participant',count(*)::integer from public.chat_messages m join public.chat_rooms r on r.id=m.chat_room_id join public.shops s on s.id=r.shop_id where m.sender_id not in (r.customer_id,s.owner_id)
union all select 'orphan_auth_profile',count(*)::integer from auth.users a left join public.users u on u.id=a.id where u.id is null
union all select 'unvalidated_foreign_key',count(*)::integer from pg_constraint where connamespace='public'::regnamespace and contype='f' and not convalidated
union all select 'duplicate_default_addresses',count(*)::integer from (select user_id from public.addresses where is_default group by user_id having count(*)>1) d
union all select 'order_timeline_status',count(*)::integer from public.orders o where o.status is distinct from (select t.status from public.order_tracking t where t.order_id=o.id order by t.created_at desc,t.id desc limit 1);
