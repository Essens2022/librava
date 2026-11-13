-- Digital catalogue: new product types (printable games, coloring pages, kids worksheets, wall art, cards & invitations).
alter table public.books drop constraint if exists books_product_type_check;
alter table public.books add constraint books_product_type_check
  check (product_type in ('ebook','planner','calendar','organizer','spreadsheet','template','game','coloring','kids','wallart','cards'));
