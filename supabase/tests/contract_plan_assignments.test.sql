-- Ejecutar dentro de BEGIN/ROLLBACK, después de 20261028180000_contract_plan_assignments.sql, solo en base local.
do $$
declare
  actor uuid;
  contrato uuid;
  plan_a uuid;
  plan_b uuid;
  plan_c uuid;
  moneda text;
  v1 uuid;
  v_otra uuid;
  a1 public.contract_plan_assignments%rowtype;
  a2 public.contract_plan_assignments%rowtype;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  select id into actor from auth.users where email like 'qa.pl.root@%' limit 1;
  select id into contrato from public.company_contracts where status = 'active' limit 1;
  if actor is null or contrato is null then raise exception 'fixture: root y contrato activo requeridos'; end if;
  select currency into moneda from public.company_contracts where id = contrato;

  if has_table_privilege('authenticated', 'public.contract_plan_assignments', 'select')
    or has_function_privilege('anon', 'public.contract_assign_plan(uuid,uuid,date,uuid,text)', 'execute') then
    raise exception 'objetos expuestos';
  end if;

  insert into public.commercial_plans (code, name, description, status, type, currency, billing_mode, transaction_fee)
  values ('PF-PLAN-T01', 'Plan A prueba', 'x', 'active', 'per_transaction', moneda, 'per_transaction', 35) returning id into plan_a;
  insert into public.commercial_plans (code, name, description, status, type, currency, billing_mode, monthly_fee)
  values ('PF-PLAN-T02', 'Plan B prueba', 'x', 'active', 'monthly_subscription', moneda, 'monthly', 10) returning id into plan_b;
  insert into public.commercial_plans (code, name, description, status, type, currency, billing_mode, monthly_fee)
  values ('PF-PLAN-T03', 'Plan otra moneda', 'x', 'active', 'monthly_subscription', case when moneda = 'USD' then 'CLP' else 'USD' end, 'monthly', 10) returning id into plan_c;

  -- Versión 1 y reutilización si no cambian los valores.
  v1 := public.commercial_plan_ensure_version(plan_a, actor);
  if public.commercial_plan_ensure_version(plan_a, actor) <> v1 then raise exception 'debía reutilizar la versión'; end if;

  -- Moneda distinta a la del contrato: rechazada antes de crear versión.
  begin
    perform public.contract_assign_plan(contrato, plan_c, null, actor, null);
    raise exception 'debía rechazar moneda distinta';
  exception when sqlstate 'P0001' then if sqlerrm <> 'MONEDA_DISTINTA' then raise; end if; end;

  -- Asignar plan A desde hace 30 días.
  a1 := public.contract_assign_plan(contrato, plan_a, hoy - 30, actor, 'Alta inicial');
  if a1.commercial_plan_version_id <> v1 or a1.valid_to is not null then raise exception 'asignación inicial'; end if;
  if (select commercial_plan_version_id from public.company_contracts where id = contrato) <> v1 then raise exception 'puntero del contrato'; end if;

  -- Mismo plan sin cambios: rechazado.
  begin
    perform public.contract_assign_plan(contrato, plan_a, hoy, actor, null);
    raise exception 'debía rechazar mismo plan';
  exception when sqlstate 'P0001' then if sqlerrm <> 'MISMO_PLAN' then raise; end if; end;

  -- Cambia el precio del plan A: el contrato conserva v1 hasta reasignar; la nueva asignación usa v2.
  update public.commercial_plans set transaction_fee = 40 where id = plan_a;
  if (select commercial_plan_version_id from public.company_contracts where id = contrato) <> v1 then raise exception 'el contrato debía conservar v1'; end if;
  a2 := public.contract_assign_plan(contrato, plan_a, hoy - 10, actor, 'Nuevo precio');
  select commercial_plan_version_id into v_otra from public.contract_plan_assignments where id = a2.id;
  if v_otra = v1 or (select version from public.commercial_plan_versions where id = v_otra) <> 2 then raise exception 'versión 2'; end if;
  if (select status from public.commercial_plan_versions where id = v1) <> 'RETIRED' then raise exception 'v1 retirada'; end if;
  if (select valid_to from public.contract_plan_assignments where id = a1.id) <> hoy - 11 then raise exception 'cierre del tramo anterior'; end if;
  if ((select rules->>'transaction_fee' from public.commercial_plan_versions where id = v1))::numeric <> 35 then raise exception 'v1 congelada'; end if;

  -- Fecha anterior al plan vigente: rechazada.
  begin
    perform public.contract_assign_plan(contrato, plan_b, hoy - 20, actor, null);
    raise exception 'debía rechazar fecha';
  exception when sqlstate 'P0001' then if sqlerrm <> 'FECHA_ANTERIOR_AL_PLAN_VIGENTE' then raise; end if; end;

  -- Cambio a plan B (upgrade) hoy.
  perform public.contract_assign_plan(contrato, plan_b, hoy, actor, 'Upgrade');
  if (select count(*) from public.contract_plan_assignments where contract_id = contrato) <> 3 then raise exception 'historial 3'; end if;
  if (select count(*) from public.contract_plan_assignments where contract_id = contrato and valid_to is null) <> 1 then raise exception 'un solo vigente'; end if;

  -- Plan no activo: rechazado.
  update public.commercial_plans set status = 'archived' where id = plan_a;
  begin
    perform public.contract_assign_plan(contrato, plan_a, hoy + 5, actor, null);
    raise exception 'debía rechazar plan archivado';
  exception when sqlstate 'P0001' then if sqlerrm <> 'PLAN_NO_ACTIVO' then raise; end if; end;

  -- Quitar el plan.
  perform public.contract_unassign_plan(contrato, hoy, actor, 'Prueba');
  if (select commercial_plan_version_id from public.company_contracts where id = contrato) is not null then raise exception 'puntero null'; end if;
  if exists (select 1 from public.contract_plan_assignments where contract_id = contrato and valid_to is null) then raise exception 'sin vigente'; end if;
  begin
    perform public.contract_unassign_plan(contrato, hoy, actor, null);
    raise exception 'debía rechazar sin plan';
  exception when sqlstate 'P0001' then if sqlerrm <> 'SIN_PLAN_VIGENTE' then raise; end if; end;

  -- La versión referenciada no se puede borrar (historial protegido).
  begin
    delete from public.commercial_plan_versions where id = v1;
    raise exception 'debía proteger la versión';
  exception when foreign_key_violation then null; end;

  raise notice 'contract_plan_assignments.test.sql: OK';
end $$;
