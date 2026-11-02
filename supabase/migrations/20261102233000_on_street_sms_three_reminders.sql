-- SOL-2026-11-02-004: avisos On Street a 15, 10 y 5 minutos del vencimiento, y
-- aviso al vencer.
-- Aditiva sobre el outbox existente. Solo programa filas; el envío sigue
-- dependiendo de /api/internal/on-street-sms/process.
alter table public.on_street_pilot_notifications
  add column if not exists reminder_minutes smallint not null default 0;

alter table public.on_street_pilot_notifications
  drop constraint if exists on_street_pilot_notifications_reminder_minutes_check,
  add constraint on_street_pilot_notifications_reminder_minutes_check
    check (reminder_minutes in (0, 5, 10, 15));

comment on column public.on_street_pilot_notifications.reminder_minutes is
  'Minutos antes del vencimiento en que se envía este aviso; 0 si el aviso no es previo al vencimiento.';

-- Los avisos previos ya existentes corresponden al aviso único de 15 minutos.
update public.on_street_pilot_notifications
set reminder_minutes = 15
where type = 'EXPIRING_SOON' and reminder_minutes = 0;

-- Un ciclo de vencimiento ahora admite un aviso por cada anticipación.
drop index if exists public.on_street_pilot_notifications_pending_unique;
create unique index on_street_pilot_notifications_pending_unique
  on public.on_street_pilot_notifications(session_id, type, reminder_minutes)
  where status = 'PENDING';

drop index if exists public.on_street_pilot_notifications_cycle_uidx;
create unique index on_street_pilot_notifications_cycle_uidx
  on public.on_street_pilot_notifications(session_id, type, target_expires_at, reminder_minutes);

-- Solo se programan los avisos que aún no han pasado: una sesión de 12 minutos
-- recibe los de 10 y 5, y nunca salen varios juntos al pagar.
create or replace function public.schedule_on_street_pilot_notifications() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_path text;
  v_minutes integer;
begin
  -- Al vencer se cancelan los avisos previos, pero no el aviso de vencimiento:
  -- la sesión puede pasar a EXPIRED antes de que ese aviso alcance a enviarse.
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
    foreach v_minutes in array array[15,10,5] loop
      if new.expires_at-make_interval(mins => v_minutes) > clock_timestamp() then
        insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,target_expires_at,reminder_minutes,message)
        values (new.id,new.parking_id,new.qr_location_id,'EXPIRING_SOON',new.phone_normalized,
          new.expires_at-make_interval(mins => v_minutes),new.expires_at,v_minutes,
          'ParkFacil: tu estacionamiento vence en '||v_minutes||' minutos. Extiende tu tiempo aqui: '||v_path)
        on conflict (session_id,type,target_expires_at,reminder_minutes) do nothing;
      end if;
    end loop;
    insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,target_expires_at,reminder_minutes,message)
    values (new.id,new.parking_id,new.qr_location_id,'EXPIRED',new.phone_normalized,new.expires_at,new.expires_at,0,
      'ParkFacil: tu tiempo termino. Paga de nuevo o retira tu vehiculo: '||v_path)
    on conflict (session_id,type,target_expires_at,reminder_minutes) do nothing;
  end if;
  return new;
end $$;

-- Pagar de nuevo tras vencer: nada garantiza que la sesión anterior ya esté
-- marcada EXPIRED, y seguiría ocupando on_street_one_active_phone_location_idx.
-- Se vence aquí para que el pago ya autorizado por Transbank pueda crear la sesión.
create or replace function public.expire_previous_on_street_pilot_session() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='ACTIVE' then
    update public.on_street_pilot_sessions set status='EXPIRED',updated_at=clock_timestamp()
      where qr_location_id=new.qr_location_id and phone_normalized=new.phone_normalized
        and status='ACTIVE' and expires_at<=clock_timestamp();
  end if;
  return new;
end $$;

drop trigger if exists trg_expire_previous_on_street_pilot_session on public.on_street_pilot_sessions;
create trigger trg_expire_previous_on_street_pilot_session
  before insert on public.on_street_pilot_sessions
  for each row execute function public.expire_previous_on_street_pilot_session();
