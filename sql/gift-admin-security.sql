-- Gift shop: idempotent database security setup.
-- This script matches the policies applied to the Supabase Gift project.
-- Execute as a project administrator, never from browser code.
begin;

create schema if not exists gift_private;
revoke all on schema gift_private from public, anon;
grant usage on schema gift_private to authenticated;

create table if not exists public.gift_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.gift_admins enable row level security;
revoke all on public.gift_admins from anon, authenticated;
grant select on public.gift_admins to authenticated;

create or replace function gift_private.is_gift_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.gift_admins
    where user_id = (select auth.uid()) and is_active = true
  )
$$;
revoke all on function gift_private.is_gift_admin() from public, anon;
grant execute on function gift_private.is_gift_admin() to authenticated;

drop policy if exists gift_admins_self_read on public.gift_admins;
create policy gift_admins_self_read on public.gift_admins
  for select to authenticated
  using (user_id = (select auth.uid()) and is_active = true);

grant select, insert, update, delete on public.gift_categories, public.gift_products, public.gift_product_images to authenticated;
grant select on public.gift_orders, public.gift_order_items to authenticated;
grant update (status) on public.gift_orders to authenticated;

drop policy if exists gift_categories_admin_select on public.gift_categories;
create policy gift_categories_admin_select on public.gift_categories for select to authenticated using ((select gift_private.is_gift_admin()));
drop policy if exists gift_categories_admin_insert on public.gift_categories;
create policy gift_categories_admin_insert on public.gift_categories for insert to authenticated with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_categories_admin_update on public.gift_categories;
create policy gift_categories_admin_update on public.gift_categories for update to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_categories_admin_delete on public.gift_categories;
create policy gift_categories_admin_delete on public.gift_categories for delete to authenticated using ((select gift_private.is_gift_admin()));

drop policy if exists gift_products_admin_select on public.gift_products;
create policy gift_products_admin_select on public.gift_products for select to authenticated using ((select gift_private.is_gift_admin()));
drop policy if exists gift_products_admin_insert on public.gift_products;
create policy gift_products_admin_insert on public.gift_products for insert to authenticated with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_products_admin_update on public.gift_products;
create policy gift_products_admin_update on public.gift_products for update to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_products_admin_delete on public.gift_products;
create policy gift_products_admin_delete on public.gift_products for delete to authenticated using ((select gift_private.is_gift_admin()));

drop policy if exists gift_product_images_admin_select on public.gift_product_images;
create policy gift_product_images_admin_select on public.gift_product_images for select to authenticated using ((select gift_private.is_gift_admin()));
drop policy if exists gift_product_images_admin_insert on public.gift_product_images;
create policy gift_product_images_admin_insert on public.gift_product_images for insert to authenticated with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_product_images_admin_update on public.gift_product_images;
create policy gift_product_images_admin_update on public.gift_product_images for update to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_product_images_admin_delete on public.gift_product_images;
create policy gift_product_images_admin_delete on public.gift_product_images for delete to authenticated using ((select gift_private.is_gift_admin()));

drop policy if exists gift_orders_admin_select on public.gift_orders;
create policy gift_orders_admin_select on public.gift_orders for select to authenticated using ((select gift_private.is_gift_admin()));
drop policy if exists gift_orders_admin_update on public.gift_orders;
create policy gift_orders_admin_update on public.gift_orders for update to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
drop policy if exists gift_order_items_admin_select on public.gift_order_items;
create policy gift_order_items_admin_select on public.gift_order_items for select to authenticated using ((select gift_private.is_gift_admin()));

drop policy if exists gift_products_public_select on public.gift_products;
create policy gift_products_public_select on public.gift_products
  for select to anon, authenticated
  using (is_published = true and exists (
    select 1 from public.gift_categories c
    where c.id = gift_products.category_id and c.is_active = true
  ));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('gift-product-images','gift-product-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=excluded.public, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists gift_product_storage_admin_select on storage.objects;
create policy gift_product_storage_admin_select on storage.objects
  for select to authenticated using (bucket_id='gift-product-images' and (select gift_private.is_gift_admin()));
drop policy if exists gift_product_storage_admin_insert on storage.objects;
create policy gift_product_storage_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id='gift-product-images' and (select gift_private.is_gift_admin()));
drop policy if exists gift_product_storage_admin_update on storage.objects;
create policy gift_product_storage_admin_update on storage.objects
  for update to authenticated using (bucket_id='gift-product-images' and (select gift_private.is_gift_admin()))
  with check (bucket_id='gift-product-images' and (select gift_private.is_gift_admin()));
drop policy if exists gift_product_storage_admin_delete on storage.objects;
create policy gift_product_storage_admin_delete on storage.objects
  for delete to authenticated using (bucket_id='gift-product-images' and (select gift_private.is_gift_admin()));


-- One-time approved email for the initial administrator.
-- The actual Auth user is created separately from Authentication > Users.
-- A verified email is necessary before membership is created automatically.
create table if not exists gift_private.gift_admin_invites (
  email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint gift_admin_invite_email_normalized check (email = lower(btrim(email)))
);
revoke all on gift_private.gift_admin_invites from public, anon, authenticated;

-- Populate the approved email only from a trusted, private management session.
-- Do not commit an administrator's address to this public repository.
-- Example executed privately:
-- insert into gift_private.gift_admin_invites (email, enabled)
-- values ('YOUR_APPROVED_ADMIN_EMAIL', true)
-- on conflict (email) do update set enabled = excluded.enabled;

create or replace function gift_private.activate_verified_gift_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $
begin
  if new.email_confirmed_at is not null
     and new.is_anonymous is distinct from true
     and (tg_op = 'INSERT' or lower(coalesce(old.email,'')) = lower(coalesce(new.email,'')))
     and exists (
       select 1 from gift_private.gift_admin_invites i
       where i.email = lower(btrim(new.email)) and i.enabled = true
     )
  then
    insert into public.gift_admins (user_id, is_active)
    values (new.id, true)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$;
revoke all on function gift_private.activate_verified_gift_admin() from public, anon, authenticated;

drop trigger if exists gift_admin_verified_email on auth.users;
create trigger gift_admin_verified_email
after insert or update of email_confirmed_at on auth.users
for each row execute function gift_private.activate_verified_gift_admin();

insert into public.gift_admins (user_id, is_active)
select u.id, true
from auth.users u
join gift_private.gift_admin_invites a
  on a.email = lower(btrim(u.email)) and a.enabled
where u.email_confirmed_at is not null
  and u.is_anonymous is distinct from true
on conflict (user_id) do nothing;

commit;
