-- Gift shop: safe guest order draft and stock management (2026-11-18)
-- Idempotent. Keep checkout disabled until legal merchant information,
-- courier terms and customer notifications are configured.
begin;
alter table public.gift_shop_settings add column if not exists checkout_enabled boolean not null default false;
revoke all on public.gift_shop_settings from anon,authenticated;
grant select on public.gift_shop_settings to anon,authenticated;
grant update(active_campaign,updated_at,checkout_enabled) on public.gift_shop_settings to authenticated;

create sequence if not exists public.gift_order_number_seq;
revoke all on sequence public.gift_order_number_seq from public,anon,authenticated;
alter table public.gift_orders add column if not exists order_number bigint;
alter table public.gift_orders alter column order_number set default nextval('public.gift_order_number_seq'::regclass);
update public.gift_orders set order_number=nextval('public.gift_order_number_seq'::regclass) where order_number is null;
alter table public.gift_orders alter column order_number set not null;
create unique index if not exists gift_orders_order_number_uniq on public.gift_orders(order_number);
alter table public.gift_orders add column if not exists request_key uuid;
create unique index if not exists gift_orders_request_key_uniq on public.gift_orders(request_key);
alter table public.gift_orders add column if not exists delivery_courier text;
alter table public.gift_orders add column if not exists payment_method text not null default 'cod';
alter table public.gift_orders add column if not exists shipping_quote_pending boolean not null default true;
comment on column public.gift_orders.shipping_eur is '0 while shipping_quote_pending=true means UNKNOWN delivery fee, not free shipping.';
comment on column public.gift_orders.total_eur is 'While shipping_quote_pending=true, total_eur is the product-only subtotal.';
CREATE OR REPLACE FUNCTION public.gift_submit_order(p_request_key uuid, p_customer_name text, p_customer_phone text, p_customer_email text, p_courier text, p_delivery_type text, p_delivery_city text, p_delivery_location text, p_customer_note text, p_items jsonb, p_shipping_ack boolean, p_expected_subtotal numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text := btrim(coalesce(p_customer_name,''));
  v_phone text := regexp_replace(coalesce(p_customer_phone,''),'[^0-9+]','','g');
  v_email text := lower(btrim(coalesce(p_customer_email,'')));
  v_city text := btrim(coalesce(p_delivery_city,''));
  v_place text := btrim(coalesce(p_delivery_location,''));
  v_note text := btrim(coalesce(p_customer_note,''));
  v_code bigint;
  v_id uuid;
  v_old record;
  v_line record;
  v_count integer := 0;
  v_subtotal numeric(12,2) := 0;
  v_total_qty integer := 0;
  v_n integer;
begin
  -- Any order data is written only by this fixed validation path.
  if p_request_key is null then raise exception 'Невалидна заявка. Опитай отново.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gift-order-key:'||p_request_key::text,0));
  select id,order_number,subtotal_eur,customer_phone into v_old
    from public.gift_orders where request_key=p_request_key;
  if found then
    if regexp_replace(v_old.customer_phone,'[^0-9+]','','g')<>v_phone then
      raise exception 'Невалидна повторна заявка.';
    end if;
    return pg_catalog.jsonb_build_object('order_code','ZU-'||pg_catalog.lpad(v_old.order_number::text,6,'0'),
      'subtotal_eur',v_old.subtotal_eur,'shipping_pending',true,'already_submitted',true);
  end if;
  if not exists (select 1 from public.gift_shop_settings where id='main' and checkout_enabled=true) then
    raise exception 'Поръчките все още не се приемат.';
  end if;
  if pg_catalog.length(v_name) not between 3 and 120
      or pg_catalog.length(v_phone) not between 8 and 16
      or v_phone !~ '^\+?[0-9]{8,15}$'
      or pg_catalog.length(v_email) not between 6 and 254
      or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  then raise exception 'Попълни коректно име, телефон и имейл.'; end if;
  if p_courier not in ('econt','speedy')
    or p_delivery_type not in ('office','address')
    or pg_catalog.length(v_city) not between 2 and 100
    or pg_catalog.length(v_place) not between 5 and 220
    or pg_catalog.length(v_note)>600
  then raise exception 'Посочи валидни данни за куриер и доставка.'; end if;
  if p_shipping_ack is distinct from true then
    raise exception 'Потвърди, че доставката е отделна и се уточнява преди изпращане.';
  end if;
  if pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'Невалидна количка.';
  end if;
  v_n := pg_catalog.jsonb_array_length(p_items);
  if v_n < 1 or v_n > 20 then raise exception 'Избери от 1 до 20 различни продукта.'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_items) as el
    where pg_catalog.jsonb_typeof(el.value)<>'object'
      or (el.value->>'id') is null or (el.value->>'qty') is null
      or (el.value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (el.value->>'qty') !~ '^[0-9]{1,2}$'
  ) then raise exception 'Невалидни продукти или количества.'; end if;
  if (select count(distinct (el.value->>'id')) from pg_catalog.jsonb_array_elements(p_items) el) <> v_n then
    raise exception 'Повтарящ се продукт в количката.';
  end if;
  -- Transactional anti-abuse limits: server-enforced even when JavaScript is bypassed.
  -- The global advisory lock serializes counters, including simultaneous requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gift-order-global-burst',0));
  if (select count(*) from public.gift_orders
      where created_at>pg_catalog.now()-interval '5 minutes')>=20
  then raise exception 'Твърде много заявки в момента. Опитай по-късно.'; end if;
  if (select count(*) from public.gift_orders
      where customer_phone=v_phone and created_at>pg_catalog.now()-interval '90 seconds')>=1
  then raise exception 'Изчакай малко преди нова поръчка.'; end if;
  if (select count(*) from public.gift_orders
      where customer_phone=v_phone and created_at>pg_catalog.now()-interval '1 hour')>=3
  then raise exception 'Твърде много заявки. Опитай по-късно.'; end if;
  if (select count(*) from public.gift_orders
      where customer_phone=v_phone and created_at>pg_catalog.now()-interval '24 hours')>=6
  then raise exception 'Достигнат е дневният лимит за поръчки.'; end if;
  if (select count(*) from public.gift_orders
      where lower(customer_email)=v_email and created_at>pg_catalog.now()-interval '1 hour')>=3
  then raise exception 'Твърде много заявки за този имейл. Опитай по-късно.'; end if;
  if (select count(*) from public.gift_orders
      where lower(customer_email)=v_email and created_at>pg_catalog.now()-interval '24 hours')>=6
  then raise exception 'Достигнат е дневният лимит за този имейл.'; end if;
  if (select count(*) from public.gift_orders
      where lower(btrim(delivery_city))=lower(v_city)
        and lower(btrim(delivery_address))=lower(v_place)
        and created_at>pg_catalog.now()-interval '24 hours')>=8
  then raise exception 'Твърде много заявки за този адрес или офис. Опитай по-късно.'; end if;

    -- Lock available products in stable UUID order. Neither prices nor stock
  -- are taken from the browser. Any error rolls the entire transaction back.
  for v_line in
    select p.id,p.name,p.price_eur,p.stock_quantity,x.qty
    from pg_catalog.jsonb_to_recordset(p_items) as x(id uuid,qty integer)
    join public.gift_products p on p.id=x.id
    join public.gift_categories c on c.id=p.category_id
    where p.is_published=true and c.is_active=true
    order by p.id
    for update of p
  loop
    if v_line.qty is null or v_line.qty<1 or v_line.qty>20 or
       v_line.stock_quantity<v_line.qty or v_line.price_eur<=0 then
      raise exception 'Продуктът не е наличен в желаното количество.';
    end if;
    v_count := v_count+1;
    v_total_qty := v_total_qty+v_line.qty;
    v_subtotal := v_subtotal+v_line.price_eur*v_line.qty;
  end loop;
  if v_count<>v_n or v_total_qty>40 then
    raise exception 'Някои продукти вече не са налични. Обнови количката.';
  end if;
  if p_expected_subtotal is null or pg_catalog.round(p_expected_subtotal,2)<>v_subtotal then
    raise exception 'Цената е променена. Обнови количката преди поръчка.';
  end if;

  insert into public.gift_orders
   (customer_name,customer_phone,customer_email,delivery_method,delivery_courier,
    delivery_city,delivery_address,customer_note,status,subtotal_eur,shipping_eur,total_eur,
    payment_method,shipping_quote_pending,request_key)
  values(v_name,v_phone,v_email,p_courier||'_'||p_delivery_type,p_courier,
    v_city,v_place,nullif(v_note,''),'pending',v_subtotal,0,v_subtotal,
    'cod',true,p_request_key)
  returning id,order_number into v_id,v_code;

  for v_line in
    select p.id,p.name,p.price_eur,x.qty
    from pg_catalog.jsonb_to_recordset(p_items) as x(id uuid,qty integer)
    join public.gift_products p on p.id=x.id
    order by p.id
  loop
    update public.gift_products set stock_quantity=stock_quantity-v_line.qty,updated_at=pg_catalog.now()
      where id=v_line.id and stock_quantity>=v_line.qty;
    if not found then raise exception 'Наличността е променена. Обнови количката.'; end if;
    insert into public.gift_order_items(order_id,product_id,product_name,quantity,unit_price_eur)
      values (v_id,v_line.id,v_line.name,v_line.qty,v_line.price_eur);
  end loop;
  return pg_catalog.jsonb_build_object(
    'order_code','ZU-'||pg_catalog.lpad(v_code::text,6,'0'),
    'subtotal_eur',v_subtotal,'shipping_pending',true,'already_submitted',false);
end;
$function$
;
CREATE OR REPLACE FUNCTION gift_private.gift_restore_cancelled_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status='cancelled' and new.status<>'cancelled' then
    raise exception 'Отказана поръчка не може да бъде повторно активирана.';
  end if;
  if old.status<>'cancelled' and new.status='cancelled' then
    update public.gift_products p
       set stock_quantity=p.stock_quantity + i.quantity,updated_at=pg_catalog.now()
      from public.gift_order_items i
      where i.order_id=new.id and p.id=i.product_id;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$
;

revoke all on function public.gift_submit_order(uuid,text,text,text,text,text,text,text,text,jsonb,boolean,numeric) from public,anon,authenticated;
grant execute on function public.gift_submit_order(uuid,text,text,text,text,text,text,text,text,jsonb,boolean,numeric) to anon;
revoke all on function gift_private.gift_restore_cancelled_stock() from public,anon,authenticated;
drop trigger if exists gift_orders_restore_cancelled_stock on public.gift_orders;
create trigger gift_orders_restore_cancelled_stock before update of status on public.gift_orders
for each row execute function gift_private.gift_restore_cancelled_stock();

revoke all on public.gift_orders,public.gift_order_items from anon;
revoke insert,update,delete on public.gift_orders,public.gift_order_items from authenticated;
grant select on public.gift_orders,public.gift_order_items to authenticated;
grant update(status) on public.gift_orders to authenticated;
commit;