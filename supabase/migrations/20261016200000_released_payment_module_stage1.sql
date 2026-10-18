-- Off Street — Pago liberado, Etapa 1 (fases B + C, sin POS).
-- SOL-2026-10-16-003. Consolida, en su forma FINAL, la parte de contratación,
-- estado del módulo, cupos, tarifas a beneficiarios y autorizaciones de las
-- migraciones locales 20261004100000, 20261005100000, 20261005110000 y
-- 20261005120000 (nunca publicadas), y agrega el registro del pago del
-- beneficiario.
--
-- Requiere el catálogo 20261016170000 (ya en producción). No modifica el
-- catálogo, `parking_stays` ni el POS: el ingreso con beneficio
-- (released_payment_register_entry y columnas de estadía) es de la Etapa 2.
--
-- Decisiones del usuario aplicadas:
-- - Importe mensual del módulo (UF + IVA) con plazo 12/24/36; Root registra
--   el importe FINAL; una contratación por estacionamiento (una propuesta = un
--   estacionamiento). Contratar NO activa; solo Root activa/desactiva.
-- - Administrador = company_admin de la empresa dueña: cupos, tarifas,
--   autorizaciones y pagos de beneficiarios.
-- - Se elimina el % al beneficiario del modelo anterior (no existe aquí).
-- - Pago del beneficiario: lo registra SOLO el administrador; solo pagos
--   recibidos (sin cobro en línea); SIN pagos parciales: el monto debe ser el
--   total acordado en la autorización. El beneficio exige la autorización
--   pagada (lo aplicará el ingreso en la Etapa 2).
--
-- Acceso: solo vía API server-side (service_role) con verificación del rol en
-- cada RPC. RLS habilitado sin políticas; anon/authenticated sin privilegios.

do $$
begin
  if to_regclass('public.released_payment_catalog') is null then
    raise exception 'Falta el catálogo de Pago liberado (20261016170000).';
  end if;
  -- Bases locales con las migraciones de desarrollo (modelo superpuesto):
  -- no se convierten. Usar una base sin el módulo.
  if to_regclass('public.released_payment_contracts') is not null then
    raise exception 'El módulo Pago liberado ya existe en esta base (esquema de desarrollo anterior); esta migración solo se aplica sobre una base sin el módulo.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

-- Término = inicio + cantidad en la unidad (horas exactas; días, meses y años
-- calendario en la zona del estacionamiento; fin de mes ajustado).
create or replace function public.released_payment_contract_end(
  p_starts_at timestamptz, p_unit text, p_quantity integer, p_time_zone text default 'America/Santiago'
) returns timestamptz
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_unit
    when 'HOUR' then p_starts_at + make_interval(hours => p_quantity)
    when 'DAY' then ((p_starts_at at time zone p_time_zone) + make_interval(days => p_quantity)) at time zone p_time_zone
    when 'MONTH' then ((p_starts_at at time zone p_time_zone) + make_interval(months => p_quantity)) at time zone p_time_zone
    when 'YEAR' then ((p_starts_at at time zone p_time_zone) + make_interval(years => p_quantity)) at time zone p_time_zone
  end;
$$;

create or replace function public.released_payment_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'RELEASED_PAYMENT_HISTORY_IMMUTABLE' using errcode = '42501';
end;
$$;

create or replace function public.released_payment_root_actor(p_actor_id uuid)
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
    raise exception 'RELEASED_PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

-- Administrador = company_admin activo de la empresa dueña del estacionamiento.
create or replace function public.released_payment_admin_actor(p_actor_id uuid, p_parking_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  select u.email into v_email
  from auth.users u
  join public.company_members cm on cm.user_id = u.id
  join public.parkings p on p.company_id = cm.company_id
  where u.id = p_actor_id and p.id = p_parking_id and cm.role = 'company_admin' and cm.status = 'active';
  if v_email is null then
    raise exception 'RELEASED_PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contratación (Root): importe mensual + plazo, versiones inmutables
-- ---------------------------------------------------------------------------

create table public.released_payment_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  version integer not null check (version >= 1),
  modality text not null default 'MONTHLY_FEE' check (modality = 'MONTHLY_FEE'),
  billing_unit text not null default 'MONTH' check (billing_unit = 'MONTH'),
  unit_quantity integer not null default 1 check (unit_quantity = 1),
  period_quantity integer not null default 1 check (period_quantity = 1),
  monthly_fee_uf numeric(12,2) not null check (monthly_fee_uf >= 0 and monthly_fee_uf <= 100000),
  base_monthly_fee_uf numeric(12,2) null check (base_monthly_fee_uf is null or (base_monthly_fee_uf >= monthly_fee_uf and base_monthly_fee_uf <= 100000)),
  -- Compatibilidad con la lectura existente: igual al importe mensual final.
  price_per_period_uf numeric(12,2) not null,
  total_uf numeric(14,2) not null,
  discount_notes text not null default '',
  term_months integer not null check (term_months in (12, 24, 36)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null default 'America/Santiago',
  contract_reference text not null default '',
  crm_proposal_number text not null default '',
  notes text not null default '',
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz null,
  superseded_by uuid null references auth.users(id) on delete set null,
  unique (parking_id, version),
  constraint released_payment_contracts_amounts_check check (price_per_period_uf = monthly_fee_uf and total_uf = monthly_fee_uf),
  constraint released_payment_contracts_term_end_check check (ends_at = public.released_payment_contract_end(starts_at, 'MONTH', term_months, time_zone))
);

comment on table public.released_payment_contracts is 'Pago liberado: contratación del módulo por estacionamiento (Root). Importe mensual FINAL en UF + IVA con plazo 12/24/36 meses; versiones inmutables. No incluye cupos ni tarifas del cliente.';
comment on column public.released_payment_contracts.monthly_fee_uf is 'Importe mensual FINAL acordado (UF + IVA), después de los descuentos de la propuesta; debe coincidir con el CRM.';
comment on column public.released_payment_contracts.base_monthly_fee_uf is 'Importe mensual antes de descuentos, cuando esté disponible.';
comment on column public.released_payment_contracts.term_months is 'Plazo contractual; término = inicio + plazo en meses calendario.';

create unique index released_payment_contracts_current_idx on public.released_payment_contracts(parking_id) where superseded_at is null;
create index released_payment_contracts_company_idx on public.released_payment_contracts(company_id, created_at desc);

create or replace function public.released_payment_contracts_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'RELEASED_PAYMENT_HISTORY_IMMUTABLE' using errcode = '42501';
  end if;
  if old.superseded_at is not null
     or new.superseded_at is null
     or (to_jsonb(new) - 'superseded_at' - 'superseded_by') is distinct from (to_jsonb(old) - 'superseded_at' - 'superseded_by') then
    raise exception 'RELEASED_PAYMENT_CONTRACT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger released_payment_contracts_guard
  before update or delete on public.released_payment_contracts
  for each row execute function public.released_payment_contracts_guard();

-- ---------------------------------------------------------------------------
-- Estado del módulo por estacionamiento y cupos del cliente
-- ---------------------------------------------------------------------------

create table public.released_payment_parking_modules (
  parking_id uuid primary key references public.parkings(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  enabled boolean not null default false,
  current_contract_id uuid null references public.released_payment_contracts(id) on delete restrict,
  operational_spots integer null check (operational_spots is null or (operational_spots >= 0 and operational_spots <= 1000)),
  status_changed_at timestamptz null,
  status_changed_by uuid null references auth.users(id) on delete set null,
  status_reason text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);

comment on column public.released_payment_parking_modules.operational_spots is 'Cupos simultáneos para Pago liberado definidos por el administrador. NULL = sin configurar (sin ingresos con beneficio).';

create table public.released_payment_module_events (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  event_type text not null check (event_type in (
    'CONTRACT_CREATED', 'CONTRACT_VERSIONED', 'ACTIVATED', 'DEACTIVATED',
    'TARIFF_CREATED', 'TARIFF_VERSIONED', 'TARIFF_RETIRED', 'SPOTS_CHANGED'
  )),
  contract_id uuid null references public.released_payment_contracts(id) on delete restrict,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null check (length(btrim(reason)) >= 3),
  actor_id uuid null references auth.users(id) on delete set null,
  actor_email text not null default '',
  actor_role text not null default '',
  created_at timestamptz not null default clock_timestamp()
);

create index released_payment_module_events_parking_idx on public.released_payment_module_events(parking_id, created_at desc);

create trigger released_payment_module_events_immutable
  before update or delete on public.released_payment_module_events
  for each row execute function public.released_payment_block_mutation();

-- ---------------------------------------------------------------------------
-- Tarifas a beneficiarios (administrador): CLP con IVA incluido, versiones
-- ---------------------------------------------------------------------------

create table public.released_payment_tariffs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  billing_unit text not null check (billing_unit in ('HOUR', 'DAY', 'MONTH', 'YEAR')),
  version integer not null check (version >= 1),
  currency text not null default 'CLP' check (currency = 'CLP'),
  unit_price numeric(14,0) not null check (unit_price >= 0 and unit_price <= 1000000000),
  vat_treatment text not null default 'INCLUDED' check (vat_treatment = 'INCLUDED'),
  vat_rate numeric(5,4) not null default 0.19 check (vat_rate = 0.19),
  label text not null default '',
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz null,
  superseded_by uuid null references auth.users(id) on delete set null,
  retired boolean not null default false,
  unique (parking_id, billing_unit, version),
  check (not retired or superseded_at is not null)
);

comment on table public.released_payment_tariffs is 'Pago liberado: tarifas del estacionamiento a sus beneficiarios (CLP, IVA incluido 19 %). Versiones inmutables; independientes del importe mensual que cobra ParkFacil.';

create unique index released_payment_tariffs_current_idx on public.released_payment_tariffs(parking_id, billing_unit) where superseded_at is null;
create index released_payment_tariffs_company_idx on public.released_payment_tariffs(company_id, parking_id, created_at desc);

create or replace function public.released_payment_tariffs_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'RELEASED_PAYMENT_HISTORY_IMMUTABLE' using errcode = '42501';
  end if;
  if old.superseded_at is not null
     or new.superseded_at is null
     or (to_jsonb(new) - 'superseded_at' - 'superseded_by' - 'retired') is distinct from (to_jsonb(old) - 'superseded_at' - 'superseded_by' - 'retired') then
    raise exception 'RELEASED_PAYMENT_TARIFF_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger released_payment_tariffs_guard
  before update or delete on public.released_payment_tariffs
  for each row execute function public.released_payment_tariffs_guard();

-- ---------------------------------------------------------------------------
-- Autorizaciones por patente + estacionamiento (administrador)
-- ---------------------------------------------------------------------------

create table public.released_payment_authorizations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  license_plate text not null check (license_plate ~ '^[A-Z0-9]{4}-[A-Z0-9]{2}$'),
  beneficiary_name text not null default '',
  beneficiary_reference text not null default '',
  kind text not null check (kind in ('CONTINUOUS', 'RECURRING')),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(schedule) = 'array'),
  time_zone text not null default 'America/Santiago',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  version integer not null default 1 check (version >= 1),
  -- Copia de lo acordado con el beneficiario (no cambia si la tarifa cambia).
  tariff_id uuid not null references public.released_payment_tariffs(id) on delete restrict,
  tariff_version integer not null check (tariff_version >= 1),
  billing_unit text not null check (billing_unit in ('HOUR', 'DAY', 'MONTH', 'YEAR')),
  quantity integer not null,
  unit_price numeric(14,0) not null check (unit_price >= 0),
  currency text not null check (currency = 'CLP'),
  vat_treatment text not null check (vat_treatment = 'INCLUDED'),
  vat_rate numeric(5,4) not null check (vat_rate = 0.19),
  total_amount numeric(16,0) not null,
  net_amount numeric(16,0) not null check (net_amount >= 0),
  tax_amount numeric(16,0) not null check (tax_amount >= 0),
  terms_captured_at timestamptz not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users(id) on delete set null,
  revoked_reason text null,
  check (valid_to > valid_from),
  check ((kind = 'CONTINUOUS' and schedule = '[]'::jsonb) or (kind = 'RECURRING' and jsonb_array_length(schedule) between 1 and 14)),
  check ((status = 'REVOKED') = (revoked_at is not null)),
  constraint released_payment_authorizations_terms_check check (
    quantity >= 1
    and quantity <= case billing_unit when 'HOUR' then 8760 when 'DAY' then 3660 when 'MONTH' then 120 else 10 end
    and total_amount = unit_price * quantity
    and net_amount + tax_amount = total_amount
  )
);

comment on column public.released_payment_authorizations.total_amount is 'Total acordado con el beneficiario = cantidad × precio por unidad (CLP, IVA incluido). No indica pago recibido: ver released_payment_beneficiary_payments.';

create index released_payment_authorizations_company_idx on public.released_payment_authorizations(company_id, parking_id, created_at desc);
create index released_payment_authorizations_plate_idx on public.released_payment_authorizations(parking_id, license_plate) where status = 'ACTIVE';

create table public.released_payment_authorization_events (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.released_payment_authorizations(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'REVOKED', 'PAYMENT_REGISTERED', 'PAYMENT_VOIDED')),
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null check (length(btrim(reason)) >= 3),
  actor_id uuid null references auth.users(id) on delete set null,
  actor_email text not null default '',
  actor_role text not null default '',
  created_at timestamptz not null default clock_timestamp()
);

create index released_payment_authorization_events_parking_idx on public.released_payment_authorization_events(parking_id, created_at desc);

create trigger released_payment_authorization_events_immutable
  before update or delete on public.released_payment_authorization_events
  for each row execute function public.released_payment_block_mutation();

-- ---------------------------------------------------------------------------
-- Pagos recibidos de beneficiarios (administrador). Sin pagos parciales: el
-- monto es el total acordado. Un solo pago vigente por autorización. No se
-- borra: se anula con motivo (por ejemplo, registro erróneo).
-- ---------------------------------------------------------------------------

create table public.released_payment_beneficiary_payments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  authorization_id uuid not null references public.released_payment_authorizations(id) on delete restrict,
  authorization_version integer not null check (authorization_version >= 1),
  license_plate text not null,
  amount numeric(16,0) not null check (amount >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  method text not null check (method in ('CASH', 'TRANSFER', 'CARD', 'OTHER')),
  paid_at timestamptz not null,
  reference text not null default '',
  notes text not null default '',
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'VOIDED')),
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  voided_at timestamptz null,
  voided_by uuid null references auth.users(id) on delete set null,
  voided_by_email text null,
  void_reason text null,
  check ((status = 'VOIDED') = (voided_at is not null)),
  check (status = 'REGISTERED' or length(btrim(coalesce(void_reason, ''))) >= 3),
  check (method <> 'OTHER' or length(btrim(reference)) >= 1 or length(btrim(notes)) >= 3)
);

comment on table public.released_payment_beneficiary_payments is 'Pago liberado: pagos RECIBIDOS por el estacionamiento de sus beneficiarios, registrados por el administrador. Sin cobro en línea ni pagos parciales (monto = total acordado). Anulación con motivo; nunca se borran.';

create unique index released_payment_beneficiary_payments_current_idx
  on public.released_payment_beneficiary_payments(authorization_id) where status = 'REGISTERED';
create index released_payment_beneficiary_payments_parking_idx
  on public.released_payment_beneficiary_payments(parking_id, paid_at desc);

create or replace function public.released_payment_beneficiary_payments_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'RELEASED_PAYMENT_HISTORY_IMMUTABLE' using errcode = '42501';
  end if;
  -- Única transición: REGISTERED → VOIDED, sin tocar el resto.
  if old.status <> 'REGISTERED' or new.status <> 'VOIDED'
     or (to_jsonb(new) - 'status' - 'voided_at' - 'voided_by' - 'voided_by_email' - 'void_reason')
        is distinct from (to_jsonb(old) - 'status' - 'voided_at' - 'voided_by' - 'voided_by_email' - 'void_reason') then
    raise exception 'RELEASED_PAYMENT_PAYMENT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger released_payment_beneficiary_payments_guard
  before update or delete on public.released_payment_beneficiary_payments
  for each row execute function public.released_payment_beneficiary_payments_guard();

-- ---------------------------------------------------------------------------
-- RPC: Root
-- ---------------------------------------------------------------------------

create or replace function public.released_payment_save_monthly_fee(p_actor_id uuid, p_parking_id uuid, p_input jsonb, p_reason text)
returns public.released_payment_contracts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_parking public.parkings%rowtype;
  v_fee numeric;
  v_base numeric;
  v_term integer;
  v_starts timestamptz;
  v_previous public.released_payment_contracts%rowtype;
  v_next public.released_payment_contracts%rowtype;
  v_version integer;
begin
  v_email := public.released_payment_root_actor(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  begin
    v_fee := (p_input->>'monthlyFeeUf')::numeric;
    v_base := nullif(p_input->>'baseMonthlyFeeUf', '')::numeric;
  exception when others then
    raise exception 'RELEASED_PAYMENT_FEE_INVALID' using errcode = '22023';
  end;
  begin
    v_term := (p_input->>'termMonths')::integer;
    v_starts := (p_input->>'startsAt')::timestamptz;
  exception when others then
    raise exception 'RELEASED_PAYMENT_TERM_INVALID' using errcode = '22023';
  end;
  select * into v_parking from public.parkings where id = p_parking_id for update;
  if not found or v_parking.type is distinct from 'OFF_STREET' then
    raise exception 'RELEASED_PAYMENT_PARKING_NOT_FOUND' using errcode = '22023';
  end if;
  if v_fee is null or v_fee < 0 or v_fee > 100000 or v_fee <> round(v_fee, 2) then
    raise exception 'RELEASED_PAYMENT_FEE_INVALID' using errcode = '22023';
  end if;
  if v_base is not null and (v_base < v_fee or v_base > 100000 or v_base <> round(v_base, 2)) then
    raise exception 'RELEASED_PAYMENT_FEE_INVALID' using errcode = '22023';
  end if;
  if v_term is null or v_term not in (12, 24, 36) or v_starts is null then
    raise exception 'RELEASED_PAYMENT_TERM_INVALID' using errcode = '22023';
  end if;

  select * into v_previous from public.released_payment_contracts
  where parking_id = p_parking_id and superseded_at is null for update;
  select coalesce(max(version), 0) + 1 into v_version from public.released_payment_contracts where parking_id = p_parking_id;

  if v_previous.id is not null then
    update public.released_payment_contracts
    set superseded_at = clock_timestamp(), superseded_by = p_actor_id
    where id = v_previous.id;
  end if;

  insert into public.released_payment_contracts (
    company_id, parking_id, version, monthly_fee_uf, base_monthly_fee_uf, price_per_period_uf, total_uf,
    discount_notes, term_months, starts_at, ends_at,
    contract_reference, crm_proposal_number, notes, reason, created_by, created_by_email
  ) values (
    v_parking.company_id, p_parking_id, v_version, round(v_fee, 2), round(v_base, 2), round(v_fee, 2), round(v_fee, 2),
    left(btrim(coalesce(p_input->>'discountNotes', '')), 300), v_term, v_starts,
    public.released_payment_contract_end(v_starts, 'MONTH', v_term, 'America/Santiago'),
    left(btrim(coalesce(p_input->>'contractReference', '')), 120),
    left(btrim(coalesce(p_input->>'crmProposalNumber', '')), 60), left(btrim(coalesce(p_input->>'notes', '')), 500),
    btrim(p_reason), p_actor_id, v_email
  ) returning * into v_next;

  insert into public.released_payment_parking_modules (parking_id, company_id, enabled, current_contract_id)
  values (p_parking_id, v_parking.company_id, false, v_next.id)
  on conflict (parking_id) do update set current_contract_id = excluded.current_contract_id, updated_at = clock_timestamp();

  insert into public.released_payment_module_events (parking_id, company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (
    p_parking_id, v_parking.company_id,
    case when v_previous.id is null then 'CONTRACT_CREATED' else 'CONTRACT_VERSIONED' end,
    v_next.id,
    case when v_previous.id is null then '{}'::jsonb else to_jsonb(v_previous) - 'superseded_at' - 'superseded_by' end,
    to_jsonb(v_next),
    btrim(p_reason), p_actor_id, v_email, 'platform_admin'
  );
  return v_next;
end;
$$;

create or replace function public.released_payment_set_module_state(p_actor_id uuid, p_parking_id uuid, p_enabled boolean, p_reason text)
returns public.released_payment_parking_modules
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_module public.released_payment_parking_modules%rowtype;
  v_contract public.released_payment_contracts%rowtype;
begin
  v_email := public.released_payment_root_actor(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id for update;
  if not found or v_module.current_contract_id is null then
    raise exception 'RELEASED_PAYMENT_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if v_module.enabled = p_enabled then
    raise exception 'RELEASED_PAYMENT_STATE_UNCHANGED' using errcode = '22023';
  end if;
  if p_enabled then
    select * into v_contract from public.released_payment_contracts where id = v_module.current_contract_id;
    if v_contract.ends_at <= clock_timestamp() then
      raise exception 'RELEASED_PAYMENT_CONTRACT_EXPIRED' using errcode = '22023';
    end if;
  end if;

  update public.released_payment_parking_modules set
    enabled = p_enabled,
    status_changed_at = clock_timestamp(),
    status_changed_by = p_actor_id,
    status_reason = btrim(p_reason),
    updated_at = clock_timestamp()
  where parking_id = p_parking_id;

  insert into public.released_payment_module_events (parking_id, company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (
    p_parking_id, v_module.company_id, case when p_enabled then 'ACTIVATED' else 'DEACTIVATED' end, v_module.current_contract_id,
    jsonb_build_object('enabled', v_module.enabled), jsonb_build_object('enabled', p_enabled),
    btrim(p_reason), p_actor_id, v_email, 'platform_admin'
  );

  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  return v_module;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: administrador
-- ---------------------------------------------------------------------------

-- Cupos simultáneos. En la Etapa 1 no existen estadías liberadas (el POS aún
-- no aplica el beneficio); la Etapa 2 agrega la comprobación contra la
-- ocupación liberada vigente con el mismo bloqueo del ingreso.
create or replace function public.released_payment_set_operational_spots(p_actor_id uuid, p_parking_id uuid, p_spots integer, p_reason text)
returns public.released_payment_parking_modules
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_module public.released_payment_parking_modules%rowtype;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_spots is null or p_spots < 0 or p_spots > 1000 then
    raise exception 'RELEASED_PAYMENT_SPOTS_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('released_payment:' || p_parking_id::text, 0));
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id for update;
  if not found or v_module.current_contract_id is null then
    raise exception 'RELEASED_PAYMENT_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if not v_module.enabled then
    raise exception 'RELEASED_PAYMENT_MODULE_DISABLED' using errcode = '22023';
  end if;
  if v_module.operational_spots is not distinct from p_spots then
    raise exception 'RELEASED_PAYMENT_SPOTS_UNCHANGED' using errcode = '22023';
  end if;

  update public.released_payment_parking_modules
  set operational_spots = p_spots, updated_at = clock_timestamp()
  where parking_id = p_parking_id;

  insert into public.released_payment_module_events (parking_id, company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (
    p_parking_id, v_module.company_id, 'SPOTS_CHANGED', v_module.current_contract_id,
    jsonb_build_object('operational_spots', v_module.operational_spots),
    jsonb_build_object('operational_spots', p_spots),
    btrim(p_reason), p_actor_id, v_email, 'company_admin'
  );
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  return v_module;
end;
$$;

create or replace function public.released_payment_save_tariff(p_actor_id uuid, p_parking_id uuid, p_input jsonb, p_reason text)
returns public.released_payment_tariffs
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_module public.released_payment_parking_modules%rowtype;
  v_unit text := upper(btrim(coalesce(p_input->>'billingUnit', '')));
  v_price numeric;
  v_previous public.released_payment_tariffs%rowtype;
  v_next public.released_payment_tariffs%rowtype;
  v_version integer;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if v_unit not in ('HOUR', 'DAY', 'MONTH', 'YEAR') then
    raise exception 'RELEASED_PAYMENT_TARIFF_UNIT_INVALID' using errcode = '22023';
  end if;
  begin
    v_price := (p_input->>'unitPrice')::numeric;
  exception when others then
    raise exception 'RELEASED_PAYMENT_TARIFF_PRICE_INVALID' using errcode = '22023';
  end;
  if v_price is null or v_price < 0 or v_price > 1000000000 or v_price <> round(v_price, 0) then
    raise exception 'RELEASED_PAYMENT_TARIFF_PRICE_INVALID' using errcode = '22023';
  end if;
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  if not found or v_module.current_contract_id is null then
    raise exception 'RELEASED_PAYMENT_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if not v_module.enabled then
    raise exception 'RELEASED_PAYMENT_MODULE_DISABLED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('released_payment_tariff:' || p_parking_id::text || ':' || v_unit, 0));
  select * into v_previous from public.released_payment_tariffs
  where parking_id = p_parking_id and billing_unit = v_unit and superseded_at is null for update;
  if v_previous.id is not null and v_previous.unit_price = v_price and v_previous.label = left(btrim(coalesce(p_input->>'label', '')), 80) then
    raise exception 'RELEASED_PAYMENT_TARIFF_UNCHANGED' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.released_payment_tariffs
  where parking_id = p_parking_id and billing_unit = v_unit;

  if v_previous.id is not null then
    update public.released_payment_tariffs set superseded_at = clock_timestamp(), superseded_by = p_actor_id where id = v_previous.id;
  end if;

  insert into public.released_payment_tariffs (
    company_id, parking_id, billing_unit, version, unit_price, label, reason, created_by, created_by_email
  ) values (
    v_module.company_id, p_parking_id, v_unit, v_version, v_price, left(btrim(coalesce(p_input->>'label', '')), 80),
    btrim(p_reason), p_actor_id, v_email
  ) returning * into v_next;

  insert into public.released_payment_module_events (parking_id, company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (
    p_parking_id, v_module.company_id,
    case when v_previous.id is null then 'TARIFF_CREATED' else 'TARIFF_VERSIONED' end,
    v_module.current_contract_id,
    case when v_previous.id is null then '{}'::jsonb else to_jsonb(v_previous) - 'superseded_at' - 'superseded_by' - 'retired' end,
    to_jsonb(v_next),
    btrim(p_reason), p_actor_id, v_email, 'company_admin'
  );
  return v_next;
end;
$$;

create or replace function public.released_payment_retire_tariff(p_actor_id uuid, p_parking_id uuid, p_billing_unit text, p_reason text)
returns public.released_payment_tariffs
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_previous public.released_payment_tariffs%rowtype;
  v_row public.released_payment_tariffs%rowtype;
  v_module public.released_payment_parking_modules%rowtype;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_previous from public.released_payment_tariffs
  where parking_id = p_parking_id and billing_unit = upper(btrim(coalesce(p_billing_unit, ''))) and superseded_at is null for update;
  if not found then
    raise exception 'RELEASED_PAYMENT_TARIFF_NOT_FOUND' using errcode = '22023';
  end if;
  update public.released_payment_tariffs set superseded_at = clock_timestamp(), superseded_by = p_actor_id, retired = true
  where id = v_previous.id returning * into v_row;
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  insert into public.released_payment_module_events (parking_id, company_id, event_type, contract_id, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (
    p_parking_id, v_previous.company_id, 'TARIFF_RETIRED', v_module.current_contract_id,
    to_jsonb(v_previous) - 'superseded_at' - 'superseded_by' - 'retired', jsonb_build_object('retired', true, 'billing_unit', v_previous.billing_unit),
    btrim(p_reason), p_actor_id, v_email, 'company_admin'
  );
  return v_row;
end;
$$;

-- Crear o modificar una autorización. Si mantiene tarifa, cantidad e inicio,
-- conserva la copia comercial acordada. Con un pago vigente registrado, las
-- condiciones comerciales (tarifa, cantidad, inicio) no se pueden cambiar:
-- primero se anula el pago (con motivo) o se revoca y crea otra.
create or replace function public.released_payment_save_authorization(p_actor_id uuid, p_parking_id uuid, p_authorization_id uuid, p_input jsonb, p_reason text)
returns public.released_payment_authorizations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_module public.released_payment_parking_modules%rowtype;
  v_contract public.released_payment_contracts%rowtype;
  v_previous public.released_payment_authorizations%rowtype;
  v_row public.released_payment_authorizations%rowtype;
  v_tariff public.released_payment_tariffs%rowtype;
  v_from timestamptz;
  v_to timestamptz;
  v_quantity integer;
  v_tariff_id uuid;
  v_kind text := upper(btrim(coalesce(p_input->>'kind', '')));
  v_plate text := upper(btrim(coalesce(p_input->>'licensePlate', '')));
  v_schedule jsonb := coalesce(p_input->'schedule', '[]'::jsonb);
  v_keep_terms boolean := false;
  v_total numeric;
  v_net numeric;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  begin
    v_from := (p_input->>'startsAt')::timestamptz;
    v_quantity := (p_input->>'quantity')::integer;
    v_tariff_id := nullif(p_input->>'tariffId', '')::uuid;
  exception when others then
    raise exception 'RELEASED_PAYMENT_VALIDITY_INVALID' using errcode = '22023';
  end;
  select * into v_module from public.released_payment_parking_modules where parking_id = p_parking_id;
  if not found or v_module.current_contract_id is null then
    raise exception 'RELEASED_PAYMENT_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if not v_module.enabled then
    raise exception 'RELEASED_PAYMENT_MODULE_DISABLED' using errcode = '22023';
  end if;
  select * into v_contract from public.released_payment_contracts where id = v_module.current_contract_id;
  if v_contract.ends_at <= clock_timestamp() then
    raise exception 'RELEASED_PAYMENT_CONTRACT_EXPIRED' using errcode = '22023';
  end if;
  if v_from is null then
    raise exception 'RELEASED_PAYMENT_VALIDITY_INVALID' using errcode = '22023';
  end if;
  if v_tariff_id is null or v_quantity is null then
    raise exception 'RELEASED_PAYMENT_TERMS_REQUIRED' using errcode = '22023';
  end if;

  if p_authorization_id is not null then
    select * into v_previous from public.released_payment_authorizations
    where id = p_authorization_id and parking_id = p_parking_id for update;
    if not found then
      raise exception 'RELEASED_PAYMENT_AUTHORIZATION_NOT_FOUND' using errcode = '22023';
    end if;
    if v_previous.status <> 'ACTIVE' then
      raise exception 'RELEASED_PAYMENT_AUTHORIZATION_REVOKED' using errcode = '22023';
    end if;
    v_keep_terms := v_previous.tariff_id = v_tariff_id and v_previous.quantity = v_quantity and v_previous.valid_from = v_from;
    if not v_keep_terms and exists (
      select 1 from public.released_payment_beneficiary_payments
      where authorization_id = p_authorization_id and status = 'REGISTERED'
    ) then
      raise exception 'RELEASED_PAYMENT_AUTHORIZATION_PAID' using errcode = '22023';
    end if;
  end if;

  if v_keep_terms then
    v_to := v_previous.valid_to;
  else
    select * into v_tariff from public.released_payment_tariffs where id = v_tariff_id and parking_id = p_parking_id;
    if not found or v_tariff.superseded_at is not null then
      raise exception 'RELEASED_PAYMENT_TARIFF_NOT_CURRENT' using errcode = '22023';
    end if;
    if v_quantity < 1 or v_quantity > (case v_tariff.billing_unit when 'HOUR' then 8760 when 'DAY' then 3660 when 'MONTH' then 120 else 10 end) then
      raise exception 'RELEASED_PAYMENT_QUANTITY_INVALID' using errcode = '22023';
    end if;
    v_to := public.released_payment_contract_end(v_from, v_tariff.billing_unit, v_quantity, 'America/Santiago');
    v_total := v_tariff.unit_price * v_quantity;
    v_net := round(v_total / (1 + v_tariff.vat_rate));
  end if;
  if v_to is null or v_to <= v_from then
    raise exception 'RELEASED_PAYMENT_VALIDITY_INVALID' using errcode = '22023';
  end if;
  if v_from < v_contract.starts_at or v_to > v_contract.ends_at then
    raise exception 'RELEASED_PAYMENT_OUTSIDE_CONTRACT' using errcode = '22023';
  end if;

  if p_authorization_id is null then
    insert into public.released_payment_authorizations (
      company_id, parking_id, license_plate, beneficiary_name, beneficiary_reference, kind,
      valid_from, valid_to, schedule, created_by, updated_by,
      tariff_id, tariff_version, billing_unit, quantity, unit_price, currency, vat_treatment, vat_rate,
      total_amount, net_amount, tax_amount, terms_captured_at
    ) values (
      v_module.company_id, p_parking_id, v_plate, left(btrim(coalesce(p_input->>'beneficiaryName', '')), 120),
      left(btrim(coalesce(p_input->>'beneficiaryReference', '')), 120), v_kind, v_from, v_to, v_schedule, p_actor_id, p_actor_id,
      v_tariff.id, v_tariff.version, v_tariff.billing_unit, v_quantity, v_tariff.unit_price, v_tariff.currency, v_tariff.vat_treatment, v_tariff.vat_rate,
      v_total, v_net, v_total - v_net, clock_timestamp()
    ) returning * into v_row;
    insert into public.released_payment_authorization_events (authorization_id, parking_id, company_id, event_type, previous_values, new_values, reason, actor_id, actor_email, actor_role)
    values (v_row.id, p_parking_id, v_module.company_id, 'CREATED', '{}'::jsonb, to_jsonb(v_row), btrim(p_reason), p_actor_id, v_email, 'company_admin');
    return v_row;
  end if;

  update public.released_payment_authorizations set
    beneficiary_name = left(btrim(coalesce(p_input->>'beneficiaryName', '')), 120),
    beneficiary_reference = left(btrim(coalesce(p_input->>'beneficiaryReference', '')), 120),
    kind = v_kind,
    valid_from = v_from,
    valid_to = v_to,
    schedule = v_schedule,
    tariff_id = case when v_keep_terms then tariff_id else v_tariff.id end,
    tariff_version = case when v_keep_terms then tariff_version else v_tariff.version end,
    billing_unit = case when v_keep_terms then billing_unit else v_tariff.billing_unit end,
    quantity = case when v_keep_terms then quantity else v_quantity end,
    unit_price = case when v_keep_terms then unit_price else v_tariff.unit_price end,
    currency = case when v_keep_terms then currency else v_tariff.currency end,
    vat_treatment = case when v_keep_terms then vat_treatment else v_tariff.vat_treatment end,
    vat_rate = case when v_keep_terms then vat_rate else v_tariff.vat_rate end,
    total_amount = case when v_keep_terms then total_amount else v_total end,
    net_amount = case when v_keep_terms then net_amount else v_net end,
    tax_amount = case when v_keep_terms then tax_amount else v_total - v_net end,
    terms_captured_at = case when v_keep_terms then terms_captured_at else clock_timestamp() end,
    version = v_previous.version + 1,
    updated_by = p_actor_id,
    updated_at = clock_timestamp()
  where id = p_authorization_id
  returning * into v_row;
  insert into public.released_payment_authorization_events (authorization_id, parking_id, company_id, event_type, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (v_row.id, p_parking_id, v_module.company_id, 'UPDATED', to_jsonb(v_previous), to_jsonb(v_row), btrim(p_reason), p_actor_id, v_email, 'company_admin');
  return v_row;
end;
$$;

create or replace function public.released_payment_revoke_authorization(p_actor_id uuid, p_parking_id uuid, p_authorization_id uuid, p_reason text)
returns public.released_payment_authorizations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_previous public.released_payment_authorizations%rowtype;
  v_row public.released_payment_authorizations%rowtype;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_previous from public.released_payment_authorizations
  where id = p_authorization_id and parking_id = p_parking_id for update;
  if not found then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_previous.status <> 'ACTIVE' then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_REVOKED' using errcode = '22023';
  end if;
  update public.released_payment_authorizations set
    status = 'REVOKED', revoked_at = clock_timestamp(), revoked_by = p_actor_id, revoked_reason = btrim(p_reason),
    version = v_previous.version + 1, updated_by = p_actor_id, updated_at = clock_timestamp()
  where id = p_authorization_id
  returning * into v_row;
  insert into public.released_payment_authorization_events (authorization_id, parking_id, company_id, event_type, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (v_row.id, p_parking_id, v_row.company_id, 'REVOKED', to_jsonb(v_previous), to_jsonb(v_row), btrim(p_reason), p_actor_id, v_email, 'company_admin');
  return v_row;
end;
$$;

-- Registrar el pago RECIBIDO del total acordado (sin parciales). No exige el
-- módulo activo: registra dinero ya recibido por una autorización vigente.
create or replace function public.released_payment_register_beneficiary_payment(p_actor_id uuid, p_parking_id uuid, p_authorization_id uuid, p_input jsonb)
returns public.released_payment_beneficiary_payments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_auth public.released_payment_authorizations%rowtype;
  v_row public.released_payment_beneficiary_payments%rowtype;
  v_amount numeric;
  v_paid_at timestamptz;
  v_method text := upper(btrim(coalesce(p_input->>'method', '')));
  v_reference text := left(btrim(coalesce(p_input->>'reference', '')), 120);
  v_notes text := left(btrim(coalesce(p_input->>'notes', '')), 500);
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  begin
    v_amount := (p_input->>'amount')::numeric;
    v_paid_at := (p_input->>'paidAt')::timestamptz;
  exception when others then
    raise exception 'RELEASED_PAYMENT_PAYMENT_INVALID' using errcode = '22023';
  end;
  if v_method not in ('CASH', 'TRANSFER', 'CARD', 'OTHER') then
    raise exception 'RELEASED_PAYMENT_PAYMENT_METHOD_INVALID' using errcode = '22023';
  end if;
  if v_method = 'OTHER' and length(v_reference) < 1 and length(v_notes) < 3 then
    raise exception 'RELEASED_PAYMENT_PAYMENT_DETAIL_REQUIRED' using errcode = '22023';
  end if;
  if v_paid_at is null or v_paid_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'RELEASED_PAYMENT_PAYMENT_DATE_INVALID' using errcode = '22023';
  end if;

  select * into v_auth from public.released_payment_authorizations
  where id = p_authorization_id and parking_id = p_parking_id for update;
  if not found then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_auth.status <> 'ACTIVE' then
    raise exception 'RELEASED_PAYMENT_AUTHORIZATION_REVOKED' using errcode = '22023';
  end if;
  if exists (select 1 from public.released_payment_beneficiary_payments where authorization_id = p_authorization_id and status = 'REGISTERED') then
    raise exception 'RELEASED_PAYMENT_PAYMENT_DUPLICATE' using errcode = '23505';
  end if;
  -- Sin pagos parciales: el monto es exactamente el total acordado.
  if v_amount is null or v_amount <> v_auth.total_amount then
    raise exception 'RELEASED_PAYMENT_PAYMENT_AMOUNT_MISMATCH' using errcode = '22023';
  end if;

  insert into public.released_payment_beneficiary_payments (
    company_id, parking_id, authorization_id, authorization_version, license_plate, amount, method, paid_at,
    reference, notes, created_by, created_by_email
  ) values (
    v_auth.company_id, p_parking_id, v_auth.id, v_auth.version, v_auth.license_plate, v_amount, v_method, v_paid_at,
    v_reference, v_notes, p_actor_id, v_email
  ) returning * into v_row;

  insert into public.released_payment_authorization_events (authorization_id, parking_id, company_id, event_type, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (v_auth.id, p_parking_id, v_auth.company_id, 'PAYMENT_REGISTERED', '{}'::jsonb, to_jsonb(v_row), 'Pago recibido registrado', p_actor_id, v_email, 'company_admin');
  return v_row;
end;
$$;

create or replace function public.released_payment_void_beneficiary_payment(p_actor_id uuid, p_parking_id uuid, p_payment_id uuid, p_reason text)
returns public.released_payment_beneficiary_payments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_previous public.released_payment_beneficiary_payments%rowtype;
  v_row public.released_payment_beneficiary_payments%rowtype;
begin
  v_email := public.released_payment_admin_actor(p_actor_id, p_parking_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'RELEASED_PAYMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_previous from public.released_payment_beneficiary_payments
  where id = p_payment_id and parking_id = p_parking_id for update;
  if not found then
    raise exception 'RELEASED_PAYMENT_PAYMENT_NOT_FOUND' using errcode = '22023';
  end if;
  if v_previous.status <> 'REGISTERED' then
    raise exception 'RELEASED_PAYMENT_PAYMENT_ALREADY_VOIDED' using errcode = '22023';
  end if;
  update public.released_payment_beneficiary_payments set
    status = 'VOIDED', voided_at = clock_timestamp(), voided_by = p_actor_id, voided_by_email = v_email, void_reason = left(btrim(p_reason), 500)
  where id = p_payment_id
  returning * into v_row;
  insert into public.released_payment_authorization_events (authorization_id, parking_id, company_id, event_type, previous_values, new_values, reason, actor_id, actor_email, actor_role)
  values (v_row.authorization_id, p_parking_id, v_row.company_id, 'PAYMENT_VOIDED', to_jsonb(v_previous), to_jsonb(v_row), left(btrim(p_reason), 500), p_actor_id, v_email, 'company_admin');
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acceso: solo service_role (API server-side). Historial sin UPDATE/DELETE.
-- ---------------------------------------------------------------------------

alter table public.released_payment_contracts enable row level security;
alter table public.released_payment_contracts force row level security;
alter table public.released_payment_parking_modules enable row level security;
alter table public.released_payment_parking_modules force row level security;
alter table public.released_payment_module_events enable row level security;
alter table public.released_payment_module_events force row level security;
alter table public.released_payment_tariffs enable row level security;
alter table public.released_payment_tariffs force row level security;
alter table public.released_payment_authorizations enable row level security;
alter table public.released_payment_authorizations force row level security;
alter table public.released_payment_authorization_events enable row level security;
alter table public.released_payment_authorization_events force row level security;
alter table public.released_payment_beneficiary_payments enable row level security;
alter table public.released_payment_beneficiary_payments force row level security;

revoke all on public.released_payment_contracts, public.released_payment_parking_modules,
  public.released_payment_module_events, public.released_payment_tariffs,
  public.released_payment_authorizations, public.released_payment_authorization_events,
  public.released_payment_beneficiary_payments
  from anon, authenticated, service_role;

-- La escritura pasa solo por las RPC (security definer); service_role lee.
grant select on public.released_payment_contracts, public.released_payment_parking_modules,
  public.released_payment_module_events, public.released_payment_tariffs,
  public.released_payment_authorizations, public.released_payment_authorization_events,
  public.released_payment_beneficiary_payments
  to service_role;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.released_payment_contract_end(timestamptz, text, integer, text)',
    'public.released_payment_root_actor(uuid)',
    'public.released_payment_admin_actor(uuid, uuid)',
    'public.released_payment_save_monthly_fee(uuid, uuid, jsonb, text)',
    'public.released_payment_set_module_state(uuid, uuid, boolean, text)',
    'public.released_payment_set_operational_spots(uuid, uuid, integer, text)',
    'public.released_payment_save_tariff(uuid, uuid, jsonb, text)',
    'public.released_payment_retire_tariff(uuid, uuid, text, text)',
    'public.released_payment_save_authorization(uuid, uuid, uuid, jsonb, text)',
    'public.released_payment_revoke_authorization(uuid, uuid, uuid, text)',
    'public.released_payment_register_beneficiary_payment(uuid, uuid, uuid, jsonb)',
    'public.released_payment_void_beneficiary_payment(uuid, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end $$;
