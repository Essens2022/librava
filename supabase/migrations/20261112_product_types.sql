-- Digital products (planners, calendars, organizers, spreadsheets, templates) next to ebooks.
-- Safe to run once; existing books keep working (product_type defaults to 'ebook').
alter table public.books add column if not exists product_type text not null default 'ebook';
alter table public.books drop constraint if exists books_product_type_check;
alter table public.books add constraint books_product_type_check
  check (product_type in ('ebook','planner','calendar','organizer','spreadsheet','template'));
alter table public.books drop constraint if exists books_format_check;
alter table public.books add constraint books_format_check
  check (format in ('pdf','epub','xlsx','docx','zip'));
create index if not exists books_product_type_idx on public.books (product_type) where deleted_at is null;
