-- Etapa 19: configurador dinámico y cambio de esquema auditable.
alter table public.parkings drop constraint if exists parkings_status_check;
update public.parkings set status='CONFIGURING' where status='MAINTENANCE';
alter table public.parkings
  add constraint parkings_status_check check (status in ('DRAFT','CONFIGURING','READY_FOR_REVIEW','ACTIVE','INACTIVE')),
  add column if not exists district text not null default '',
  add column if not exists region text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists off_street_configuration_status text not null default 'EMPTY'
    check (off_street_configuration_status in ('EMPTY','ACTIVE','ARCHIVED')),
  add column if not exists on_street_configuration_status text not null default 'EMPTY'
    check (on_street_configuration_status in ('EMPTY','ACTIVE','ARCHIVED')),
  add column if not exists type_changed_at timestamptz,
  add column if not exists type_changed_by uuid references auth.users(id) on delete set null;

update public.parkings set
  off_street_configuration_status=case when type='OFF_STREET' then 'ACTIVE' else off_street_configuration_status end,
  on_street_configuration_status=case when type='ON_STREET' then 'ACTIVE' else on_street_configuration_status end;

create table if not exists public.parking_type_changes (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parkings(id) on delete restrict,
  previous_type text not null check (previous_type in ('OFF_STREET','ON_STREET')),
  new_type text not null check (new_type in ('OFF_STREET','ON_STREET')),
  configuration_snapshot jsonb not null,
  reason text not null default '',
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists parking_type_changes_parking_idx on public.parking_type_changes(parking_id,created_at desc);
alter table public.parking_type_changes enable row level security;
grant select,insert on public.parking_type_changes to service_role;

create or replace function public.change_parking_configuration_type(
  p_parking_id uuid, p_new_type text, p_confirmed boolean, p_actor_id uuid, p_reason text default ''
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_parking public.parkings%rowtype;
  v_summary jsonb;
  v_levels integer := 0; v_zones integer := 0; v_sectors integer := 0;
  v_streets integer := 0; v_assignments integer := 0; v_capacity integer := 0;
begin
  if p_new_type not in ('OFF_STREET','ON_STREET') then raise exception 'INVALID_PARKING_TYPE' using errcode='22023'; end if;
  select * into v_parking from public.parkings where id=p_parking_id for update;
  if not found then raise exception 'PARKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_parking.type=p_new_type then return jsonb_build_object('changed',false,'type',p_new_type); end if;

  if v_parking.type='OFF_STREET' then
    select count(*) into v_levels from public.parking_levels where parking_id=p_parking_id;
    select count(*),coalesce(sum(capacity) filter(where status='ACTIVE'),0) into v_zones,v_capacity from public.parking_zones where parking_id=p_parking_id;
  else
    select count(*) into v_sectors from public.parking_sectors where parking_id=p_parking_id;
    select count(*),coalesce(sum(capacity) filter(where status='ACTIVE'),0) into v_streets,v_capacity from public.parking_streets where parking_id=p_parking_id;
    select count(*) into v_assignments from public.operator_assignments where parking_id=p_parking_id;
  end if;
  v_summary := jsonb_build_object('levels',v_levels,'zones',v_zones,'sectors',v_sectors,'streets',v_streets,'assignments',v_assignments,'capacity',v_capacity);
  if (v_levels+v_zones+v_sectors+v_streets+v_assignments)>0 and not p_confirmed then
    raise exception 'TYPE_CHANGE_CONFIRMATION_REQUIRED:%',v_summary::text using errcode='P0001';
  end if;

  update public.parkings set
    type=p_new_type,status='CONFIGURING',type_changed_at=clock_timestamp(),type_changed_by=p_actor_id,
    off_street_configuration_status=case when p_new_type='OFF_STREET' then 'ACTIVE' when type='OFF_STREET' then 'ARCHIVED' else off_street_configuration_status end,
    on_street_configuration_status=case when p_new_type='ON_STREET' then 'ACTIVE' when type='ON_STREET' then 'ARCHIVED' else on_street_configuration_status end,
    updated_at=clock_timestamp()
  where id=p_parking_id;
  insert into public.parking_type_changes(parking_id,previous_type,new_type,configuration_snapshot,reason,changed_by)
    values(p_parking_id,v_parking.type,p_new_type,v_summary,left(trim(coalesce(p_reason,'')),500),p_actor_id);
  return jsonb_build_object('changed',true,'previousType',v_parking.type,'type',p_new_type,'archived',v_summary);
end;
$$;
revoke all on function public.change_parking_configuration_type(uuid,text,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.change_parking_configuration_type(uuid,text,boolean,uuid,text) to service_role;

create or replace function public.activate_parking_configuration(p_parking_id uuid,p_actor_id uuid)
returns public.parkings language plpgsql security definer set search_path=public as $$
declare v_parking public.parkings%rowtype; v_parent integer; v_child integer; v_capacity integer;
begin
  select * into v_parking from public.parkings where id=p_parking_id for update;
  if not found then raise exception 'PARKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_parking.type='OFF_STREET' then
    select count(*) into v_parent from public.parking_levels where parking_id=p_parking_id;
    select count(*),coalesce(sum(capacity) filter(where status='ACTIVE'),0) into v_child,v_capacity from public.parking_zones where parking_id=p_parking_id;
  else
    select count(*) into v_parent from public.parking_sectors where parking_id=p_parking_id;
    select count(*),coalesce(sum(capacity) filter(where status='ACTIVE'),0) into v_child,v_capacity from public.parking_streets where parking_id=p_parking_id;
  end if;
  if v_parent<1 or v_child<1 or v_capacity<1 then raise exception 'ACTIVATION_REQUIREMENTS_PENDING' using errcode='23514'; end if;
  -- No existe una tabla de tarifas aprobada: nunca se presume su cumplimiento.
  raise exception 'TARIFF_SOURCE_UNAVAILABLE' using errcode='P0001';
end;
$$;
revoke all on function public.activate_parking_configuration(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_parking_configuration(uuid,uuid) to service_role;
