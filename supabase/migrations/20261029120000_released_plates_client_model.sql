-- Off Street — Pago liberado gestionado por el cliente (SOL-2026-10-28-003).
--
-- Modelo aprobado por el usuario (prototipo v5, 2026-10-28):
-- - El administrador de la empresa (company_admin) activa el módulo en cada
--   estacionamiento y registra las patentes liberadas; ParkFacil Root no
--   interviene y el módulo no tiene costo con ParkFacil.
-- - Una autorización rige en TODOS los estacionamientos de la empresa con el
--   módulo activado.
-- - Patente (AAAA-11 o AA-1111, guardada en el formato interno XXXX-XX),
--   inicio y término (el término lo puede escribir el cliente; la cantidad y
--   la unidad solo lo sugieren y se guardan para el ticket «LIBERADO POR …»).
--   «Semanas (lunes a viernes)»: el beneficio no aplica sábado ni domingo.
-- - Beneficiario: nombre, RUT, teléfono y correo obligatorios; motivo
--   obligatorio.
-- - Modalidad: sin costo para el beneficiario, o cobro a un tercero (factura
--   por un valor neto en UF o pesos; la emisión no se automatiza aquí).
-- - Uso: entradas múltiples, una sola entrada o un máximo de usos.
-- - Una patente no tiene dos autorizaciones vigentes o programadas a la vez
--   en la empresa; un vehículo dentro no puede volver a ingresar.
-- - Si sale después del término, se cobra solo el tiempo excedente.
--
-- Convive con el modelo de las Etapas 1–3 (contratación Root, cupos, tarifas
-- y pagos), que no se modifica. Reutiliza el cobro de estadías liberadas de la
-- Etapa 2 (released_covered_seconds / released_chargeable_seconds).
-- Acceso: solo vía API server-side (service_role); RLS sin políticas.

do $$
begin
  if to_regprocedure('public.released_payment_block_mutation()') is null then
    raise exception 'Falta la Etapa 1 de Pago liberado (released_payment_block_mutation).';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parking_stays' and column_name = 'released_covered_seconds'
  ) then
    raise exception 'Falta la Etapa 2 de Pago liberado (20261018130000): columnas de estadía liberada.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Activación por estacionamiento (administrador de la empresa)
-- ---------------------------------------------------------------------------

create table public.released_plate_parking_settings (
  parking_id uuid primary key references public.parkings(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  enabled boolean not null default false,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_by_email text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);

comment on table public.released_plate_parking_settings is 'Pago liberado (modelo cliente): activación por estacionamiento hecha por el administrador de la empresa.';

-- ---------------------------------------------------------------------------
-- Autorizaciones por patente (empresa)
-- ---------------------------------------------------------------------------

create table public.released_plate_authorizations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  license_plate text not null check (license_plate ~ '^[A-Z0-9]{4}-[A-Z0-9]{2}$'),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  duration_quantity integer null check (duration_quantity is null or duration_quantity between 1 and 9999),
  duration_unit text null check (duration_unit is null or duration_unit in ('HOUR', 'DAY', 'WEEK_WEEKDAYS', 'MONTH', 'YEAR')),
  weekdays_only boolean not null default false,
  beneficiary_name text not null check (length(btrim(beneficiary_name)) between 2 and 120),
  beneficiary_rut text not null check (beneficiary_rut ~ '^[0-9]{1,2}(\.[0-9]{3}){2}-[0-9K]$'),
  beneficiary_phone text not null check (length(btrim(beneficiary_phone)) between 8 and 20),
  beneficiary_email text not null check (beneficiary_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' and length(beneficiary_email) <= 160),
  reason text not null check (length(btrim(reason)) between 2 and 200),
  modality text not null check (modality in ('FREE', 'THIRD_PARTY')),
  third_party_name text null,
  third_party_rut text null,
  third_party_email text null,
  third_party_amount numeric(14,2) null,
  third_party_currency text null check (third_party_currency is null or third_party_currency in ('UF', 'CLP')),
  usage_mode text not null check (usage_mode in ('MULTIPLE', 'SINGLE', 'MAX')),
  max_uses integer null,
  uses_count integer not null default 0 check (uses_count >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'FINISHED', 'DELETED')),
  finished_at timestamptz null,
  deleted_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_by_email text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  check (valid_to > valid_from),
  check ((duration_quantity is null) = (duration_unit is null)),
  check (weekdays_only = (duration_unit is not distinct from 'WEEK_WEEKDAYS')),
  check (
    (modality = 'FREE' and third_party_name is null and third_party_rut is null and third_party_email is null
      and third_party_amount is null and third_party_currency is null)
    or (modality = 'THIRD_PARTY' and length(btrim(coalesce(third_party_name, ''))) between 2 and 120
      and coalesce(third_party_rut, '') ~ '^[0-9]{1,2}(\.[0-9]{3}){2}-[0-9K]$'
      and coalesce(third_party_email, '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
      and coalesce(third_party_amount, 0) > 0 and third_party_currency is not null)
  ),
  check (
    (usage_mode = 'MULTIPLE' and max_uses is null)
    or (usage_mode = 'SINGLE' and max_uses = 1)
    or (usage_mode = 'MAX' and max_uses between 2 and 100000)
  ),
  check (max_uses is null or uses_count <= max_uses),
  check ((status = 'FINISHED') = (finished_at is not null)),
  check ((status = 'DELETED') = (deleted_at is not null))
);

comment on table public.released_plate_authorizations is 'Pago liberado (modelo cliente): patentes liberadas por la empresa; rigen en sus estacionamientos con el módulo activo.';
comment on column public.released_plate_authorizations.duration_unit is 'Unidad elegida para el ticket «LIBERADO POR …»; NULL si el término se escribió a mano.';
comment on column public.released_plate_authorizations.third_party_amount is 'Cobro a un tercero: valor neto de la factura (más IVA).';

create index released_plate_authorizations_company_idx on public.released_plate_authorizations(company_id, created_at desc);
create index released_plate_authorizations_plate_idx on public.released_plate_authorizations(company_id, license_plate) where status = 'ACTIVE';

create table public.released_plate_authorization_events (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.released_plate_authorizations(id) on delete restrict,
  company_id text not null references public.companies(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'IMPORTED', 'UPDATED', 'FINISHED', 'DELETED', 'RESTORED', 'USED')),
  parking_id uuid null references public.parkings(id) on delete restrict,
  stay_id uuid null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  actor_id uuid null references auth.users(id) on delete set null,
  actor_email text not null default '',
  created_at timestamptz not null default clock_timestamp()
);

create index released_plate_authorization_events_auth_idx on public.released_plate_authorization_events(authorization_id, created_at);

create trigger released_plate_authorization_events_immutable
  before update or delete on public.released_plate_authorization_events
  for each row execute function public.released_payment_block_mutation();

-- Las autorizaciones no se borran físicamente (eliminación lógica).
create trigger released_plate_authorizations_no_delete
  before delete on public.released_plate_authorizations
  for each row execute function public.released_payment_block_mutation();

-- ---------------------------------------------------------------------------
-- Estadías: autorización y condiciones congeladas al ingreso
-- ---------------------------------------------------------------------------

alter table public.parking_stays
  add column released_plate_authorization_id uuid null references public.released_plate_authorizations(id) on delete restrict,
  add column released_plate_snapshot jsonb null,
  add constraint parking_stays_released_plate_shape_check check (
    (released_plate_authorization_id is null and released_plate_snapshot is null)
    or (released_plate_authorization_id is not null and jsonb_typeof(released_plate_snapshot) = 'object'
      and released_payment_authorization_id is null)
  );

comment on column public.parking_stays.released_plate_snapshot is 'Pago liberado (modelo cliente): condiciones congeladas al ingreso; la salida usa solo este snapshot.';

create index parking_stays_released_plate_open_idx
  on public.parking_stays(parking_id)
  where status = 'OPEN' and released_plate_authorization_id is not null;

-- ---------------------------------------------------------------------------
-- Actor: administrador activo de la empresa
-- ---------------------------------------------------------------------------

create or replace function public.released_plate_admin_actor(p_actor_id uuid, p_company_id text)
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
  where u.id = p_actor_id and cm.company_id = p_company_id and cm.role = 'company_admin' and cm.status = 'active';
  if v_email is null then
    raise exception 'RELEASED_PLATE_FORBIDDEN' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activar / desactivar en un estacionamiento
-- ---------------------------------------------------------------------------

create or replace function public.released_plate_set_parking(p_actor_id uuid, p_parking_id uuid, p_enabled boolean)
returns public.released_plate_parking_settings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_company text;
  v_email text;
  v_row public.released_plate_parking_settings%rowtype;
begin
  select company_id into v_company from public.parkings where id = p_parking_id;
  if v_company is null then
    raise exception 'RELEASED_PLATE_PARKING_NOT_FOUND' using errcode = '23514';
  end if;
  v_email := public.released_plate_admin_actor(p_actor_id, v_company);
  insert into public.released_plate_parking_settings (parking_id, company_id, enabled, updated_by, updated_by_email, updated_at)
  values (p_parking_id, v_company, coalesce(p_enabled, false), p_actor_id, v_email, clock_timestamp())
  on conflict (parking_id) do update
    set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_by_email = excluded.updated_by_email, updated_at = excluded.updated_at
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crear / editar (la validación de formato la hace el servidor; la base
-- vuelve a exigir forma, permisos, concurrencia y que la patente no tenga
-- otra autorización vigente o programada en la empresa).
-- ---------------------------------------------------------------------------

create or replace function public.released_plate_save(
  p_actor_id uuid, p_company_id text, p_authorization_id uuid, p_expected_updated_at timestamptz, p_input jsonb, p_imported boolean default false
)
returns public.released_plate_authorizations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := public.released_plate_admin_actor(p_actor_id, p_company_id);
  v_now timestamptz := clock_timestamp();
  v_current public.released_plate_authorizations%rowtype;
  v_row public.released_plate_authorizations%rowtype;
  v_plate text := upper(btrim(coalesce(p_input->>'license_plate', '')));
  v_from timestamptz := (p_input->>'valid_from')::timestamptz;
  v_to timestamptz := (p_input->>'valid_to')::timestamptz;
  v_usage text := p_input->>'usage_mode';
begin
  if p_authorization_id is not null then
    select * into v_current from public.released_plate_authorizations where id = p_authorization_id for update;
    if not found or v_current.company_id <> p_company_id then
      raise exception 'RELEASED_PLATE_NOT_FOUND' using errcode = '23514';
    end if;
    if v_current.updated_at is distinct from p_expected_updated_at then
      raise exception 'RELEASED_PLATE_CONFLICT' using errcode = '40001';
    end if;
    if v_current.status <> 'ACTIVE' or v_now >= v_current.valid_to then
      raise exception 'RELEASED_PLATE_NOT_EDITABLE' using errcode = '23514';
    end if;
    -- La patente de un registro existente no cambia.
    v_plate := v_current.license_plate;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('released_plate:' || p_company_id || ':' || v_plate, 0));
  if exists (
    select 1 from public.released_plate_authorizations a
    where a.company_id = p_company_id and a.license_plate = v_plate and a.status = 'ACTIVE'
      and a.valid_to > v_now and a.id is distinct from p_authorization_id
      and (a.max_uses is null or a.uses_count < a.max_uses)
  ) then
    raise exception 'RELEASED_PLATE_OVERLAP' using errcode = '23505';
  end if;

  if p_authorization_id is null then
    insert into public.released_plate_authorizations (
      company_id, license_plate, valid_from, valid_to, duration_quantity, duration_unit, weekdays_only,
      beneficiary_name, beneficiary_rut, beneficiary_phone, beneficiary_email, reason, modality,
      third_party_name, third_party_rut, third_party_email, third_party_amount, third_party_currency,
      usage_mode, max_uses, created_by, created_by_email, created_at, updated_by, updated_by_email, updated_at
    ) values (
      p_company_id, v_plate, v_from, v_to, nullif(p_input->>'duration_quantity', '')::integer, nullif(p_input->>'duration_unit', ''),
      coalesce(p_input->>'duration_unit', '') = 'WEEK_WEEKDAYS',
      btrim(p_input->>'beneficiary_name'), p_input->>'beneficiary_rut', btrim(p_input->>'beneficiary_phone'), lower(btrim(p_input->>'beneficiary_email')),
      btrim(p_input->>'reason'), p_input->>'modality',
      nullif(btrim(coalesce(p_input->>'third_party_name', '')), ''), nullif(p_input->>'third_party_rut', ''), nullif(lower(btrim(coalesce(p_input->>'third_party_email', ''))), ''),
      nullif(p_input->>'third_party_amount', '')::numeric, nullif(p_input->>'third_party_currency', ''),
      v_usage, nullif(p_input->>'max_uses', '')::integer, p_actor_id, v_email, v_now, p_actor_id, v_email, v_now
    ) returning * into v_row;
    insert into public.released_plate_authorization_events (authorization_id, company_id, event_type, new_values, actor_id, actor_email)
    values (v_row.id, p_company_id, case when p_imported then 'IMPORTED' else 'CREATED' end, to_jsonb(v_row), p_actor_id, v_email);
  else
    if nullif(p_input->>'max_uses', '')::integer < v_current.uses_count then
      raise exception 'RELEASED_PLATE_MAX_BELOW_USES' using errcode = '23514';
    end if;
    update public.released_plate_authorizations set
      valid_from = v_from, valid_to = v_to,
      duration_quantity = nullif(p_input->>'duration_quantity', '')::integer, duration_unit = nullif(p_input->>'duration_unit', ''),
      weekdays_only = coalesce(p_input->>'duration_unit', '') = 'WEEK_WEEKDAYS',
      beneficiary_name = btrim(p_input->>'beneficiary_name'), beneficiary_rut = p_input->>'beneficiary_rut',
      beneficiary_phone = btrim(p_input->>'beneficiary_phone'), beneficiary_email = lower(btrim(p_input->>'beneficiary_email')),
      reason = btrim(p_input->>'reason'), modality = p_input->>'modality',
      third_party_name = nullif(btrim(coalesce(p_input->>'third_party_name', '')), ''), third_party_rut = nullif(p_input->>'third_party_rut', ''),
      third_party_email = nullif(lower(btrim(coalesce(p_input->>'third_party_email', ''))), ''),
      third_party_amount = nullif(p_input->>'third_party_amount', '')::numeric, third_party_currency = nullif(p_input->>'third_party_currency', ''),
      usage_mode = v_usage, max_uses = nullif(p_input->>'max_uses', '')::integer,
      updated_by = p_actor_id, updated_by_email = v_email, updated_at = v_now
    where id = p_authorization_id
    returning * into v_row;
    insert into public.released_plate_authorization_events (authorization_id, company_id, event_type, previous_values, new_values, actor_id, actor_email)
    values (v_row.id, p_company_id, 'UPDATED', to_jsonb(v_current), to_jsonb(v_row), p_actor_id, v_email);
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finalizar ahora / eliminar (lógico) / restaurar
-- ---------------------------------------------------------------------------

create or replace function public.released_plate_set_status(
  p_actor_id uuid, p_company_id text, p_authorization_id uuid, p_expected_updated_at timestamptz, p_action text
)
returns public.released_plate_authorizations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := public.released_plate_admin_actor(p_actor_id, p_company_id);
  v_now timestamptz := clock_timestamp();
  v_current public.released_plate_authorizations%rowtype;
  v_row public.released_plate_authorizations%rowtype;
begin
  select * into v_current from public.released_plate_authorizations where id = p_authorization_id for update;
  if not found or v_current.company_id <> p_company_id then
    raise exception 'RELEASED_PLATE_NOT_FOUND' using errcode = '23514';
  end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'RELEASED_PLATE_CONFLICT' using errcode = '40001';
  end if;

  if p_action = 'FINISH' then
    if v_current.status <> 'ACTIVE' or v_now >= v_current.valid_to or v_now < v_current.valid_from then
      raise exception 'RELEASED_PLATE_NOT_CURRENT' using errcode = '23514';
    end if;
    update public.released_plate_authorizations
      set status = 'FINISHED', finished_at = v_now, valid_to = v_now, updated_by = p_actor_id, updated_by_email = v_email, updated_at = v_now
      where id = p_authorization_id returning * into v_row;
  elsif p_action = 'DELETE' then
    if v_current.status = 'DELETED' then
      raise exception 'RELEASED_PLATE_ALREADY_DELETED' using errcode = '23514';
    end if;
    update public.released_plate_authorizations
      set status = 'DELETED', deleted_at = v_now, finished_at = null, updated_by = p_actor_id, updated_by_email = v_email, updated_at = v_now
      where id = p_authorization_id returning * into v_row;
  elsif p_action = 'RESTORE' then
    if v_current.status <> 'DELETED' then
      raise exception 'RELEASED_PLATE_NOT_DELETED' using errcode = '23514';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('released_plate:' || p_company_id || ':' || v_current.license_plate, 0));
    if v_current.valid_to > v_now and exists (
      select 1 from public.released_plate_authorizations a
      where a.company_id = p_company_id and a.license_plate = v_current.license_plate and a.status = 'ACTIVE'
        and a.valid_to > v_now and a.id <> p_authorization_id and (a.max_uses is null or a.uses_count < a.max_uses)
    ) then
      raise exception 'RELEASED_PLATE_OVERLAP' using errcode = '23505';
    end if;
    update public.released_plate_authorizations
      set status = 'ACTIVE', deleted_at = null, updated_by = p_actor_id, updated_by_email = v_email, updated_at = v_now
      where id = p_authorization_id returning * into v_row;
  else
    raise exception 'RELEASED_PLATE_ACTION_INVALID' using errcode = '22023';
  end if;

  insert into public.released_plate_authorization_events (authorization_id, company_id, event_type, previous_values, new_values, actor_id, actor_email)
  values (v_row.id, p_company_id, case p_action when 'FINISH' then 'FINISHED' when 'DELETE' then 'DELETED' else 'RESTORED' end,
    to_jsonb(v_current), to_jsonb(v_row), p_actor_id, v_email);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ingreso con beneficio (POS). El servidor ya evaluó la autorización; la base
-- lo vuelve a exigir con bloqueo por patente: módulo activo en el
-- estacionamiento, autorización activa de la empresa, vigente ahora, día hábil
-- si es «lunes a viernes», usos disponibles y sin estadía abierta de la
-- patente en ningún estacionamiento.
-- ---------------------------------------------------------------------------

create or replace function public.released_plate_register_entry(
  p_parking_id uuid, p_authorization_id uuid, p_snapshot jsonb, p_stay jsonb
)
returns public.parking_stays
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_tz text := 'America/Santiago';
  v_company text;
  v_enabled boolean;
  v_auth public.released_plate_authorizations%rowtype;
  v_plate text := upper(btrim(coalesce(p_stay->>'license_plate', '')));
  v_stay public.parking_stays%rowtype;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'RELEASED_PLATE_SNAPSHOT_INVALID' using errcode = '22023';
  end if;
  select company_id into v_company from public.parkings where id = p_parking_id;
  perform pg_advisory_xact_lock(hashtextextended('released_plate:' || coalesce(v_company, '') || ':' || v_plate, 0));

  select enabled into v_enabled from public.released_plate_parking_settings where parking_id = p_parking_id;
  if not coalesce(v_enabled, false) then
    raise exception 'RELEASED_PLATE_MODULE_DISABLED' using errcode = '23514';
  end if;

  select * into v_auth from public.released_plate_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'ACTIVE' or v_auth.company_id <> v_company or v_auth.license_plate <> v_plate then
    raise exception 'RELEASED_PLATE_AUTHORIZATION_INVALID' using errcode = '23514';
  end if;
  if v_now < v_auth.valid_from or v_now >= v_auth.valid_to then
    raise exception 'RELEASED_PLATE_NOT_CURRENT' using errcode = '23514';
  end if;
  if v_auth.weekdays_only and extract(isodow from (v_now at time zone v_tz)) in (6, 7) then
    raise exception 'RELEASED_PLATE_WEEKEND' using errcode = '23514';
  end if;
  if v_auth.max_uses is not null and v_auth.uses_count >= v_auth.max_uses then
    raise exception 'RELEASED_PLATE_NO_USES' using errcode = '23514';
  end if;
  if exists (select 1 from public.parking_stays where license_plate = v_plate and status = 'OPEN') then
    raise exception 'RELEASED_PLATE_STAY_DUPLICATE' using errcode = '23505';
  end if;

  insert into public.parking_stays (
    code, parking_id, license_plate, entry_operator_id, entry_operator_name, entry_source, entry_shift_id,
    released_plate_authorization_id, released_plate_snapshot
  ) values (
    p_stay->>'code', p_parking_id, v_plate, nullif(p_stay->>'entry_operator_id', '')::uuid, coalesce(p_stay->>'entry_operator_name', ''),
    coalesce(p_stay->>'entry_source', 'POS'), nullif(p_stay->>'entry_shift_id', '')::uuid,
    v_auth.id, p_snapshot
  ) returning * into v_stay;

  update public.released_plate_authorizations set uses_count = uses_count + 1 where id = v_auth.id;
  insert into public.released_plate_authorization_events (authorization_id, company_id, event_type, parking_id, stay_id, new_values, actor_id, actor_email)
  values (v_auth.id, v_company, 'USED', p_parking_id, v_stay.id,
    jsonb_build_object('uses_count', v_auth.uses_count + 1, 'max_uses', v_auth.max_uses, 'stay_code', v_stay.code),
    nullif(p_stay->>'entry_operator_id', '')::uuid, coalesce(p_stay->>'entry_operator_name', ''));
  return v_stay;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seguridad: solo service_role
-- ---------------------------------------------------------------------------

alter table public.released_plate_parking_settings enable row level security;
alter table public.released_plate_parking_settings force row level security;
alter table public.released_plate_authorizations enable row level security;
alter table public.released_plate_authorizations force row level security;
alter table public.released_plate_authorization_events enable row level security;
alter table public.released_plate_authorization_events force row level security;

revoke all on public.released_plate_parking_settings, public.released_plate_authorizations, public.released_plate_authorization_events from public, anon, authenticated;
grant select, insert, update on public.released_plate_parking_settings, public.released_plate_authorizations to service_role;
grant select, insert on public.released_plate_authorization_events to service_role;

revoke all on function public.released_plate_admin_actor(uuid, text) from public, anon, authenticated;
revoke all on function public.released_plate_set_parking(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.released_plate_save(uuid, text, uuid, timestamptz, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.released_plate_set_status(uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.released_plate_register_entry(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.released_plate_admin_actor(uuid, text) to service_role;
grant execute on function public.released_plate_set_parking(uuid, uuid, boolean) to service_role;
grant execute on function public.released_plate_save(uuid, text, uuid, timestamptz, jsonb, boolean) to service_role;
grant execute on function public.released_plate_set_status(uuid, text, uuid, timestamptz, text) to service_role;
grant execute on function public.released_plate_register_entry(uuid, uuid, jsonb, jsonb) to service_role;
