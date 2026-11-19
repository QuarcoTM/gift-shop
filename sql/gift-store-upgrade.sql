alter table public.gift_products
  add column contents text not null default '' check(length(contents)<=2000),
  add column featured_slot smallint check(featured_slot between 1 and 4),
  add column packed_photo text check(packed_photo is null or packed_photo ~ '^https://');
create unique index gift_featured_slot on public.gift_products(featured_slot) where featured_slot is not null;
alter table public.gift_shop_settings add column contact_email text not null default ''
  check(contact_email='' or contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');
grant update(contact_email) on public.gift_shop_settings to authenticated;

create table public.gift_components (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(trim(name)) between 1 and 120),
  units integer not null default 0 check(units>=0),
  unit_cost numeric(12,4) not null default 0 check(unit_cost>=0)
);
create table public.gift_recipes (
  product_id uuid not null references public.gift_products(id) on delete cascade,
  component_id uuid not null references public.gift_components(id),
  units integer not null check(units between 1 and 10000),
  primary key(product_id,component_id)
);
create table gift_private.component_reservations (
  item_id uuid not null references public.gift_order_items(id),
  component_id uuid not null references public.gift_components(id),
  units integer not null, primary key(item_id,component_id)
);
revoke all on gift_private.component_reservations from public, anon, authenticated;

create table public.gift_inquiries (
  id uuid primary key, created_at timestamptz not null default now(),
  quantity integer not null check(quantity between 1 and 100000),
  budget numeric(10,2) not null check(budget>0), needed_on date not null,
  contact text not null check(length(trim(contact)) between 5 and 160),
  occasion text not null check(length(occasion)<=500),
  handled boolean not null default false
);
alter table public.gift_components enable row level security;
alter table public.gift_recipes enable row level security;
alter table public.gift_inquiries enable row level security;
revoke all on public.gift_components, public.gift_recipes, public.gift_inquiries from public, anon, authenticated;
grant select,insert,update on public.gift_components to authenticated;
grant select,insert,update,delete on public.gift_recipes to authenticated;
grant select,update(handled) on public.gift_inquiries to authenticated;
create policy components_admin on public.gift_components for all to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
create policy recipes_admin on public.gift_recipes for all to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
create policy inquiries_admin on public.gift_inquiries for all to authenticated using ((select gift_private.is_gift_admin())) with check ((select gift_private.is_gift_admin()));
create index gift_inquiry_contact_time on public.gift_inquiries(lower(trim(contact)),created_at);
create function public.gift_ask_offer(p_id uuid,p_quantity integer,p_budget numeric,p_date date,p_contact text,p_occasion text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gift-inquiry',0));
  if exists(select 1 from public.gift_inquiries where id=p_id) then return; end if;
  if p_date < (now() at time zone 'Europe/Sofia')::date or p_contact !~ '(@|[0-9].*[0-9].*[0-9].*[0-9].*[0-9])' then
    raise exception 'Провери датата и данните за контакт.';
  end if;
  if (select count(*) from public.gift_inquiries where created_at>now()-interval '5 minutes')>=30 or
     (select count(*) from public.gift_inquiries where lower(trim(contact))=lower(trim(p_contact)) and created_at>now()-interval '1 hour')>=3 then
    raise exception 'Опитай отново по-късно.';
  end if;
  insert into public.gift_inquiries(id,quantity,budget,needed_on,contact,occasion)
     values(p_id,p_quantity,p_budget,p_date,trim(p_contact),trim(p_occasion));
end $$;
revoke all on function public.gift_ask_offer(uuid,integer,numeric,date,text,text) from public;
grant execute on function public.gift_ask_offer(uuid,integer,numeric,date,text,text) to anon,authenticated;

create function public.gift_store_capacity() returns table(product_id uuid,available integer)
language sql stable security definer set search_path='' as $$
 select p.id,least(p.stock_quantity,min(c.units/r.units))
 from public.gift_products p join public.gift_categories cat on cat.id=p.category_id and cat.is_active
 join public.gift_recipes r on r.product_id=p.id join public.gift_components c on c.id=r.component_id
 where p.is_published group by p.id
$$;
revoke all on function public.gift_store_capacity() from public;
grant execute on function public.gift_store_capacity() to anon,authenticated;

create function gift_private.reserve_parts() returns trigger language plpgsql security definer set search_path='' as $$
declare part record;
begin
  perform 1 from public.gift_products where id=new.product_id for update;
  for part in select component_id,units*new.quantity as needed from public.gift_recipes where product_id=new.product_id order by component_id loop
    update public.gift_components set units=units-part.needed where id=part.component_id and units>=part.needed;
    if not found then raise exception 'Наличността на комплекта се промени. Обнови количката.'; end if;
    insert into gift_private.component_reservations values(new.id,part.component_id,part.needed);
  end loop;
  return new;
end $$;
create trigger gift_reserve_parts after insert on public.gift_order_items for each row execute function gift_private.reserve_parts();
create function gift_private.restore_parts() returns trigger language plpgsql security definer set search_path='' as $$
declare part record;
begin
  if (new.status='cancelled' and old.status<>'cancelled') or
     (new.return_stock_restored_at is not null and old.return_stock_restored_at is null) then
    for part in select r.component_id,sum(r.units)::integer as units from gift_private.component_reservations r
      join public.gift_order_items i on i.id=r.item_id where i.order_id=new.id group by r.component_id order by r.component_id loop
      update public.gift_components set units=units+part.units where id=part.component_id;
    end loop;
    delete from gift_private.component_reservations r using public.gift_order_items i where i.id=r.item_id and i.order_id=new.id;
  end if;
  return new;
end $$;
create trigger gift_restore_parts after update of status,return_stock_restored_at on public.gift_orders for each row execute function gift_private.restore_parts();
revoke all on function gift_private.reserve_parts(),gift_private.restore_parts() from public,anon,authenticated;

create function public.gift_set_recipe(p_product uuid,p_parts jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
  if not gift_private.is_gift_admin() then raise exception 'Нямаш достъп.'; end if;
  perform 1 from public.gift_products where id=p_product for update;
  if not found then raise exception 'Комплектът липсва.'; end if;
  delete from public.gift_recipes where product_id=p_product;
  insert into public.gift_recipes(product_id,component_id,units)
   select p_product,x.component_id,x.units from pg_catalog.jsonb_to_recordset(p_parts) as x(component_id uuid,units integer);
end $$;
revoke all on function public.gift_set_recipe(uuid,jsonb) from public,anon;
grant execute on function public.gift_set_recipe(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
