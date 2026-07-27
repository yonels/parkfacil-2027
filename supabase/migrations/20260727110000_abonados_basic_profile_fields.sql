-- Etapa 18: datos personales validados y responsables basicos para abonados

alter table public.abonados
  add column if not exists nombres text,
  add column if not exists apellido_paterno text,
  add column if not exists apellido_materno text,
  add column if not exists rut_numero text,
  add column if not exists rut_dv text,
  add column if not exists telefono_pais text not null default 'CL',
  add column if not exists telefono_codigo text not null default '+56',
  add column if not exists telefono_numero text;

update public.abonados
set
  nombres = coalesce(nullif(trim(nombres), ''), nullif(trim(nombre), ''), 'Sin nombre'),
  apellido_paterno = coalesce(nullif(trim(apellido_paterno), ''), 'Sin apellido'),
  apellido_materno = nullif(trim(apellido_materno), ''),
  rut_numero = coalesce(nullif(regexp_replace(coalesce(rut_numero, ''), '[^0-9]', '', 'g'), ''), nullif(left(regexp_replace(coalesce(rut, ''), '[^0-9Kk]', '', 'g'), greatest(length(regexp_replace(coalesce(rut, ''), '[^0-9Kk]', '', 'g')) - 1, 0)), '')),
  rut_dv = coalesce(nullif(upper(regexp_replace(coalesce(rut_dv, ''), '[^0-9Kk]', '', 'g')), ''), nullif(right(upper(regexp_replace(coalesce(rut, ''), '[^0-9Kk]', '', 'g')), 1), '')),
  telefono_numero = coalesce(nullif(trim(telefono_numero), ''), nullif(trim(telefono), ''));

update public.abonados
set
  nombre = trim(concat_ws(' ', nombres, apellido_paterno, nullif(apellido_materno, ''))),
  rut = concat(rut_numero, upper(rut_dv)),
  telefono = nullif(trim(concat_ws(' ', telefono_codigo, telefono_numero)), '')
where nombres is not null and apellido_paterno is not null and rut_numero is not null and rut_dv is not null;

alter table public.abonados
  alter column nombres set not null,
  alter column apellido_paterno set not null,
  alter column rut_numero set not null,
  alter column rut_dv set not null;


alter table public.abonados drop constraint if exists abonados_estado_check;
alter table public.abonados
  add constraint abonados_estado_check check (estado in ('active','inactive','suspended','pending','blocked'));

alter table public.abonado_credenciales drop constraint if exists abonado_credenciales_status_check;
alter table public.abonado_credenciales
  add constraint abonado_credenciales_status_check check (status in ('active','pending_activation','suspended','expired','blocked','inactive','revoked'));

alter table public.abonado_credenciales drop constraint if exists abonado_credenciales_tipo_check;
alter table public.abonado_credenciales
  add constraint abonado_credenciales_tipo_check check (tipo in ('rfid_card','qr_code','mobile','barcode','pin','other'));
create table if not exists public.abonado_responsables (
  id text primary key default gen_random_uuid()::text,
  nombres text not null,
  apellido_paterno text not null,
  apellido_materno text,
  correo text,
  telefono_codigo text not null default '+56',
  telefono_numero text,
  estado text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abonado_responsables_estado_check check (estado in ('active','inactive'))
);


insert into public.abonado_responsables (id, nombres, apellido_paterno, estado)
select distinct responsable_id, 'Responsable', 'registrado', 'active'
from public.abonados
where responsable_id is not null
  and btrim(responsable_id) <> ''
  and not exists (
    select 1
    from public.abonado_responsables existing
    where existing.id = public.abonados.responsable_id
  );
alter table public.abonados drop constraint if exists abonados_responsable_id_fk;
alter table public.abonados
  add constraint abonados_responsable_id_fk foreign key (responsable_id) references public.abonado_responsables(id) on delete set null;

alter table public.abonados drop constraint if exists abonados_rut_separado_check;
alter table public.abonados
  add constraint abonados_rut_separado_check check (rut_numero ~ '^[0-9]+$' and rut_dv ~ '^[0-9K]$');

alter table public.abonados drop constraint if exists abonados_nombre_partes_check;
alter table public.abonados
  add constraint abonados_nombre_partes_check check (btrim(nombres) <> '' and btrim(apellido_paterno) <> '');

create unique index if not exists abonados_unique_rut_numero_dv
  on public.abonados (rut_numero, rut_dv);

create unique index if not exists abonado_responsables_unique_correo
  on public.abonado_responsables (lower(correo))
  where correo is not null and btrim(correo) <> '';

create index if not exists abonado_responsables_estado_idx on public.abonado_responsables (estado);

drop trigger if exists trg_abonado_responsables_updated_at on public.abonado_responsables;
create trigger trg_abonado_responsables_updated_at
before update on public.abonado_responsables
for each row
execute function public.set_updated_at();

alter table public.abonado_responsables enable row level security;

drop policy if exists abonado_responsables_select_authenticated on public.abonado_responsables;
create policy abonado_responsables_select_authenticated
on public.abonado_responsables
for select
to authenticated
using (true);

drop policy if exists abonado_responsables_insert_authenticated on public.abonado_responsables;
create policy abonado_responsables_insert_authenticated
on public.abonado_responsables
for insert
to authenticated
with check (true);

drop policy if exists abonado_responsables_update_authenticated on public.abonado_responsables;
create policy abonado_responsables_update_authenticated
on public.abonado_responsables
for update
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on table public.abonado_responsables to service_role;
grant usage, select on all sequences in schema public to service_role;

