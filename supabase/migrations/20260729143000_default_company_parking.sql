-- Toda empresa nace con un estacionamiento inicial y sus tres usuarios asociados.
create table if not exists public.company_member_parkings (
  user_id uuid not null references public.company_members(user_id) on delete cascade,
  parking_id uuid not null references public.parkings(id) on delete cascade,
  access_level text not null check (access_level in ('ADMIN','POS_OPERATOR')),
  created_at timestamptz not null default now(),
  primary key (user_id, parking_id)
);

create index if not exists company_member_parkings_parking_idx
  on public.company_member_parkings(parking_id, access_level);

alter table public.company_member_parkings enable row level security;
revoke all on public.company_member_parkings from public, anon, authenticated;
grant select, insert, update, delete on public.company_member_parkings to service_role;
grant delete on public.parkings to service_role;

insert into public.parkings (
  id, code, name, company_id, company_name, type, status, address, district,
  city, region, country, schedule, description, notes, access_count, exit_count,
  off_street_configuration_status, on_street_configuration_status
) values (
  '50000000-0000-4000-8000-000000000005',
  '5Q-001',
  'Estacionamiento Inmobiliaria 5Q',
  'emp-5q',
  'Inmobiliaria 5Q',
  'OFF_STREET',
  'DRAFT',
  'Las Encinas 140',
  'Cerrillos',
  'Santiago',
  'Metropolitana',
  'Chile',
  'Pendiente de configuración',
  'Estacionamiento inicial creado desde el contrato de adhesión del 09-07-2026.',
  'Modalidad, capacidad, accesos, salidas y horario deben ser confirmados por el administrador antes de activar.',
  0,
  0,
  'EMPTY',
  'EMPTY'
) on conflict (code) do update set
  name=excluded.name,
  company_id=excluded.company_id,
  company_name=excluded.company_name,
  address=excluded.address,
  district=excluded.district,
  city=excluded.city,
  region=excluded.region,
  country=excluded.country,
  description=excluded.description,
  notes=excluded.notes,
  updated_at=now();

insert into public.company_member_parkings(user_id, parking_id, access_level)
select member.user_id, parking.id,
  case when member.role='company_admin' then 'ADMIN' else 'POS_OPERATOR' end
from public.company_members member
join public.parkings parking on parking.company_id=member.company_id
where member.company_id='emp-5q' and parking.code='5Q-001'
on conflict (user_id,parking_id) do update set access_level=excluded.access_level;
