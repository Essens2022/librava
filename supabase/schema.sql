-- =====================================================================
--  LIBRAVA — schema Supabase
--  Rulează tot fișierul o singură dată în Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- ---------- profiles (un rând pentru fiecare cont) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------- books ----------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  author text not null,
  description text default '',
  category text not null default 'fiction',
  language text not null default 'ro',
  format text not null default 'pdf' check (format in ('pdf', 'epub')),
  pages int,
  price_cents int not null default 0 check (price_cents >= 0),
  list_price_cents int check (list_price_cents is null or list_price_cents >= 0),
  currency text not null default 'eur',
  cover_path text,
  file_path text,
  file_name text,
  sample_path text,
  keywords text[] not null default '{}',
  published_at date default current_date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  rating_avg numeric(2,1) not null default 0,
  rating_count int not null default 0,
  sales_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- KDP-style details
  series_name text, series_number int, edition int,
  contributors jsonb not null default '[]',
  rights text not null default 'own' check (rights in ('own', 'public')),
  categories text[] not null default '{}',
  age_min int, age_max int, adult boolean not null default false, isbn text,
  aplus jsonb not null default '[]',   -- A+ modules shown on the book page
  file_check jsonb,                    -- result of the manuscript check at upload
  librava_id text                      -- internal book code (like an ASIN), unique
);
create index if not exists books_status_idx on public.books (status, published_at desc);

-- ---------- orders (comenzi Stripe în așteptare / plătite) ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reference text unique not null default ('LIB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  email text,
  method text not null default 'card' check (method in ('card', 'bank', 'gift')),
  items jsonb not null,                 -- [{ "book_id": "...", "title": "...", "price_cents": 499 }]
  amount_cents int not null,
  currency text not null default 'eur',
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------- purchases (o carte deținută de un utilizator) ----------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  book_id uuid not null references public.books(id) on delete restrict,
  order_id uuid references public.orders(id),
  gift boolean not null default false,
  price_cents int not null default 0,
  currency text not null default 'eur',
  customer_email text,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);
create index if not exists purchases_book_idx on public.purchases (book_id);

-- ---------- reading progress & bookmarks ----------
create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  location text,
  page int,
  percent real default 0,
  bookmarks jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ---------- reviews ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000),
  author_name text,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

-- ---------- counters kept up to date by triggers ----------
create or replace function public.refresh_book_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare b uuid := coalesce(new.book_id, old.book_id);
begin
  update public.books set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where book_id = b), 0),
    rating_count = (select count(*) from public.reviews where book_id = b)
  where id = b;
  return null;
end $$;
drop trigger if exists reviews_rating on public.reviews;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_book_rating();

create or replace function public.bump_sales()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.books set sales_count = sales_count + 1 where id = new.book_id;
  return null;
end $$;
create or replace function public.drop_sales()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.books set sales_count = greatest(sales_count - 1, 0) where id = old.book_id;
  return null;
end $$;
drop trigger if exists purchases_unsales on public.purchases;
create trigger purchases_unsales after delete on public.purchases
  for each row execute function public.drop_sales();
drop trigger if exists purchases_sales on public.purchases;
create trigger purchases_sales after insert on public.purchases
  for each row execute function public.bump_sales();

-- ---------- free books: claimed directly from the site ----------
create or replace function public.claim_free_book(p_book_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.books where id = p_book_id and price_cents = 0 and status = 'published' and deleted_at is null) then
    raise exception 'Book is not free';
  end if;
  insert into public.purchases (user_id, book_id, price_cents, customer_email)
  values (auth.uid(), p_book_id, 0, (select email from auth.users where id = auth.uid()))
  on conflict (user_id, book_id) do nothing;
end $$;
revoke all on function public.claim_free_book(uuid) from public, anon;
grant execute on function public.claim_free_book(uuid) to authenticated;

-- ---------- admin: confirm / cancel an order (e.g. when Stripe's message was lost) ----------
create or replace function public.admin_set_order(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_admin() then raise exception 'admin.notAdmin'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.status <> 'pending' then raise exception 'Order not pending.'; end if;
  if p_status = 'paid' then
    insert into public.purchases (user_id, book_id, order_id, price_cents, currency, customer_email)
    select o.user_id, (it->>'book_id')::uuid, o.id, (it->>'price_cents')::int, o.currency, o.email
    from jsonb_array_elements(o.items) it
    on conflict (user_id, book_id) do nothing;
    update public.orders set status = 'paid', paid_at = now() where id = o.id;
  elsif p_status = 'cancelled' then
    update public.orders set status = 'cancelled' where id = o.id;
  else raise exception 'bad status'; end if;
end $$;
revoke all on function public.admin_set_order(uuid, text) from public, anon;
grant execute on function public.admin_set_order(uuid, text) to authenticated;

-- ---------- a customer deletes their own account (sales records stay, without the account) ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_admin() then raise exception 'The administrator account cannot be deleted here.'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.orders enable row level security;
alter table public.purchases enable row level security;
alter table public.reading_progress enable row level security;
alter table public.reviews enable row level security;

-- profiles: everyone sees only their own row; admin sees all; users may change only their name
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- books: published ones are public; buyers keep access to what they bought; admin manages everything
drop policy if exists "books read" on public.books;
create policy "books read" on public.books for select using (
  (status = 'published' and deleted_at is null)
  or public.is_admin()
  or exists (select 1 from public.purchases p where p.book_id = books.id and p.user_id = auth.uid())
);
drop policy if exists "books admin write" on public.books;
create policy "books admin write" on public.books for all using (public.is_admin()) with check (public.is_admin());

-- orders: read own (written only by the Stripe functions with the service key)
drop policy if exists "orders read own" on public.orders;
create policy "orders read own" on public.orders for select using (user_id = auth.uid() or public.is_admin());

-- purchases: read own; admin reads all (inserts only via claim_free_book or the Stripe webhook)
drop policy if exists "purchases read" on public.purchases;
create policy "purchases read" on public.purchases for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "purchases admin insert" on public.purchases;
create policy "purchases admin insert" on public.purchases for insert with check (public.is_admin());
drop policy if exists "purchases admin delete" on public.purchases;
create policy "purchases admin delete" on public.purchases for delete using (public.is_admin());

-- reading progress: fully private to each reader
drop policy if exists "progress own" on public.reading_progress;
create policy "progress own" on public.reading_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reviews: public to read; only buyers may write, one per book
drop policy if exists "reviews read" on public.reviews;
create policy "reviews read" on public.reviews for select using (true);
drop policy if exists "reviews write own" on public.reviews;
create policy "reviews write own" on public.reviews for insert with check (
  user_id = auth.uid() and exists (select 1 from public.purchases p where p.book_id = reviews.book_id and p.user_id = auth.uid())
);
drop policy if exists "reviews update own" on public.reviews;
create policy "reviews update own" on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "reviews delete own" on public.reviews;
create policy "reviews delete own" on public.reviews for delete using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
--  Storage: covers + samples are public, book files are PRIVATE
-- =====================================================================
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('samples', 'samples', true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public, file_size_limit) values ('books', 'books', false, 524288000) on conflict (id) do update set public = false;

drop policy if exists "public covers/samples read" on storage.objects;
create policy "public covers/samples read" on storage.objects for select using (bucket_id in ('covers', 'samples'));

drop policy if exists "admin uploads" on storage.objects;
create policy "admin uploads" on storage.objects for insert with check (bucket_id in ('covers', 'samples', 'books') and public.is_admin());
drop policy if exists "admin updates" on storage.objects;
create policy "admin updates" on storage.objects for update using (bucket_id in ('covers', 'samples', 'books') and public.is_admin());
drop policy if exists "admin deletes" on storage.objects;
create policy "admin deletes" on storage.objects for delete using (bucket_id in ('covers', 'samples', 'books') and public.is_admin());

-- a book file can be opened only by the admin or by someone who bought that book
drop policy if exists "buyers read book files" on storage.objects;
create policy "buyers read book files" on storage.objects for select using (
  bucket_id = 'books' and (
    public.is_admin()
    or exists (
      select 1 from public.purchases p join public.books b on b.id = p.book_id
      where p.user_id = auth.uid() and b.file_path = storage.objects.name
    )
  )
);

-- =====================================================================
--  După ce îți creezi contul pe site, fă-te administrator
--  (înlocuiește adresa cu emailul tău și rulează doar linia de mai jos):
-- update public.profiles set is_admin = true where email = 'emailul-tau@exemplu.com';
-- (nobody can make themselves admin from the site: is_admin is not writable by users)
-- =====================================================================

-- book interior: colour or black & white
alter table public.books add column if not exists color text not null default 'color' check (color in ('color','bw'));

-- promotions (Admin -> Advertising): see migration 'promos' (table public.promos + function promo_hit)

-- editions: the same book in several formats (EPUB, PDF), each row with its own file and price, linked by work_id
alter table public.books add column if not exists work_id uuid;
create index if not exists books_work_idx on public.books (work_id) where work_id is not null;
-- statistics: visits by search-engine robots are kept but not counted
alter table public.events add column if not exists bot boolean not null default false;
-- light store list: plain-text start of the description + index for paged reading (5000+ books)
alter table public.books add column if not exists blurb text generated always as (left(regexp_replace(coalesce(description, ''), '<[^>]*>', ' ', 'g'), 200)) stored;
create index if not exists books_list_idx on public.books (published_at desc, id) where deleted_at is null;

-- 2026-10-22: full-size originals of books made light for screens (Admin keeps them; private bucket)
-- insert into storage.buckets (id, name, public) values ('originals', 'originals', false);
-- policies "librava admin originals read/insert/update/delete": bucket_id = 'originals' and is_admin()
-- alter table public.books add column original_path text;

-- ---------------------------------------------------------------- customer activity (Admin → Customers)
-- visits and time on the site of logged-in customers; written only through heartbeat(), read only by admins
create table if not exists public.user_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  sid text not null,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seconds int not null default 0,
  pages int not null default 0,
  device text,
  primary key (user_id, sid)
);
create index if not exists user_sessions_user_seen on public.user_sessions(user_id, last_seen desc);
alter table public.user_sessions enable row level security;
drop policy if exists "admin reads sessions" on public.user_sessions;
create policy "admin reads sessions" on public.user_sessions for select using (public.is_admin());
create or replace function public.heartbeat(p_sid text, p_sec int, p_pages int, p_device text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); s text := left(p_sid, 40); prev timestamptz;
begin
  if u is null or s is null or s !~ '^[a-z0-9]{6,40}$' then return; end if;
  select last_seen into prev from public.user_sessions where user_id = u and sid = s;
  if prev is null then
    insert into public.user_sessions(user_id, sid, seconds, pages, device)
    values (u, s, 0, least(greatest(coalesce(p_pages, 1), 0), 20), left(p_device, 10));
  else
    update public.user_sessions set
      seconds = seconds + case when now() - prev >= interval '20 seconds' then least(greatest(coalesce(p_sec, 0), 0), 60) else 0 end,
      pages = pages + least(greatest(coalesce(p_pages, 0), 0), 20),
      last_seen = now()
    where user_id = u and sid = s;
  end if;
end $$;
revoke all on function public.heartbeat(text, int, int, text) from public, anon;
grant execute on function public.heartbeat(text, int, int, text) to authenticated;
