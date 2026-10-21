-- Piloto On Street QR: reactivación del camino gratuito (sin cobro).
-- No toca ni reemplaza el flujo prepago/Webpay existente (create_on_street_pilot_session
-- con 4 argumentos, on_street_payment_intents, payment_transactions): ambos coexisten.
-- Esta función crea una sesión ACTIVE sin purchased_minutes, sin rate_id, sin
-- rate_per_minute, sin simulated_amount y sin expires_at (todas esas columnas ya son
-- nullable desde las migraciones anteriores). Una sesión sin expires_at nunca es
-- marcada EXPIRED automáticamente por refresh_on_street_pilot_session/
-- expire_on_street_pilot_sessions (la comparación "expires_at <= now()" con NULL no
-- es verdadera en SQL), y el trigger de avisos SMS exige expires_at is not null antes
-- de programar nada, así que esta sesión tampoco agenda avisos.
create or replace function public.create_on_street_pilot_session_free(p_qr_code text,p_phone text,p_client_hash text)
returns public.on_street_pilot_sessions language plpgsql security definer set search_path=public as $$
declare v_location public.on_street_qr_locations%rowtype; v_session public.on_street_pilot_sessions%rowtype;
begin
  if p_phone !~ '^\+569[0-9]{8}$' or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'PILOT_INPUT_INVALID' using errcode='23514'; end if;
  select q.* into v_location from public.on_street_qr_locations q
  join public.parkings p on p.id=q.parking_id and p.type='ON_STREET' and p.status='ACTIVE'
  join public.parking_street_segments g on g.id=q.segment_id and g.status='ACTIVE'
  where q.public_code=p_qr_code and q.status='ACTIVE';
  if not found then raise exception 'QR_LOCATION_NOT_FOUND' using errcode='P0002'; end if;
  if (select count(*) from public.on_street_pilot_attempts where qr_location_id=v_location.id and client_hash=p_client_hash and attempted_at>clock_timestamp()-interval '1 minute') >= 5
    then raise exception 'PILOT_RATE_LIMITED' using errcode='P0001'; end if;
  insert into public.on_street_pilot_attempts(qr_location_id,client_hash) values(v_location.id,p_client_hash);
  select * into v_session from public.on_street_pilot_sessions where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE';
  if found then return v_session; end if;
  begin
    insert into public.on_street_pilot_sessions(qr_location_id,parking_id,phone_normalized)
    values(v_location.id,v_location.parking_id,p_phone) returning * into v_session;
  exception when unique_violation then
    select * into v_session from public.on_street_pilot_sessions where qr_location_id=v_location.id and phone_normalized=p_phone and status='ACTIVE';
  end;
  return v_session;
end $$;

revoke all on function public.create_on_street_pilot_session_free(text,text,text) from public,anon,authenticated;
grant execute on function public.create_on_street_pilot_session_free(text,text,text) to service_role;
