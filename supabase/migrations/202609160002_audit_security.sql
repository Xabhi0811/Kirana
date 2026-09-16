-- INSERT RETURNING evaluates SELECT policies against the inserted row. A STABLE
-- helper querying shops cannot see that row in the statement's earlier snapshot.
drop policy shops_read on public.shops;
create policy shops_read on public.shops for select using (
  public.shop_visible(id)
  or (owner_id = auth.uid() and public.active_role() = 'SHOPKEEPER' and approval_status <> 'SUSPENDED')
  or public.is_admin()
);

-- Expose only the caller's status, not suspended profile data or other accounts.
create function public.my_account_status() returns text
language sql stable security definer set search_path = '' as $$
  select status from public.users where id = auth.uid()
$$;
revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

-- RLS does not protect TRUNCATE. Hosted default grants must not allow it.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
notify pgrst, 'reload schema';
