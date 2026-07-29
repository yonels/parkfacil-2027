-- Clínica Ramis: empresa matriz y estacionamientos persistentes.
-- Mantiene métricas heredadas para el catálogo y crea la estructura
-- niveles/zonas utilizada por el detalle Off Street.

insert into public.companies (
  id, rut_number, rut_dv, business_name, trade_name, business_activity,
  address, district, city, region, country, primary_contact, email, phone,
  legal_representative, status, relationship_type, incorporated_on, notes
) values (
  'emp-ramis',
  '76345890',
  '2',
  'Sociedad Médica Integral Clínica Ramis Ltda.',
  'Clínica Ramis',
  'Servicios médicos y administración de centros de salud',
  'Av. Providencia 1840',
  'Providencia',
  'Santiago',
  'Metropolitana',
  'Chile',
  'Administración Clínica Ramis',
  'administracion@clinicaramis.cl',
  '+56 2 2300 0000',
  'Representante Legal Clínica Ramis',
  'active',
  'client',
  '2026-01-01',
  'Empresa matriz de los estacionamientos Clínica Ramis.'
)
on conflict (id) do update set
  rut_number = excluded.rut_number,
  rut_dv = excluded.rut_dv,
  business_name = excluded.business_name,
  trade_name = excluded.trade_name,
  business_activity = excluded.business_activity,
  address = excluded.address,
  district = excluded.district,
  city = excluded.city,
  region = excluded.region,
  country = excluded.country,
  primary_contact = excluded.primary_contact,
  email = excluded.email,
  phone = excluded.phone,
  legal_representative = excluded.legal_representative,
  status = excluded.status,
  relationship_type = excluded.relationship_type,
  incorporated_on = excluded.incorporated_on,
  notes = excluded.notes,
  updated_at = now();

insert into public.parkings (
  id, code, name, company_id, company_name, type, status, address, city,
  country, schedule, description, access_count, exit_count
) values
  (
    '10000000-0000-4000-8000-000000000101', 'PF-001',
    'Clínica Ramis Central', 'emp-ramis', 'Clínica Ramis', 'OFF_STREET',
    'ACTIVE', 'Av. Providencia 1840', 'Santiago', 'Chile', '24/7',
    'Estacionamiento principal de Clínica Ramis.', 4, 3
  ),
  (
    '10000000-0000-4000-8000-000000000102', 'PF-002',
    'Clínica Ramis Norte', 'emp-ramis', 'Clínica Ramis', 'OFF_STREET',
    'ACTIVE', 'Av. El Salto 4921', 'Huechuraba', 'Chile', '24/7',
    'Estacionamiento de la sede norte de Clínica Ramis.', 2, 2
  ),
  (
    '10000000-0000-4000-8000-000000000103', 'PF-003',
    'Clínica Ramis Urgencias', 'emp-ramis', 'Clínica Ramis', 'OFF_STREET',
    'INACTIVE', 'Los Leones 955', 'Santiago', 'Chile', '24/7',
    'Estacionamiento asociado al servicio de urgencias.', 2, 1
  )
on conflict (code) do update set
  name = excluded.name,
  company_id = excluded.company_id,
  company_name = excluded.company_name,
  type = excluded.type,
  status = excluded.status,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  schedule = excluded.schedule,
  description = excluded.description,
  access_count = excluded.access_count,
  exit_count = excluded.exit_count,
  updated_at = now();

insert into public.parking_levels (
  id, parking_id, code, name, status, description, notes, declared_capacity
) values
  ('30000000-0000-4000-8000-000000000101', (select id from public.parkings where code='PF-001'), 'NIV-001', 'Nivel 1', 'ACTIVE', 'Nivel principal', '', 240),
  ('30000000-0000-4000-8000-000000000102', (select id from public.parkings where code='PF-001'), 'NIV-002', 'Nivel 2', 'ACTIVE', 'Segundo nivel', '', 40),
  ('30000000-0000-4000-8000-000000000103', (select id from public.parkings where code='PF-001'), 'NIV-003', 'Nivel 3', 'ACTIVE', 'Tercer nivel', '', 40),
  ('30000000-0000-4000-8000-000000000104', (select id from public.parkings where code='PF-002'), 'NIV-001', 'Nivel 1', 'ACTIVE', 'Nivel principal', '', 180),
  ('30000000-0000-4000-8000-000000000105', (select id from public.parkings where code='PF-003'), 'NIV-001', 'Nivel 1', 'ACTIVE', 'Nivel de urgencias', '', 96)
on conflict (parking_id, code) do update set
  name = excluded.name,
  status = excluded.status,
  description = excluded.description,
  declared_capacity = excluded.declared_capacity,
  updated_at = now();

insert into public.parking_zones (
  id, parking_id, level_id, code, name, status, capacity, occupied,
  description, notes
) values
  ('40000000-0000-4000-8000-000000000101', (select id from public.parkings where code='PF-001'), '30000000-0000-4000-8000-000000000101', 'GEN-1', 'General Nivel 1', 'ACTIVE', 240, 190, 'Estacionamiento general', ''),
  ('40000000-0000-4000-8000-000000000102', (select id from public.parkings where code='PF-001'), '30000000-0000-4000-8000-000000000102', 'GEN-2', 'General Nivel 2', 'ACTIVE', 40, 30, 'Estacionamiento general', ''),
  ('40000000-0000-4000-8000-000000000103', (select id from public.parkings where code='PF-001'), '30000000-0000-4000-8000-000000000103', 'VIP', 'VIP', 'ACTIVE', 40, 26, 'Plazas preferentes', ''),
  ('40000000-0000-4000-8000-000000000104', (select id from public.parkings where code='PF-002'), '30000000-0000-4000-8000-000000000104', 'GEN', 'General', 'ACTIVE', 180, 91, 'Estacionamiento general', ''),
  ('40000000-0000-4000-8000-000000000105', (select id from public.parkings where code='PF-003'), '30000000-0000-4000-8000-000000000105', 'URG', 'Urgencias', 'ACTIVE', 96, 74, 'Plazas de urgencias', '')
on conflict (level_id, code) do update set
  name = excluded.name,
  status = excluded.status,
  capacity = excluded.capacity,
  occupied = excluded.occupied,
  description = excluded.description,
  updated_at = now();

-- Compatibilidad temporal con el cálculo del catálogo actual.
insert into public.parking_sectors (
  id, parking_id, code, name, type, status, capacity, occupied, notes,
  level, zone, location_description, access_count, exit_count
) values
  ('20000000-0000-4000-8000-000000000201', (select id from public.parkings where code='PF-001'), 'A', 'General Nivel 1', 'OFF_STREET', 'ACTIVE', 240, 190, '', 'Nivel 1', 'General', 'Nivel principal', 2, 1),
  ('20000000-0000-4000-8000-000000000202', (select id from public.parkings where code='PF-001'), 'B', 'General Nivel 2', 'OFF_STREET', 'ACTIVE', 40, 30, '', 'Nivel 2', 'General', 'Segundo nivel', 1, 1),
  ('20000000-0000-4000-8000-000000000203', (select id from public.parkings where code='PF-001'), 'C', 'VIP', 'OFF_STREET', 'ACTIVE', 40, 26, '', 'Nivel 3', 'VIP', 'Plazas preferentes', 1, 1),
  ('20000000-0000-4000-8000-000000000204', (select id from public.parkings where code='PF-002'), 'A', 'General', 'OFF_STREET', 'ACTIVE', 180, 91, '', 'Nivel 1', 'General', 'Nivel principal', 2, 2),
  ('20000000-0000-4000-8000-000000000205', (select id from public.parkings where code='PF-003'), 'A', 'Urgencias', 'OFF_STREET', 'ACTIVE', 96, 74, '', 'Nivel 1', 'Urgencias', 'Plazas de urgencias', 2, 1)
on conflict (parking_id, code) do update set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  capacity = excluded.capacity,
  occupied = excluded.occupied,
  notes = excluded.notes,
  level = excluded.level,
  zone = excluded.zone,
  location_description = excluded.location_description,
  access_count = excluded.access_count,
  exit_count = excluded.exit_count,
  updated_at = now();
