-- Avisos SMS simulados del piloto On Street. No contacta proveedores externos.
create table if not exists public.on_street_pilot_notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.on_street_pilot_sessions(id) on delete restrict,
  parking_id uuid not null references public.parkings(id) on delete restrict,
  qr_location_id uuid not null references public.on_street_qr_locations(id) on delete restrict,
  type text not null check (type in ('EXPIRING_SOON','EXPIRED')),
  phone_normalized text not null check (phone_normalized ~ '^\+569[0-9]{8}$'),
  scheduled_at timestamptz not null,
  sent_at timestamptz null,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED','CANCELLED')),
  attempts integer not null default 0 check (attempts >= 0),
  message text not null,
  error_code text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists on_street_pilot_notifications_due_idx on public.on_street_pilot_notifications(status,scheduled_at);
create index if not exists on_street_pilot_notifications_session_idx on public.on_street_pilot_notifications(session_id,scheduled_at);
create unique index if not exists on_street_pilot_notifications_pending_unique on public.on_street_pilot_notifications(session_id,type) where status='PENDING';

create or replace function public.schedule_on_street_pilot_notifications() returns trigger language plpgsql security definer set search_path=public as $$
declare v_street text; v_segment text; v_path text;
begin
  if tg_op='UPDATE' and new.status='CLOSED' and old.status is distinct from new.status then
    update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp() where session_id=new.id and status='PENDING';
    return new;
  end if;
  if tg_op='UPDATE' and new.status='EXPIRED' and old.status is distinct from new.status then
    update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp() where session_id=new.id and type='EXPIRING_SOON' and status='PENDING';
    return new;
  end if;
  if new.status='ACTIVE' and new.expires_at is not null and (tg_op='INSERT' or old.expires_at is distinct from new.expires_at) then
    if tg_op='UPDATE' then update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp() where session_id=new.id and status='PENDING'; end if;
    select s.name,g.name into v_street,v_segment from public.on_street_qr_locations q join public.parking_streets s on s.id=q.street_id join public.parking_street_segments g on g.id=q.segment_id where q.id=new.qr_location_id;
    v_path:='/estacionar/sesion/'||new.public_token::text;
    insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,message) values
      (new.id,new.parking_id,new.qr_location_id,'EXPIRING_SOON',new.phone_normalized,new.expires_at-interval '10 minutes','ParkFacil: tu estacionamiento en '||v_street||' '||v_segment||' vence en 10 minutos. Si necesitas más tiempo, ingresa aquí: '||v_path),
      (new.id,new.parking_id,new.qr_location_id,'EXPIRED',new.phone_normalized,new.expires_at,'ParkFacil: tu tiempo de estacionamiento en '||v_street||' '||v_segment||' ha finalizado. Revisa tu sesión aquí: '||v_path);
  end if;
  return new;
end $$;
drop trigger if exists trg_on_street_pilot_notifications on public.on_street_pilot_sessions;
create trigger trg_on_street_pilot_notifications after insert or update of expires_at,status on public.on_street_pilot_sessions for each row execute function public.schedule_on_street_pilot_notifications();

alter table public.on_street_pilot_notifications enable row level security;
revoke all on public.on_street_pilot_notifications from anon,authenticated;
grant select,insert,update on public.on_street_pilot_notifications to service_role;
revoke all on function public.schedule_on_street_pilot_notifications() from public,anon,authenticated;
grant execute on function public.schedule_on_street_pilot_notifications() to service_role;
