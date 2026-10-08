-- SOL-2026-10-08-004: preserve the canonical POS transaction and return its existing receipt.
-- Authorization precedes the idempotent return; no stays are modified.
-- The API authorizes administrators and tenant scope before using service_role.
-- Existing RESTRICT foreign keys preserve every linked operation.
grant delete on table public.operator_shifts to service_role;

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
  if v_shift.operator_id<>p_actor_id and not p_actor_is_admin then raise exception 'SHIFT_FORBIDDEN' using errcode='42501'; end if;
  select * into v_closure from public.shift_closures where shift_id=v_shift.id;
  if found then return v_closure; end if;
  if v_shift.status not in ('OPEN','CLOSING') then raise exception 'SHIFT_NOT_CLOSABLE' using errcode='P0001'; end if;
  select * into v_parking from public.parkings where id=v_shift.parking_id;
  if not found then raise exception 'PARKING_NOT_FOUND' using errcode='P0002'; end if;

  if v_parking.type='OFF_STREET' then
    if exists(select 1 from public.parking_stays s where s.payment_shift_id=v_shift.id and
      (s.parking_id is distinct from v_shift.parking_id or s.exit_operator_id::text is distinct from v_shift.operator_id or s.status<>'PAID')) then
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
