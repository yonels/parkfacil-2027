-- Patente del vehículo en el flujo público QR On-Street.
-- Las columnas permanecen nullable exclusivamente para conservar filas históricas
-- creadas antes de que el formulario capturara patente. Todas las nuevas intenciones
-- públicas la exigen en el servidor y esta función la copia a la sesión resultante.
alter table public.on_street_payment_intents
  add column if not exists license_plate_normalized text null;

alter table public.on_street_pilot_sessions
  add column if not exists license_plate_normalized text null;

alter table public.on_street_payment_intents
  drop constraint if exists on_street_payment_intents_license_plate_check,
  add constraint on_street_payment_intents_license_plate_check
    check (license_plate_normalized is null or license_plate_normalized ~ '^[A-Z0-9]{4,8}$');

alter table public.on_street_pilot_sessions
  drop constraint if exists on_street_pilot_sessions_license_plate_check,
  add constraint on_street_pilot_sessions_license_plate_check
    check (license_plate_normalized is null or license_plate_normalized ~ '^[A-Z0-9]{4,8}$');

create index if not exists on_street_pilot_sessions_plate_idx
  on public.on_street_pilot_sessions(parking_id,license_plate_normalized)
  where license_plate_normalized is not null;

create or replace function public.require_on_street_initial_license_plate() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.operation_type='INITIAL' and new.license_plate_normalized is null then
    raise exception 'ON_STREET_LICENSE_PLATE_REQUIRED' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_require_on_street_initial_license_plate on public.on_street_payment_intents;
create trigger trg_require_on_street_initial_license_plate
before insert on public.on_street_payment_intents
for each row execute function public.require_on_street_initial_license_plate();

create or replace function public.finalize_authorized_on_street_payment(
  p_transaction_id uuid,p_provider_status text,p_authorization_code text,p_response_code integer,p_provider_response jsonb,
  p_payment_type text,p_provider_payment_type_code text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.payment_transactions%rowtype; i public.on_street_payment_intents%rowtype; s public.on_street_pilot_sessions%rowtype; v_now timestamptz:=clock_timestamp(); v_previous timestamptz; v_new timestamptz;
begin
  select * into t from public.payment_transactions where id=p_transaction_id for update;
  if not found then raise exception 'PAYMENT_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;
  select * into i from public.on_street_payment_intents where id=t.source_id for update;
  if t.status='COMMITTED' then return jsonb_build_object('transactionId',t.id,'sessionId',i.resulting_session_id,'result','ALREADY_COMMITTED'); end if;
  if t.status<>'COMMITTING' or p_response_code<>0 or upper(coalesce(p_provider_status,''))<>'AUTHORIZED' then raise exception 'PAYMENT_NOT_AUTHORIZED' using errcode='23514'; end if;
  if p_payment_type not in ('DEBIT','CREDIT') then raise exception 'PAYMENT_TYPE_INVALID' using errcode='23514'; end if;
  if i.status='PAID' then raise exception 'PAYMENT_INTENT_ALREADY_PAID' using errcode='23505'; end if;
  if i.operation_type='INITIAL' then
    insert into public.on_street_pilot_sessions(qr_location_id,parking_id,license_plate_normalized,phone_normalized,status,started_at,purchased_minutes,rate_id,rate_per_minute,simulated_amount,amount_paid,expires_at,payment_transaction_id,operational_number,created_at,updated_at)
    values(i.qr_location_id,i.parking_id,i.license_plate_normalized,i.phone_normalized,'ACTIVE',v_now,i.purchased_minutes,i.rate_id,i.rate_per_minute,i.amount,i.amount,v_now+i.purchased_minutes*interval '1 minute',t.id,'OS-'||to_char(v_now at time zone 'America/Santiago','YYYYMMDD')||'-'||lpad(nextval('public.on_street_session_operational_seq')::text,6,'0'),v_now,v_now)
    returning * into s;
  else
    select * into s from public.on_street_pilot_sessions where id=i.target_session_id for update;
    if not found or s.status<>'ACTIVE' then raise exception 'PILOT_SESSION_NOT_ACTIVE' using errcode='23514'; end if;
    if i.license_plate_normalized is distinct from s.license_plate_normalized or i.phone_normalized is distinct from s.phone_normalized then raise exception 'PILOT_SESSION_IDENTITY_MISMATCH' using errcode='23514'; end if;
    v_previous:=s.expires_at; v_new:=greatest(s.expires_at,v_now)+i.purchased_minutes*interval '1 minute';
    insert into public.on_street_pilot_extensions(session_id,additional_minutes,rate_id,rate_per_minute,simulated_amount,previous_expires_at,new_expires_at,origin,payment_transaction_id)
    values(s.id,i.purchased_minutes,i.rate_id,i.rate_per_minute,i.amount,v_previous,v_new,'WEBPAY',t.id);
    update public.on_street_pilot_sessions set purchased_minutes=purchased_minutes+i.purchased_minutes,simulated_amount=simulated_amount+i.amount,amount_paid=coalesce(amount_paid,simulated_amount)+i.amount,expires_at=v_new,updated_at=v_now where id=s.id returning * into s;
  end if;
  update public.payment_transactions set status='COMMITTED',provider_status=left(p_provider_status,40),authorization_code=left(p_authorization_code,64),response_code=p_response_code,payment_method='CARD',payment_type=p_payment_type,provider_payment_type_code=left(p_provider_payment_type_code,8),sanitized_provider_response=p_provider_response,committed_at=v_now,updated_at=v_now where id=t.id;
  update public.on_street_payment_intents set status='PAID',paid_at=v_now,resulting_session_id=s.id,updated_at=v_now where id=i.id;
  return jsonb_build_object('transactionId',t.id,'sessionId',s.id,'sessionToken',s.public_token,'result','COMMITTED');
end $$;

revoke all on function public.finalize_authorized_on_street_payment(uuid,text,text,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finalize_authorized_on_street_payment(uuid,text,text,integer,jsonb,text,text) to service_role;
revoke all on function public.require_on_street_initial_license_plate() from public,anon,authenticated;
