-- Off Street — Pago liberado (Fase A): catálogo comercial del módulo.
--
-- Root → Planes → Módulos adicionales → Pago liberado. ParkFacil cobra el
-- módulo al dueño/operador del estacionamiento, POR ESTACIONAMIENTO, además
-- del servicio base. Valores en UF netos (se presentan "+ IVA").
--
-- - package_price_uf: total del período de la modalidad (no mensualizado).
-- - included_spots: plazas simultáneas incluidas en el paquete (hasta 5).
-- - additional_spot_price_uf: precio de UNA plaza adicional por el período
--   completo de la modalidad. NULL = PENDIENTE DE DEFINICIÓN: bloquea cotizar
--   plazas adicionales en esa modalidad (nunca se deriva del mensual).
-- - available_in_quotes: el módulo no se ofrece en propuestas hasta que Root
--   lo libere comercialmente (false por defecto).
--
-- Cambiar el catálogo NO altera propuestas ni contratos: ambos guardan su
-- propio snapshot de precios. Sin renovación automática ni facturación.
--
-- Acceso: solo vía API server-side (service role) con autorización Root.
-- RLS habilitado sin políticas: anon/authenticated no leen ni escriben.

create table if not exists public.released_payment_catalog (
  modality text primary key check (modality in ('MONTHLY', 'SEMIANNUAL', 'ANNUAL')),
  period_months integer not null check (period_months in (1, 6, 12)),
  package_price_uf numeric(10,2) not null check (package_price_uf >= 0 and package_price_uf <= 10000),
  included_spots integer not null check (included_spots >= 1 and included_spots <= 1000),
  additional_spot_price_uf numeric(10,2) null check (additional_spot_price_uf is null or (additional_spot_price_uf >= 0 and additional_spot_price_uf <= 10000)),
  currency text not null default 'UF' check (currency = 'UF'),
  available_in_quotes boolean not null default false,
  notes text not null default '',
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    (modality = 'MONTHLY' and period_months = 1)
    or (modality = 'SEMIANNUAL' and period_months = 6)
    or (modality = 'ANNUAL' and period_months = 12)
  )
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

-- Precios acordados (configurables por Root). Adicionales semestral/anual:
-- PENDIENTES DE DEFINICIÓN (NULL). No disponible en propuestas hasta su
-- liberación comercial.
insert into public.released_payment_catalog
  (modality, period_months, package_price_uf, included_spots, additional_spot_price_uf, available_in_quotes)
values
  ('MONTHLY', 1, 2.00, 5, 0.25, false),
  ('SEMIANNUAL', 6, 11.00, 5, null, false),
  ('ANNUAL', 12, 20.00, 5, null, false)
on conflict (modality) do nothing;

alter table public.released_payment_catalog enable row level security;
alter table public.released_payment_catalog_audit enable row level security;

-- Lectura server-side (API Root de 2027 y catálogo del CRM, ambos con
-- service role). Sin escritura directa: solo vía la RPC de abajo.
grant select on public.released_payment_catalog to service_role;
grant select on public.released_payment_catalog_audit to service_role;

-- Actualización atómica del catálogo + auditoría, solo Root (re-verificado
-- en la base: app_metadata.role = platform_admin). Solo service_role puede
-- ejecutarla (la API la llama después de autorizar la sesión).
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
  v_months integer;
  v_package numeric(10,2);
  v_included integer;
  v_additional numeric(10,2);
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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 3 then
    raise exception 'RELEASED_PAYMENT_ITEMS_REQUIRED' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_modality := upper(trim(coalesce(item->>'modality', '')));
    v_months := case v_modality when 'MONTHLY' then 1 when 'SEMIANNUAL' then 6 when 'ANNUAL' then 12 else null end;
    if v_months is null then
      raise exception 'RELEASED_PAYMENT_MODALITY_INVALID' using errcode = '22023';
    end if;
    begin
      v_package := (item->>'packagePriceUf')::numeric(10,2);
      v_included := (item->>'includedSpots')::integer;
      v_additional := case when item->'additionalSpotPriceUf' is null or jsonb_typeof(item->'additionalSpotPriceUf') = 'null' then null else (item->>'additionalSpotPriceUf')::numeric(10,2) end;
    exception when others then
      raise exception 'RELEASED_PAYMENT_VALUE_INVALID' using errcode = '22023';
    end;
    v_available := coalesce((item->>'availableInQuotes')::boolean, false);
    v_notes := left(coalesce(item->>'notes', ''), 500);

    select * into previous from public.released_payment_catalog where modality = v_modality for update;

    insert into public.released_payment_catalog as c
      (modality, period_months, package_price_uf, included_spots, additional_spot_price_uf, available_in_quotes, notes, updated_by, updated_at)
    values
      (v_modality, v_months, v_package, v_included, v_additional, v_available, v_notes, p_actor_id, now())
    on conflict (modality) do update set
      package_price_uf = excluded.package_price_uf,
      included_spots = excluded.included_spots,
      additional_spot_price_uf = excluded.additional_spot_price_uf,
      available_in_quotes = excluded.available_in_quotes,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    where (c.package_price_uf, c.included_spots, c.additional_spot_price_uf, c.available_in_quotes, c.notes)
      is distinct from (excluded.package_price_uf, excluded.included_spots, excluded.additional_spot_price_uf, excluded.available_in_quotes, excluded.notes);

    if found then
      insert into public.released_payment_catalog_audit (modality, previous_values, new_values, changed_by, changed_by_email)
      values (
        v_modality,
        coalesce(to_jsonb(previous) - 'updated_by' - 'updated_at', '{}'::jsonb),
        jsonb_build_object('package_price_uf', v_package, 'included_spots', v_included, 'additional_spot_price_uf', v_additional, 'available_in_quotes', v_available, 'notes', v_notes),
        p_actor_id,
        actor_email
      );
    end if;
  end loop;

  return query select * from public.released_payment_catalog order by period_months;
end;
$$;

revoke all on function public.update_released_payment_catalog(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_released_payment_catalog(uuid, jsonb) to service_role;
