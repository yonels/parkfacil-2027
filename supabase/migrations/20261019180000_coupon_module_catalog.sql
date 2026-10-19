-- Off Street — Cupones y descuentos como módulo contratable (SOL-2026-10-19-002,
-- etapa C). Parte 1: catálogo comercial del módulo (solo Root).
--
-- Mismo modelo que Pago liberado (20261016170000): una fila MONTHLY_FEE sin
-- precio (el importe mensual se define en cada propuesta y Root lo registra en
-- la contratación) y un interruptor `available_in_quotes`, apagado por
-- defecto, que el CRM lee para ofrecer el módulo en propuestas.
--
-- Acceso: solo vía API server-side (service_role) con autorización Root.
-- RLS habilitado sin políticas; anon/authenticated sin privilegios.

create table if not exists public.coupon_module_catalog (
  modality text primary key check (modality = 'MONTHLY_FEE'),
  billing_unit text not null default 'MONTH' check (billing_unit = 'MONTH'),
  unit_quantity integer not null default 1 check (unit_quantity = 1),
  currency text not null default 'UF' check (currency = 'UF'),
  available_in_quotes boolean not null default false,
  notes text not null default '',
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.coupon_module_catalog is
  'Cupones y descuentos: liberación comercial del módulo (solo Root). MONTHLY_FEE = importe mensual del módulo en UF + IVA; sin precio: el importe se define en cada propuesta.';

create table if not exists public.coupon_module_catalog_audit (
  id uuid primary key default gen_random_uuid(),
  modality text not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_by_email text not null,
  changed_at timestamptz not null default now()
);

create index if not exists coupon_module_catalog_audit_date_idx on public.coupon_module_catalog_audit(changed_at desc);

insert into public.coupon_module_catalog (modality) values ('MONTHLY_FEE')
on conflict (modality) do nothing;

alter table public.coupon_module_catalog enable row level security;
alter table public.coupon_module_catalog_audit enable row level security;

revoke all on public.coupon_module_catalog from anon, authenticated, service_role;
revoke all on public.coupon_module_catalog_audit from anon, authenticated, service_role;
grant select on public.coupon_module_catalog to service_role;
grant select on public.coupon_module_catalog_audit to service_role;

-- RPC Root: disponibilidad en propuestas y notas; atómica + auditoría. Vuelve a
-- verificar en la base que el actor sea platform_admin.
create or replace function public.update_coupon_module_catalog(
  p_actor_id uuid,
  p_available boolean,
  p_notes text
) returns public.coupon_module_catalog
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_role text;
  v_notes text := left(coalesce(p_notes, ''), 500);
  v_previous public.coupon_module_catalog%rowtype;
  v_next public.coupon_module_catalog%rowtype;
begin
  select email, raw_app_meta_data->>'role' into v_email, v_role from auth.users where id = p_actor_id;
  if v_email is null or v_role is distinct from 'platform_admin' then
    raise exception 'COUPON_MODULE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_available is null then
    raise exception 'COUPON_MODULE_CATALOG_INVALID' using errcode = '22023';
  end if;

  select * into v_previous from public.coupon_module_catalog where modality = 'MONTHLY_FEE' for update;
  if not found then
    raise exception 'COUPON_MODULE_CATALOG_MISSING' using errcode = '22023';
  end if;

  update public.coupon_module_catalog set
    available_in_quotes = p_available,
    notes = v_notes,
    updated_by = p_actor_id,
    updated_at = now()
  where modality = 'MONTHLY_FEE'
    and (available_in_quotes, notes) is distinct from (p_available, v_notes)
  returning * into v_next;

  if v_next.modality is not null then
    insert into public.coupon_module_catalog_audit (modality, previous_values, new_values, changed_by, changed_by_email)
    values (
      'MONTHLY_FEE',
      to_jsonb(v_previous) - 'updated_by' - 'updated_at',
      jsonb_build_object('available_in_quotes', p_available, 'notes', v_notes),
      p_actor_id,
      v_email
    );
    return v_next;
  end if;
  return v_previous;
end;
$$;

revoke all on function public.update_coupon_module_catalog(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.update_coupon_module_catalog(uuid, boolean, text) to service_role;
