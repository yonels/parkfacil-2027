create table if not exists public.companies (
  id text primary key,
  rut_number text not null,
  rut_dv text not null,
  business_name text not null,
  trade_name text not null,
  business_activity text not null default '',
  address text not null,
  district text not null default '',
  city text not null,
  region text not null default '',
  country text not null default 'Chile',
  primary_contact text not null,
  email text not null,
  phone text not null,
  legal_representative text not null,
  status text not null default 'active' check (status in ('active','inactive','onboarding')),
  relationship_type text not null default 'client' check (relationship_type in ('client','operator','administrator','partner','supplier')),
  incorporated_on date null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rut_number, rut_dv)
);

insert into public.companies (
  id, rut_number, rut_dv, business_name, trade_name, business_activity,
  address, district, city, region, country, primary_contact, email, phone,
  legal_representative, status, relationship_type, incorporated_on, notes
) values
  (
    'emp-001','4943377','8','ParkFacil Operaciones Spa','ParkFacil Operaciones',
    'Operación y administración de estacionamientos','Av. Raúl Labbé 12613, oficina 231',
    'Lo Barnechea','Santiago','Metropolitana','Chile','María Pérez',
    'maria.perez@parkfacil.cl','+56 2 2345 6789','Juan Pérez','active','client',
    '2024-01-15','Empresa principal de operación ParkFacil.'
  ),
  (
    'emp-002','7654321','5','Movilidad Urbana Norte Ltda.','Movilidad Urbana Norte',
    'Gestión de movilidad y operación de estacionamientos','Calle 80 1200',
    'Laureles','Medellín','Antioquia','Colombia','Diego Rojas',
    'diego.rojas@northmobility.co','+57 4 3210 9876','Ana Rojas','onboarding','operator',
    '2025-05-10','Empresa operadora en proceso de incorporación.'
  ),
  (
    'emp-003','11223344','6','Administradora Plaza Sur S.A.','Plaza Sur',
    'Administración de inmuebles','Carrera 15 500','San Fernando','Cali',
    'Valle del Cauca','Colombia','Sofía Morales','sofia@plazasure.com',
    '+57 2 5555 0000','Luis Morales','inactive','administrator','2023-08-01',
    'Empresa histórica sin estacionamientos asociados.'
  )
on conflict (id) do update set
  rut_number=excluded.rut_number,
  rut_dv=excluded.rut_dv,
  business_name=excluded.business_name,
  trade_name=excluded.trade_name,
  business_activity=excluded.business_activity,
  address=excluded.address,
  district=excluded.district,
  city=excluded.city,
  region=excluded.region,
  country=excluded.country,
  primary_contact=excluded.primary_contact,
  email=excluded.email,
  phone=excluded.phone,
  legal_representative=excluded.legal_representative,
  status=excluded.status,
  relationship_type=excluded.relationship_type,
  incorporated_on=excluded.incorporated_on,
  notes=excluded.notes,
  updated_at=now();

update public.parkings p
set company_name = c.trade_name
from public.companies c
where c.id = p.company_id;

alter table public.parkings
  drop constraint if exists parkings_company_id_fkey;
alter table public.parkings
  add constraint parkings_company_id_fkey
  foreign key (company_id) references public.companies(id) on update cascade on delete restrict;

create index if not exists companies_status_relationship_idx on public.companies(status, relationship_type);
create index if not exists companies_city_idx on public.companies(city);

create or replace function public.set_companies_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_companies_updated_at();

alter table public.companies enable row level security;
grant select, insert, update on public.companies to service_role;
