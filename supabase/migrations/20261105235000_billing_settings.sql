-- SOL-2026-11-05-005, F1.4: configuración de facturación de ParkFacil (una sola fila).
-- Datos del emisor, plazo de pago por defecto y proveedor de emisión. Valores iniciales tomados de la factura
-- N° 278 emitida en EasyDoc (captura del usuario 2026-11-05); dirección, comuna y ciudad informadas por el usuario el
-- 2026-11-05 («Avda Raul Labbe 12613 Of 231 Santiago, Lo Barnechea ParkFacil SPA 77.991.619-7»). El correo queda por completar.
create table if not exists public.billing_settings (
  id smallint primary key default 1 check (id = 1),
  issuer_business_name text not null default '',
  issuer_rut_number text not null default '',
  issuer_rut_dv text not null default '',
  issuer_activity text not null default '',
  issuer_activity_code text not null default '',
  issuer_address text not null default '',
  issuer_district text not null default '',
  issuer_city text not null default '',
  issuer_sii_office text not null default '',
  issuer_email text not null default '',
  issuer_phone text not null default '',
  default_payment_due_days integer not null default 6 check (default_payment_due_days between 0 and 120),
  invoice_provider text not null default 'SIMULATED' check (invoice_provider in ('SIMULATED','HAULMER')),
  provider_environment text not null default 'TEST' check (provider_environment in ('TEST','PRODUCTION')),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.billing_settings (id, issuer_business_name, issuer_rut_number, issuer_rut_dv, issuer_activity, issuer_address, issuer_district, issuer_city, issuer_sii_office, default_payment_due_days)
values (1, 'ParkFacil SpA', '77991619', '7', 'Otras actividades de tecnología de la información y de servicios informáticos', 'Av. Raúl Labbé 12613, Of. 231', 'Lo Barnechea', 'Santiago', 'Santiago Oriente', 6)
on conflict (id) do nothing;

create table if not exists public.billing_settings_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references auth.users(id) on delete set null,
  previous_value jsonb null,
  new_value jsonb null,
  created_at timestamptz not null default now()
);

alter table public.billing_settings enable row level security;
alter table public.billing_settings_audit enable row level security;
revoke all on public.billing_settings, public.billing_settings_audit from public, anon, authenticated;
grant select, insert, update on public.billing_settings to service_role;
grant select, insert on public.billing_settings_audit to service_role;
