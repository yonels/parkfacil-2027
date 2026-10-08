-- SOL-2026-10-08-003 (etapa 1): tarifas por franja horaria con tope, salida sin
-- pago ("se retiró sin pagar") y deudas pendientes con aviso al ingreso.
-- Diseño: docs/solicitudes/SOL-2026-10-08-003/DISENO.md (v2.1).
--
-- Principios:
-- - Aditiva: las tarifas existentes quedan con time_bands_enabled=false y su
--   cobro no cambia. Ningún dato existente se reescribe.
-- - Las franjas siguen siendo minuto efectivo (cambia el precio según la hora,
--   no la modalidad); el tope solo reduce. overnight_flat_amount sigue en 0.
-- - companies.id es TEXT en este esquema: toda FK a companies usa text.
-- - Los montos se calculan en el dominio (src/lib/parkingRates.mjs); la base
--   valida forma, transiciones e inmutabilidad (defensa en profundidad).

begin;

-- ------------------------------------------------------------------
-- 1) Tarifas: bandera de franjas y forma de la tarifa
-- ------------------------------------------------------------------
alter table public.parking_rates
  add column if not exists time_bands_enabled boolean not null default false;

-- Reemplaza el check heredado sin nombre (modalidad <-> minute_amount) por uno
-- con nombre que incorpora las franjas. Se ubica por su definición para no
-- depender del nombre autogenerado (parking_rates_check1).
do $$
declare v record;
begin
  for v in
    select conname from pg_constraint
    where conrelid = 'public.parking_rates'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%EFFECTIVE_MINUTE%minute_amount IS NOT NULL%EXPIRED_BLOCKS%minute_amount IS NULL%'
  loop
    execute format('alter table public.parking_rates drop constraint %I', v.conname);
  end loop;
end $$;

alter table public.parking_rates drop constraint if exists parking_rates_billing_shape_check;
alter table public.parking_rates add constraint parking_rates_billing_shape_check check (
  (billing_mode = 'EFFECTIVE_MINUTE' and time_bands_enabled = false and minute_amount is not null)
  or (billing_mode = 'EFFECTIVE_MINUTE' and time_bands_enabled = true and minute_amount is null)
  or (billing_mode = 'EXPIRED_BLOCKS' and time_bands_enabled = false and minute_amount is null)
);

comment on column public.parking_rates.time_bands_enabled is
  'Precio por franja horaria (solo minuto efectivo, Off Street). Los precios viven en parking_rate_time_bands.';

-- ------------------------------------------------------------------
-- 2) Juegos de franjas (por días) y franjas
-- ------------------------------------------------------------------
create table if not exists public.parking_rate_band_sets (
  id uuid primary key default gen_random_uuid(),
  rate_id uuid not null references public.parking_rates(id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 7),
  label text not null default '' check (char_length(label) <= 60),
  days_of_week smallint[] not null default '{}'::smallint[]
    check (days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),
  applies_to_holidays boolean not null default false,
  created_at timestamptz not null default now(),
  unique (rate_id, sequence),
  unique (id, rate_id)
);
create unique index if not exists parking_rate_band_sets_one_holiday_idx
  on public.parking_rate_band_sets(rate_id) where applies_to_holidays;

create table if not exists public.parking_rate_time_bands (
  id uuid primary key default gen_random_uuid(),
  band_set_id uuid not null,
  rate_id uuid not null,
  sequence smallint not null check (sequence between 1 and 8),
  label text not null default '' check (char_length(label) <= 40),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 0 and 1439),
  minute_amount numeric(14,4) not null check (minute_amount > 0),
  cap_amount numeric(14,2) null check (cap_amount is null or cap_amount > 0),
  created_at timestamptz not null default now(),
  foreign key (band_set_id, rate_id) references public.parking_rate_band_sets(id, rate_id) on delete cascade,
  unique (band_set_id, sequence),
  unique (band_set_id, start_minute)
);
create index if not exists parking_rate_time_bands_rate_idx on public.parking_rate_time_bands(rate_id);

comment on table public.parking_rate_time_bands is
  'Franja horaria [start_minute, end_minute) en hora de Chile; end<start cruza medianoche; start=end solo si es la única franja (24 h). cap_amount: tope por pasada continua.';

-- Validación completa de la configuración de franjas de una tarifa:
-- cada día 1..7 en exactamente un juego; cada juego con 1..8 franjas que cubren
-- las 24 h sin huecos ni superposiciones.
create or replace function public.parking_rate_time_bands_valid(p_rate_id uuid)
returns boolean language plpgsql stable set search_path = public as $$
declare
  v_set record;
  v_band record;
  v_count integer;
  v_first_start integer;
  v_prev_end integer;
  v_day integer;
begin
  if not exists (select 1 from public.parking_rate_band_sets where rate_id = p_rate_id) then
    return false;
  end if;
  for v_day in 1..7 loop
    select count(*) into v_count from public.parking_rate_band_sets
    where rate_id = p_rate_id and v_day = any(days_of_week);
    if v_count <> 1 then return false; end if;
  end loop;
  for v_set in select id from public.parking_rate_band_sets where rate_id = p_rate_id loop
    select count(*) into v_count from public.parking_rate_time_bands where band_set_id = v_set.id;
    if v_count < 1 or v_count > 8 then return false; end if;
    if v_count = 1 then
      if not exists (select 1 from public.parking_rate_time_bands
                     where band_set_id = v_set.id and start_minute = end_minute) then
        return false;
      end if;
      continue;
    end if;
    v_first_start := null; v_prev_end := null;
    for v_band in
      select start_minute, end_minute from public.parking_rate_time_bands
      where band_set_id = v_set.id order by start_minute
    loop
      if v_band.start_minute = v_band.end_minute then return false; end if;
      if v_first_start is null then
        v_first_start := v_band.start_minute;
      elsif v_band.start_minute <> v_prev_end then
        return false;
      end if;
      v_prev_end := v_band.end_minute;
    end loop;
    if v_prev_end <> v_first_start then return false; end if;
  end loop;
  return true;
end;
$$;

-- Guardas de la tarifa con franjas: solo Off Street, y no puede quedar ACTIVE
-- con una configuración inválida. El cambio de time_bands_enabled solo es
-- posible mientras la tarifa es DRAFT (mismo criterio de edición existente).
create or replace function public.parking_rates_time_bands_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'DRAFT'
     and new.time_bands_enabled is distinct from old.time_bands_enabled then
    raise exception 'RATE_TIME_BANDS_IMMUTABLE' using errcode = '23514';
  end if;
  if new.time_bands_enabled then
    if not exists (select 1 from public.parkings p where p.id = new.parking_id and p.type = 'OFF_STREET') then
      raise exception 'RATE_TIME_BANDS_OFF_STREET_ONLY' using errcode = '23514';
    end if;
    if new.status = 'ACTIVE' and not public.parking_rate_time_bands_valid(new.id) then
      raise exception 'RATE_TIME_BANDS_INVALID' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists parking_rates_time_bands_guard on public.parking_rates;
create trigger parking_rates_time_bands_guard
before insert or update on public.parking_rates
for each row execute function public.parking_rates_time_bands_guard();

-- Juegos y franjas solo se modifican mientras la tarifa es DRAFT y nunca
-- participó en un cobro (mismo criterio que rate.editable en el dominio).
create or replace function public.parking_rate_bands_edit_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_rate_id uuid := coalesce(new.rate_id, old.rate_id);
  v_status text;
begin
  select status into v_status from public.parking_rates where id = v_rate_id;
  if v_status is null then
    return coalesce(new, old); -- cascada desde el borrado de la tarifa
  end if;
  if v_status <> 'DRAFT' or exists (select 1 from public.parking_stays where rate_id = v_rate_id) then
    raise exception 'RATE_TIME_BANDS_IMMUTABLE' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists parking_rate_band_sets_edit_guard on public.parking_rate_band_sets;
create trigger parking_rate_band_sets_edit_guard
before insert or update or delete on public.parking_rate_band_sets
for each row execute function public.parking_rate_bands_edit_guard();
drop trigger if exists parking_rate_time_bands_edit_guard on public.parking_rate_time_bands;
create trigger parking_rate_time_bands_edit_guard
before insert or update or delete on public.parking_rate_time_bands
for each row execute function public.parking_rate_bands_edit_guard();

alter table public.parking_rate_band_sets enable row level security;
alter table public.parking_rate_time_bands enable row level security;
revoke all on public.parking_rate_band_sets, public.parking_rate_time_bands from anon, authenticated;
grant select, insert, update, delete on public.parking_rate_band_sets, public.parking_rate_time_bands to service_role;
grant select on public.parking_rate_band_sets, public.parking_rate_time_bands to authenticated;
drop policy if exists rate_band_sets_read on public.parking_rate_band_sets;
create policy rate_band_sets_read on public.parking_rate_band_sets for select to authenticated
  using (exists (select 1 from public.parking_rates r where r.id = rate_id and public.pf_can_access_parking(r.parking_id)));
drop policy if exists rate_time_bands_read on public.parking_rate_time_bands;
create policy rate_time_bands_read on public.parking_rate_time_bands for select to authenticated
  using (exists (select 1 from public.parking_rates r where r.id = rate_id and public.pf_can_access_parking(r.parking_id)));

-- ------------------------------------------------------------------
-- 3) Feriados propios de cada cliente (D14)
-- ------------------------------------------------------------------
create table if not exists public.parking_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  holiday_date date not null,
  label text not null default '' check (char_length(label) <= 80),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, holiday_date)
);
alter table public.parking_holidays enable row level security;
revoke all on public.parking_holidays from anon, authenticated;
grant select, insert, update, delete on public.parking_holidays to service_role;
grant select on public.parking_holidays to authenticated;
drop policy if exists parking_holidays_read on public.parking_holidays;
create policy parking_holidays_read on public.parking_holidays for select to authenticated
  using (public.pf_is_platform_admin() or company_id = public.pf_current_company_id());

-- ------------------------------------------------------------------
-- 4) Estadías: salida sin pago y desglose del cobro
-- ------------------------------------------------------------------
alter table public.parking_stays
  add column if not exists charge_breakdown jsonb null,
  add column if not exists unpaid_marked_at timestamptz null,
  add column if not exists unpaid_marked_by uuid null references auth.users(id) on delete set null,
  add column if not exists unpaid_marked_by_name text null,
  add column if not exists unpaid_shift_id uuid null references public.operator_shifts(id) on delete restrict,
  add column if not exists unpaid_notes text null check (unpaid_notes is null or char_length(unpaid_notes) <= 300),
  add column if not exists exit_source text null check (exit_source is null or exit_source in ('SHIFT_CLOSE', 'SENSOR', 'LPR'));

do $$
declare v record;
begin
  for v in
    select conname from pg_constraint
    where conrelid = 'public.parking_stays'::regclass and contype = 'c'
      and (
        pg_get_constraintdef(oid) like '%status = ANY (ARRAY[''OPEN''::text, ''PAID''::text, ''CANCELLED''::text])%'
        or pg_get_constraintdef(oid) like '%(status = ''OPEN''::text) AND (exit_at IS NULL)%(status = ''CANCELLED''::text)%'
      )
  loop
    execute format('alter table public.parking_stays drop constraint %I', v.conname);
  end loop;
end $$;

alter table public.parking_stays drop constraint if exists parking_stays_status_check;
alter table public.parking_stays add constraint parking_stays_status_check
  check (status in ('OPEN', 'PAID', 'CANCELLED', 'UNPAID_PENDING', 'UNPAID_EXIT'));

alter table public.parking_stays drop constraint if exists parking_stays_status_shape_check;
alter table public.parking_stays add constraint parking_stays_status_shape_check check (
  (status = 'OPEN' and exit_at is null)
  or (status = 'PAID' and exit_at is not null and payment_code is not null)
  or status = 'CANCELLED'
  or (status = 'UNPAID_PENDING' and exit_at is null and payment_code is null and payment_method is null
      and unpaid_marked_at is not null and unpaid_shift_id is not null)
  or (status = 'UNPAID_EXIT' and exit_at is not null and payment_code is null and payment_method is null
      and unpaid_marked_at is not null and unpaid_shift_id is not null and exit_source is not null
      and total_amount is not null and exit_at >= unpaid_marked_at)
);

create index if not exists parking_stays_unpaid_pending_idx
  on public.parking_stays(unpaid_shift_id) where status = 'UNPAID_PENDING';

comment on column public.parking_stays.exit_source is
  'Origen de la hora de salida de una salida sin pago: SHIFT_CLOSE (cierre de turno, D15); SENSOR/LPR reservados (D16).';

-- Transiciones de la salida sin pago. Se ejecuta solo cuando cambia el estado
-- o cuando la fila ya está en UNPAID_EXIT (inmutable).
create or replace function public.parking_stays_unpaid_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shift public.operator_shifts%rowtype;
  v_close_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.status in ('UNPAID_PENDING', 'UNPAID_EXIT') then
      raise exception 'UNPAID_STATUS_INSERT_FORBIDDEN' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'UNPAID_EXIT' then
    if new.status is distinct from old.status or new.exit_at is distinct from old.exit_at
       or new.total_amount is distinct from old.total_amount or new.net_amount is distinct from old.net_amount
       or new.tax_amount is distinct from old.tax_amount or new.unpaid_shift_id is distinct from old.unpaid_shift_id
       or new.charge_breakdown is distinct from old.charge_breakdown then
      raise exception 'UNPAID_EXIT_IMMUTABLE' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    if old.status = 'UNPAID_PENDING' and (new.unpaid_shift_id is distinct from old.unpaid_shift_id
       or new.unpaid_marked_at is distinct from old.unpaid_marked_at) then
      raise exception 'UNPAID_PENDING_IMMUTABLE' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'UNPAID_PENDING' then
    if old.status <> 'OPEN' then raise exception 'UNPAID_REQUIRES_OPEN_STAY' using errcode = '23514'; end if;
    select * into v_shift from public.operator_shifts where id = new.unpaid_shift_id for share;
    if not found then raise exception 'UNPAID_SHIFT_NOT_FOUND' using errcode = '23503'; end if;
    if v_shift.status <> 'OPEN' then raise exception 'UNPAID_SHIFT_NOT_OPEN' using errcode = '23514'; end if;
    if v_shift.parking_id <> new.parking_id then raise exception 'UNPAID_SHIFT_PARKING_MISMATCH' using errcode = '23514'; end if;
    if new.unpaid_marked_by is null or v_shift.operator_id <> new.unpaid_marked_by::text then
      raise exception 'UNPAID_SHIFT_OPERATOR_MISMATCH' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'UNPAID_PENDING' and new.status = 'OPEN' then
    -- Revertir una marca errónea: solo mientras el turno siga abierto.
    select * into v_shift from public.operator_shifts where id = old.unpaid_shift_id for share;
    if not found or v_shift.status <> 'OPEN' then
      raise exception 'UNPAID_REVERT_SHIFT_NOT_OPEN' using errcode = '23514';
    end if;
    if new.unpaid_marked_at is not null or new.unpaid_shift_id is not null or new.unpaid_marked_by is not null then
      raise exception 'UNPAID_REVERT_REQUIRES_CLEAR' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'UNPAID_EXIT' then
    if old.status <> 'UNPAID_PENDING' then raise exception 'UNPAID_EXIT_REQUIRES_PENDING' using errcode = '23514'; end if;
    if new.unpaid_shift_id is distinct from old.unpaid_shift_id then
      raise exception 'UNPAID_PENDING_IMMUTABLE' using errcode = '23514';
    end if;
    select actual_close_at into v_close_at from public.shift_closures where shift_id = old.unpaid_shift_id;
    if v_close_at is null then raise exception 'UNPAID_SHIFT_NOT_CLOSED' using errcode = '23514'; end if;
    if new.exit_at is distinct from v_close_at then
      raise exception 'UNPAID_EXIT_TIME_MISMATCH' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'UNPAID_PENDING' then
    raise exception 'UNPAID_PENDING_INVALID_TRANSITION' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists parking_stays_unpaid_guard on public.parking_stays;
create trigger parking_stays_unpaid_guard
before insert or update on public.parking_stays
for each row execute function public.parking_stays_unpaid_guard();
revoke all on function public.parking_stays_unpaid_guard() from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 5) Deudas pendientes
-- ------------------------------------------------------------------
create table if not exists public.parking_debts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  stay_id uuid not null unique references public.parking_stays(id) on delete restrict,
  license_plate text not null check (license_plate ~ '^[A-Z0-9]{4}-[A-Z0-9]{2}$'),
  origin text not null default 'UNPAID_EXIT' check (origin = 'UNPAID_EXIT'),
  net_amount integer not null check (net_amount >= 0),
  tax_amount integer not null check (tax_amount >= 0),
  amount integer not null check (amount >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'WAIVED')),
  notes text not null default '' check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  paid_at timestamptz null,
  paid_by uuid null references auth.users(id) on delete set null,
  paid_by_name text null,
  paid_method text null check (paid_method is null or paid_method in ('CASH', 'CARD', 'TRANSFER', 'OTHER')),
  paid_reference text null check (paid_reference is null or char_length(paid_reference) <= 120),
  paid_channel text null check (paid_channel is null or paid_channel in ('WEB', 'POS')),
  waived_at timestamptz null,
  waived_by uuid null references auth.users(id) on delete set null,
  waived_by_name text null,
  waived_reason text null check (waived_reason is null or char_length(waived_reason) <= 300),
  waived_channel text null check (waived_channel is null or waived_channel in ('WEB', 'POS')),
  updated_at timestamptz not null default now(),
  check (net_amount + tax_amount = amount),
  check (
    (status = 'PENDING' and paid_at is null and waived_at is null)
    or (status = 'PAID' and paid_at is not null and paid_method is not null and paid_channel is not null and waived_at is null)
    or (status = 'WAIVED' and waived_at is not null and waived_channel is not null
        and char_length(trim(coalesce(waived_reason, ''))) > 0 and paid_at is null)
  )
);
create index if not exists parking_debts_pending_plate_idx
  on public.parking_debts(company_id, license_plate) where status = 'PENDING';
create index if not exists parking_debts_company_status_idx
  on public.parking_debts(company_id, status, created_at desc);

-- Una deuda solo cambia de PENDING a PAID o WAIVED; sus datos de origen nunca
-- cambian y, una vez resuelta, es inmutable. No se borra.
create or replace function public.parking_debts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'PARKING_DEBT_DELETE_FORBIDDEN' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'PENDING' then raise exception 'PARKING_DEBT_MUST_START_PENDING' using errcode = '23514'; end if;
    if not exists (select 1 from public.parking_stays s where s.id = new.stay_id and s.status = 'UNPAID_EXIT'
                   and s.parking_id = new.parking_id and s.license_plate = new.license_plate
                   and s.total_amount = new.amount) then
      raise exception 'PARKING_DEBT_STAY_MISMATCH' using errcode = '23514';
    end if;
    return new;
  end if;
  if old.status <> 'PENDING' then raise exception 'PARKING_DEBT_IMMUTABLE' using errcode = '23514'; end if;
  if new.company_id is distinct from old.company_id or new.parking_id is distinct from old.parking_id
     or new.stay_id is distinct from old.stay_id or new.license_plate is distinct from old.license_plate
     or new.amount is distinct from old.amount or new.net_amount is distinct from old.net_amount
     or new.tax_amount is distinct from old.tax_amount or new.created_at is distinct from old.created_at
     or new.origin is distinct from old.origin then
    raise exception 'PARKING_DEBT_ORIGIN_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists parking_debts_guard on public.parking_debts;
create trigger parking_debts_guard
before insert or update or delete on public.parking_debts
for each row execute function public.parking_debts_guard();

alter table public.parking_debts enable row level security;
revoke all on public.parking_debts from anon, authenticated;
grant select, insert, update on public.parking_debts to service_role;
grant select on public.parking_debts to authenticated;
drop policy if exists parking_debts_read on public.parking_debts;
create policy parking_debts_read on public.parking_debts for select to authenticated
  using (public.pf_is_platform_admin() or company_id = public.pf_current_company_id());

-- Cierre atómico de una salida sin pago: pasa la estadía a UNPAID_EXIT con la
-- hora de cierre del turno y crea su deuda en la misma transacción. Los montos
-- llegan calculados por el dominio; aquí se validan coherencia y hora.
-- Idempotente: si la estadía ya está cerrada, devuelve su deuda.
create or replace function public.finalize_unpaid_stay(
  p_stay_id uuid, p_exit_at timestamptz, p_elapsed_minutes integer,
  p_rate_id uuid, p_rate_name text, p_billing_mode text,
  p_subtotal integer, p_net integer, p_tax integer, p_total integer, p_breakdown jsonb
) returns public.parking_debts
language plpgsql security definer set search_path = public as $$
declare
  v_stay public.parking_stays%rowtype;
  v_debt public.parking_debts%rowtype;
  v_company_id text;
  v_close_at timestamptz;
begin
  select * into v_stay from public.parking_stays where id = p_stay_id for update;
  if not found then raise exception 'STAY_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_stay.status = 'UNPAID_EXIT' then
    select * into v_debt from public.parking_debts where stay_id = v_stay.id;
    if found then return v_debt; end if;
    raise exception 'UNPAID_EXIT_WITHOUT_DEBT' using errcode = '23514';
  end if;
  if v_stay.status <> 'UNPAID_PENDING' then raise exception 'UNPAID_EXIT_REQUIRES_PENDING' using errcode = '23514'; end if;
  select actual_close_at into v_close_at from public.shift_closures where shift_id = v_stay.unpaid_shift_id;
  if v_close_at is null then raise exception 'UNPAID_SHIFT_NOT_CLOSED' using errcode = '23514'; end if;
  if p_exit_at is distinct from v_close_at then raise exception 'UNPAID_EXIT_TIME_MISMATCH' using errcode = '23514'; end if;
  if p_total is null or p_net is null or p_tax is null or p_subtotal is null
     or p_total < 0 or p_net < 0 or p_tax < 0 or p_net + p_tax <> p_total or p_subtotal <> p_total then
    raise exception 'UNPAID_AMOUNTS_INVALID' using errcode = '23514';
  end if;
  if p_elapsed_minutes is null or p_elapsed_minutes < 0 then raise exception 'UNPAID_AMOUNTS_INVALID' using errcode = '23514'; end if;
  select company_id into v_company_id from public.parkings where id = v_stay.parking_id;
  if v_company_id is null then raise exception 'PARKING_COMPANY_NOT_FOUND' using errcode = 'P0002'; end if;

  update public.parking_stays set
    status = 'UNPAID_EXIT', exit_at = v_close_at, exit_source = 'SHIFT_CLOSE',
    exit_operator_id = v_stay.unpaid_marked_by, exit_operator_name = v_stay.unpaid_marked_by_name,
    elapsed_minutes = p_elapsed_minutes, rate_id = p_rate_id, rate_name = p_rate_name, billing_mode = p_billing_mode,
    subtotal_amount = p_subtotal, discount_amount = 0, net_amount = p_net, tax_amount = p_tax, total_amount = p_total,
    charge_breakdown = p_breakdown, updated_at = now()
  where id = v_stay.id;

  insert into public.parking_debts(company_id, parking_id, stay_id, license_plate, net_amount, tax_amount, amount,
    notes, created_by)
  values (v_company_id, v_stay.parking_id, v_stay.id, v_stay.license_plate, p_net, p_tax, p_total,
    coalesce(v_stay.unpaid_notes, ''), v_stay.unpaid_marked_by)
  returning * into v_debt;
  return v_debt;
end;
$$;
revoke all on function public.finalize_unpaid_stay(uuid, timestamptz, integer, uuid, text, text, integer, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_unpaid_stay(uuid, timestamptz, integer, uuid, text, text, integer, integer, integer, integer, jsonb) to service_role;

-- ------------------------------------------------------------------
-- 6) Aviso de deuda pendiente por estacionamiento (D6, D7)
-- ------------------------------------------------------------------
alter table public.parking_offstreet_settings
  add column if not exists debt_notice_enabled boolean not null default false;
comment on column public.parking_offstreet_settings.debt_notice_enabled is
  'Muestra al ingresar una patente sus deudas pendientes en cualquier estacionamiento de la empresa.';

commit;
