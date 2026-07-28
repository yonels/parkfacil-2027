-- Etapa 19.1: Centro de Notificaciones multicanal - fundacion e historial

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  parking_id uuid null,
  subscriber_id uuid null,
  user_id uuid null,
  type text not null,
  channel text not null,
  status text not null,
  recipient text null,
  recipient_name text null,
  subject text null,
  template_key text null,
  payload jsonb not null default '{}'::jsonb,
  provider text null,
  provider_message_id text null,
  attempt_count integer not null default 0,
  error_code text null,
  error_message text null,
  scheduled_at timestamptz null,
  processing_at timestamptz null,
  sent_at timestamptz null,
  delivered_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  constraint notifications_channel_check check (channel in ('email','whatsapp','internal')),
  constraint notifications_status_check check (status in ('draft','pending','processing','sent','delivered','failed','cancelled')),
  constraint notifications_type_check check (type in (
    'credential_created',
    'credential_status_changed',
    'subscriber_created',
    'subscriber_expiring',
    'subscriber_expired',
    'payment_received',
    'cash_closure',
    'contract_created',
    'contract_expiring',
    'quote_created',
    'quote_accepted',
    'operational_alert',
    'system_alert'
  )),
  constraint notifications_attempt_count_check check (attempt_count >= 0)
);

create table if not exists public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  attempt_number integer not null,
  provider text null,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  status text not null,
  error_code text null,
  error_message text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notification_attempts_status_check check (status in ('draft','pending','processing','sent','delivered','failed','cancelled')),
  constraint notification_attempts_number_check check (attempt_number > 0),
  constraint notification_attempts_unique_number unique (notification_id, attempt_number)
);

create index if not exists notifications_status_idx on public.notifications (status);
create index if not exists notifications_channel_idx on public.notifications (channel);
create index if not exists notifications_type_idx on public.notifications (type);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
create index if not exists notifications_subscriber_id_idx on public.notifications (subscriber_id);
create index if not exists notifications_parking_id_idx on public.notifications (parking_id);
create index if not exists notifications_channel_status_created_idx on public.notifications (channel, status, created_at desc);
create index if not exists notifications_type_status_created_idx on public.notifications (type, status, created_at desc);
create index if not exists notifications_recipient_search_idx on public.notifications using gin (to_tsvector('simple', coalesce(recipient,'') || ' ' || coalesce(recipient_name,'') || ' ' || coalesce(subject,'')));
create index if not exists notification_attempts_notification_id_idx on public.notification_attempts (notification_id);
create index if not exists notification_attempts_status_idx on public.notification_attempts (status);

create or replace function public.set_notifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at
before update on public.notifications
for each row
execute function public.set_notifications_updated_at();

create or replace function public.sync_notification_attempt_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.notifications set attempt_count = attempt_count + 1 where id = new.notification_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.notifications set attempt_count = greatest(attempt_count - 1, 0) where id = old.notification_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notification_attempt_count_insert on public.notification_attempts;
create trigger trg_notification_attempt_count_insert
after insert on public.notification_attempts
for each row
execute function public.sync_notification_attempt_count();

drop trigger if exists trg_notification_attempt_count_delete on public.notification_attempts;
create trigger trg_notification_attempt_count_delete
after delete on public.notification_attempts
for each row
execute function public.sync_notification_attempt_count();

alter table public.notifications enable row level security;
alter table public.notification_attempts enable row level security;

drop policy if exists notifications_select_authenticated on public.notifications;
create policy notifications_select_authenticated
on public.notifications
for select
to authenticated
using (true);

drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated
on public.notifications
for insert
to authenticated
with check (true);

drop policy if exists notifications_update_authenticated on public.notifications;
create policy notifications_update_authenticated
on public.notifications
for update
to authenticated
using (true)
with check (true);

drop policy if exists notification_attempts_select_authenticated on public.notification_attempts;
create policy notification_attempts_select_authenticated
on public.notification_attempts
for select
to authenticated
using (true);

drop policy if exists notification_attempts_insert_authenticated on public.notification_attempts;
create policy notification_attempts_insert_authenticated
on public.notification_attempts
for insert
to authenticated
with check (true);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.notifications, public.notification_attempts to service_role;
grant execute on function public.set_notifications_updated_at() to service_role;
grant execute on function public.sync_notification_attempt_count() to service_role;
