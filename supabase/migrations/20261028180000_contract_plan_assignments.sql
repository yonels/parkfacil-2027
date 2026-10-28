-- Planes por contrato con versionado e historial (SOL-2026-10-28-002).
--
-- Un contrato tiene un solo plan base vigente (company_contracts.
-- commercial_plan_version_id, ya existente). Esta migración agrega:
--   1. contract_plan_assignments: historial de qué versión de plan rigió en
--      cada contrato, desde/hasta, quién y por qué.
--   2. commercial_plan_ensure_version: crea la versión 1 de un plan y una
--      versión nueva cuando sus valores cambiaron; los contratos conservan la
--      versión (y precio) con que fueron asignados.
--   3. contract_assign_plan / contract_unassign_plan: asignar, cambiar o quitar
--      el plan de un contrato en una sola transacción.
-- Aditiva: no modifica ni borra datos existentes. Solo service_role ejecuta
-- las funciones (la API exige además ParkFacil Root).

begin;

create table if not exists public.contract_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts(id) on delete restrict,
  commercial_plan_version_id uuid not null references public.commercial_plan_versions(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  reason text,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  end_reason text,
  constraint contract_plan_assignments_rango check (valid_to is null or valid_to >= valid_from)
);
-- Un solo plan vigente (sin fecha de término) por contrato.
create unique index if not exists contract_plan_assignments_vigente
  on public.contract_plan_assignments (contract_id) where valid_to is null;
create index if not exists contract_plan_assignments_contrato_idx
  on public.contract_plan_assignments (contract_id, valid_from desc);

alter table public.contract_plan_assignments enable row level security;
revoke all on public.contract_plan_assignments from anon, authenticated;
grant select, insert, update on public.contract_plan_assignments to service_role;

-- Valores del plan que definen una versión (lo que el contrato "congela").
create or replace function public.commercial_plan_snapshot(p public.commercial_plans)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'name', p.name, 'type', p.type, 'billing_mode', p.billing_mode,
    'monthly_fee', p.monthly_fee, 'annual_fee', p.annual_fee, 'implementation_fee', p.implementation_fee,
    'transaction_fee', p.transaction_fee, 'device_fee', p.device_fee, 'parking_fee', p.parking_fee,
    'support_fee', p.support_fee, 'discount_percentage', p.discount_percentage,
    'minimum_monthly_charge', p.minimum_monthly_charge, 'included_parkings', p.included_parkings,
    'included_devices', p.included_devices, 'included_users', p.included_users)
$$;

create or replace function public.commercial_plan_ensure_version(p_plan uuid, p_actor uuid)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  plan public.commercial_plans%rowtype;
  ultima public.commercial_plan_versions%rowtype;
  hoy date := (now() at time zone 'America/Santiago')::date;
  snapshot jsonb;
  inclusiones jsonb;
  nueva uuid;
begin
  select * into plan from public.commercial_plans where id = p_plan for update;
  if not found then raise exception 'PLAN_INEXISTENTE' using errcode = 'P0002'; end if;
  snapshot := public.commercial_plan_snapshot(plan);
  inclusiones := jsonb_build_object('modules', to_jsonb(coalesce(plan.modules, '{}')), 'equipment', to_jsonb(coalesce(plan.equipment, '{}')));
  select * into ultima from public.commercial_plan_versions
   where commercial_plan_id = p_plan order by version desc limit 1;
  if found and ultima.rules = snapshot and ultima.inclusions = inclusiones and ultima.currency = plan.currency then
    return ultima.id;
  end if;
  if found then
    update public.commercial_plan_versions
       set status = 'RETIRED', valid_to = greatest(valid_from, hoy)
     where commercial_plan_id = p_plan and status = 'ACTIVE';
  end if;
  insert into public.commercial_plan_versions (commercial_plan_id, version, currency, valid_from, status, inclusions, rules, created_by)
  values (p_plan, coalesce(ultima.version, 0) + 1, plan.currency, hoy, 'ACTIVE', inclusiones, snapshot, p_actor)
  returning id into nueva;
  return nueva;
end $$;

create or replace function public.contract_assign_plan(p_contract uuid, p_plan uuid, p_valid_from date, p_actor uuid, p_reason text)
returns public.contract_plan_assignments language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  contrato public.company_contracts%rowtype;
  vigente public.contract_plan_assignments%rowtype;
  nueva public.contract_plan_assignments%rowtype;
  version_id uuid;
  desde date := coalesce(p_valid_from, (now() at time zone 'America/Santiago')::date);
begin
  if not exists (select 1 from public.commercial_plans where id = p_plan and status = 'active') then
    raise exception 'PLAN_NO_ACTIVO' using errcode = 'P0001';
  end if;
  select * into contrato from public.company_contracts where id = p_contract for update;
  if not found then raise exception 'CONTRATO_INEXISTENTE' using errcode = 'P0002'; end if;
  if contrato.status in ('expired', 'terminated', 'cancelled') then
    raise exception 'CONTRATO_CERRADO' using errcode = 'P0001';
  end if;
  -- Regla existente (company_contract_plan_version_guard): misma moneda que el contrato.
  if (select currency from public.commercial_plans where id = p_plan) <> contrato.currency then
    raise exception 'MONEDA_DISTINTA' using errcode = 'P0001';
  end if;
  version_id := public.commercial_plan_ensure_version(p_plan, p_actor);

  select * into vigente from public.contract_plan_assignments
   where contract_id = p_contract and valid_to is null for update;
  if found then
    if vigente.commercial_plan_version_id = version_id then
      raise exception 'MISMO_PLAN' using errcode = 'P0001';
    end if;
    if desde <= vigente.valid_from then
      raise exception 'FECHA_ANTERIOR_AL_PLAN_VIGENTE' using errcode = 'P0001';
    end if;
    update public.contract_plan_assignments
       set valid_to = desde - 1, ended_by = p_actor, ended_at = now(), end_reason = 'Cambio de plan'
     where id = vigente.id;
  end if;

  insert into public.contract_plan_assignments (contract_id, commercial_plan_version_id, valid_from, reason, assigned_by)
  values (p_contract, version_id, desde, nullif(trim(p_reason), ''), p_actor)
  returning * into nueva;

  update public.company_contracts set commercial_plan_version_id = version_id, updated_at = now()
   where id = p_contract;
  return nueva;
end $$;

create or replace function public.contract_unassign_plan(p_contract uuid, p_valid_to date, p_actor uuid, p_reason text)
returns public.contract_plan_assignments language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  vigente public.contract_plan_assignments%rowtype;
  hasta date := coalesce(p_valid_to, (now() at time zone 'America/Santiago')::date);
begin
  perform 1 from public.company_contracts where id = p_contract for update;
  if not found then raise exception 'CONTRATO_INEXISTENTE' using errcode = 'P0002'; end if;
  select * into vigente from public.contract_plan_assignments
   where contract_id = p_contract and valid_to is null for update;
  if not found then raise exception 'SIN_PLAN_VIGENTE' using errcode = 'P0001'; end if;
  if hasta < vigente.valid_from then raise exception 'FECHA_ANTERIOR_AL_PLAN_VIGENTE' using errcode = 'P0001'; end if;
  update public.contract_plan_assignments
     set valid_to = hasta, ended_by = p_actor, ended_at = now(), end_reason = coalesce(nullif(trim(p_reason), ''), 'Plan quitado')
   where id = vigente.id returning * into vigente;
  update public.company_contracts set commercial_plan_version_id = null, updated_at = now() where id = p_contract;
  return vigente;
end $$;

revoke all on function public.commercial_plan_snapshot(public.commercial_plans) from public, anon, authenticated;
revoke all on function public.commercial_plan_ensure_version(uuid, uuid) from public, anon, authenticated;
revoke all on function public.contract_assign_plan(uuid, uuid, date, uuid, text) from public, anon, authenticated;
revoke all on function public.contract_unassign_plan(uuid, date, uuid, text) from public, anon, authenticated;
grant execute on function public.commercial_plan_snapshot(public.commercial_plans) to service_role;
grant execute on function public.commercial_plan_ensure_version(uuid, uuid) to service_role;
grant execute on function public.contract_assign_plan(uuid, uuid, date, uuid, text) to service_role;
grant execute on function public.contract_unassign_plan(uuid, date, uuid, text) to service_role;

commit;
