-- SOL-2026-11-12-004 («Consulte su boleta»): la consulta pública por patente
-- busca en TODA la tabla parking_stays (todas las empresas, estacionamientos
-- y ciudades viven en una sola base -- ver respuesta al usuario en el
-- registro de la solicitud), sin filtrar por parking_id. Los índices
-- existentes (parking_stays_one_open_plate_idx, parking_stays_open_idx) están
-- pensados para "una patente abierta en ESTE estacionamiento", no para esta
-- búsqueda global. Sin este índice, cada consulta recorre toda la tabla.
--
-- Se incluye status porque la consulta pública solo mira status = 'PAID'
-- (nunca OPEN ni CANCELLED), y se ordena por exit_at (más reciente primero),
-- igual que el resto de reportes por patente del proyecto.
create index if not exists parking_stays_license_plate_paid_idx
  on public.parking_stays (license_plate, exit_at desc)
  where status = 'PAID';
