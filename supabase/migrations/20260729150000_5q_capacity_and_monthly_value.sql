-- Datos comerciales y capacidad confirmados para Inmobiliaria 5Q.
update public.company_contracts
set monthly_value=2.5,
    monthly_value_source='Valor contractual confirmado por el cliente el 29-07-2026',
    currency='UF',
    tax_label='+ IVA',
    updated_at=now()
where company_id='emp-5q' and contract_number='ADH-5Q-2026-07-09';

update public.parkings
set description='Estacionamiento Off Street de 300 plazas asociado al contrato de adhesión de Inmobiliaria 5Q.',
    notes='Capacidad y valor mensual confirmados. Accesos, salidas y horario deben configurarse antes de activar.',
    off_street_configuration_status='ACTIVE',
    updated_at=now()
where code='5Q-001';

insert into public.parking_levels (
  id, parking_id, code, name, status, description, notes, declared_capacity
) values (
  '51000000-0000-4000-8000-000000000005',
  (select id from public.parkings where code='5Q-001'),
  'NIV-001',
  'Nivel general',
  'ACTIVE',
  'Nivel inicial definido para el estacionamiento de Inmobiliaria 5Q.',
  'La distribución interna puede subdividirse posteriormente.',
  300
) on conflict (parking_id,code) do update set
  name=excluded.name,
  status=excluded.status,
  description=excluded.description,
  notes=excluded.notes,
  declared_capacity=excluded.declared_capacity,
  updated_at=now();

insert into public.parking_zones (
  id, parking_id, level_id, code, name, status, capacity, occupied, description, notes
) values (
  '52000000-0000-4000-8000-000000000005',
  (select id from public.parkings where code='5Q-001'),
  (select id from public.parking_levels where parking_id=(select id from public.parkings where code='5Q-001') and code='NIV-001'),
  'ZON-001',
  'Zona general',
  'ACTIVE',
  300,
  0,
  'Zona inicial que representa la capacidad contractual total.',
  'Puede subdividirse en zonas operativas conservando una capacidad total de 300 plazas.'
) on conflict (level_id,code) do update set
  name=excluded.name,
  status=excluded.status,
  capacity=excluded.capacity,
  occupied=least(parking_zones.occupied,excluded.capacity),
  description=excluded.description,
  notes=excluded.notes,
  updated_at=now();

grant delete on public.parking_levels, public.parking_zones to service_role;
