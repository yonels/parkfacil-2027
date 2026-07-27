-- Paso 18: Base real de abonados en Supabase

create extension if not exists pgcrypto;

create sequence if not exists public.abonado_codigo_seq start with 1001 increment by 1;

create or replace function public.next_abonado_codigo()
returns text
language sql
as $$
  select 'AB-' || lpad(nextval('public.abonado_codigo_seq')::text, 4, '0');
$$;

create table if not exists public.abonados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default public.next_abonado_codigo(),
  nombre text not null,
  rut text not null,
  correo text,
  telefono text,
  empresa_id text,
  contrato_id text,
  responsable_id text,
  tipo text not null,
  estado text not null,
  fecha_inicio date not null,
  fecha_termino date not null,
  estacionamientos text[] not null default '{}',
  observaciones text,
  historial text[] not null default '{}',
  incidencias text[] not null default '{}',
  auditoria text[] not null default '{}',
  documentos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abonados_tipo_check check (tipo in ('individual','company_employee','resident','tenant','supplier','courtesy','temporary','other')),
  constraint abonados_estado_check check (estado in ('active','suspended','pending','blocked')),
  constraint abonados_fechas_check check (fecha_termino >= fecha_inicio)
);

create table if not exists public.abonado_vehiculos (
  id uuid primary key default gen_random_uuid(),
  abonado_id uuid not null references public.abonados(id) on delete cascade,
  license_plate text not null,
  brand text,
  model text,
  color text,
  year int,
  vehicle_type text not null default 'car',
  is_primary boolean not null default false,
  status text not null default 'authorized',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abonado_vehiculos_tipo_check check (vehicle_type in ('car','motorcycle','van','truck','bicycle','other')),
  constraint abonado_vehiculos_estado_check check (status in ('authorized','pending','blocked','inactive'))
);

create table if not exists public.abonado_credenciales (
  id uuid primary key default gen_random_uuid(),
  abonado_id uuid not null references public.abonados(id) on delete cascade,
  numero text not null,
  tipo text not null,
  status text not null,
  fecha_inicio date not null,
  fecha_termino date not null,
  estacionamientos text[] not null default '{}',
  acceso_bloqueado boolean not null default false,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abonado_credenciales_tipo_check check (tipo in ('license_plate','rfid_card','qr_code','mobile','barcode','pin','biometric_reference','manual','other')),
  constraint abonado_credenciales_status_check check (status in ('active','pending_activation','suspended','expired','blocked','inactive')),
  constraint abonado_credenciales_fechas_check check (fecha_termino >= fecha_inicio)
);

create unique index if not exists abonado_vehiculos_unique_plate_per_abonado
  on public.abonado_vehiculos (abonado_id, upper(license_plate));

create unique index if not exists abonado_credenciales_unique_numero
  on public.abonado_credenciales (numero);

create unique index if not exists abonados_unique_rut
  on public.abonados (rut);

create index if not exists abonados_estado_idx on public.abonados (estado);
create index if not exists abonados_tipo_idx on public.abonados (tipo);
create index if not exists abonados_empresa_id_idx on public.abonados (empresa_id);
create index if not exists abonados_fecha_termino_idx on public.abonados (fecha_termino);
create index if not exists abonado_vehiculos_abonado_id_idx on public.abonado_vehiculos (abonado_id);
create index if not exists abonado_credenciales_abonado_id_idx on public.abonado_credenciales (abonado_id);
create index if not exists abonado_credenciales_fecha_termino_idx on public.abonado_credenciales (fecha_termino);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_abonados_updated_at on public.abonados;
create trigger trg_abonados_updated_at
before update on public.abonados
for each row
execute function public.set_updated_at();

drop trigger if exists trg_abonado_vehiculos_updated_at on public.abonado_vehiculos;
create trigger trg_abonado_vehiculos_updated_at
before update on public.abonado_vehiculos
for each row
execute function public.set_updated_at();

drop trigger if exists trg_abonado_credenciales_updated_at on public.abonado_credenciales;
create trigger trg_abonado_credenciales_updated_at
before update on public.abonado_credenciales
for each row
execute function public.set_updated_at();

alter table public.abonados enable row level security;
alter table public.abonado_vehiculos enable row level security;
alter table public.abonado_credenciales enable row level security;

drop policy if exists abonados_select_authenticated on public.abonados;
create policy abonados_select_authenticated
on public.abonados
for select
to authenticated
using (true);

drop policy if exists abonados_insert_authenticated on public.abonados;
create policy abonados_insert_authenticated
on public.abonados
for insert
to authenticated
with check (true);

drop policy if exists abonados_update_authenticated on public.abonados;
create policy abonados_update_authenticated
on public.abonados
for update
to authenticated
using (true)
with check (true);

drop policy if exists abonado_vehiculos_select_authenticated on public.abonado_vehiculos;
create policy abonado_vehiculos_select_authenticated
on public.abonado_vehiculos
for select
to authenticated
using (true);

drop policy if exists abonado_vehiculos_insert_authenticated on public.abonado_vehiculos;
create policy abonado_vehiculos_insert_authenticated
on public.abonado_vehiculos
for insert
to authenticated
with check (true);

drop policy if exists abonado_vehiculos_update_authenticated on public.abonado_vehiculos;
create policy abonado_vehiculos_update_authenticated
on public.abonado_vehiculos
for update
to authenticated
using (true)
with check (true);

drop policy if exists abonado_vehiculos_delete_authenticated on public.abonado_vehiculos;
create policy abonado_vehiculos_delete_authenticated
on public.abonado_vehiculos
for delete
to authenticated
using (true);

drop policy if exists abonado_credenciales_select_authenticated on public.abonado_credenciales;
create policy abonado_credenciales_select_authenticated
on public.abonado_credenciales
for select
to authenticated
using (true);

drop policy if exists abonado_credenciales_insert_authenticated on public.abonado_credenciales;
create policy abonado_credenciales_insert_authenticated
on public.abonado_credenciales
for insert
to authenticated
with check (true);

drop policy if exists abonado_credenciales_update_authenticated on public.abonado_credenciales;
create policy abonado_credenciales_update_authenticated
on public.abonado_credenciales
for update
to authenticated
using (true)
with check (true);

drop policy if exists abonado_credenciales_delete_authenticated on public.abonado_credenciales;
create policy abonado_credenciales_delete_authenticated
on public.abonado_credenciales
for delete
to authenticated
using (true);
