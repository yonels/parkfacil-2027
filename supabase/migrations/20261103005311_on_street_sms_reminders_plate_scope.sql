-- SOL-2026-11-02-004: aviso On Street a 15 minutos del vencimiento y aviso al
-- vencer. Una sesión activa por patente y QR, en vez de por móvil y QR.
-- Solo programa filas; el envío sigue dependiendo de
-- /api/internal/on-street-sms/process.

-- Solo se programa el aviso previo si aún no ha pasado: una sesión de 12 minutos
-- recibe únicamente el aviso al vencer.
create or replace function public.schedule_on_street_pilot_notifications() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_path text;
begin
  -- Al vencer se cancela el aviso previo, pero no el aviso de vencimiento: la
  -- sesión puede pasar a EXPIRED antes de que ese aviso alcance a enviarse.
  if tg_op='UPDATE' and new.status in ('CLOSED','EXPIRED') and old.status is distinct from new.status then
    update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp()
      where session_id=new.id and status='PENDING' and (new.status='CLOSED' or type<>'EXPIRED');
    return new;
  end if;
  if new.status='ACTIVE' and new.expires_at is not null and (tg_op='INSERT' or old.expires_at is distinct from new.expires_at) then
    if tg_op='UPDATE' then
      update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp()
        where session_id=new.id and status='PENDING';
    end if;
    v_path:='/estacionar/sesion/'||new.public_token::text;
    if new.expires_at-interval '15 minutes' > clock_timestamp() then
      insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,target_expires_at,message)
      values (new.id,new.parking_id,new.qr_location_id,'EXPIRING_SOON',new.phone_normalized,
        new.expires_at-interval '15 minutes',new.expires_at,
        'ParkFacil: tu estacionamiento vence en 15 minutos. Extiende tu tiempo aqui: '||v_path)
      on conflict (session_id,type,target_expires_at) do nothing;
    end if;
    insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,target_expires_at,message)
    values (new.id,new.parking_id,new.qr_location_id,'EXPIRED',new.phone_normalized,new.expires_at,new.expires_at,
      'ParkFacil: tu tiempo termino. Paga o retira tu vehiculo: '||v_path)
    on conflict (session_id,type,target_expires_at) do nothing;
  end if;
  return new;
end $$;

-- Lo que se estaciona y se fiscaliza es el vehículo: un mismo móvil puede pagar
-- por varias patentes en un QR. Las sesiones antiguas sin patente no compiten.
drop index if exists public.on_street_one_active_phone_location_idx;
create unique index on_street_one_active_plate_location_idx
  on public.on_street_pilot_sessions(qr_location_id, license_plate_normalized)
  where status = 'ACTIVE' and license_plate_normalized is not null;

-- Pagar de nuevo tras vencer: nada garantiza que la sesión anterior ya esté
-- marcada EXPIRED, y seguiría ocupando el índice. Se vence aquí para que el pago
-- ya autorizado por Transbank pueda crear la sesión.
create or replace function public.expire_previous_on_street_pilot_session() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='ACTIVE' and new.license_plate_normalized is not null then
    update public.on_street_pilot_sessions set status='EXPIRED',updated_at=clock_timestamp()
      where qr_location_id=new.qr_location_id and license_plate_normalized=new.license_plate_normalized
        and status='ACTIVE' and expires_at<=clock_timestamp();
  end if;
  return new;
end $$;

drop trigger if exists trg_expire_previous_on_street_pilot_session on public.on_street_pilot_sessions;
create trigger trg_expire_previous_on_street_pilot_session
  before insert on public.on_street_pilot_sessions
  for each row execute function public.expire_previous_on_street_pilot_session();
