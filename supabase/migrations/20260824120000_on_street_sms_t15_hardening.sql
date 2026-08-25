-- Endurecimiento aditivo del outbox SMS On-Street existente.
alter table public.on_street_pilot_notifications
  add column if not exists target_expires_at timestamptz null;

update public.on_street_pilot_notifications
set target_expires_at = case when type='EXPIRING_SOON' then scheduled_at + interval '15 minutes' else scheduled_at end
where target_expires_at is null;

alter table public.on_street_pilot_notifications alter column target_expires_at set not null;

create unique index if not exists on_street_pilot_notifications_cycle_uidx
  on public.on_street_pilot_notifications(session_id,type,target_expires_at);

create or replace function public.schedule_on_street_pilot_notifications() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_path text;
begin
  if tg_op='UPDATE' and new.status in ('CLOSED','EXPIRED') and old.status is distinct from new.status then
    update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp()
      where session_id=new.id and status='PENDING';
    return new;
  end if;
  if new.status='ACTIVE' and new.expires_at is not null and (tg_op='INSERT' or old.expires_at is distinct from new.expires_at) then
    if tg_op='UPDATE' then
      update public.on_street_pilot_notifications set status='CANCELLED',updated_at=clock_timestamp()
        where session_id=new.id and status='PENDING';
    end if;
    v_path:='/estacionar/sesion/'||new.public_token::text;
    insert into public.on_street_pilot_notifications(session_id,parking_id,qr_location_id,type,phone_normalized,scheduled_at,target_expires_at,message)
    values (new.id,new.parking_id,new.qr_location_id,'EXPIRING_SOON',new.phone_normalized,
      new.expires_at-interval '15 minutes',new.expires_at,
      'ParkFacil: tu estacionamiento vence en 15 minutos. Extiende tu tiempo aqui: '||v_path)
    on conflict (session_id,type,target_expires_at) do nothing;
  end if;
  return new;
end $$;
