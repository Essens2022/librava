-- Publisher: complete KDP book packages sold to ONE buyer only (with publishing rights).
-- Safe to run once. Existing books are untouched.
alter table public.books drop constraint if exists books_product_type_check;
alter table public.books add constraint books_product_type_check
  check (product_type in ('ebook','planner','calendar','organizer','spreadsheet','template','game','coloring','kids','wallart','cards','publisher'));
-- exclusivity: a package is sold once. While a buyer is paying it is held for 15 minutes.
alter table public.books add column if not exists sold_at timestamptz;
alter table public.books add column if not exists reserved_until timestamptz;
alter table public.books add column if not exists reserved_order uuid;
-- the package files and the license are separate, simple facts shown on the card
alter table public.books add column if not exists pub_platforms text[] default '{}';
