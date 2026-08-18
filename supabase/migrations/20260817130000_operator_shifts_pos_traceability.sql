-- POS off-street sobre la arquitectura canónica operator_shifts/shift_closures.
-- No se completa retrospectivamente ningún turno: los registros históricos y
-- los pagos automáticos/Webpay permanecen con referencias NULL.

alter table public.parking_stays
  add column if not exists entry_shift_id uuid null,
  add column if not exists payment_shift_id uuid null;

alter table public.parking_stays
  drop constraint if exists parking_stays_entry_shift_id_fkey,
  add constraint parking_stays_entry_shift_id_fkey
    foreign key (entry_shift_id) references public.operator_shifts(id) on delete restrict,
  drop constraint if exists parking_stays_payment_shift_id_fkey,
  add constraint parking_stays_payment_shift_id_fkey
    foreign key (payment_shift_id) references public.operator_shifts(id) on delete restrict;

create index if not exists parking_stays_entry_shift_idx
  on public.parking_stays(entry_shift_id) where entry_shift_id is not null;
create index if not exists parking_stays_payment_shift_idx
  on public.parking_stays(payment_shift_id) where payment_shift_id is not null;

-- Los datos on-street siguen exigiendo estos atributos mediante las funciones
-- operacionales. A nivel físico pueden ser NULL para un turno off-street.
alter table public.operator_shifts
  alter column sector_id drop not null,
  alter column street_id drop not null,
  alter column assignment_id drop not null;

alter table public.shift_closures
  alter column sector_id drop not null,
  alter column street_id drop not null,
  alter column capacity_snapshot drop not null,
  alter column occupied_snapshot drop not null,
  add column if not exists cash_amount numeric(14,2) null,
  add column if not exists card_amount numeric(14,2) null,
  add column if not exists declared_cash_amount numeric(14,2) null,
  add column if not exists difference_observation text null,
  add column if not exists payments_snapshot jsonb null,
  add column if not exists pending_vehicles_snapshot jsonb null;

-- Invariante transaccional para trazabilidad POS. El bloqueo compartido hace
-- que un ingreso/pago compita correctamente con close_operator_shift, que
-- bloquea el turno FOR UPDATE antes de cerrarlo.
create or replace function public.validate_parking_stay_shift_links()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_shift public.operator_shifts%rowtype;
begin
  if new.entry_shift_id is not null
     and (tg_op = 'INSERT' or old.entry_shift_id is distinct from new.entry_shift_id) then
    select * into v_shift from public.operator_shifts where id=new.entry_shift_id for share;
    if not found then raise exception 'ENTRY_SHIFT_NOT_FOUND' using errcode='23503'; end if;
    if v_shift.status <> 'OPEN' then raise exception 'ENTRY_SHIFT_NOT_OPEN' using errcode='23514'; end if;
    if v_shift.parking_id <> new.parking_id then raise exception 'ENTRY_SHIFT_PARKING_MISMATCH' using errcode='23514'; end if;
    if new.entry_operator_id is null or v_shift.operator_id <> new.entry_operator_id::text then
      raise exception 'ENTRY_SHIFT_OPERATOR_MISMATCH' using errcode='23514';
    end if;
  end if;

  if new.payment_shift_id is not null
     and (tg_op = 'INSERT' or old.payment_shift_id is distinct from new.payment_shift_id) then
    select * into v_shift from public.operator_shifts where id=new.payment_shift_id for share;
    if not found then raise exception 'PAYMENT_SHIFT_NOT_FOUND' using errcode='23503'; end if;
    if v_shift.status <> 'OPEN' then raise exception 'PAYMENT_SHIFT_NOT_OPEN' using errcode='23514'; end if;
    if v_shift.parking_id <> new.parking_id then raise exception 'PAYMENT_SHIFT_PARKING_MISMATCH' using errcode='23514'; end if;
    if new.exit_operator_id is null or v_shift.operator_id <> new.exit_operator_id::text then
      raise exception 'PAYMENT_SHIFT_OPERATOR_MISMATCH' using errcode='23514';
    end if;
    if new.status <> 'PAID' or new.payment_code is null then
      raise exception 'PAYMENT_SHIFT_REQUIRES_PAID_STAY' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists parking_stays_validate_shift_links on public.parking_stays;
create trigger parking_stays_validate_shift_links
before insert or update of entry_shift_id,payment_shift_id,status,payment_code,entry_operator_id,exit_operator_id,parking_id
on public.parking_stays for each row execute function public.validate_parking_stay_shift_links();

revoke all on function public.validate_parking_stay_shift_links() from public,anon,authenticated;
grant execute on function public.validate_parking_stay_shift_links() to service_role;

create or replace function public.start_operator_shift(
  p_shift_id uuid, p_actor_id text, p_actor_is_admin boolean default false
) returns public.operator_shifts
language plpgsql security definer set search_path=public as $$
declare
  v_shift public.operator_shifts%rowtype;
  v_parking public.parkings%rowtype;
  v_opened_at timestamptz := clock_timestamp();
begin
  select * into v_shift from public.operator_shifts where id=p_shift_id for update;
  if not found then raise exception 'SHIFT_NOT_FOUND' using errcode='P0002'; end if;
  if v_shift.operator_id<>p_actor_id and not p_actor_is_admin then
    raise exception 'SHIFT_FORBIDDEN' using errcode='42501';
  end if;
  if v_shift.status<>'PROGRAMMED' then raise exception 'SHIFT_NOT_PROGRAMMED' using errcode='P0001'; end if;

  select * into v_parking from public.parkings where id=v_shift.parking_id and status='ACTIVE';
  if not found then raise exception 'PARKING_NOT_ACTIVE' using errcode='P0002'; end if;
  if v_parking.type='ON_STREET' and
     (v_shift.assignment_id is null or v_shift.sector_id is null or v_shift.street_id is null) then
    raise exception 'ON_STREET_ASSIGNMENT_REQUIRED' using errcode='23514';
  end if;
  if exists(select 1 from public.operator_shifts s where s.operator_id=v_shift.operator_id
    and s.status in ('OPEN','CLOSING') and s.id<>v_shift.id) then
    raise exception 'OPERATOR_SHIFT_CONFLICT' using errcode='23505';
  end if;

  update public.operator_shifts set status='OPEN',opened_at=v_opened_at,opened_by=p_actor_id,updated_at=v_opened_at
  where id=v_shift.id and status='PROGRAMMED' returning * into v_shift;
  if not found then raise exception 'SHIFT_START_CONFLICT' using errcode='40001'; end if;
  return v_shift;
end;
$$;
revoke all on function public.start_operator_shift(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.start_operator_shift(uuid,text,boolean) to service_role;

-- Firma extendida para POS. La firma histórica de cinco argumentos se
-- conserva más abajo como wrapper, por lo que sus consumidores no cambian.
create or replace function public.close_operator_shift(
  p_shift_id uuid, p_actor_id text, p_actor_name text, p_actor_is_admin boolean,
  p_notes text, p_declared_cash numeric, p_difference_observation text
) returns public.shift_closures
language plpgsql security definer set search_path=public as $$
declare
  v_shift public.operator_shifts%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_parking public.parkings%rowtype;
  v_sector public.parking_sectors%rowtype;
  v_street public.parking_streets%rowtype;
  v_close_at timestamptz := clock_timestamp();
  v_amount numeric(14,2) := 0; v_cash numeric(14,2) := 0; v_card numeric(14,2) := 0;
  v_paid integer := 0; v_pending integer := 0; v_cancelled integer := 0;
  v_difference numeric(14,2); v_payments jsonb; v_pending_snapshot jsonb;
  v_closure public.shift_closures%rowtype;
begin
  select * into v_shift from public.operator_shifts where id=p_shift_id for update;
  if not found then raise exception 'SHIFT_NOT_FOUND' using errcode='P0002'; end if;
  if v_shift.status not in ('OPEN','CLOSING') then raise exception 'SHIFT_NOT_CLOSABLE' using errcode='P0001'; end if;
  if v_shift.operator_id<>p_actor_id and not p_actor_is_admin then raise exception 'SHIFT_FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.shift_closures where shift_id=v_shift.id) then raise exception 'SHIFT_ALREADY_CLOSED' using errcode='23505'; end if;
  select * into v_parking from public.parkings where id=v_shift.parking_id;
  if not found then raise exception 'PARKING_NOT_FOUND' using errcode='P0002'; end if;

  if v_parking.type='OFF_STREET' then
    if exists(select 1 from public.parking_stays s where s.payment_shift_id=v_shift.id and
      (s.parking_id<>v_shift.parking_id or s.exit_operator_id::text<>v_shift.operator_id or s.status<>'PAID')) then
      raise exception 'SHIFT_PAYMENT_TRACE_MISMATCH' using errcode='23514';
    end if;
    select coalesce(sum(total_amount),0),count(*),
      coalesce(sum(total_amount) filter(where payment_method='CASH'),0),
      coalesce(sum(total_amount) filter(where payment_method='CARD'),0),
      coalesce(jsonb_agg(jsonb_build_object('stayId',id,'plate',license_plate,'ticket',code,
        'exitAt',exit_at,'paymentMethod',payment_method,'amount',total_amount,'operatorId',exit_operator_id)
        order by exit_at),'[]'::jsonb)
    into v_amount,v_paid,v_cash,v_card,v_payments from public.parking_stays
    where payment_shift_id=v_shift.id and parking_id=v_shift.parking_id and status='PAID';
    select count(*),coalesce(jsonb_agg(jsonb_build_object('stayId',id,'plate',license_plate,
      'ticket',code,'entryAt',entry_at) order by entry_at),'[]'::jsonb)
    into v_pending,v_pending_snapshot from public.parking_stays
    where parking_id=v_shift.parking_id and status='OPEN';
    if p_declared_cash is not null and p_declared_cash<0 then raise exception 'INVALID_DECLARED_CASH' using errcode='23514'; end if;
    v_difference := case when p_declared_cash is null then null else p_declared_cash-v_cash end;
    if v_difference<>0 and trim(coalesce(p_difference_observation,''))='' then
      raise exception 'DIFFERENCE_OBSERVATION_REQUIRED' using errcode='23514';
    end if;
  else
    if v_shift.assignment_id is null or v_shift.sector_id is null or v_shift.street_id is null then
      raise exception 'ON_STREET_ASSIGNMENT_REQUIRED' using errcode='23514';
    end if;
    select * into v_assignment from public.operator_assignments where id=v_shift.assignment_id;
    select * into v_sector from public.parking_sectors where id=v_shift.sector_id;
    select * into v_street from public.parking_streets where id=v_shift.street_id;
    if v_assignment.id is null or v_sector.id is null or v_street.id is null then raise exception 'ASSIGNMENT_INVALID' using errcode='23514'; end if;
    if to_regclass('public.parking_payments') is null then raise exception 'OPERATIONAL_DATA_SOURCE_UNAVAILABLE' using errcode='P0001'; end if;
    execute 'select coalesce(sum(amount),0),count(distinct movement_id) from public.parking_payments where collected_in_shift_id=$1 and collected_by_operator_id=$2 and status=''PROCESSED'''
      into v_amount,v_paid using v_shift.id,v_shift.operator_id;
    execute 'select count(*) from public.parking_movements where parking_id=$1 and sector_id=$2 and street_id=$3 and status=''PENDING_PAYMENT'''
      into v_pending using v_shift.parking_id,v_shift.sector_id,v_shift.street_id;
    execute 'select count(*) from public.parking_movements where cancelled_in_shift_id=$1 and status=''CANCELLED'''
      into v_cancelled using v_shift.id;
  end if;

  insert into public.shift_closures(shift_id,assignment_id,parking_id,sector_id,street_id,operator_id,operator_name,
    company_name,parking_name,sector_name,street_name,number_from,number_to,assigned_spaces,shift_date,
    actual_start_at,actual_close_at,collected_amount,paid_vehicles_count,pending_vehicles_count,
    cancelled_vehicles_count,capacity_snapshot,occupied_snapshot,snapshot_at,notes,confirmed_by,folio,
    cash_amount,card_amount,declared_cash_amount,cash_difference,difference_observation,payments_snapshot,pending_vehicles_snapshot)
  values(v_shift.id,v_shift.assignment_id,v_shift.parking_id,v_shift.sector_id,v_shift.street_id,v_shift.operator_id,
    coalesce(nullif(trim(p_actor_name),''),v_shift.operator_id),coalesce(v_parking.company_name,''),v_parking.name,
    case when v_sector.id is null then null else 'Sector '||v_sector.code||' - '||v_sector.name end,v_street.name,
    v_assignment.number_from,v_assignment.number_to,v_assignment.max_vehicles,v_shift.shift_date,v_shift.opened_at,
    v_close_at,v_amount,v_paid,v_pending,v_cancelled,v_assignment.max_vehicles,
    case when v_assignment.max_vehicles is null then null else least(v_pending,v_assignment.max_vehicles) end,
    v_close_at,left(trim(coalesce(p_notes,'')),1000),p_actor_id,
    'CT-'||to_char(v_close_at at time zone 'America/Santiago','YYYYMMDD-HH24MISS')||'-'||upper(substr(v_shift.id::text,1,8)),
    v_cash,v_card,p_declared_cash,v_difference,left(trim(coalesce(p_difference_observation,'')),1000),v_payments,v_pending_snapshot)
  returning * into v_closure;
  update public.operator_shifts set status='CLOSED',closed_at=v_close_at,closed_by=p_actor_id,
    notes=left(trim(coalesce(p_notes,'')),1000),updated_at=v_close_at where id=v_shift.id;
  return v_closure;
end;
$$;

revoke all on function public.close_operator_shift(uuid,text,text,boolean,text,numeric,text) from public,anon,authenticated;
grant execute on function public.close_operator_shift(uuid,text,text,boolean,text,numeric,text) to service_role;

-- Contrato histórico: delega en la implementación canónica extendida.
create or replace function public.close_operator_shift(
  p_shift_id uuid, p_actor_id text, p_actor_name text, p_actor_is_admin boolean, p_notes text
) returns public.shift_closures
language sql security definer set search_path=public as $$
  select public.close_operator_shift(p_shift_id,p_actor_id,p_actor_name,p_actor_is_admin,p_notes,null,null);
$$;
revoke all on function public.close_operator_shift(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.close_operator_shift(uuid,text,text,boolean,text) to service_role;
