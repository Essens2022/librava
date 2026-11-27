-- Publisher: complete KDP book packages sold to ONE buyer only (with publishing rights).
-- Safe to run once. Existing books are untouched.
alter table public.books drop constraint if exists books_product_type_check;
alter table public.books add constraint books_product_type_check
  check (product_type in ('ebook','planner','calendar','organizer','spreadsheet','template','game','coloring','kids','wallart','cards','publisher'));
-- exclusivity: a package is sold once. While a buyer is paying it is held for 5 minutes.
alter table public.books add column if not exists sold_at timestamptz;
alter table public.books add column if not exists reserved_until timestamptz;
alter table public.books add column if not exists reserved_order uuid;
alter table public.books add column if not exists reserved_user uuid;
create index if not exists books_pub_idx on public.books (product_type, sold_at, reserved_until) where product_type = 'publisher';

-- a free claim can never hand out a publisher package (one buyer only)
create or replace function public.claim_free_book(p_book_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.books where id = p_book_id and price_cents = 0 and status = 'published' and deleted_at is null and product_type <> 'publisher') then
    raise exception 'Book is not free';
  end if;
  insert into public.purchases (user_id, book_id, price_cents, customer_email)
  values (auth.uid(), p_book_id, 0, (select email from auth.users where id = auth.uid()))
  on conflict (user_id, book_id) do nothing;
end $$;
-- the admin confirming an order by hand also marks publisher packages as sold
create or replace function public.admin_set_order(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_admin() then raise exception 'admin.notAdmin'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.status <> 'pending' then raise exception 'Order not pending.'; end if;
  if p_status = 'paid' then
    if o.user_id is not null then
      insert into public.purchases (user_id, book_id, order_id, price_cents, currency, customer_email)
      select o.user_id, (it->>'book_id')::uuid, o.id, (it->>'price_cents')::int, o.currency, o.email
      from jsonb_array_elements(o.items) it
      on conflict (user_id, book_id) do nothing;
    end if;
    update public.books set sold_at = now(), reserved_until = null
      where product_type = 'publisher' and id in (select (it->>'book_id')::uuid from jsonb_array_elements(o.items) it);
    update public.orders set status = 'paid', paid_at = now() where id = o.id;
  elsif p_status = 'cancelled' then
    update public.books set reserved_until = null, reserved_order = null, reserved_user = null where reserved_order = o.id;
    update public.orders set status = 'cancelled' where id = o.id;
  else raise exception 'bad status'; end if;
end $$;
revoke all on function public.claim_free_book(uuid) from public, anon;
grant execute on function public.claim_free_book(uuid) to authenticated;
revoke all on function public.admin_set_order(uuid, text) from public, anon;
grant execute on function public.admin_set_order(uuid, text) to authenticated;
