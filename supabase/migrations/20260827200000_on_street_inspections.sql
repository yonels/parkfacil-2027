-- ParkFacil Inspectores — Etapa 2: registro real de fiscalización.
--
-- Cubre §13/§14 del encargo de Etapa 2: una fiscalización queda vinculada a
-- patente + sesión (si existe) + inspector + ubicación + fecha/hora, y deja
-- la patente identificable como OBSERVADA en consultas futuras.
--
-- Idempotencia (§12, requisito crítico): dos garantías independientes a
-- nivel de base de datos, ninguna depende del frontend --
--   1) idempotency_key único: un doble click/reintento con la MISMA clave
--      nunca crea una segunda fila.
--   2) índice único parcial sobre session_id para fiscalizaciones OVERSTAY:
--      la MISMA sesión vencida nunca puede fiscalizarse dos veces, incluso
--      si llegaran dos idempotency_key distintas.
-- register_on_street_inspection() aplica ambas antes de insertar, y vuelve
-- a capturar unique_violation como red de seguridad ante una carrera real
-- (mismo patrón que create_on_street_payment_transaction).
create table if not exists public.on_street_inspections (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  license_plate_normalized text not null check (license_plate_normalized ~ '^[A-Z0-9]{4,8}$'),
  session_id uuid null references public.on_street_pilot_sessions(id) on delete restrict,
  qr_location_id uuid null references public.on_street_qr_locations(id) on delete restrict,
  parking_id uuid null references public.parkings(id) on delete restrict,
  inspector_user_id uuid not null references auth.users(id) on delete restrict,
  inspection_type text not null check (inspection_type in ('OVERSTAY','NO_SESSION','OTHER')),
  vehicle_still_present boolean not null default true,
  observations text null check (observations is null or length(observations) <= 2000),
  latitude double precision null check (latitude is null or (latitude >= -90 and latitude <= 90)),
  longitude double precision null check (longitude is null or (longitude >= -180 and longitude <= 180)),
  phone_normalized text null check (phone_normalized is null or phone_normalized ~ '^\+569[0-9]{8}$'),
  inspected_at timestamptz not null default clock_timestamp(),
  -- SMS (§10/§12): NOT_REQUIRED para NO_SESSION/OTHER y para OVERSTAY con
  -- vehicle_still_present=false (nunca se multa una patente que ya no está).
  sms_required boolean not null default false,
  sms_status text not null default 'NOT_REQUIRED' check (sms_status in ('NOT_REQUIRED','PENDING','SENDING','SENT','FAILED')),
  sms_sent_at timestamptz null,
  sms_provider_message_id text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (sms_required = false or inspection_type = 'OVERSTAY'),
  check (session_id is not null or inspection_type <> 'OVERSTAY')
);

-- Una sesión vencida nunca se fiscaliza (ni se le envía SMS) dos veces.
create unique index if not exists on_street_inspections_session_overstay_uidx
  on public.on_street_inspections(session_id) where inspection_type = 'OVERSTAY' and session_id is not null;

-- Consulta global del Inspector: por patente, sin parking_id (§3.1) —
-- último evento primero.
create index if not exists on_street_inspections_plate_idx
  on public.on_street_inspections(license_plate_normalized, inspected_at desc);
-- Historial real de un inspector (§15): sus propias fiscalizaciones.
create index if not exists on_street_inspections_inspector_idx
  on public.on_street_inspections(inspector_user_id, inspected_at desc);

alter table public.on_street_inspections enable row level security;
-- Mismo criterio que el resto de tablas operacionales On-Street (sesiones,
-- intentos de pago, transacciones): sin acceso directo de anon/authenticated
-- -- toda lectura/escritura pasa por el service role desde rutas server-side
-- que ya validan sesión + rol antes de tocar la tabla.
revoke all on public.on_street_inspections from anon, authenticated;
grant select, insert, update on public.on_street_inspections to service_role;

-- RPC de registro idempotente. security definer + search_path fijo, mismo
-- patrón que create_on_street_payment_transaction/finalize_authorized_on_street_payment.
-- No envía el SMS (eso ocurre en la aplicación, vía el proveedor SMS ya
-- existente): esta función solo garantiza que el REGISTRO -- y por lo tanto
-- la decisión de "hay que enviar SMS" -- ocurra exactamente una vez.
create or replace function public.register_on_street_inspection(
  p_idempotency_key text,
  p_license_plate text,
  p_session_id uuid,
  p_qr_location_id uuid,
  p_parking_id uuid,
  p_inspector_user_id uuid,
  p_inspection_type text,
  p_vehicle_still_present boolean,
  p_observations text,
  p_latitude double precision,
  p_longitude double precision,
  p_phone_normalized text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inspection public.on_street_inspections%rowtype; v_reused boolean := false; v_sms_required boolean;
begin
  if p_license_plate !~ '^[A-Z0-9]{4,8}$' then raise exception 'INSPECTION_PLATE_INVALID' using errcode = '23514'; end if;
  if length(coalesce(p_idempotency_key, '')) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '23514'; end if;
  if p_inspection_type not in ('OVERSTAY','NO_SESSION','OTHER') then raise exception 'INSPECTION_TYPE_INVALID' using errcode = '23514'; end if;
  if p_inspection_type = 'OVERSTAY' and p_session_id is null then raise exception 'INSPECTION_SESSION_REQUIRED' using errcode = '23514'; end if;

  select * into v_inspection from public.on_street_inspections where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_inspection.id, 'reused', true, 'smsRequired', v_inspection.sms_required, 'smsStatus', v_inspection.sms_status, 'inspectedAt', v_inspection.inspected_at);
  end if;

  if p_inspection_type = 'OVERSTAY' then
    select * into v_inspection from public.on_street_inspections where session_id = p_session_id and inspection_type = 'OVERSTAY';
    if found then
      return jsonb_build_object('id', v_inspection.id, 'reused', true, 'smsRequired', v_inspection.sms_required, 'smsStatus', v_inspection.sms_status, 'inspectedAt', v_inspection.inspected_at);
    end if;
  end if;

  v_sms_required := (p_inspection_type = 'OVERSTAY' and p_vehicle_still_present);

  begin
    insert into public.on_street_inspections(
      idempotency_key, license_plate_normalized, session_id, qr_location_id, parking_id, inspector_user_id,
      inspection_type, vehicle_still_present, observations, latitude, longitude, phone_normalized,
      sms_required, sms_status
    ) values (
      p_idempotency_key, p_license_plate, p_session_id, p_qr_location_id, p_parking_id, p_inspector_user_id,
      p_inspection_type, p_vehicle_still_present, p_observations, p_latitude, p_longitude, p_phone_normalized,
      v_sms_required, case when v_sms_required then 'PENDING' else 'NOT_REQUIRED' end
    ) returning * into v_inspection;
  exception when unique_violation then
    select * into v_inspection from public.on_street_inspections where idempotency_key = p_idempotency_key;
    if not found and p_inspection_type = 'OVERSTAY' then
      select * into v_inspection from public.on_street_inspections where session_id = p_session_id and inspection_type = 'OVERSTAY';
    end if;
    if not found then raise; end if;
    v_reused := true;
  end;

  return jsonb_build_object('id', v_inspection.id, 'reused', v_reused, 'smsRequired', v_inspection.sms_required, 'smsStatus', v_inspection.sms_status, 'inspectedAt', v_inspection.inspected_at);
end $$;

revoke all on function public.register_on_street_inspection(text,text,uuid,uuid,uuid,uuid,text,boolean,text,double precision,double precision,text) from public, anon, authenticated;
grant execute on function public.register_on_street_inspection(text,text,uuid,uuid,uuid,uuid,text,boolean,text,double precision,double precision,text) to service_role;

-- Búsqueda global de sesión por patente (§3.1: sin parking_id). El índice
-- existente on_street_pilot_sessions_plate_idx queda encabezado por
-- parking_id (sirve al panel administrativo por estacionamiento) y por eso
-- no sirve para esta consulta global -- se agrega uno nuevo, sin tocar el
-- anterior ni ningún caller existente.
create index if not exists on_street_pilot_sessions_global_plate_idx
  on public.on_street_pilot_sessions(license_plate_normalized, status, started_at desc)
  where license_plate_normalized is not null;
