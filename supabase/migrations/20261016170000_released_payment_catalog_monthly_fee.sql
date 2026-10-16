-- Off Street — Pago liberado: catálogo de liberación comercial, forma FINAL
-- (SOL-2026-10-16-002, opción A elegida por el usuario el 2026-10-16).
--
-- Migración consolidada SOLO DE CATÁLOGO para publicar en producción el
-- requisito del CRM: la fila MONTHLY_FEE (importe mensual del módulo, con
-- vigencia igual al plazo del contrato 12/24/36 meses, definido en cada
-- propuesta). El catálogo NO guarda precios: solo indica, por modalidad, si
-- Root liberó el módulo para propuestas (apagado por defecto).
--
-- No crea contratos, módulos por estacionamiento, autorizaciones ni toca
-- estadías o POS (fases B–E quedan fuera).
--
-- Converge desde dos estados:
-- - Base sin catálogo (producción): crea todo en su forma final.
-- - Catálogo de la primera Fase A (20261001090000, aplicada en QA): archiva
--   los precios antiguos en released_payment_catalog_price_archive, elimina
--   sus columnas, agrega billing_unit/unit_quantity y conserva las filas
--   mensuales anteriores como historial (apagadas o como estén).
--
-- Acceso: solo vía API server-side (service_role) con autorización Root.
-- RLS habilitado sin políticas; anon/authenticated sin privilegios.

create table if not exists public.released_payment_catalog (
  modality text primary key,
  period_months integer null,
  billing_unit text not null,
  unit_quantity integer not null,
  currency text not null default 'UF' check (currency = 'UF'),
  available_in_quotes boolean not null default false,
  notes text not null default '',
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.released_payment_catalog_audit (
  id uuid primary key default gen_random_uuid(),
  modality text not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_by_email text not null,
  changed_at timestamptz not null default now()
);

create index if not exists released_payment_catalog_audit_modality_date_idx
  on public.released_payment_catalog_audit(modality, changed_at desc);

-- Catálogo de la primera Fase A: archivar precios antes de eliminarlos.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'released_payment_catalog' and column_name = 'package_price_uf'
  ) then
    create table if not exists public.released_payment_catalog_price_archive (
      archived_at timestamptz not null default now(),
      modality text not null,
      period_months integer not null,
      package_price_uf numeric(10,2),
      included_spots integer,
      additional_spot_price_uf numeric(10,2),
      available_in_quotes boolean,
      notes text,
      updated_by uuid,
      updated_at timestamptz
    );
    alter table public.released_payment_catalog_price_archive enable row level security;
    revoke all on public.released_payment_catalog_price_archive from anon, authenticated, service_role;
    grant select on public.released_payment_catalog_price_archive to service_role;

    insert into public.released_payment_catalog_price_archive
      (modality, period_months, package_price_uf, included_spots, additional_spot_price_uf, available_in_quotes, notes, updated_by, updated_at)
    select modality, period_months, package_price_uf, included_spots, additional_spot_price_uf, available_in_quotes, notes, updated_by, updated_at
    from public.released_payment_catalog;
  end if;
end $$;

alter table public.released_payment_catalog
  drop column if exists package_price_uf,
  drop column if exists included_spots,
  drop column if exists additional_spot_price_uf,
  add column if not exists billing_unit text,
  add column if not exists unit_quantity integer;

-- Filas mensuales anteriores (solo existen si venía de la primera Fase A).
update public.released_payment_catalog
set billing_unit = 'MONTH', unit_quantity = period_months
where billing_unit is null;

alter table public.released_payment_catalog
  alter column billing_unit set not null,
  alter column unit_quantity set not null,
  alter column period_months drop not null;

alter table public.released_payment_catalog
  drop constraint if exists released_payment_catalog_check,
  drop constraint if exists released_payment_catalog_period_months_check,
  drop constraint if exists released_payment_catalog_modality_check,
  drop constraint if exists released_payment_catalog_unit_check;

-- Mismas reglas que el módulo completo (20261005110000), para que las filas
-- históricas sigan siendo válidas.
alter table public.released_payment_catalog
  add constraint released_payment_catalog_modality_check
    check (modality in ('HOURLY', 'DAILY', 'MONTHLY', 'SEMIANNUAL', 'ANNUAL', 'ONE_TIME', 'MONTHLY_FEE')),
  add constraint released_payment_catalog_unit_check check (
    (modality = 'HOURLY' and billing_unit = 'HOUR' and unit_quantity = 1 and period_months is null)
    or (modality = 'DAILY' and billing_unit = 'DAY' and unit_quantity = 1 and period_months is null)
    or (modality = 'MONTHLY' and billing_unit = 'MONTH' and unit_quantity = 1 and period_months = 1)
    or (modality = 'SEMIANNUAL' and billing_unit = 'MONTH' and unit_quantity = 6 and period_months = 6)
    or (modality = 'ANNUAL' and billing_unit = 'MONTH' and unit_quantity = 12 and period_months = 12)
    or (modality = 'ONE_TIME' and billing_unit = 'ONE_TIME' and unit_quantity = 1 and period_months is null)
    or (modality = 'MONTHLY_FEE' and billing_unit = 'MONTH' and unit_quantity = 1 and period_months is null)
  );

-- Nace apagada: Root decide cuándo se ofrece en propuestas.
insert into public.released_payment_catalog (modality, period_months, billing_unit, unit_quantity, available_in_quotes, notes)
values ('MONTHLY_FEE', null, 'MONTH', 1, false, '')
on conflict (modality) do nothing;

comment on table public.released_payment_catalog is
  'Pago liberado: liberación comercial (solo Root). MONTHLY_FEE = importe mensual del módulo (SOL-2026-10-05-002); sin precios: el importe se define en cada propuesta. Otras modalidades, si existen, son historial.';

alter table public.released_payment_catalog enable row level security;
alter table public.released_payment_catalog_audit enable row level security;

-- Lectura server-side (API Root de 2027 y catálogo del CRM, ambos con
-- service role). Sin escritura directa: solo vía la RPC de abajo.
-- Revocación explícita: no depende de los privilegios por defecto del esquema.
revoke all on public.released_payment_catalog from anon, authenticated, service_role;
revoke all on public.released_payment_catalog_audit from anon, authenticated, service_role;
grant select on public.released_payment_catalog to service_role;
grant select on public.released_payment_catalog_audit to service_role;

-- RPC Root: actualiza disponibilidad y notas de las modalidades informadas
-- (al menos una, existentes); atómica + auditoría. Re-verifica en la base
-- que el actor sea platform_admin. Solo service_role puede ejecutarla.
create or replace function public.update_released_payment_catalog(
  p_actor_id uuid,
  p_items jsonb
) returns setof public.released_payment_catalog
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_email text;
  actor_role text;
  item jsonb;
  v_modality text;
  v_available boolean;
  v_notes text;
  previous public.released_payment_catalog%rowtype;
begin
  select email, raw_app_meta_data->>'role' into actor_email, actor_role from auth.users where id = p_actor_id;
  if actor_email is null then
    raise exception 'RELEASED_PAYMENT_ACTOR_NOT_FOUND' using errcode = '42501';
  end if;
  if actor_role is distinct from 'platform_admin' then
    raise exception 'RELEASED_PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 7 then
    raise exception 'RELEASED_PAYMENT_ITEMS_REQUIRED' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_modality := upper(trim(coalesce(item->>'modality', '')));
    v_available := coalesce((item->>'availableInQuotes')::boolean, false);
    v_notes := left(coalesce(item->>'notes', ''), 500);

    select * into previous from public.released_payment_catalog where modality = v_modality for update;
    if not found then
      raise exception 'RELEASED_PAYMENT_MODALITY_INVALID' using errcode = '22023';
    end if;

    update public.released_payment_catalog as c set
      available_in_quotes = v_available,
      notes = v_notes,
      updated_by = p_actor_id,
      updated_at = now()
    where c.modality = v_modality
      and (c.available_in_quotes, c.notes) is distinct from (v_available, v_notes);

    if found then
      insert into public.released_payment_catalog_audit (modality, previous_values, new_values, changed_by, changed_by_email)
      values (
        v_modality,
        coalesce(to_jsonb(previous) - 'updated_by' - 'updated_at', '{}'::jsonb),
        jsonb_build_object('available_in_quotes', v_available, 'notes', v_notes),
        p_actor_id,
        actor_email
      );
    end if;
  end loop;

  return query
    select * from public.released_payment_catalog
    order by case billing_unit when 'ONE_TIME' then 0 when 'HOUR' then 1 when 'DAY' then 2 else 3 end, unit_quantity;
end;
$$;

revoke all on function public.update_released_payment_catalog(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_released_payment_catalog(uuid, jsonb) to service_role;
