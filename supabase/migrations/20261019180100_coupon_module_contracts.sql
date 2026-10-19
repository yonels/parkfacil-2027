-- Off Street — Cupones y descuentos como módulo contratable (SOL-2026-10-19-002,
-- etapa C). Parte 2: contratación por EMPRESA, estado del módulo y eventos.
--
-- Decisiones del usuario (2026-10-19, D1–D8):
-- - D1: se contrata por empresa (el cupón vale en cualquier estacionamiento de
--   la empresa y las tiendas son de la empresa).
-- - D2: importe mensual FINAL en UF + IVA, plazo 12/24/36 meses, versiones
--   inmutables (mismo modelo que Pago liberado).
-- - D3/D4: activo = habilitado por Root Y contrato vigente hoy (el vencimiento
--   apaga sin procesos programados). Inactivo: no se emite, envía ni canjea; el
--   historial y los reportes quedan en solo lectura.
-- - Contratar NO activa: Root activa/desactiva con motivo.
--
-- Acceso: solo vía API server-side (service_role) con verificación del rol en
-- cada RPC. RLS habilitado sin políticas; anon/authenticated sin privilegios.

do $$
begin
  if to_regclass('public.coupon_module_catalog') is null then
    raise exception 'Falta el catálogo del módulo Cupones (20261019180000).';
  end if;
  if to_regclass('public.coupons') is null then
    raise exception 'Faltan las tablas de cupones (20260803110000).';
  end if;
end $$;

-- Término = inicio + plazo en meses calendario en America/Santiago.
create or replace function public.coupon_module_contract_end(p_starts_at timestamptz, p_term_months integer)
returns timestamptz
language sql
immutable
set search_path = pg_catalog
as $$
  select ((p_starts_at at time zone 'America/Santiago') + make_interval(months => p_term_months)) at time zone 'America/Santiago';
$$;

create or replace function public.coupon_module_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'COUPON_MODULE_HISTORY_IMMUTABLE' using errcode = '42501';
end;
$$;

create or replace function public.coupon_module_root_actor(p_actor_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_role text;
begin
  select email, raw_app_meta_data->>'role' into v_email, v_role from auth.users where id = p_actor_id;
  if v_email is null or v_role is distinct from 'platform_admin' then
    raise exception 'COUPON_MODULE_FORBIDDEN' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contratación (Root): importe mensual + plazo, versiones inmutables
-- ---------------------------------------------------------------------------

create table if not exists public.coupon_module_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  version integer not null check (version >= 1),
  modality text not null default 'MONTHLY_FEE' check (modality = 'MONTHLY_FEE'),
  monthly_fee_uf numeric(12,2) not null check (monthly_fee_uf >= 0 and monthly_fee_uf <= 100000),
  base_monthly_fee_uf numeric(12,2) null check (base_monthly_fee_uf is null or (base_monthly_fee_uf >= monthly_fee_uf and base_monthly_fee_uf <= 100000)),
  discount_notes text not null default '',
  term_months integer not null check (term_months in (12, 24, 36)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null default 'America/Santiago' check (time_zone = 'America/Santiago'),
  contract_reference text not null default '',
  crm_proposal_number text not null default '',
  notes text not null default '',
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz null,
  superseded_by uuid null references auth.users(id) on delete set null,
  unique (company_id, version),
  constraint coupon_module_contracts_term_end_check check (ends_at = public.coupon_module_contract_end(starts_at, term_months))
);

comment on table public.coupon_module_contracts is 'Cupones y descuentos: contratación del módulo por empresa (Root). Importe mensual FINAL en UF + IVA con plazo 12/24/36 meses; versiones inmutables.';
comment on column public.coupon_module_contracts.monthly_fee_uf is 'Importe mensual FINAL acordado (UF + IVA), después de los descuentos de la propuesta; debe coincidir con el CRM.';

create unique index if not exists coupon_module_contracts_current_idx on public.coupon_module_contracts(company_id) where superseded_at is null;

create or replace function public.coupon_module_contracts_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'COUPON_MODULE_HISTORY_IMMUTABLE' using errcode = '42501';
  end if;
  if old.superseded_at is not null
     or new.superseded_at is null
     or (to_jsonb(new) - 'superseded_at' - 'superseded_by') is distinct from (to_jsonb(old) - 'superseded_at' - 'superseded_by') then
    raise exception 'COUPON_MODULE_CONTRACT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists coupon_module_contracts_guard on public.coupon_module_contracts;
create trigger coupon_module_contracts_guard
  before update or delete on public.coupon_module_contracts
  for each row execute function public.coupon_module_contracts_guard();

create table if not exists public.coupon_company_modules (
  company_id text primary key references public.companies(id) on delete restrict,
  enabled boolean not null default false,
  current_contract_id uuid null references public.coupon_module_contracts(id) on delete restrict,
  status_changed_at timestamptz null,
  status_changed_by uuid null references auth.users(id) on delete set null,
  status_reason text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.coupon_module_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  event_type text not null check (event_type in ('CONTRACT_CREATED', 'CONTRACT_VERSIONED', 'ACTIVATED', 'DEACTIVATED')),
  contract_id uuid null references public.coupon_module_contracts(id) on delete restrict,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null check (length(btrim(reason)) >= 3),
  actor_id uuid null references auth.users(id) on delete set null,
  actor_email text not null default '',
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists coupon_module_events_company_idx on public.coupon_module_events(company_id, created_at desc);

drop trigger if exists coupon_module_events_immutable on public.coupon_module_events;
create trigger coupon_module_events_immutable
  before update or delete on public.coupon_module_events
  for each row execute function public.coupon_module_block_mutation();

-- ¿Módulo activo hoy? Habilitado por Root y contrato vigente (D3/D4).
create or replace function public.coupon_module_active(p_company_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coupon_company_modules m
    join public.coupon_module_contracts c on c.id = m.current_contract_id
    where m.company_id = p_company_id
      and m.enabled
      and c.starts_at <= clock_timestamp()
      and c.ends_at > clock_timestamp()
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC Root
-- ---------------------------------------------------------------------------

create or replace function public.coupon_module_save_contract(p_actor_id uuid, p_company_id text, p_input jsonb, p_reason text)
returns public.coupon_module_contracts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_company public.companies%rowtype;
  v_fee numeric;
  v_base numeric;
  v_term integer;
  v_starts timestamptz;
  v_previous public.coupon_module_contracts%rowtype;
  v_next public.coupon_module_contracts%rowtype;
  v_version integer;
begin
  v_email := public.coupon_module_root_actor(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'COUPON_MODULE_REASON_REQUIRED' using errcode = '22023';
  end if;
  begin
    v_fee := (p_input->>'monthlyFeeUf')::numeric;
    v_base := nullif(p_input->>'baseMonthlyFeeUf', '')::numeric;
  exception when others then
    raise exception 'COUPON_MODULE_FEE_INVALID' using errcode = '22023';
  end;
  begin
    v_term := (p_input->>'termMonths')::integer;
    v_starts := (p_input->>'startsAt')::timestamptz;
  exception when others then
    raise exception 'COUPON_MODULE_TERM_INVALID' using errcode = '22023';
  end;
  select * into v_company from public.companies where id = p_company_id for update;
  if not found or v_company.status is distinct from 'active' or v_company.relationship_type is distinct from 'client'
     or not ('OFF_STREET' = any(coalesce(v_company.enabled_products, '{}'::text[]))) then
    raise exception 'COUPON_MODULE_COMPANY_INVALID' using errcode = '22023';
  end if;
  if v_fee is null or v_fee < 0 or v_fee > 100000 or v_fee <> round(v_fee, 2) then
    raise exception 'COUPON_MODULE_FEE_INVALID' using errcode = '22023';
  end if;
  if v_base is not null and (v_base < v_fee or v_base > 100000 or v_base <> round(v_base, 2)) then
    raise exception 'COUPON_MODULE_FEE_INVALID' using errcode = '22023';
  end if;
  if v_term is null or v_term not in (12, 24, 36) or v_starts is null then
    raise exception 'COUPON_MODULE_TERM_INVALID' using errcode = '22023';
  end if;

  select * into v_previous from public.coupon_module_contracts
  where company_id = p_company_id and superseded_at is null for update;
  select coalesce(max(version), 0) + 1 into v_version from public.coupon_module_contracts where company_id = p_company_id;

  if v_previous.id is not null then
    update public.coupon_module_contracts
    set superseded_at = clock_timestamp(), superseded_by = p_actor_id
    where id = v_previous.id;
  end if;

  insert into public.coupon_module_contracts (
    company_id, version, monthly_fee_uf, base_monthly_fee_uf, discount_notes, term_months, starts_at, ends_at,
    contract_reference, crm_proposal_number, notes, reason, created_by, created_by_email
  ) values (
    p_company_id, v_version, round(v_fee, 2), round(v_base, 2),
    left(btrim(coalesce(p_input->>'discountNotes', '')), 300), v_term, v_starts,
    public.coupon_module_contract_end(v_starts, v_term),
    left(btrim(coalesce(p_input->>'contractReference', '')), 120),
    left(btrim(coalesce(p_input->>'crmProposalNumber', '')), 60), left(btrim(coalesce(p_input->>'notes', '')), 500),
    btrim(p_reason), p_actor_id, v_email
  ) returning * into v_next;

  insert into public.coupon_company_modules (company_id, enabled, current_contract_id)
  values (p_company_id, false, v_next.id)
  on conflict (company_id) do update set current_contract_id = excluded.current_contract_id, updated_at = clock_timestamp();

  insert into public.coupon_module_events (company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email)
  values (
    p_company_id,
    case when v_previous.id is null then 'CONTRACT_CREATED' else 'CONTRACT_VERSIONED' end,
    v_next.id,
    case when v_previous.id is null then '{}'::jsonb else to_jsonb(v_previous) - 'superseded_at' - 'superseded_by' end,
    to_jsonb(v_next),
    btrim(p_reason), p_actor_id, v_email
  );
  return v_next;
end;
$$;

create or replace function public.coupon_module_set_state(p_actor_id uuid, p_company_id text, p_enabled boolean, p_reason text)
returns public.coupon_company_modules
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_module public.coupon_company_modules%rowtype;
  v_contract public.coupon_module_contracts%rowtype;
begin
  v_email := public.coupon_module_root_actor(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'COUPON_MODULE_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'COUPON_MODULE_STATE_INVALID' using errcode = '22023';
  end if;
  select * into v_module from public.coupon_company_modules where company_id = p_company_id for update;
  if not found or v_module.current_contract_id is null then
    raise exception 'COUPON_MODULE_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if v_module.enabled = p_enabled then
    raise exception 'COUPON_MODULE_STATE_UNCHANGED' using errcode = '22023';
  end if;
  if p_enabled then
    select * into v_contract from public.coupon_module_contracts where id = v_module.current_contract_id;
    if v_contract.ends_at <= clock_timestamp() then
      raise exception 'COUPON_MODULE_CONTRACT_EXPIRED' using errcode = '22023';
    end if;
  end if;

  update public.coupon_company_modules set
    enabled = p_enabled,
    status_changed_at = clock_timestamp(),
    status_changed_by = p_actor_id,
    status_reason = btrim(p_reason),
    updated_at = clock_timestamp()
  where company_id = p_company_id
  returning * into v_module;

  insert into public.coupon_module_events (company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email)
  values (
    p_company_id, case when p_enabled then 'ACTIVATED' else 'DEACTIVATED' end, v_module.current_contract_id,
    jsonb_build_object('enabled', not p_enabled), jsonb_build_object('enabled', p_enabled),
    btrim(p_reason), p_actor_id, v_email
  );
  return v_module;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acceso
-- ---------------------------------------------------------------------------

alter table public.coupon_module_contracts enable row level security;
alter table public.coupon_company_modules enable row level security;
alter table public.coupon_module_events enable row level security;

revoke all on public.coupon_module_contracts, public.coupon_company_modules, public.coupon_module_events from anon, authenticated, service_role;
grant select on public.coupon_module_contracts, public.coupon_company_modules, public.coupon_module_events to service_role;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.coupon_module_root_actor(uuid)',
    'public.coupon_module_active(text)',
    'public.coupon_module_save_contract(uuid, text, jsonb, text)',
    'public.coupon_module_set_state(uuid, text, boolean, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end $$;
