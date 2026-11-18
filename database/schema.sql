-- Gift Shop database schema
-- Applied to separate Supabase project: ycsjfsoijafepgslzzlz
-- Source-of-truth copy for reproducibility; do not run again on existing schema.
-- Catalog is publicly readable only when products are published.
-- Customer orders are private; inserts/updates must come from trusted backend.

create table public.gift_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.gift_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.gift_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price_eur numeric(10,2) not null check (price_eur >= 0),
  compare_at_price_eur numeric(10,2) check (compare_at_price_eur is null or compare_at_price_eur >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gift_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.gift_products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.gift_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  delivery_method text,
  delivery_city text,
  delivery_address text,
  customer_note text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','preparing','shipped','delivered','cancelled')),
  subtotal_eur numeric(10,2) not null default 0 check (subtotal_eur >= 0),
  shipping_eur numeric(10,2) not null default 0 check (shipping_eur >= 0),
  total_eur numeric(10,2) not null default 0 check (total_eur >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gift_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.gift_orders(id) on delete cascade,
  product_id uuid references public.gift_products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_eur numeric(10,2) not null check (unit_price_eur >= 0),
  created_at timestamptz not null default now()
);

create index gift_products_category_idx on public.gift_products(category_id);
create index gift_products_published_idx on public.gift_products(is_published);
create index gift_product_images_product_sort_idx on public.gift_product_images(product_id,sort_order);
create index gift_orders_created_at_idx on public.gift_orders(created_at desc);
create index gift_orders_status_idx on public.gift_orders(status);
create index gift_order_items_order_idx on public.gift_order_items(order_id);
create index gift_order_items_product_idx on public.gift_order_items(product_id);

alter table public.gift_categories enable row level security;
alter table public.gift_products enable row level security;
alter table public.gift_product_images enable row level security;
alter table public.gift_orders enable row level security;
alter table public.gift_order_items enable row level security;

revoke all on public.gift_categories,public.gift_products,public.gift_product_images,public.gift_orders,public.gift_order_items from anon,authenticated;
grant select on public.gift_categories,public.gift_products,public.gift_product_images to anon,authenticated;
grant all on public.gift_categories,public.gift_products,public.gift_product_images,public.gift_orders,public.gift_order_items to service_role;

create policy gift_categories_public_select
  on public.gift_categories for select to anon,authenticated using (is_active = true);
create policy gift_products_public_select
  on public.gift_products for select to anon,authenticated using (is_published = true);
create policy gift_product_images_public_select
  on public.gift_product_images for select to anon,authenticated
  using (exists (select 1 from public.gift_products p where p.id=product_id and p.is_published=true));
