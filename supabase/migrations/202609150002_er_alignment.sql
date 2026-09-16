-- Incremental ER alignment. Keep the original migration unchanged.
-- Abort rather than guessing replacements for invalid/duplicate phone numbers.
do $$ begin
 if exists(select 1 from public.users where phone is not null and phone !~ '^\+?[0-9]{10,15}$') then
  raise exception 'ER migration blocked: repair invalid profile phone numbers first';
 end if;
 if exists(select 1 from public.users where phone is not null group by ltrim(phone,'+') having count(*) > 1) then
  raise exception 'ER migration blocked: resolve duplicate profile phone numbers first';
 end if;
end $$;

alter table public.users add constraint users_phone_format
 check(phone is null or phone ~ '^\+?[0-9]{10,15}$');
create unique index users_phone_unique on public.users(ltrim(phone,'+')) where phone is not null;

-- Historical line totals are derived from the snapshot price, not today's catalog.
alter table public.order_items add constraint order_items_total_consistent
 check(total_price = unit_price * quantity);

-- PostgreSQL does not automatically index the referencing side of foreign keys.
create index categories_parent_idx on public.categories(parent_id);
create index shops_category_idx on public.shops(category_id);
create index shopping_list_items_product_idx on public.shopping_list_items(product_id);
create index orders_address_idx on public.orders(address_id);
create index order_items_product_idx on public.order_items(product_id);
create index tracking_updated_by_idx on public.order_tracking(updated_by);
create index reviews_customer_idx on public.reviews(customer_id);
create index complaints_user_created_idx on public.complaints(user_id,created_at desc);
create index complaints_order_idx on public.complaints(order_id);
create index complaints_shop_idx on public.complaints(shop_id);
create index chat_messages_sender_idx on public.chat_messages(sender_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id);
