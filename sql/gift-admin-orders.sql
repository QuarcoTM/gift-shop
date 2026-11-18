-- Gift shop / order admin workflow: 2026-11-18
-- Runs without changing checkout_enabled, existing customers, products or orders.
-- Safe to reapply. All mutations through admin-only authenticated RPC.
begin;

alter table public.gift_orders
  add column if not exists waybill_number text,
  add column if not exists customer_shipping_confirmed_at timestamptz,
  add column if not exists return_in_transit_at timestamptz,
  add column if not exists return_received_at timestamptz,
  add column if not exists return_stock_restored_at timestamptz,
  add column if not exists return_refunded_at timestamptz;

alter table public.gift_orders
  drop constraint if exists gift_waybill_number_length;
alter table public.gift_orders
  add constraint gift_waybill_number_length check (
    waybill_number is null or
    (char_length(waybill_number) between 5 and 80 and waybill_number !~ '[[:cntrl:]]')
  );
alter table public.gift_orders
  drop constraint if exists gift_return_restored_requires_receipt;
alter table public.gift_orders
  add constraint gift_return_restored_requires_receipt
  check (return_stock_restored_at is null or return_received_at is not null);
alter table public.gift_orders
  drop constraint if exists gift_return_refunded_requires_receipt;
alter table public.gift_orders
  add constraint gift_return_refunded_requires_receipt
  check (return_refunded_at is null or return_received_at is not null);

create or replace function public.gift_admin_order_action(
  p_order_id uuid,
  p_action text,
  p_expected_updated_at timestamptz,
  p_shipping_eur numeric default null,
  p_waybill_number text default null,
  p_confirmed_with_customer boolean default false,
  p_restore_stock boolean default false
) returns public.gift_orders
language plpgsql security definer set search_path to ''
as $function$
declare
  v public.gift_orders%rowtype;
  v_waybill text := btrim(coalesce(p_waybill_number, ''));
begin
  -- Do not trust the client UI or the existence of a session alone.
  if (select auth.uid()) is null or not exists (
    select 1 from public.gift_admins a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ) then
    raise exception 'Нямаш права да обработваш поръчки.' using errcode = '42501';
  end if;
  if p_order_id is null or p_action is null then
    raise exception 'Невалидно действие върху поръчката.';
  end if;
  select * into v from public.gift_orders where id=p_order_id for update;
  if not found then raise exception 'Поръчката не е намерена.'; end if;
  if p_expected_updated_at is null or v.updated_at is distinct from p_expected_updated_at then
    raise exception 'Поръчката е променена междувременно. Обнови я и опитай отново.';
  end if;

  case p_action
    when 'quote' then
      if v.status <> 'pending' then
        raise exception 'Цената за доставка се задава преди потвърждаване на поръчката.';
      end if;
      if p_shipping_eur is null or p_shipping_eur < 0 or p_shipping_eur > 500
         or p_shipping_eur <> pg_catalog.round(p_shipping_eur,2) then
        raise exception 'Въведи коректна цена за доставка в евро с до две цифри след запетаята.';
      end if;
      update public.gift_orders set
        shipping_eur=p_shipping_eur,shipping_quote_pending=false,
        total_eur=subtotal_eur+p_shipping_eur,updated_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    when 'confirm' then
      if v.status <> 'pending' or v.shipping_quote_pending then
        raise exception 'Първо уточни цената на доставката при нова поръчка.';
      end if;
      if p_confirmed_with_customer is distinct from true then
        raise exception 'Потвърди, че клиентът е приел доставката и крайната сума.';
      end if;
      update public.gift_orders set
        status='confirmed',customer_shipping_confirmed_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    when 'prepare' then
      if v.status <> 'confirmed' or v.customer_shipping_confirmed_at is null then
        raise exception 'Първо потвърди поръчката с клиента.';
      end if;
      update public.gift_orders set status='preparing'
      where id=v.id returning * into v;

    when 'ship' then
      if v.status <> 'preparing' then raise exception 'Поръчката трябва да е в подготовка.'; end if;
      if pg_catalog.length(v_waybill) not between 5 and 80 or v_waybill ~ '[[:cntrl:]]' then
        raise exception 'Въведи коректен номер на товарителница.';
      end if;
      update public.gift_orders set status='shipped',waybill_number=v_waybill
      where id=v.id returning * into v;

    when 'correct_waybill' then
      if v.status not in ('shipped','delivered') then
        raise exception 'Корекция на товарителница е възможна след изпращане.';
      end if;
      if pg_catalog.length(v_waybill) not between 5 and 80 or v_waybill ~ '[[:cntrl:]]' then
        raise exception 'Въведи коректен номер на товарителница.';
      end if;
      update public.gift_orders set waybill_number=v_waybill,
        updated_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    when 'deliver' then
      if v.status <> 'shipped' then raise exception 'Пратката първо трябва да е изпратена.'; end if;
      update public.gift_orders set status='delivered'
      where id=v.id returning * into v;

    when 'cancel' then
      if v.status not in ('pending','confirmed','preparing') then
        raise exception 'Изпратена или вече отказана поръчка не може да бъде анулирана.';
      end if;
      -- The existing status trigger restores reserved stock exactly once.
      update public.gift_orders set status='cancelled'
      where id=v.id returning * into v;

    when 'return_transit' then
      if v.withdrawal_requested_at is null then
        raise exception 'Няма заявен отказ от клиента за тази поръчка.';
      end if;
      if v.return_in_transit_at is not null or v.return_received_at is not null then
        raise exception 'Връщането вече се обработва или е получено.';
      end if;
      update public.gift_orders set return_in_transit_at=pg_catalog.clock_timestamp(),
        updated_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    when 'return_received' then
      if v.withdrawal_requested_at is null or v.return_received_at is not null then
        raise exception 'Няма нова заявка за връщане, която да отбележиш като получена.';
      end if;
      if v.status not in ('shipped','delivered') then
        raise exception 'Само изпратена поръчка може да се връща.';
      end if;
      if p_restore_stock is true then
        if exists (
          select 1 from public.gift_order_items i
          left join public.gift_products p on p.id=i.product_id
          where i.order_id=v.id and p.id is null
        ) then
          raise exception 'Част от продуктите са изтрити. Получи връщането без автоматично възстановяване на наличност.';
        end if;
        update public.gift_products p
        set stock_quantity=p.stock_quantity+i.quantity,updated_at=pg_catalog.clock_timestamp()
        from public.gift_order_items i
        where i.order_id=v.id and p.id=i.product_id;
      end if;
      update public.gift_orders set
        return_received_at=pg_catalog.clock_timestamp(),
        return_stock_restored_at=case when p_restore_stock is true
          then pg_catalog.clock_timestamp() else null end,
        updated_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    when 'restore_stock' then
      if v.withdrawal_requested_at is null or v.return_received_at is null
         or v.return_stock_restored_at is not null then
        raise exception 'Наличността може да се възстанови само веднъж след получено връщане.';
      end if;
      if exists (
        select 1 from public.gift_order_items i
        left join public.gift_products p on p.id=i.product_id
        where i.order_id=v.id and p.id is null
      ) then
        raise exception 'Част от продуктите са изтрити. Възстанови наличността ръчно след проверка.';
      end if;
      update public.gift_products p
      set stock_quantity=p.stock_quantity+i.quantity,updated_at=pg_catalog.clock_timestamp()
      from public.gift_order_items i
      where i.order_id=v.id and p.id=i.product_id;
      update public.gift_orders set return_stock_restored_at=pg_catalog.clock_timestamp(),
        updated_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    when 'return_refunded' then
      if v.withdrawal_requested_at is null or v.return_received_at is null
         or v.return_refunded_at is not null then
        raise exception 'Първо отбележи физически получената пратка; не отбелязвай повторно възстановяване на сума.';
      end if;
      -- This is a bookkeeping acknowledgment, not an actual bank transaction.
      update public.gift_orders set return_refunded_at=pg_catalog.clock_timestamp(),
        updated_at=pg_catalog.clock_timestamp()
      where id=v.id returning * into v;

    else
      raise exception 'Неподдържано действие върху поръчката.';
  end case;
  return v;
end
$function$;

-- Only authenticated administrators may execute this function; it checks gift_admins again.
revoke all on function public.gift_admin_order_action(uuid,text,timestamptz,numeric,text,boolean,boolean)
from public,anon,authenticated;
grant execute on function public.gift_admin_order_action(uuid,text,timestamptz,numeric,text,boolean,boolean)
to authenticated;

-- Prevent old/cached admin clients from bypassing server-side status transitions.
revoke update(status) on public.gift_orders from authenticated;
commit;
