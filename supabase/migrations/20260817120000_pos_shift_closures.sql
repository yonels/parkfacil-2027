-- POS — Cierre de caja por operador.
-- Estructuras independientes del modelo On Street (operator_shifts /
-- operator_assignments / shift_closures no se modifican). Off Street no
-- tiene sectores/calles/asignaciones por rango de número, así que estas
-- tablas son deliberadamente más simples: un turno = operador + parking +
-- ventana de tiempo. La atribución de pagos al turno se resuelve por
-- parking_id + exit_operator_id + status='PAID' + exit_at entre opened_at y
-- closed_at (parking_stays no recibe columna shift_id).

create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at)
);

-- Un solo turno OPEN por operador (regla 1).
create unique index if not exists pos_shift_one_open_per_operator_idx
  on public.pos_shifts(operator_id) where status = 'OPEN';

create index if not exists pos_shifts_parking_idx on public.pos_shifts(parking_id, status);

create table if not exists public.pos_shift_closures (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.pos_shifts(id) on delete restrict,
  operator_id text not null,
  parking_id uuid not null references public.parkings(id) on delete restrict,

  confirmed_payments_count integer not null default 0 check (confirmed_payments_count >= 0),
  -- Pagos anulados = 0 mientras no exista un mecanismo real de anulación
  -- financiera (regla 7/8): no se inventa. Ver auditoría previa — ningún
  -- endpoint del sistema anula hoy un pago ya confirmado.
  cancelled_payments_count integer not null default 0 check (cancelled_payments_count >= 0),

  cash_amount numeric(14,2) not null default 0,
  -- El esquema actual no distingue débito de crédito dentro de un pago con
  -- tarjeta (solo CASH/CARD en parking_stays.payment_method); igual que en
  -- Pagos del día, quedan en 0 en vez de inventar un reparto.
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  cancelled_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,

  declared_cash_amount numeric(14,2) not null default 0,
  cash_difference numeric(14,2) not null default 0,
  difference_observation text not null default '',

  pending_vehicles_count integer not null default 0 check (pending_vehicles_count >= 0),
  pending_vehicles_snapshot jsonb not null default '[]'::jsonb,
  payments_snapshot jsonb not null default '[]'::jsonb,

  shift_opened_at timestamptz not null,
  shift_closed_at timestamptz not null,

  folio text not null unique,
  confirmed_by text not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pos_shift_closures_operator_idx on public.pos_shift_closures(operator_id, confirmed_at desc);
create index if not exists pos_shift_closures_parking_idx on public.pos_shift_closures(parking_id, confirmed_at desc);

alter table public.pos_shifts enable row level security;
alter table public.pos_shift_closures enable row level security;

grant select, insert, update on public.pos_shifts to service_role;
grant select, insert, update on public.pos_shift_closures to service_role;

-- Un cierre confirmado es inmutable (regla 9), incluso ante escrituras
-- accidentales del propio backend.
create or replace function public.prevent_pos_shift_closure_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'POS_SHIFT_CLOSURE_IMMUTABLE' using errcode = 'P0001';
end;
$$;
drop trigger if exists pos_shift_closures_immutable on public.pos_shift_closures;
create trigger pos_shift_closures_immutable before update or delete on public.pos_shift_closures
for each row execute function public.prevent_pos_shift_closure_mutation();

-- Transacción única: recalcula todo server-side (regla 2), congela
-- payments_snapshot/pending_vehicles_snapshot (regla 4/6) y cierra el turno
-- en el mismo movimiento (evita doble cierre — regla 9/rechazo CASO D).
create or replace function public.close_pos_shift(
  p_shift_id uuid,
  p_actor_id text,
  p_actor_name text,
  p_actor_is_admin boolean,
  p_declared_cash numeric,
  p_observation text
) returns public.pos_shift_closures
language plpgsql security definer set search_path=public as $$
declare
  v_shift public.pos_shifts%rowtype;
  v_parking public.parkings%rowtype;
  v_close_at timestamptz := clock_timestamp();
  v_confirmed_count integer;
  v_cash_amount numeric(14,2);
  v_debit_amount numeric(14,2) := 0;
  v_credit_amount numeric(14,2) := 0;
  v_gross_amount numeric(14,2);
  v_cancelled_amount numeric(14,2) := 0;
  v_cancelled_count integer := 0;
  v_net_amount numeric(14,2);
  v_difference numeric(14,2);
  v_pending_count integer;
  v_payments_snapshot jsonb;
  v_pending_snapshot jsonb;
  v_closure public.pos_shift_closures%rowtype;
begin
  if p_declared_cash is null or p_declared_cash < 0 then
    raise exception 'INVALID_DECLARED_CASH' using errcode = '23514';
  end if;

  select * into v_shift from public.pos_shifts where id = p_shift_id for update;
  if not found then raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_shift.status <> 'OPEN' then raise exception 'SHIFT_NOT_CLOSABLE' using errcode = 'P0001'; end if;
  if v_shift.operator_id <> p_actor_id and not p_actor_is_admin then
    raise exception 'SHIFT_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.pos_shift_closures where shift_id = v_shift.id) then
    raise exception 'SHIFT_ALREADY_CLOSED' using errcode = '23505';
  end if;

  select * into v_parking from public.parkings where id = v_shift.parking_id;
  if v_parking.id is null then raise exception 'PARKING_NOT_FOUND' using errcode = 'P0002'; end if;

  -- Atribución (regla 3): parking_id + exit_operator_id + status=PAID +
  -- exit_at entre opened_at y el cierre real (clock_timestamp()).
  select
    coalesce(count(*), 0),
    coalesce(sum(total_amount) filter (where payment_method = 'CASH'), 0),
    coalesce(sum(total_amount), 0)
  into v_confirmed_count, v_cash_amount, v_gross_amount
  from public.parking_stays
  where parking_id = v_shift.parking_id
    and exit_operator_id = v_shift.operator_id
    and status = 'PAID'
    and exit_at >= v_shift.opened_at
    and exit_at <= v_close_at;

  v_net_amount := v_gross_amount - v_cancelled_amount;
  v_difference := p_declared_cash - v_cash_amount;

  if v_difference <> 0 and trim(coalesce(p_observation, '')) = '' then
    raise exception 'DIFFERENCE_OBSERVATION_REQUIRED' using errcode = '23514';
  end if;

  -- Vehículos pendientes: todos los OPEN del parking al momento del cierre
  -- (regla 6 del requerimiento original) — no se cierran, no generan pago,
  -- no cambian de operador; es solo constancia + fotografía para auditoría.
  select coalesce(count(*), 0) into v_pending_count
  from public.parking_stays
  where parking_id = v_shift.parking_id and status = 'OPEN';

  select coalesce(jsonb_agg(jsonb_build_object(
    'stayId', id,
    'plate', license_plate,
    'ticket', code,
    'exitAt', exit_at,
    'paymentMethod', payment_method,
    'amount', total_amount,
    'operatorId', exit_operator_id
  ) order by exit_at), '[]'::jsonb)
  into v_payments_snapshot
  from public.parking_stays
  where parking_id = v_shift.parking_id
    and exit_operator_id = v_shift.operator_id
    and status = 'PAID'
    and exit_at >= v_shift.opened_at
    and exit_at <= v_close_at;

  select coalesce(jsonb_agg(jsonb_build_object(
    'stayId', id,
    'plate', license_plate,
    'ticket', code,
    'entryAt', entry_at,
    'elapsedMinutes', greatest(0, floor(extract(epoch from (v_close_at - entry_at)) / 60))
  ) order by entry_at), '[]'::jsonb)
  into v_pending_snapshot
  from public.parking_stays
  where parking_id = v_shift.parking_id and status = 'OPEN';

  insert into public.pos_shift_closures(
    shift_id, operator_id, parking_id,
    confirmed_payments_count, cancelled_payments_count,
    cash_amount, debit_amount, credit_amount, gross_amount, cancelled_amount, net_amount,
    declared_cash_amount, cash_difference, difference_observation,
    pending_vehicles_count, pending_vehicles_snapshot, payments_snapshot,
    shift_opened_at, shift_closed_at, folio, confirmed_by
  ) values (
    v_shift.id, v_shift.operator_id, v_shift.parking_id,
    v_confirmed_count, v_cancelled_count,
    v_cash_amount, v_debit_amount, v_credit_amount, v_gross_amount, v_cancelled_amount, v_net_amount,
    p_declared_cash, v_difference, left(trim(coalesce(p_observation, '')), 1000),
    v_pending_count, v_pending_snapshot, v_payments_snapshot,
    v_shift.opened_at, v_close_at,
    'CC-' || to_char(v_close_at at time zone 'America/Santiago', 'YYYYMMDD-HH24MISS') || '-' || upper(substr(v_shift.id::text, 1, 8)),
    p_actor_id
  ) returning * into v_closure;

  update public.pos_shifts set status = 'CLOSED', closed_at = v_close_at, updated_at = v_close_at where id = v_shift.id;

  return v_closure;
end;
$$;
revoke all on function public.close_pos_shift(uuid,text,text,boolean,numeric,text) from public,anon,authenticated;
grant execute on function public.close_pos_shift(uuid,text,text,boolean,numeric,text) to service_role;
