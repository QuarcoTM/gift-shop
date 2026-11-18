begin;
-- New Year has its own permanent catalog category regardless of the active theme.
insert into public.gift_categories (name, slug, description, sort_order, is_active)
select 'Нова година', 'nova-godina', 'Подаръци за посрещането на Нова година.', 15, true
where not exists (select 1 from public.gift_categories where slug='nova-godina');
-- If a holiday category already existed, preserve its existing content but make it accessible.
update public.gift_categories set is_active=true where slug='nova-godina' and is_active is distinct from true;
-- Allow selecting the New Year theme in the existing protected admin campaign picker.
alter table public.gift_shop_settings
  drop constraint if exists gift_shop_settings_active_campaign_check;
alter table public.gift_shop_settings
  add constraint gift_shop_settings_active_campaign_check
  check (active_campaign in ('christmas','new_year','easter','valentine','womens_day','martenitsa','everyday'));
commit;