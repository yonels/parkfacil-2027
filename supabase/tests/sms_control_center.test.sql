-- Ejecutar dentro de BEGIN/ROLLBACK, después de 20261029212053_sms_control_center.sql, solo en base local.
do $$
declare
  r jsonb;
  r2 jsonb;
  m uuid;
  child uuid;
  n integer;
  legacy_before integer;
  legacy_view integer;
begin
  -- Nada expuesto al navegador.
  if has_table_privilege('authenticated', 'public.sms_messages', 'select')
    or has_table_privilege('anon', 'public.sms_history_v', 'select')
    or has_function_privilege('authenticated', 'public.sms_enqueue_message(jsonb)', 'execute') then
    raise exception 'objetos expuestos';
  end if;

  -- Encolar + idempotencia.
  r := public.sms_enqueue_message(jsonb_build_object('module','DIAGNOSTIC','message_type','TEST','phone_normalized','+56911112222',
    'body','Prueba','idempotency_key','test-key-0001','provider','SIMULATED','is_simulated',true));
  if (r->>'reused')::boolean or r->'message'->>'status' <> 'QUEUED' then raise exception 'encolado: %', r; end if;
  m := (r->'message'->>'id')::uuid;
  if (r->'message'->>'root_message_id')::uuid <> m then raise exception 'root_message_id debe ser el propio id'; end if;
  r2 := public.sms_enqueue_message(jsonb_build_object('module','DIAGNOSTIC','message_type','TEST','phone_normalized','+56911112222',
    'body','Prueba','idempotency_key','test-key-0001'));
  if not (r2->>'reused')::boolean or (r2->'message'->>'id')::uuid <> m then raise exception 'idempotencia: %', r2; end if;
  select count(*) into n from public.sms_messages where idempotency_key = 'test-key-0001';
  if n <> 1 then raise exception 'duplicado creado'; end if;

  -- Reclamo único (SKIP LOCKED + estado).
  select count(*) into n from public.sms_claim_due(10) c where c.id = m;
  if n <> 1 then raise exception 'reclamo inicial'; end if;
  select count(*) into n from public.sms_claim_due(10) c where c.id = m;
  if n <> 0 then raise exception 'reclamo repetido'; end if;

  -- Transición condicional y columnas no permitidas ignoradas.
  r := public.sms_transition(m, array['SENDING'], 'ACCEPTED',
    jsonb_build_object('provider_message_id','prov-1','attempts',1,'accepted_at',clock_timestamp(),'body','HACK','company_id','otra-empresa'),
    jsonb_build_object('source','SEND','dedupe_key','send:1','provider_code','0'));
  if r->'message'->>'status' <> 'ACCEPTED' or r->'message'->>'body' <> 'Prueba' or r->'message'->>'company_id' is not null then raise exception 'transicion: %', r; end if;
  r := public.sms_transition(m, array['SENDING'], 'FAILED', '{}'::jsonb, '{"dedupe_key":"x"}'::jsonb);
  if r->>'error' <> 'STATUS_CONFLICT' then raise exception 'conflicto esperado: %', r; end if;

  -- DLR duplicado: el evento se registra una sola vez.
  r := public.sms_transition(m, array['ACCEPTED','PENDING_CONFIRMATION'], 'DELIVERED', jsonb_build_object('delivered_at',clock_timestamp()),
    jsonb_build_object('source','DLR_POLL','dedupe_key','dlr:prov-1:DELIVRD'));
  if not (r->>'event_recorded')::boolean then raise exception 'primer DLR'; end if;
  r := public.sms_transition(m, array['DELIVERED'], 'DELIVERED', '{}'::jsonb, jsonb_build_object('source','DLR_POLL','dedupe_key','dlr:prov-1:DELIVRD'));
  if (r->>'event_recorded')::boolean then raise exception 'DLR duplicado registrado'; end if;
  select count(*) into n from public.sms_message_events where message_id = m;
  if n <> 4 then raise exception 'eventos esperados 4 (QUEUED,SENDING,ACCEPTED,DELIVERED), hay %', n; end if;

  -- Reenvío: hijo con la misma raíz.
  r := public.sms_enqueue_message(jsonb_build_object('module','DIAGNOSTIC','message_type','TEST','phone_normalized','+56911112222',
    'body','Prueba','idempotency_key','test-key-0002','parent_message_id',m,'skip_rate_limits',true));
  child := (r->'message'->>'id')::uuid;
  if (r->'message'->>'root_message_id')::uuid <> m then raise exception 'raiz del reenvio'; end if;

  -- Límite por teléfono (5/hora por defecto; ya hay 2).
  for i in 3..5 loop
    r := public.sms_enqueue_message(jsonb_build_object('module','ADMIN','message_type','T','phone_normalized','+56911112222','body','x','idempotency_key','test-limit-' || i));
    if r ? 'error' then raise exception 'limite prematuro en %', i; end if;
  end loop;
  r := public.sms_enqueue_message(jsonb_build_object('module','ADMIN','message_type','T','phone_normalized','+56911112222','body','x','idempotency_key','test-limit-6'));
  if r->>'error' <> 'RATE_LIMITED' or r->>'scope' <> 'PHONE' then raise exception 'limite por telefono: %', r; end if;

  -- Validaciones de datos.
  begin
    perform public.sms_enqueue_message(jsonb_build_object('module','ADMIN','message_type','T','phone_normalized','+5691234','body','x','idempotency_key','test-bad-phone'));
    raise exception 'telefono invalido aceptado';
  exception when check_violation then null; end;

  -- Vista: incluye cada registro heredado exactamente una vez.
  select (select count(*) from public.on_street_pilot_notifications)
       + (select count(*) from public.on_street_inspections where sms_status <> 'NOT_REQUIRED')
       + (select count(*) from public.on_street_inspections where inspector_copy_sms_status in ('SENT','FAILED')) into legacy_before;
  select count(*) into legacy_view from public.sms_history_v where source <> 'CENTRAL';
  if legacy_before <> legacy_view then raise exception 'vista heredada % vs %', legacy_view, legacy_before; end if;
  select count(*) into n from (select source, source_id from public.sms_history_v group by 1,2 having count(*) > 1) d;
  if n <> 0 then raise exception 'filas duplicadas en la vista'; end if;
  select count(*) into n from public.sms_history_v where status not in ('CREATED','QUEUED','SENDING','ACCEPTED','PENDING_CONFIRMATION','DELIVERED','REJECTED','FAILED','EXPIRED','CANCELLED','UNKNOWN');
  if n <> 0 then raise exception 'estado no normalizado en la vista'; end if;

  -- Retención: anonimiza sin borrar.
  update public.sms_messages set created_at = clock_timestamp() - interval '400 days' where id = child;
  r := public.sms_apply_retention(null);
  if (r->>'messages_redacted')::integer < 1 then raise exception 'retencion: %', r; end if;
  if exists (select 1 from public.sms_messages where id = child and (phone_normalized is not null or body is not null or phone_last4 is null)) then raise exception 'retencion no anonimizo'; end if;

  -- Resumen: aceptado y entregado se cuentan por separado; simulados fuera por defecto.
  r := public.sms_dashboard_summary('{"include_simulated":true}'::jsonb);
  if (r->'kpis'->>'accepted')::int < (r->'kpis'->>'delivered')::int then raise exception 'aceptados < entregados'; end if;
  r2 := public.sms_dashboard_summary('{}'::jsonb);
  if (r2->>'simulated')::int <> (select count(*) from public.sms_history_v where is_simulated and created_at >= '-infinity') then raise exception 'conteo de simulados excluidos'; end if;
  if exists (select 1 from public.sms_history_filtered('{}'::jsonb) where is_simulated) then raise exception 'filtro por defecto incluye simulados'; end if;

  -- Fallos: cada SMS en una sola categoría.
  r := public.sms_failure_summary('{"include_simulated":true}'::jsonb);
  select coalesce(sum(value::int), 0) into n from jsonb_each_text(r->'by_category');
  if n <> (r->>'total')::int then raise exception 'categorias de fallo no suman el total: %', r; end if;

  -- Consumo: sin tarifa => costo null; con tarifa general vigente => costo = conteo * valor.
  r := public.sms_consumption('{}'::jsonb);
  if (r->>'priced')::int <> 0 and not exists (select 1 from public.sms_tariffs where archived_at is null) then raise exception 'costo sin tarifa'; end if;
  insert into public.sms_tariffs (valid_from, unit_price, currency) values ('2000-01-01', 10, 'CLP');
  r := public.sms_consumption('{}'::jsonb);
  if (r->>'priced')::int <> (r->>'total')::int or coalesce((r->'cost_by_currency'->>'CLP')::numeric, 0) <> (r->>'total')::int * 10 then raise exception 'costo con tarifa: %', r; end if;
  begin
    insert into public.sms_tariffs (valid_from, unit_price, source) values ('2000-01-01', 1, 'PROVIDER');
    raise exception 'tarifa no interna aceptada';
  exception when check_violation then null; end;

  raise notice 'sms_control_center: OK';
end $$;
