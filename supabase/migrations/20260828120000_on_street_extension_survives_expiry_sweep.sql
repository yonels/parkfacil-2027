-- Cierre del flujo de extensión de tiempo QR On-Street (auditoría
-- 2026-08-28): una EXTENSION iniciada válidamente mientras la sesión
-- estaba ACTIVE podía perder el pago ya autorizado por Transbank si,
-- durante el checkout en Webpay, el barrido automático de expiración
-- (expire_on_street_pilot_sessions -- invocado por el cron de
-- reconciliación cada 2 minutos, por refresh_on_street_pilot_session al
-- visitar /estacionar/sesion/{token}, o por listParkingPilotSessions al
-- abrir el panel admin) alcanzaba a marcar status='EXPIRED' ANTES de que
-- finalize_authorized_on_street_payment corriera. La condición
-- "s.status<>'ACTIVE'" rechazaba entonces el pago ya autorizado con
-- PILOT_SESSION_NOT_ACTIVE, dejando la transacción varada en COMMITTING
-- (dinero capturado por Transbank, minutos nunca aplicados) de forma
-- permanente -- ni el callback directo ni el reconciliador podían
-- recuperarla, porque ambos llaman a la misma función.
--
-- Evidencia de que la extensión partió válida: createExtensionPaymentIntent
-- (onStreetPaymentService.js) exige status='ACTIVE' de la sesión objetivo
-- en el momento de crear el intent (409 en caso contrario) -- por
-- construcción, cualquier fila on_street_payment_intents con
-- operation_type='EXTENSION' es prueba de que la sesión estaba ACTIVE
-- cuando se creó. No se agrega ninguna columna nueva para esto (ver §10
-- del brief: la evidencia ya persistida es suficiente, no sobrearquitecturar).
--
-- Regla de negocio aprobada: si esa evidencia existe (el intent EXTENSION
-- existe) y Transbank autoriza el pago, los minutos se aplican aunque la
-- sesión haya sido barrida a 'EXPIRED' mientras tanto -- 'EXPIRED' es un
-- estado puramente derivado del tiempo, nunca una decisión humana. Se
-- diferencia explícitamente de 'CLOSED' (close_on_street_pilot_session,
-- decisión explícita del conductor de terminar su estadía antes): una
-- sesión CLOSED nunca se reabre con una extensión, sigue rechazándose con
-- PILOT_SESSION_NOT_ACTIVE exactamente igual que antes.
--
-- La fórmula del nuevo expires_at NO cambia (ya era correcta):
-- greatest(s.expires_at, v_now) + minutos -- si la sesión seguía vigente,
-- suma sobre su vencimiento real; si ya había vencido (venció durante el
-- checkout), cuenta desde el momento de autorización, nunca crea un
-- vencimiento retroactivo ni resta minutos ya pagados.
--
-- Al aplicarse, la sesión vuelve explícitamente a status='ACTIVE' (el
-- nuevo expires_at siempre queda en el futuro respecto de v_now, así que
-- "resucitarla" es coherente). Esto puede chocar con
-- on_street_one_active_phone_location_idx (una sesión ACTIVE por
-- qr_location_id+phone_normalized) en el caso residual, raro, en que el
-- conductor haya abandonado el pago y contratado una sesión nueva en el
-- mismo punto/teléfono mientras la extensión seguía varada en Webpay -- en
-- ese caso el UPDATE falla con unique_violation (23505) y la función entera
-- se revierte (la transacción queda COMMITTING, igual que cualquier otro
-- rechazo de esta función); es un conflicto real entre dos sesiones
-- legítimas, no algo que este cambio deba resolver de forma implícita.
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
    -- Único cambio funcional de esta migración respecto de la versión
    -- anterior: 'EXPIRED' se acepta además de 'ACTIVE' (ver justificación
    -- arriba). 'CLOSED' sigue rechazado, igual que cualquier otro valor.
    if not found or s.status not in ('ACTIVE','EXPIRED') then raise exception 'PILOT_SESSION_NOT_ACTIVE' using errcode='23514'; end if;
    if i.license_plate_normalized is distinct from s.license_plate_normalized or i.phone_normalized is distinct from s.phone_normalized then raise exception 'PILOT_SESSION_IDENTITY_MISMATCH' using errcode='23514'; end if;
    v_previous:=s.expires_at; v_new:=greatest(s.expires_at,v_now)+i.purchased_minutes*interval '1 minute';
    insert into public.on_street_pilot_extensions(session_id,additional_minutes,rate_id,rate_per_minute,simulated_amount,previous_expires_at,new_expires_at,origin,payment_transaction_id)
    values(s.id,i.purchased_minutes,i.rate_id,i.rate_per_minute,i.amount,v_previous,v_new,'WEBPAY',t.id);
    update public.on_street_pilot_sessions set status='ACTIVE',purchased_minutes=purchased_minutes+i.purchased_minutes,simulated_amount=simulated_amount+i.amount,amount_paid=coalesce(amount_paid,simulated_amount)+i.amount,expires_at=v_new,updated_at=v_now where id=s.id returning * into s;
  end if;
  update public.payment_transactions set status='COMMITTED',provider_status=left(p_provider_status,40),authorization_code=left(p_authorization_code,64),response_code=p_response_code,payment_method='CARD',payment_type=p_payment_type,provider_payment_type_code=left(p_provider_payment_type_code,8),sanitized_provider_response=p_provider_response,committed_at=v_now,updated_at=v_now where id=t.id;
  update public.on_street_payment_intents set status='PAID',paid_at=v_now,resulting_session_id=s.id,updated_at=v_now where id=i.id;
  return jsonb_build_object('transactionId',t.id,'sessionId',s.id,'sessionToken',s.public_token,'result','COMMITTED');
end $$;

revoke all on function public.finalize_authorized_on_street_payment(uuid,text,text,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finalize_authorized_on_street_payment(uuid,text,text,integer,jsonb,text,text) to service_role;
