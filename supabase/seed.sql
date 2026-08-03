-- Seed controlado e idempotente para Etapa 19.
-- No se ejecuta automáticamente desde la aplicación.

insert into public.parkings (
  id, code, name, company_id, company_name, type, status, address, city,
  country, schedule, description, access_count, exit_count
) values
  ('10000000-0000-4000-8000-000000000001', 'PC-001', 'Parking Centro', 'emp-001', 'ParkFacil Operaciones', 'OFF_STREET', 'ACTIVE', 'Av. Principal 123', 'Bogotá', 'Colombia', '24/7', 'Estacionamiento cubierto de operación continua.', 6, 4),
  ('10000000-0000-4000-8000-000000000002', 'PN-002', 'Parking Norte', 'emp-002', 'Movilidad Urbana Norte', 'ON_STREET', 'MAINTENANCE', 'Calle 80 #12-45', 'Medellín', 'Colombia', '06:00 - 22:00', 'Operación On Street organizada por tramos.', 4, 2),
  ('10000000-0000-4000-8000-000000000003', 'PS-003', 'Parking Sur', 'emp-001', 'ParkFacil Operaciones', 'OFF_STREET', 'INACTIVE', 'Carrera 15 #20-10', 'Cali', 'Colombia', '08:00 - 20:00', 'Estacionamiento pendiente de configuración sectorial.', 3, 2)
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
  exit_count = excluded.exit_count;

insert into public.parking_sectors (
  id, parking_id, code, name, type, status, capacity, occupied, notes,
  level, zone, location_description, access_count, exit_count,
  street, from_reference, to_reference, district, segment_description
) values
  ('20000000-0000-4000-8000-000000000001', (select id from public.parkings where code = 'PC-001'), 'CTR-A', 'Zona A', 'OFF_STREET', 'ACTIVE', 20, 11, 'Ocupación agregada.', 'Nivel 1', 'Zona A', 'Área general próxima al acceso principal.', 2, 1, null, null, null, null, null),
  ('20000000-0000-4000-8000-000000000002', (select id from public.parkings where code = 'PC-001'), 'CTR-B', 'Zona B', 'OFF_STREET', 'ACTIVE', 80, 72, 'Visualización resumida.', 'Nivel -1', 'Zona B', 'Área cubierta de alta demanda.', 2, 2, null, null, null, null, null),
  ('20000000-0000-4000-8000-000000000101', (select id from public.parkings where code = 'PN-002'), 'NOR-MON', 'Tramo Moneda', 'ON_STREET', 'ACTIVE', 35, 20, 'Tramo autorizado.', null, null, null, 0, 0, 'Moneda', 'Bandera', 'Ahumada', 'Centro', 'Costado norte del tramo autorizado.'),
  ('20000000-0000-4000-8000-000000000102', (select id from public.parkings where code = 'PN-002'), 'NOR-80', 'Tramo Calle 80', 'ON_STREET', 'ACTIVE', 36, 8, 'Ocupación agregada.', null, null, null, 0, 0, 'Calle 80', 'Carrera 12', 'Carrera 15', 'Zona Norte', 'Tramo operacional señalizado.')
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
  street = excluded.street,
  from_reference = excluded.from_reference,
  to_reference = excluded.to_reference,
  district = excluded.district,
  segment_description = excluded.segment_description;
