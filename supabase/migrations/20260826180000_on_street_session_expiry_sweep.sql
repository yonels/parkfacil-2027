-- Expiración real, persistente y automática de sesiones On-Street vencidas.
--
-- Causa raíz confirmada (incidente 2026-08-26, transacción 926c7144-...): la
-- única función que materializa status='ACTIVE' -> 'EXPIRED' en base de
-- datos, expire_on_street_pilot_sessions(p_parking_id), solo se invocaba
-- desde listParkingPilotSessions() -- es decir, únicamente cuando un
-- administrador abre /estacionamientos/{id}/sesiones-qr para ESE
-- estacionamiento puntual. refresh_on_street_pilot_session() tampoco sirve
-- como mecanismo general: solo actúa sobre UNA sesión, y solo cuando
-- alguien visita su enlace público. Sin ninguna de las dos visitas, una
-- sesión vencida podía permanecer 'ACTIVE' indefinidamente, bloqueando para
-- siempre el índice on_street_one_active_phone_location_idx (una sesión
-- ACTIVE por qr_location_id+phone_normalized) -- tanto para nuevas
-- contrataciones normales como para el reconciliador de pagos (ver
-- onStreetPaymentReconcileCore.mjs), que por eso podía recibir 23505 de
-- forma permanente en vez de solo transitoria.
--
-- Esta migración generaliza expire_on_street_pilot_sessions para aceptar
-- p_parking_id NULL como "barrer todos los estacionamientos" -- mismo
-- nombre, mismo comportamiento para todo caller existente (que siempre pasa
-- un parking_id real), simplemente amplía el caso NULL. No se cambia la
-- firma (sigue siendo expire_on_street_pilot_sessions(uuid)): un DEFAULT no
-- crea un overload nuevo, así que los GRANT/REVOKE ya existentes siguen
-- aplicando sin cambios.
--
-- La operación sigue siendo un único UPDATE con WHERE exacto sobre
-- status='ACTIVE' AND expires_at<=clock_timestamp(): idempotente (una
-- segunda ejecución no encuentra más filas que tocar), segura ante
-- ejecuciones concurrentes (una sola sentencia SQL, atómica; dos llamadas
-- simultáneas no pueden hacer que la misma fila termine en un estado
-- incoherente), y estructuralmente incapaz de tocar una sesión todavía
-- vigente (expires_at<=now() es la única condición temporal) o de tocar el
-- índice de sesión única (nunca inserta ni relaja esa restricción).
create or replace function public.expire_on_street_pilot_sessions(p_parking_id uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.on_street_pilot_sessions
    set status='EXPIRED', updated_at=clock_timestamp()
  where status='ACTIVE'
    and expires_at is not null
    and expires_at<=clock_timestamp()
    and (p_parking_id is null or parking_id=p_parking_id);
  get diagnostics n = row_count;
  return n;
end $$;
