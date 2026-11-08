-- SOL-2026-11-05-005: códigos automáticos del catálogo de servicios y productos.
-- Decisión del usuario 2026-11-08: el código es un correlativo de 4 letras y 2 números que se genera solo:
-- SERV-01, SERV-02… para servicios y PROD-01, PROD-02… para productos. Reemplaza los códigos en inglés
-- (MONTHLY_FEE, ADDITIONAL_POS…), que se guardan en legacy_code. Los nombres se pasan a español.
-- Los códigos no los usa ninguna regla de negocio ni función (revisado 2026-11-08): todo se enlaza por id.

alter table public.billable_concepts add column if not exists legacy_code text null;

-- Siguiente código libre para un tipo (SERVICE → SERV, PRODUCT → PROD). Desde el 100 crece a 3 dígitos.
create or replace function public.billable_concepts_next_code(p_item_kind text)
returns text
language plpgsql
set search_path = public
as $$
declare
  prefix text := case when p_item_kind = 'PRODUCT' then 'PROD' else 'SERV' end;
  next_number integer;
begin
  perform pg_advisory_xact_lock(hashtext('billable_concepts_code_' || prefix));
  select coalesce(max(substring(code from 6)::integer), 0) + 1 into next_number
    from public.billable_concepts where code ~ ('^' || prefix || '-[0-9]+$');
  return prefix || '-' || lpad(next_number::text, 2, '0');
end;
$$;

-- Recodificación de los conceptos existentes: primero la cuota mensual, luego por nombre; los de prueba al final.
alter table public.billable_concepts drop constraint if exists billable_concepts_code_format_check;
update public.billable_concepts set legacy_code = code where legacy_code is null and code !~ '^(SERV|PROD)-[0-9]{2,}$';

update public.billable_concepts set name = case code
    when 'MONTHLY_FEE' then 'Cuota mensual ParkFacil'
    when 'ADDITIONAL_DEVICE' then 'Dispositivo adicional'
    when 'IMPLEMENTATION' then 'Implementación'
    when 'INTEGRATION' then 'Integración'
    when 'SUBSCRIPTION' then 'Suscripción'
    else name end
  where code in ('MONTHLY_FEE','ADDITIONAL_DEVICE','IMPLEMENTATION','INTEGRATION','SUBSCRIPTION');
update public.billable_concepts set name = replace(name, 'Certificacion', 'Certificación') where name like 'Certificacion%';

-- Unidades en español (catálogo y servicios ya asignados; las prefacturas y documentos emitidos no se tocan).
update public.billable_concepts set unit = case lower(unit)
    when 'device' then 'equipo' when 'service' then 'servicio' when 'unit' then 'unidad'
    when 'parking' then 'estacionamiento' when 'month' then 'mes' when 'mensual' then 'mes' else unit end
  where lower(unit) in ('device','service','unit','parking','month','mensual');
update public.contract_billable_items set unit = case lower(unit)
    when 'device' then 'equipo' when 'service' then 'servicio' when 'unit' then 'unidad'
    when 'parking' then 'estacionamiento' when 'month' then 'mes' when 'mensual' then 'mes' else unit end
  where lower(unit) in ('device','service','unit','parking','month','mensual');
-- Servicios ya asignados cuya descripción era el nombre antiguo en inglés.
update public.contract_billable_items set description = 'Cuota mensual ParkFacil' where description = 'Fee mensual ParkFacil';

with ordered as (
  select id, item_kind,
    row_number() over (
      partition by item_kind
      order by case when code = 'MONTHLY_FEE' then 0 when code like 'ETAPA5%' then 2 else 1 end, name, created_at
    ) as n
  from public.billable_concepts
  where code !~ '^(SERV|PROD)-[0-9]{2,}$'
)
update public.billable_concepts c
  set code = (case when o.item_kind = 'PRODUCT' then 'PROD' else 'SERV' end) || '-' || lpad(o.n::text, 2, '0'),
      updated_at = now()
  from ordered o where o.id = c.id;

alter table public.billable_concepts add constraint billable_concepts_code_format_check
  check (code ~ '^(SERV|PROD)-[0-9]{2,}$');

-- Al crear siempre se asigna el código (se ignora cualquier código enviado). Después no se puede cambiar.
create or replace function public.billable_concepts_assign_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.code := public.billable_concepts_next_code(new.item_kind);
  elsif new.code is distinct from old.code then
    raise exception 'CATALOG_CODE_IMMUTABLE' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists billable_concepts_assign_code on public.billable_concepts;
create trigger billable_concepts_assign_code
  before insert or update of code on public.billable_concepts
  for each row execute function public.billable_concepts_assign_code();

revoke all on function public.billable_concepts_next_code(text) from public, anon, authenticated;
revoke all on function public.billable_concepts_assign_code() from public, anon, authenticated;
grant execute on function public.billable_concepts_next_code(text) to service_role;
