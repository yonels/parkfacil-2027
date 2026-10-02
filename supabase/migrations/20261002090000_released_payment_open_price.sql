-- Off Street — Pago liberado: DEFINICIÓN COMERCIAL FINAL (usuario, 2026-10-01).
--
-- El precio que ParkFacil cobra por habilitar el módulo queda ABIERTO: se
-- indica en cada cotización/propuesta (modalidad, período, importe y cupos
-- simultáneos), sin paquetes, precios unitarios, tramos ni valores de
-- catálogo, y sin calcular el importe a partir de los cupos.
--
-- El catálogo conserva solo la LIBERACIÓN COMERCIAL por modalidad
-- (available_in_quotes, solo Root, apagado por defecto). Los precios
-- anteriores se ARCHIVAN como evidencia antes de eliminar sus columnas;
-- la auditoría existente no se modifica. Propuestas y contratos guardan su
-- propio snapshot y no se alteran.

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
grant select on public.released_payment_catalog_price_archive to service_role;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'released_payment_catalog' and column_name = 'package_price_uf'
  ) then
    insert into public.released_payment_catalog_price_archive
      (modality, period_months, package_price_uf, included_spots, additional_spot_price_uf, available_in_quotes, notes, updated_by, updated_at)
    select modality, period_months, package_price_uf, included_spots, additional_spot_price_uf, available_in_quotes, notes, updated_by, updated_at
    from public.released_payment_catalog;
  end if;
end $$;

alter table public.released_payment_catalog
  drop column if exists package_price_uf,
  drop column if exists included_spots,
  drop column if exists additional_spot_price_uf;

comment on table public.released_payment_catalog is
  'Pago liberado: liberación comercial por modalidad (solo Root). Sin precios: el importe se define en cada propuesta.';

-- RPC Root (misma firma): solo disponibilidad y notas; atómica + auditoría.
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
    v_available := coalesce((item->>'availableInQuotes')::boolean, false);
    v_notes := left(coalesce(item->>'notes', ''), 500);

    select * into previous from public.released_payment_catalog where modality = v_modality for update;

    insert into public.released_payment_catalog as c
      (modality, period_months, available_in_quotes, notes, updated_by, updated_at)
    values
      (v_modality, v_months, v_available, v_notes, p_actor_id, now())
    on conflict (modality) do update set
      available_in_quotes = excluded.available_in_quotes,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    where (c.available_in_quotes, c.notes) is distinct from (excluded.available_in_quotes, excluded.notes);

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

  return query select * from public.released_payment_catalog order by period_months;
end;
$$;

revoke all on function public.update_released_payment_catalog(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_released_payment_catalog(uuid, jsonb) to service_role;
