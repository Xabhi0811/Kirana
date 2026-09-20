-- now() is fixed at transaction start. Multiple transitions in one transaction
-- otherwise have indistinguishable timestamps and can render out of order.
alter table public.order_tracking alter column created_at set default clock_timestamp();
