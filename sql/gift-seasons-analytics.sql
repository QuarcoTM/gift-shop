-- Gift-shop optional analytics + seasonal presets
-- Applied to Supabase Gift project. Re-runnable on the same project.
-- Anonymous sessions are counted only after frontend opt-in.
-- No names, IP addresses, user agents or marketing IDs are stored in these tables.
begin;

create table if not exists public.gift_shop_settings (
 id text primary key default 'main' check (id='main'),
 active_campaign text not null default 'christmas'
   check (active_campaign in ('christmas','easter','valentine','womens_day','martenitsa','everyday')),
 updated_at timestamptz not null default now()
);
alter table public.gift_shop_settings enable row level security;
insert into public.gift_shop_settings(id,active_campaign)
values ('main','christmas') on conflict(id) do nothing;

revoke all on public.gift_shop_settings from anon,authenticated;
grant select on public.gift_shop_settings to anon,authenticated;
grant update(active_campaign,updated_at) on public.gift_shop_settings to authenticated;
drop policy if exists gift_settings_public_read on public.gift_shop_settings;
create policy gift_settings_public_read on public.gift_shop_settings
 for select to anon,authenticated using (true);
drop policy if exists gift_settings_admin_update on public.gift_shop_settings;
create policy gift_settings_admin_update on public.gift_shop_settings
 for update to authenticated
 using ((select gift_private.is_gift_admin()))
 with check ((select gift_private.is_gift_admin()));

create table if not exists public.gift_visit_events (
 id bigint generated always as identity primary key,
 visit_date date not null default (timezone('Europe/Sofia',now()))::date,
 created_at timestamptz not null default now(),
 session_id uuid not null,
 page_path text not null check (page_path in (
   '/','/products/','/collections/','/collection/','/product/',
   '/cart/','/about/','/bulk/','/contact/'
 ))
);
create index if not exists gift_visit_events_date_idx
 on public.gift_visit_events(visit_date desc);
create index if not exists gift_visit_events_date_session_idx
 on public.gift_visit_events(visit_date,session_id);
alter table public.gift_visit_events enable row level security;
revoke all on public.gift_visit_events from public,anon,authenticated;
grant insert(session_id,page_path) on public.gift_visit_events to anon;
grant select on public.gift_visit_events to authenticated;
grant usage,select on sequence public.gift_visit_events_id_seq to anon;

drop policy if exists gift_visit_events_anonymous_insert on public.gift_visit_events;
create policy gift_visit_events_anonymous_insert on public.gift_visit_events
 for insert to anon with check (
  page_path in (
   '/','/products/','/collections/','/collection/','/product/',
   '/cart/','/about/','/bulk/','/contact/'
  )
  and visit_date=(timezone('Europe/Sofia',now()))::date
  and created_at <= now()+interval '1 minute'
 );
drop policy if exists gift_visit_events_admin_read on public.gift_visit_events;
create policy gift_visit_events_admin_read on public.gift_visit_events
 for select to authenticated using ((select gift_private.is_gift_admin()));

create or replace view public.gift_daily_analytics
 with (security_invoker=true) as
 select visit_date as day, count(*)::bigint as pageviews,
        count(distinct session_id)::bigint as unique_sessions
 from public.gift_visit_events group by visit_date;
revoke all on public.gift_daily_analytics from public,anon,authenticated;
grant select on public.gift_daily_analytics to authenticated;

create or replace view public.gift_page_analytics
 with (security_invoker=true) as
 select visit_date as day,page_path,count(*)::bigint as pageviews,
        count(distinct session_id)::bigint as unique_sessions
 from public.gift_visit_events group by visit_date,page_path;
revoke all on public.gift_page_analytics from public,anon,authenticated;
grant select on public.gift_page_analytics to authenticated;

commit;
