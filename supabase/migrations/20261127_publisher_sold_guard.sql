-- Whatever way a publisher package reaches a buyer (Stripe payment, confirmed order, admin gift), it becomes sold at once;
-- if the last copy is revoked by the admin it becomes available again.
create or replace function public.pub_mark_sold() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.books set sold_at = coalesce(sold_at, now()), reserved_until = null, reserved_order = null, reserved_user = null
   where id = new.book_id and product_type = 'publisher';
  return null;
end $$;
drop trigger if exists purchases_pub_sold on public.purchases;
create trigger purchases_pub_sold after insert on public.purchases for each row execute function public.pub_mark_sold();
create or replace function public.pub_unmark_sold() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.purchases where book_id = old.book_id) then
    update public.books set sold_at = null where id = old.book_id and product_type = 'publisher';
  end if;
  return null;
end $$;
drop trigger if exists purchases_pub_unsold on public.purchases;
create trigger purchases_pub_unsold after delete on public.purchases for each row execute function public.pub_unmark_sold();
