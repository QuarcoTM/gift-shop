-- Gift shop: order management and post-dispatch withdrawal metadata (2026-11-18).
-- Applied to gift-shop database. Reapply idempotently for another environment.
-- Order access uses the existing unpredictable v4 checkout request_key:
-- it is only known to the checkout browser and the stored customer email.
-- The browser NEVER receives a service-role key.
begin;
alter table public.gift_orders
 add column if not exists withdrawal_requested_at timestamptz,
 add column if not exists withdrawal_note text,
 add column if not exists delivered_at timestamptz,
 add column if not exists receipt_email_sent_at timestamptz,
 add column if not exists receipt_email_attempted_at timestamptz,
 add column if not exists withdrawal_ack_email_sent_at timestamptz,
 add column if not exists link_email_last_sent_at timestamptz;
alter table public.gift_orders
 drop constraint if exists gift_orders_withdrawal_note_length;
alter table public.gift_orders
 add constraint gift_orders_withdrawal_note_length
 check (withdrawal_note is null or length(withdrawal_note)<=600);

create or replace function gift_private.gift_restore_cancelled_stock()
 returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if old.status='cancelled' and new.status<>'cancelled' then
    raise exception 'Отказана поръчка не може да бъде повторно активирана.';
  end if;
  if old.status<>'cancelled' and new.status='cancelled' then
    if old.status in ('shipped','delivered') then
      raise exception 'Изпратена поръчка не се анулира. Обработи заявка за връщане.';
    end if;
    update public.gift_products p
      set stock_quantity=p.stock_quantity+i.quantity,updated_at=pg_catalog.now()
      from public.gift_order_items i
      where i.order_id=new.id and p.id=i.product_id;
  end if;
  if old.status is distinct from new.status
     and new.status='delivered' and new.delivered_at is null then
    new.delivered_at=pg_catalog.now();
  end if;
  new.updated_at=pg_catalog.now();
  return new;
end $$;
revoke all on function gift_private.gift_restore_cancelled_stock() from public,anon,authenticated;
commit;

-- New order email integration:
-- 1) Configure RESEND_API_KEY and ORDER_MAIL_FROM as Supabase Edge Function secrets.
-- 2) Verify ORDER_MAIL_FROM's domain with the provider.
-- 3) Leave checkout_enabled=false until genuine test receipts and withdrawal acknowledgments succeed.
-- 4) Never enter those secrets in site-config.js or commit them into GitHub.
