-- Inmobiliaria 5Q: configuración confirmada Off Street de un solo nivel.
update public.parkings
set type='OFF_STREET',
    description='Estacionamiento Off Street de un solo nivel y 300 plazas.',
    notes='Configuración confirmada: un nivel. Accesos, salidas y horario deben completarse antes de activar.',
    off_street_configuration_status='ACTIVE',
    on_street_configuration_status='EMPTY',
    updated_at=now()
where code='5Q-001';

update public.parking_levels
set name='Nivel único',
    description='Único nivel del estacionamiento Off Street de Inmobiliaria 5Q.',
    notes='Capacidad total declarada: 300 plazas.',
    declared_capacity=300,
    status='ACTIVE',
    updated_at=now()
where parking_id=(select id from public.parkings where code='5Q-001')
  and code='NIV-001';

update public.parking_zones
set name='Zona general',
    description='Zona general del nivel único con capacidad para 300 plazas.',
    notes='Toda la capacidad del estacionamiento pertenece a este único nivel.',
    capacity=300,
    status='ACTIVE',
    updated_at=now()
where parking_id=(select id from public.parkings where code='5Q-001')
  and code='ZON-001';
