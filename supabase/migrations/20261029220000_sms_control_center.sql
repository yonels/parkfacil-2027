-- Centro de Control SMS (SOL-2026-10-29-007). Migración ADITIVA: solo crea
-- objetos nuevos con prefijo sms_. No modifica on_street_pilot_notifications,
-- on_street_inspections, sus triggers ni sus funciones -- los flujos On
-- Street / Inspector siguen exactamente igual y se leen a través de la vista
-- sms_history_v. Reversión: 20261029220000_sms_control_center.down.sql
-- (fuera de supabase/migrations para que la CLI no la aplique).
--
-- Estados (ajustados a Sentraland, ver docs de la solicitud):
--   CREATED, QUEUED, SENDING, ACCEPTED (codigo=0 + idmensaje),
--   PENDING_CONFIRMATION (smsstatus consultado sin DELIVRD), DELIVERED
--   (DELIVRD), REJECTED (codigo<>0 / REJECTD), FAILED (error técnico /
--   UNDELIV), EXPIRED, CANCELLED, UNKNOWN (timeout del envío, estado 7/104).

-- 1) Configuración (fila única) -------------------------------------------
create table if not exists public.sms_settings (
  id boolean primary key default true check (id),
  retention_days integer not null default 365 check (retention_days between 30 and 3650),
  rate_limit_user_per_hour integer not null default 20 check (rate_limit_user_per_hour between 1 and 10000),
  rate_limit_company_per_hour integer not null default 500 check (rate_limit_company_per_hour between 1 and 100000),
  rate_limit_phone_per_hour integer not null default 5 check (rate_limit_phone_per_hour between 1 and 1000),
  test_send_cooldown_seconds integer not null default 60 check (test_send_cooldown_seconds between 10 and 86400),
  test_allowed_phones text[] not null default array['+56966514044']::text[],
  auto_retry_max integer not null default 3 check (auto_retry_max between 0 and 5),
  auto_retry_delays_seconds integer[] not null default array[60,300,900]::integer[],
  unconfirmed_after_hours integer not null default 24 check (unconfirmed_after_hours between 1 and 720),
  inbound_enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid null
);
insert into public.sms_settings (id) values (true) on conflict (id) do nothing;

-- 2) Registro central de mensajes -----------------------------------------
create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('ON_STREET','OFF_STREET','ALERTS','HELPDESK','ADMIN','DIAGNOSTIC','OTHER')),
  message_type text not null check (char_length(message_type) between 1 and 60),
  company_id text null references public.companies(id) on delete restrict,
  parking_id uuid null references public.parkings(id) on delete restrict,
  origin_user_id uuid null,
  phone_normalized text null,
  phone_last4 text null check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  body text null,
  status text not null default 'CREATED' check (status in ('CREATED','QUEUED','SENDING','ACCEPTED','PENDING_CONFIRMATION','DELIVERED','REJECTED','FAILED','EXPIRED','CANCELLED','UNKNOWN')),
  provider text null check (provider is null or provider in ('SIMULATED','SENTRALAND')),
  is_simulated boolean not null default false,
  provider_message_id text null,
  provider_code text null,
  provider_description text null,
  error_code text null,
  error_category text null check (error_category is null or error_category in ('AUTH','CONNECTIVITY','INVALID_PHONE','PROVIDER_REJECTED','NO_BALANCE','TEMPORARY','UNCONFIRMED','CONFIG','VALIDATION','UNKNOWN')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 1 check (max_attempts between 1 and 6),
  next_retry_at timestamptz null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  parent_message_id uuid null references public.sms_messages(id) on delete restrict,
  root_message_id uuid null,
  queued_at timestamptz null,
  sent_at timestamptz null,
  accepted_at timestamptz null,
  delivered_at timestamptz null,
  failed_at timestamptz null,
  status_checks integer not null default 0 check (status_checks >= 0),
  last_status_check_at timestamptz null,
  redacted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  -- Teléfono y texto obligatorios mientras no se apliquen las reglas de retención.
  constraint sms_messages_phone_check check (redacted_at is not null or phone_normalized ~ '^\+569[0-9]{8}$'),
  constraint sms_messages_body_check check (redacted_at is not null or char_length(body) between 1 and 160)
);
create unique index if not exists sms_messages_idempotency_uidx on public.sms_messages(idempotency_key);
create index if not exists sms_messages_created_idx on public.sms_messages(created_at desc);
create index if not exists sms_messages_company_created_idx on public.sms_messages(company_id, created_at desc);
create index if not exists sms_messages_status_idx on public.sms_messages(status, next_retry_at);
create index if not exists sms_messages_provider_message_idx on public.sms_messages(provider_message_id) where provider_message_id is not null;
create index if not exists sms_messages_phone_created_idx on public.sms_messages(phone_normalized, created_at desc);
create index if not exists sms_messages_delivery_pending_idx on public.sms_messages(accepted_at)
  where status in ('ACCEPTED','PENDING_CONFIRMATION') and provider_message_id is not null and not is_simulated;

-- 3) Historial de eventos (solo inserción) --------------------------------
create table if not exists public.sms_message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.sms_messages(id) on delete cascade,
  from_status text null,
  to_status text not null,
  source text not null check (source in ('SEND','DLR_POLL','MANUAL','RETRY','SYSTEM','DIAGNOSTIC')),
  provider_code text null,
  provider_description text null,
  detail jsonb not null default '{}'::jsonb,
  actor_user_id uuid null,
  dedupe_key text not null,
  created_at timestamptz not null default clock_timestamp()
);
-- Una misma notificación (p. ej. el mismo DLR leído dos veces) no se registra dos veces.
create unique index if not exists sms_message_events_dedupe_uidx on public.sms_message_events(message_id, dedupe_key);
create index if not exists sms_message_events_message_idx on public.sms_message_events(message_id, created_at);

-- 4) Bandeja de entrada (preparada; inbound_enabled=false hasta que Sentraland lo confirme)
create table if not exists public.sms_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('SENTRALAND')),
  provider_message_id text not null,
  from_phone text not null,
  body text null,
  received_at timestamptz not null,
  company_id text null references public.companies(id) on delete restrict,
  related_message_id uuid null references public.sms_messages(id) on delete set null,
  attention_status text not null default 'NEW' check (attention_status in ('NEW','IN_PROGRESS','RESOLVED','DISCARDED')),
  assigned_user_id uuid null,
  notes text null,
  redacted_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists sms_inbound_messages_provider_uidx on public.sms_inbound_messages(provider, provider_message_id);

-- 5) Diagnósticos del proveedor -------------------------------------------
create table if not exists public.sms_provider_checks (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  provider text not null,
  mode text not null check (mode in ('REAL','SIMULATED')),
  config_ok boolean not null,
  missing_vars text[] not null default '{}'::text[],
  auth_ok boolean null,
  connectivity_ok boolean null,
  balance jsonb null,
  error_code text null,
  provider_code text null,
  provider_description text null,
  duration_ms integer null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sms_provider_checks_created_idx on public.sms_provider_checks(created_at desc);

-- 6) Tarifas internas (nunca se presentan como valores del proveedor) ------
create table if not exists public.sms_tariffs (
  id uuid primary key default gen_random_uuid(),
  company_id text null references public.companies(id) on delete restrict,
  valid_from date not null,
  valid_to date null,
  unit_price numeric(12,4) not null check (unit_price >= 0),
  currency text not null default 'CLP' check (currency in ('CLP','UF','USD')),
  source text not null default 'INTERNAL' check (source in ('INTERNAL')),
  notes text null,
  created_by uuid null,
  archived_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  check (valid_to is null or valid_to >= valid_from)
);

-- 7) Auditoría administrativa ---------------------------------------------
create table if not exists public.sms_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  action text not null check (action in ('TEST_SEND','MANUAL_RESEND','CANCEL','DIAGNOSTIC_RUN','SETTINGS_UPDATE','TARIFF_CREATE','TARIFF_ARCHIVE','EXPORT','VIEW_FULL_PHONE','RETENTION_RUN','INBOUND_UPDATE')),
  target_type text null,
  target_id text null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sms_admin_audit_created_idx on public.sms_admin_audit(created_at desc);

-- 8) Funciones atómicas ---------------------------------------------------

-- Encola un mensaje: idempotente (misma clave => mismo registro, reused=true)
-- y con límites de frecuencia por usuario, empresa y teléfono evaluados bajo
-- un candado transaccional por teléfono (dos solicitudes simultáneas no
-- pueden saltarse el límite).
create or replace function public.sms_enqueue_message(p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  s public.sms_settings%rowtype;
  v_existing public.sms_messages%rowtype;
  v_row public.sms_messages%rowtype;
  v_phone text := p->>'phone_normalized';
  v_user uuid := nullif(p->>'origin_user_id','')::uuid;
  v_company text := nullif(p->>'company_id','');
  v_parent uuid := nullif(p->>'parent_message_id','')::uuid;
  v_root uuid;
  v_skip_limits boolean := coalesce((p->>'skip_rate_limits')::boolean, false);
  v_n integer;
begin
  select * into v_existing from public.sms_messages where idempotency_key = p->>'idempotency_key';
  if found then return jsonb_build_object('reused', true, 'message', to_jsonb(v_existing)); end if;

  perform pg_advisory_xact_lock(hashtext('sms_enqueue:' || coalesce(v_phone,'')));
  select * into v_existing from public.sms_messages where idempotency_key = p->>'idempotency_key';
  if found then return jsonb_build_object('reused', true, 'message', to_jsonb(v_existing)); end if;

  select * into s from public.sms_settings where id;
  if not v_skip_limits then
    select count(*) into v_n from public.sms_messages where phone_normalized = v_phone and created_at > clock_timestamp() - interval '1 hour';
    if v_n >= s.rate_limit_phone_per_hour then return jsonb_build_object('error','RATE_LIMITED','scope','PHONE','limit',s.rate_limit_phone_per_hour); end if;
    if v_user is not null then
      select count(*) into v_n from public.sms_messages where origin_user_id = v_user and created_at > clock_timestamp() - interval '1 hour';
      if v_n >= s.rate_limit_user_per_hour then return jsonb_build_object('error','RATE_LIMITED','scope','USER','limit',s.rate_limit_user_per_hour); end if;
    end if;
    if v_company is not null then
      select count(*) into v_n from public.sms_messages where company_id = v_company and created_at > clock_timestamp() - interval '1 hour';
      if v_n >= s.rate_limit_company_per_hour then return jsonb_build_object('error','RATE_LIMITED','scope','COMPANY','limit',s.rate_limit_company_per_hour); end if;
    end if;
  end if;

  if v_parent is not null then
    select coalesce(root_message_id, id) into v_root from public.sms_messages where id = v_parent;
    if v_root is null then return jsonb_build_object('error','PARENT_NOT_FOUND'); end if;
  end if;

  insert into public.sms_messages (module, message_type, company_id, parking_id, origin_user_id, phone_normalized, phone_last4, body,
    status, provider, is_simulated, idempotency_key, parent_message_id, root_message_id, max_attempts, queued_at, metadata)
  values (p->>'module', p->>'message_type', v_company, nullif(p->>'parking_id','')::uuid, v_user, v_phone, right(v_phone, 4), p->>'body',
    'QUEUED', p->>'provider', coalesce((p->>'is_simulated')::boolean, false), p->>'idempotency_key', v_parent, v_root,
    coalesce((p->>'max_attempts')::integer, 1), clock_timestamp(), coalesce(p->'metadata', '{}'::jsonb))
  returning * into v_row;
  if v_row.root_message_id is null then
    update public.sms_messages set root_message_id = id where id = v_row.id returning * into v_row;
  end if;

  insert into public.sms_message_events (message_id, from_status, to_status, source, actor_user_id, dedupe_key, detail)
  values (v_row.id, null, 'QUEUED', coalesce(p->>'event_source','SYSTEM'), v_user, 'enqueue', jsonb_build_object('module', v_row.module, 'type', v_row.message_type));
  return jsonb_build_object('reused', false, 'message', to_jsonb(v_row));
end $$;

-- Transición condicional: solo cambia el estado si el actual está en
-- p_expected (equivalente al reclamo PENDING->PROCESSING de On Street), aplica
-- únicamente columnas permitidas y registra el evento en la misma transacción.
-- El evento se deduplica por (message_id, dedupe_key).
create or replace function public.sms_transition(p_message_id uuid, p_expected text[], p_to text, p_patch jsonb, p_event jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_old public.sms_messages%rowtype;
  v_new public.sms_messages%rowtype;
  v_allowed text[] := array['provider','is_simulated','provider_message_id','provider_code','provider_description','error_code','error_category',
    'attempts','next_retry_at','sent_at','accepted_at','delivered_at','failed_at','status_checks','last_status_check_at'];
  v_patch jsonb;
  v_inserted integer;
begin
  select * into v_old from public.sms_messages where id = p_message_id for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if not (v_old.status = any(p_expected)) then return jsonb_build_object('error','STATUS_CONFLICT','status',v_old.status); end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_patch from jsonb_each(coalesce(p_patch,'{}'::jsonb)) where key = any(v_allowed);
  v_new := jsonb_populate_record(v_old, v_patch);
  update public.sms_messages set
    status = p_to,
    provider = v_new.provider, is_simulated = v_new.is_simulated, provider_message_id = v_new.provider_message_id,
    provider_code = v_new.provider_code, provider_description = v_new.provider_description,
    error_code = v_new.error_code, error_category = v_new.error_category, attempts = v_new.attempts, next_retry_at = v_new.next_retry_at,
    sent_at = v_new.sent_at, accepted_at = v_new.accepted_at, delivered_at = v_new.delivered_at, failed_at = v_new.failed_at,
    status_checks = v_new.status_checks, last_status_check_at = v_new.last_status_check_at,
    updated_at = clock_timestamp()
  where id = p_message_id returning * into v_new;

  insert into public.sms_message_events (message_id, from_status, to_status, source, provider_code, provider_description, detail, actor_user_id, dedupe_key)
  values (p_message_id, v_old.status, p_to, coalesce(p_event->>'source','SYSTEM'), p_event->>'provider_code', p_event->>'provider_description',
    coalesce(p_event->'detail','{}'::jsonb), nullif(p_event->>'actor_user_id','')::uuid,
    coalesce(p_event->>'dedupe_key', gen_random_uuid()::text))
  on conflict (message_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('message', to_jsonb(v_new), 'event_recorded', v_inserted > 0);
end $$;

-- Reclama mensajes listos para enviar (nuevos o con reintento vencido).
-- SKIP LOCKED: dos procesadores simultáneos nunca reclaman el mismo mensaje.
create or replace function public.sms_claim_due(p_limit integer default 50)
returns setof public.sms_messages language plpgsql security definer set search_path=public as $$
begin
  return query
  with due as (
    select id from public.sms_messages
    where status = 'QUEUED' and (next_retry_at is null or next_retry_at <= clock_timestamp())
    order by coalesce(next_retry_at, queued_at, created_at)
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), claimed as (
    update public.sms_messages m set status = 'SENDING', updated_at = clock_timestamp()
    from due where m.id = due.id returning m.*
  ), ev as (
    insert into public.sms_message_events (message_id, from_status, to_status, source, dedupe_key)
    select id, 'QUEUED', 'SENDING', 'SYSTEM', 'claim:' || attempts from claimed
    on conflict (message_id, dedupe_key) do nothing
  )
  select * from claimed;
end $$;

-- Retención: anonimiza teléfono y texto de mensajes antiguos (conserva los
-- conteos, estados y costos). Elimina eventos técnicos del mismo período.
create or replace function public.sms_apply_retention(p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_days integer; v_cut timestamptz; v_msgs integer; v_inbound integer;
begin
  select retention_days into v_days from public.sms_settings where id;
  v_cut := clock_timestamp() - make_interval(days => v_days);
  update public.sms_messages set phone_normalized = null, body = null, redacted_at = clock_timestamp(), updated_at = clock_timestamp()
    where created_at < v_cut and redacted_at is null;
  get diagnostics v_msgs = row_count;
  update public.sms_message_events set detail = '{}'::jsonb, provider_description = null where created_at < v_cut and detail <> '{}'::jsonb;
  update public.sms_inbound_messages set from_phone = '+569********', body = null, redacted_at = clock_timestamp(), updated_at = clock_timestamp()
    where received_at < v_cut and redacted_at is null;
  get diagnostics v_inbound = row_count;
  insert into public.sms_admin_audit (actor_user_id, action, detail)
    values (p_actor, 'RETENTION_RUN', jsonb_build_object('retention_days', v_days, 'messages_redacted', v_msgs, 'inbound_redacted', v_inbound));
  return jsonb_build_object('retention_days', v_days, 'messages_redacted', v_msgs, 'inbound_redacted', v_inbound);
end $$;

-- 9) Vista unificada de historial -----------------------------------------
-- Une el registro central con los tres registros heredados sin modificarlos.
-- Cada fila tiene (source, source_id) único: un SMS nunca se cuenta dos veces.
create or replace view public.sms_history_v with (security_invoker = true) as
select
  'CENTRAL'::text as source, m.id::text as source_id, m.id as message_id,
  m.created_at, m.sent_at, m.accepted_at, m.delivered_at,
  m.company_id, m.parking_id, m.module, m.message_type, m.origin_user_id,
  m.phone_normalized, m.phone_last4, m.body,
  m.status, m.provider, m.is_simulated, m.provider_message_id, m.provider_code, m.provider_description,
  m.error_code, m.error_category, m.attempts, m.root_message_id, m.parent_message_id, m.redacted_at
from public.sms_messages m
union all
select
  'ON_STREET_NOTIFICATION', n.id::text, null::uuid,
  n.created_at, n.sent_at, n.accepted_at, n.delivered_at,
  p.company_id, n.parking_id, 'ON_STREET', 'ON_STREET_' || n.type, null::uuid,
  n.phone_normalized, right(n.phone_normalized, 4), n.message,
  case
    when n.status = 'PENDING' then 'QUEUED'
    when n.status = 'PROCESSING' then 'SENDING'
    when n.status = 'CANCELLED' then 'CANCELLED'
    when n.status = 'FAILED' and n.provider_status ~ '^[1-9][0-9]*$' then 'REJECTED'
    when n.status = 'FAILED' then 'FAILED'
    when n.delivered_at is not null then 'DELIVERED'
    when upper(coalesce(n.provider_description,'')) in ('UNDELIV','UNDELIVERED') then 'FAILED'
    when upper(coalesce(n.provider_description,'')) = 'EXPIRED' then 'EXPIRED'
    when upper(coalesce(n.provider_description,'')) in ('REJECTD','REJECTED','DELETED') then 'REJECTED'
    when n.provider_status in ('7','104') then 'UNKNOWN'
    else 'ACCEPTED'
  end,
  n.provider,
  coalesce(n.provider = 'SIMULATED' or (n.provider is null and n.status = 'SENT') or n.provider_message_id like 'simulated-%', false),
  n.provider_message_id, n.provider_status, n.provider_description,
  n.error_code,
  case
    when n.status <> 'FAILED' then null
    when n.error_code in ('SENTRALAND_PHONE_INVALID','SENTRALAND_4','SENTRALAND_13') then 'INVALID_PHONE'
    when n.error_code = 'SENTRALAND_2' then 'NO_BALANCE'
    when n.error_code in ('SENTRALAND_1','SENTRALAND_3','SENTRALAND_6') then 'PROVIDER_REJECTED'
    when n.error_code in ('SENTRALAND_7','SENTRALAND_9','SENTRALAND_10','SENTRALAND_12','SENTRALAND_20','SENTRALAND_8','SENTRALAND_11') then 'TEMPORARY'
    when n.error_code like 'SENTRALAND_TOKEN%' then 'AUTH'
    when n.error_code in ('SENTRALAND_TIMEOUT','SENTRALAND_HTTP_ERROR','SENTRALAND_RESPONSE_INVALID') then 'CONNECTIVITY'
    when n.error_code like '%_NOT_CONFIGURED' then 'CONFIG'
    else 'UNKNOWN'
  end,
  n.attempts, null::uuid, null::uuid, null::timestamptz
from public.on_street_pilot_notifications n
left join public.parkings p on p.id = n.parking_id
union all
select
  'ON_STREET_INSPECTION', i.id::text, null::uuid,
  i.created_at, i.sms_sent_at, i.sms_sent_at, case when i.sms_delivery_status = 'DELIVERED' then i.sms_delivery_checked_at end,
  p.company_id, i.parking_id, 'ON_STREET', 'INSPECTION_OVERDUE', i.inspector_user_id,
  i.phone_normalized, right(i.phone_normalized, 4), null::text,
  case
    when i.sms_status = 'PENDING' then 'QUEUED'
    when i.sms_status = 'SENDING' then 'SENDING'
    when i.sms_status = 'FAILED' then 'FAILED'
    when i.sms_delivery_status = 'DELIVERED' then 'DELIVERED'
    when i.sms_delivery_status = 'ACCEPTED' then 'PENDING_CONFIRMATION'
    when i.sms_delivery_status = 'UNDELIVERED' then 'FAILED'
    when i.sms_delivery_status = 'EXPIRED' then 'EXPIRED'
    when i.sms_delivery_status = 'REJECTED' then 'REJECTED'
    when i.sms_delivery_status = 'UNKNOWN' then 'UNKNOWN'
    else 'ACCEPTED'
  end,
  case when coalesce(i.sms_provider_message_id,'') like 'simulated-%' then 'SIMULATED' when i.sms_provider_message_id is not null then 'SENTRALAND' end,
  coalesce(i.sms_provider_message_id,'') like 'simulated-%',
  i.sms_provider_message_id, null::text, i.sms_delivery_description,
  null::text, case when i.sms_status = 'FAILED' then 'UNKNOWN' end,
  case when i.sms_status in ('SENT','FAILED') then 1 else 0 end, null::uuid, null::uuid, null::timestamptz
from public.on_street_inspections i
left join public.parkings p on p.id = i.parking_id
where i.sms_status <> 'NOT_REQUIRED'
union all
select
  'ON_STREET_INSPECTOR_COPY', i.id::text, null::uuid,
  i.created_at, i.inspector_copy_sms_sent_at, i.inspector_copy_sms_sent_at, null::timestamptz,
  p.company_id, i.parking_id, 'ON_STREET', 'INSPECTOR_COPY', i.inspector_user_id,
  null::text, null::text, null::text,
  case when i.inspector_copy_sms_status = 'SENT' then 'ACCEPTED' else 'FAILED' end,
  case when coalesce(i.inspector_copy_sms_provider_message_id,'') like 'simulated-%' then 'SIMULATED' when i.inspector_copy_sms_provider_message_id is not null then 'SENTRALAND' end,
  coalesce(i.inspector_copy_sms_provider_message_id,'') like 'simulated-%',
  i.inspector_copy_sms_provider_message_id, null::text, null::text,
  null::text, case when i.inspector_copy_sms_status = 'FAILED' then 'UNKNOWN' end,
  1, null::uuid, null::uuid, null::timestamptz
from public.on_street_inspections i
left join public.parkings p on p.id = i.parking_id
where i.inspector_copy_sms_status in ('SENT','FAILED');

-- 10) Seguridad: solo el servidor (service_role) accede ---------------------
alter table public.sms_settings enable row level security;
alter table public.sms_messages enable row level security;
alter table public.sms_message_events enable row level security;
alter table public.sms_inbound_messages enable row level security;
alter table public.sms_provider_checks enable row level security;
alter table public.sms_tariffs enable row level security;
alter table public.sms_admin_audit enable row level security;
revoke all on public.sms_settings, public.sms_messages, public.sms_message_events, public.sms_inbound_messages,
  public.sms_provider_checks, public.sms_tariffs, public.sms_admin_audit, public.sms_history_v from anon, authenticated;
grant select, insert, update on public.sms_settings, public.sms_messages, public.sms_inbound_messages, public.sms_tariffs to service_role;
grant select, insert on public.sms_message_events, public.sms_provider_checks, public.sms_admin_audit to service_role;
grant select on public.sms_history_v to service_role;
revoke all on function public.sms_enqueue_message(jsonb), public.sms_transition(uuid, text[], text, jsonb, jsonb),
  public.sms_claim_due(integer), public.sms_apply_retention(uuid) from public, anon, authenticated;
grant execute on function public.sms_enqueue_message(jsonb), public.sms_transition(uuid, text[], text, jsonb, jsonb),
  public.sms_claim_due(integer), public.sms_apply_retention(uuid) to service_role;

-- 11) Resumen para el dashboard (etapa 4) -----------------------------------
-- Indicadores y series calculados en la base sobre sms_history_v. "Aceptado"
-- (accepted_at) y "Entregado" (DELIVERED) se cuentan por separado; los envíos
-- simulados quedan fuera salvo que se pidan explícitamente.
create or replace function public.sms_dashboard_summary(p jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_from timestamptz := nullif(p->>'from','')::timestamptz;
  v_to timestamptz := nullif(p->>'to','')::timestamptz;
  v_bucket text := coalesce(nullif(p->>'bucket',''), 'day');
  v_sim boolean := coalesce((p->>'include_simulated')::boolean, false);
  v_company text := nullif(p->>'company_id','');
  v_parking uuid := nullif(p->>'parking_id','')::uuid;
  v_module text := nullif(p->>'module','');
  v_status text := nullif(p->>'status','');
  v_unconf integer;
  v_result jsonb;
begin
  if v_bucket not in ('day','week','month') then raise exception 'SMS_BUCKET_INVALID'; end if;
  select unconfirmed_after_hours into v_unconf from public.sms_settings where id;
  with base as (
    select * from public.sms_history_v h
    where (v_from is null or h.created_at >= v_from) and (v_to is null or h.created_at < v_to)
      and (v_company is null or h.company_id = v_company) and (v_parking is null or h.parking_id = v_parking)
      and (v_module is null or h.module = v_module) and (v_status is null or h.status = v_status)
  ), f as (
    select * from base where v_sim or not is_simulated
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object(
      'total', count(*) filter (where status not in ('CREATED','QUEUED','SENDING','CANCELLED')),
      'accepted', count(*) filter (where accepted_at is not null),
      -- Consumo: solo aceptados reales (los simulados nunca descuentan bolsa).
      'consumed', count(*) filter (where accepted_at is not null and not is_simulated),
      'delivered', count(*) filter (where status = 'DELIVERED'),
      'pending', count(*) filter (where status in ('CREATED','QUEUED','SENDING')),
      'failed', count(*) filter (where status in ('FAILED','EXPIRED')),
      'rejected', count(*) filter (where status = 'REJECTED'),
      'unknown', count(*) filter (where status = 'UNKNOWN'),
      'cancelled', count(*) filter (where status = 'CANCELLED'),
      'awaiting', count(*) filter (where status in ('ACCEPTED','PENDING_CONFIRMATION')),
      'unconfirmed', count(*) filter (where status in ('ACCEPTED','PENDING_CONFIRMATION') and not is_simulated
        and coalesce(accepted_at, sent_at, created_at) < clock_timestamp() - make_interval(hours => v_unconf))
    ) from f),
    'simulated', (select count(*) from base where is_simulated),
    'unconfirmed_after_hours', v_unconf,
    'series', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'total', total, 'accepted', accepted, 'delivered', delivered, 'failed', failed) order by bucket), '[]'::jsonb)
      from (select to_char(date_trunc(v_bucket, created_at at time zone 'America/Santiago'), 'YYYY-MM-DD') as bucket,
              count(*) filter (where status not in ('CREATED','QUEUED','SENDING','CANCELLED')) as total,
              count(*) filter (where accepted_at is not null) as accepted,
              count(*) filter (where status = 'DELIVERED') as delivered,
              count(*) filter (where status in ('FAILED','EXPIRED','REJECTED','UNKNOWN')) as failed
            from f group by 1) s),
    'by_module', (select coalesce(jsonb_object_agg(module, n), '{}'::jsonb) from (select module, count(*) as n from f group by 1) s),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) as n from f group by 1) s),
    'inbound', (select count(*) from public.sms_inbound_messages i
      where (v_from is null or i.received_at >= v_from) and (v_to is null or i.received_at < v_to) and (v_company is null or i.company_id = v_company)),
    'inbound_enabled', (select inbound_enabled from public.sms_settings where id),
    'last_balance', (select jsonb_build_object('checked_at', c.created_at, 'balance', c.balance) from public.sms_provider_checks c
      where c.balance is not null and c.mode = 'REAL' order by c.created_at desc limit 1)
  ) into v_result;
  return v_result;
end $$;

-- Nombres visibles de usuarios de origen (operador, inspector, administrador)
-- sin exponer auth.users al resto de la aplicación.
create or replace function public.sms_user_labels(p_ids uuid[])
returns table (user_id uuid, label text) language sql stable security definer set search_path=public as $$
  select u.id, coalesce(
    (select m.full_name from public.company_members m where m.user_id = u.id and nullif(trim(m.full_name),'') is not null order by m.updated_at desc limit 1),
    nullif(trim(u.raw_user_meta_data->>'full_name'),''),
    nullif(trim(u.raw_user_meta_data->>'name'),''),
    'Usuario ' || left(u.id::text, 8))
  from auth.users u where u.id = any(p_ids)
$$;

revoke all on function public.sms_dashboard_summary(jsonb), public.sms_user_labels(uuid[]) from public, anon, authenticated;
grant execute on function public.sms_dashboard_summary(jsonb), public.sms_user_labels(uuid[]) to service_role;

-- 12) Fallos y consumo (etapa 5) -------------------------------------------
-- Filtro común de las funciones de resumen sobre sms_history_v.
create or replace function public.sms_history_filtered(p jsonb)
returns setof public.sms_history_v language sql stable security definer set search_path=public as $$
  select h.* from public.sms_history_v h
  where (nullif(p->>'from','') is null or h.created_at >= (p->>'from')::timestamptz)
    and (nullif(p->>'to','') is null or h.created_at < (p->>'to')::timestamptz)
    and (nullif(p->>'company_id','') is null or h.company_id = p->>'company_id')
    and (nullif(p->>'parking_id','') is null or h.parking_id = (p->>'parking_id')::uuid)
    and (nullif(p->>'module','') is null or h.module = p->>'module')
    and (nullif(p->>'status','') is null or h.status = p->>'status')
    and (coalesce((p->>'include_simulated')::boolean, false) or not h.is_simulated)
$$;

-- Conteo de fallos por categoría. "UNCONFIRMED" = aceptados reales sin DLR
-- pasado el umbral configurado (no es un error del proveedor, es falta de
-- confirmación). Un mismo SMS cae en una sola categoría.
create or replace function public.sms_failure_summary(p jsonb)
returns jsonb language sql stable security definer set search_path=public as $$
  with s as (select unconfirmed_after_hours as h from public.sms_settings where id),
  f as (
    select case
      when status in ('ACCEPTED','PENDING_CONFIRMATION') and not is_simulated
        and coalesce(accepted_at, sent_at, created_at) < clock_timestamp() - make_interval(hours => (select h from s)) then 'UNCONFIRMED'
      when status in ('FAILED','REJECTED','EXPIRED','UNKNOWN') then coalesce(error_category,
        case status when 'EXPIRED' then 'UNCONFIRMED' when 'REJECTED' then 'PROVIDER_REJECTED' else 'UNKNOWN' end)
    end as category, status
    from public.sms_history_filtered(p)
  )
  select jsonb_build_object(
    'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from f where category is not null group by 1) x), '{}'::jsonb),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from f where category is not null group by 1) x), '{}'::jsonb),
    'total', (select count(*) from f where category is not null),
    'unconfirmed_after_hours', (select h from s),
    'retries_pending', (select count(*) from public.sms_messages where status = 'QUEUED' and next_retry_at is not null)
  )
$$;

-- Consumo: SMS reales aceptados por el proveedor (los que descuentan bolsa),
-- agrupados por cliente, establecimiento, módulo y período, con el costo
-- calculado SOLO con tarifas internas vigentes a la fecha de cada SMS (tarifa
-- de la empresa si existe; si no, la general). Sin tarifa => costo null.
create or replace function public.sms_consumption(p jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_bucket text := coalesce(nullif(p->>'bucket',''), 'month'); v_result jsonb;
begin
  if v_bucket not in ('day','week','month') then raise exception 'SMS_BUCKET_INVALID'; end if;
  with f as (
    select h.company_id, h.parking_id, h.module, h.created_at,
      (h.created_at at time zone 'America/Santiago')::date as local_day
    from public.sms_history_filtered(p || jsonb_build_object('include_simulated', false)) h
    where h.accepted_at is not null
  ), priced as (
    select f.*, t.unit_price, t.currency
    from f left join lateral (
      select unit_price, currency from public.sms_tariffs t
      where t.archived_at is null and t.valid_from <= f.local_day and (t.valid_to is null or t.valid_to >= f.local_day)
        and (t.company_id = f.company_id or t.company_id is null)
      order by (t.company_id is null), t.valid_from desc limit 1
    ) t on true
  )
  select jsonb_build_object(
    'total', (select count(*) from priced),
    'priced', (select count(*) from priced where unit_price is not null),
    'cost_by_currency', coalesce((select jsonb_object_agg(currency, round(total, 4)) from (select currency, sum(unit_price) total from priced where unit_price is not null group by 1) x), '{}'::jsonb),
    'by_company', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'count', n, 'cost', cost, 'currency', cur) order by n desc) from (
      select company_id, count(*) n, sum(unit_price) cost, max(currency) cur from priced group by 1) x), '[]'::jsonb),
    'by_parking', coalesce((select jsonb_agg(jsonb_build_object('parking_id', parking_id, 'company_id', company_id, 'count', n, 'cost', cost, 'currency', cur) order by n desc) from (
      select parking_id, max(company_id) company_id, count(*) n, sum(unit_price) cost, max(currency) cur from priced group by 1) x), '[]'::jsonb),
    'by_module', coalesce((select jsonb_agg(jsonb_build_object('module', module, 'count', n, 'cost', cost, 'currency', cur) order by n desc) from (
      select module, count(*) n, sum(unit_price) cost, max(currency) cur from priced group by 1) x), '[]'::jsonb),
    'by_period', coalesce((select jsonb_agg(jsonb_build_object('bucket', b, 'count', n, 'cost', cost) order by b) from (
      select to_char(date_trunc(v_bucket, created_at at time zone 'America/Santiago'), 'YYYY-MM-DD') b, count(*) n, sum(unit_price) cost from priced group by 1) x), '[]'::jsonb),
    'mixed_currency', (select count(distinct currency) > 1 from priced where unit_price is not null)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.sms_history_filtered(jsonb), public.sms_failure_summary(jsonb), public.sms_consumption(jsonb) from public, anon, authenticated;
grant execute on function public.sms_history_filtered(jsonb), public.sms_failure_summary(jsonb), public.sms_consumption(jsonb) to service_role;
