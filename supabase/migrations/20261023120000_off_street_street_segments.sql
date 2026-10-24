-- SOL-2026-10-23-001, etapa 1: zonas, calles y tramos de calle en Off Street.
--
-- Off Street ya usa parking_sectors / parking_streets / parking_street_segments /
-- operator_assignments por dentro (sector "O" automático de turnos, ver
-- src/lib/pos/offStreetAssignment.js). Esta migración:
--   1. distingue en parking_sectors las zonas de recinto (PREMISES) de las zonas de
--      calle (STREET); un estacionamiento Off Street puede tener ambas;
--   2. registra en cada estadía la zona, calle, tramo y número de calle, y si el
--      operador ingresó fuera de su asignación (permitido, se marca para reportes);
--   3. controla el cupo por tramo: con el tramo lleno no se registra otro vehículo.
-- La ciudad es la del estacionamiento (parkings.city): una por estacionamiento.
-- Las asignaciones de operador (varios tramos por operador, varios operadores por
-- tramo, horario, días y vigencia) ya existen en operator_assignments.

begin;

-- 1. Tipo de zona ------------------------------------------------------------
alter table public.parking_sectors
  add column if not exists structure_kind text not null default 'PREMISES';

alter table public.parking_sectors drop constraint if exists parking_sectors_structure_kind_check;
alter table public.parking_sectors
  add constraint parking_sectors_structure_kind_check check (structure_kind in ('PREMISES', 'STREET'));

-- Sin actualizar filas existentes: structure_kind solo se usa en estacionamientos
-- Off Street (On Street lee todas sus áreas). Actualizar las áreas On Street chocaba
-- en producción con códigos antiguos que no cumplen parking_sectors_area_code_check
-- (NOT VALID, pero se evalúa en cada UPDATE). Las zonas nuevas se crean como STREET.

-- 2. Ubicación de la estadía ---------------------------------------------------
alter table public.parking_stays
  add column if not exists sector_id uuid references public.parking_sectors(id) on delete restrict,
  add column if not exists street_id uuid references public.parking_streets(id) on delete restrict,
  add column if not exists segment_id uuid references public.parking_street_segments(id) on delete restrict,
  add column if not exists street_number integer,
  add column if not exists out_of_assignment boolean not null default false;

alter table public.parking_stays drop constraint if exists parking_stays_street_number_check;
alter table public.parking_stays
  add constraint parking_stays_street_number_check check (street_number is null or street_number >= 0);

create index if not exists parking_stays_segment_open_idx
  on public.parking_stays (segment_id)
  where segment_id is not null and status in ('OPEN', 'UNPAID_PENDING');

-- Estados en que el vehículo sigue dentro del tramo (ocupa cupo).
create or replace function public.parking_stay_occupies_segment(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('OPEN', 'UNPAID_PENDING');
$$;

-- Ocupación actual de un tramo (vehículos dentro).
create or replace function public.off_street_segment_occupancy(p_segment_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.parking_stays s
  where s.segment_id = p_segment_id and public.parking_stay_occupies_segment(s.status);
$$;

-- Coherencia de la ubicación y cupo del tramo. Solo actúa cuando la estadía trae
-- tramo: las estadías de recinto (sin segment_id) no cambian.
create or replace function public.validate_parking_stay_street_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_segment public.parking_street_segments%rowtype;
  v_occupied integer;
  v_takes_space boolean;
begin
  if new.segment_id is null then
    if new.street_id is not null or new.street_number is not null then
      raise exception 'STAY_STREET_SEGMENT_REQUIRED' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Bloquea el tramo: dos ingresos simultáneos no superan el cupo.
  select * into v_segment from public.parking_street_segments where id = new.segment_id for update;
  if not found or v_segment.parking_id <> new.parking_id then
    raise exception 'STAY_STREET_SEGMENT_MISMATCH' using errcode = '23514';
  end if;

  new.street_id := coalesce(new.street_id, v_segment.street_id);
  new.sector_id := coalesce(new.sector_id, v_segment.area_id);
  if new.street_id <> v_segment.street_id or new.sector_id <> v_segment.area_id then
    raise exception 'STAY_STREET_SEGMENT_MISMATCH' using errcode = '23514';
  end if;

  if new.street_number is not null and (new.street_number < v_segment.from_number or new.street_number > v_segment.to_number) then
    raise exception 'STAY_STREET_NUMBER_OUT_OF_SEGMENT' using errcode = '23514';
  end if;

  -- Cupo: solo al ocupar el tramo (ingreso nuevo, o cambio de tramo/estado a ocupado).
  -- (OLD no existe en INSERT: se evalúa por separado.)
  if tg_op = 'INSERT' then
    v_takes_space := public.parking_stay_occupies_segment(new.status);
  else
    v_takes_space := public.parking_stay_occupies_segment(new.status)
      and (old.segment_id is distinct from new.segment_id or not public.parking_stay_occupies_segment(old.status));
  end if;
  if v_takes_space then
    if v_segment.status <> 'ACTIVE' then
      raise exception 'STREET_SEGMENT_NOT_ACTIVE' using errcode = '23514';
    end if;
    select count(*)::integer into v_occupied
    from public.parking_stays s
    where s.segment_id = new.segment_id
      and s.id <> new.id
      and public.parking_stay_occupies_segment(s.status);
    if v_occupied >= v_segment.capacity then
      raise exception 'STREET_SEGMENT_FULL' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists parking_stays_validate_street_location on public.parking_stays;
create trigger parking_stays_validate_street_location
before insert or update of segment_id, street_id, sector_id, street_number, status on public.parking_stays
for each row execute function public.validate_parking_stay_street_location();

revoke all on function public.off_street_segment_occupancy(uuid) from public, anon, authenticated;
grant execute on function public.off_street_segment_occupancy(uuid) to service_role;

commit;
