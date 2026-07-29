-- Tarifario UF de módulos: persistencia, autorización Root y auditoría.

create table if not exists public.module_pricing (
  module_id text primary key,
  monthly_uf numeric(10,2) not null check (monthly_uf >= 0 and monthly_uf <= 10000),
  benefit text not null default '',
  active boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.module_pricing_audit (
  id uuid primary key default gen_random_uuid(),
  module_id text not null,
  previous_monthly_uf numeric(10,2) not null,
  new_monthly_uf numeric(10,2) not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_by_email text not null,
  changed_at timestamptz not null default now()
);

create index if not exists module_pricing_audit_module_date_idx
  on public.module_pricing_audit(module_id, changed_at desc);

insert into public.module_pricing(module_id, monthly_uf, benefit) values
  ('dashboard',1.80,'Visión ejecutiva inmediata para decidir con datos.'),
  ('operacion',2.40,'Control diario de movimientos, tickets e incidencias.'),
  ('estacionamientos',2.10,'Administra capacidad, instalaciones y estructura operativa.'),
  ('seguridad',1.60,'Refuerza permisos, accesos y trazabilidad de seguridad.'),
  ('tarifas',1.40,'Centraliza reglas de cobro y planes comerciales.'),
  ('simulador',1.20,'Compara escenarios y mejora decisiones tarifarias.'),
  ('recaudacion',2.20,'Controla pagos, cierres y conciliación de ingresos.'),
  ('abonados',1.50,'Gestiona clientes frecuentes y sus credenciales.'),
  ('operadores',1.30,'Administra operadores, responsables y permisos.'),
  ('dispositivos',1.90,'Supervisa equipos, conectividad y estado técnico.'),
  ('reportes',1.10,'Entrega análisis exportables e históricos personalizados.'),
  ('alertas',0.90,'Notifica eventos críticos para reaccionar a tiempo.')
on conflict (module_id) do nothing;

alter table public.module_pricing enable row level security;
alter table public.module_pricing_audit enable row level security;
revoke all on public.module_pricing, public.module_pricing_audit from public, anon, authenticated;
grant select, insert, update on public.module_pricing to service_role;
grant select, insert on public.module_pricing_audit to service_role;

create or replace function public.update_module_pricing(
  p_actor_id uuid,
  p_items jsonb
) returns setof public.module_pricing
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_email text;
  actor_role text;
  item jsonb;
  item_id text;
  item_value numeric(10,2);
  old_value numeric(10,2);
begin
  select email, raw_app_meta_data->>'role'
  into actor_email, actor_role
  from auth.users
  where id = p_actor_id;

  if actor_email is null then
    raise exception 'MODULE_PRICING_ACTOR_NOT_FOUND' using errcode='42501';
  end if;
  if actor_role is distinct from 'platform_admin' then
    raise exception 'MODULE_PRICING_FORBIDDEN' using errcode='42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'MODULE_PRICING_ITEMS_REQUIRED' using errcode='22023';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_id := trim(coalesce(item->>'moduleId',''));
    begin
      item_value := (item->>'monthlyUf')::numeric(10,2);
    exception when others then
      raise exception 'MODULE_PRICING_VALUE_INVALID' using errcode='22023';
    end;
    if item_id = '' or item_value < 0 or item_value > 10000 then
      raise exception 'MODULE_PRICING_VALUE_INVALID' using errcode='22023';
    end if;

    select monthly_uf into old_value
    from public.module_pricing
    where module_id = item_id
    for update;
    if not found then
      raise exception 'MODULE_PRICING_MODULE_NOT_FOUND: %', item_id using errcode='P0002';
    end if;

    if old_value is distinct from item_value then
      update public.module_pricing
      set monthly_uf = item_value,
          updated_by = p_actor_id,
          updated_at = clock_timestamp()
      where module_id = item_id;

      insert into public.module_pricing_audit(
        module_id, previous_monthly_uf, new_monthly_uf, changed_by, changed_by_email
      ) values (
        item_id, old_value, item_value, p_actor_id, actor_email
      );
    end if;
  end loop;

  return query
  select * from public.module_pricing order by module_id;
end;
$$;

revoke all on function public.update_module_pricing(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_module_pricing(uuid,jsonb) to service_role;
