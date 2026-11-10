-- SOL-2026-11-10-001 (recorrido de Facturación, hallazgo H13): el precio unitario en pesos de las líneas de
-- facturas y notas de crédito/débito se guarda en pesos enteros. Regla del usuario (2026-11-10): «,49 redondea hacia
-- abajo y ,51 redondea hacia arriba»; ,50 sube (round() de PostgreSQL redondea la mitad hacia arriba, como el SII).
-- Antes: round(precio_uf × UF, 2) → p. ej. $61.953,50 con subtotal $61.953. Los subtotales ya eran enteros.
-- Solo cambian esas dos expresiones; el resto de ambas funciones es igual a 20261106163810.
-- Al final: cierre de tareas de emisión abiertas de documentos ya emitidos (H18).

create or replace function public.billing_enqueue_invoice(
  p_preinvoice_id uuid,p_invoice_date date,p_idempotency_key text,p_actor_id uuid,
  p_currency text,p_net numeric,p_tax numeric,p_total numeric,p_amount_uf numeric,
  p_uf_reference_date date,p_uf_value numeric,p_uf_source text,p_converted_amount_clp numeric,
  p_customer_snapshot jsonb,p_provider text default 'mock'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.billing_preinvoices%rowtype; d public.billing_documents%rowtype; j public.billing_document_jobs%rowtype; convert_uf boolean; due_days integer; due date; provider_name text;
begin
  provider_name := coalesce(nullif(trim(p_provider),''),'mock');
  if provider_name not in ('mock','haulmer') then raise exception 'BILLING_PROVIDER_INVALID' using errcode='22023'; end if;
  select * into d from public.billing_documents where idempotency_key=p_idempotency_key;
  if found then select * into j from public.billing_document_jobs where document_id=d.id and operation='ISSUE'; return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',true); end if;
  select * into p from public.billing_preinvoices where id=p_preinvoice_id for update;
  if not found or p.status<>'READY_TO_ISSUE' then raise exception 'PREINVOICE_NOT_READY' using errcode='23514'; end if;
  convert_uf := p.currency='UF' and p_currency='CLP';
  if convert_uf and (p_uf_value is null or p_uf_value<=0) then raise exception 'UF_VALUE_REQUIRED' using errcode='23514'; end if;
  select coalesce(c.payment_due_days,(select s.default_payment_due_days from public.billing_settings s where s.id=1),0) into due_days from public.company_contracts c where c.id=p.contract_id;
  due := p_invoice_date + coalesce(due_days,0);
  update public.billing_preinvoices set status='ISSUING',updated_at=now() where id=p.id;
  insert into public.billing_documents(company_id,contract_id,preinvoice_id,provider,document_type,invoice_date,due_date,currency,net_amount,tax_amount,total_amount,amount_uf,uf_reference_date,uf_value,uf_source,converted_amount_clp,status,idempotency_key,customer_snapshot,created_by)
  values(p.company_id,p.contract_id,p.id,provider_name,'INVOICE',p_invoice_date,due,p_currency,p_net,p_tax,p_total,p_amount_uf,p_uf_reference_date,p_uf_value,p_uf_source,p_converted_amount_clp,'ISSUING',p_idempotency_key,coalesce(p_customer_snapshot,'{}'),p_actor_id) returning * into d;
  insert into public.billing_document_lines(company_id,document_id,source_preinvoice_line_id,description,quantity,unit_price,subtotal,currency,tax_category,source_reference)
  select l.company_id,d.id,l.id,l.description,l.quantity,
    case when convert_uf then round(l.unit_price*p_uf_value) when p_currency='CLP' then round(l.unit_price) else l.unit_price end,
    case when convert_uf then round(l.subtotal*p_uf_value) else l.subtotal end,
    d.currency,coalesce(c.tax_category,'UNDEFINED'),
    jsonb_build_object('preinvoiceId',p.id,'sourceCurrency',p.currency,'sourceSubtotal',l.subtotal,'sourceUnitPrice',l.unit_price)
  from public.billing_preinvoice_lines l join public.billable_concepts c on c.id=l.concept_id where l.preinvoice_id=p.id and l.line_status='ACTIVE';
  insert into public.billing_document_jobs(company_id,document_id,operation,provider,idempotency_key,created_by)
  values(d.company_id,d.id,'ISSUE',provider_name,p_idempotency_key,p_actor_id) returning * into j;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value) values(d.company_id,p.id,'DOCUMENT_JOB_CREATED',p_actor_id,jsonb_build_object('documentId',d.id,'jobId',j.id,'provider',provider_name));
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',false);
exception when unique_violation then
  select * into d from public.billing_documents where idempotency_key=p_idempotency_key;
  select * into j from public.billing_document_jobs where document_id=d.id and operation='ISSUE';
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',true);
end $$;
revoke all on function public.billing_enqueue_invoice(uuid,date,text,uuid,text,numeric,numeric,numeric,numeric,date,numeric,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.billing_enqueue_invoice(uuid,date,text,uuid,text,numeric,numeric,numeric,numeric,date,numeric,text,numeric,jsonb,text) to service_role;

create or replace function public.billing_begin_related_document(p_company_id text,p_origin_id uuid,p_document_type text,p_reason text,p_mode text,p_amount numeric,p_issue_date date,p_idempotency_key text,p_actor_id uuid,p_provider text default 'mock')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare origin public.billing_documents%rowtype; prior public.billing_documents%rowtype; created public.billing_documents%rowtype; used numeric(18,4); amount numeric(18,4); ratio numeric; action text;
  provider_name text; clp boolean; rate numeric; new_net numeric; new_tax numeric; lines_sum numeric; diff numeric; top_line uuid;
begin
  provider_name := coalesce(nullif(trim(p_provider),''),'mock');
  if provider_name not in ('mock','haulmer') then raise exception 'BILLING_PROVIDER_INVALID' using errcode='22023'; end if;
  if p_document_type not in ('CREDIT_NOTE','DEBIT_NOTE') then raise exception 'DOCUMENT_TYPE_INVALID' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'DOCUMENT_REASON_REQUIRED' using errcode='22023'; end if;
  if p_issue_date is null or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 120 then raise exception 'DOCUMENT_REQUEST_INVALID' using errcode='22023'; end if;
  select * into prior from public.billing_documents where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('documentId',prior.id,'status',prior.status,'reused',true); end if;
  select * into origin from public.billing_documents where id=p_origin_id for update;
  if not found or origin.company_id<>p_company_id then raise exception 'ORIGIN_DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
  if origin.document_type<>'INVOICE' or origin.status<>'ISSUED' then raise exception 'ORIGIN_INVOICE_INVALID' using errcode='23514'; end if;
  if p_document_type='CREDIT_NOTE' then
    if p_mode not in ('TOTAL','PARTIAL') then raise exception 'CREDIT_NOTE_MODE_INVALID' using errcode='22023'; end if;
    select coalesce(sum(case when currency='UF' then amount_uf else total_amount end),0) into used from public.billing_documents where document_reference_id=origin.id and document_type='CREDIT_NOTE' and status in ('ISSUING','ISSUED','PROVIDER_PENDING');
    amount:=case when p_mode='TOTAL' then (case when origin.currency='UF' then origin.amount_uf else origin.total_amount end)-used else p_amount end;
    if amount is null or amount<=0 or amount>(case when origin.currency='UF' then origin.amount_uf else origin.total_amount end)-used then raise exception 'CREDIT_NOTE_EXCEEDS_AVAILABLE' using errcode='23514'; end if;
    action:='CREDIT_NOTE_REQUESTED';
  else
    if p_amount is null or p_amount<=0 then raise exception 'DEBIT_NOTE_AMOUNT_INVALID' using errcode='22023'; end if; amount:=p_amount; action:='DEBIT_NOTE_REQUESTED';
  end if;
  clp := origin.currency='CLP';
  if clp then
    amount := round(amount);
    if amount<=0 then raise exception 'DOCUMENT_AMOUNT_INVALID' using errcode='22023'; end if;
    rate := case when origin.net_amount>0 then origin.tax_amount/origin.net_amount else 0 end;
    new_net := round(amount/(1+rate)); new_tax := amount-new_net;
    insert into public.billing_documents(company_id,contract_id,preinvoice_id,provider,document_type,document_reference_id,invoice_date,due_date,currency,net_amount,tax_amount,total_amount,status,idempotency_key,reason,correction_mode,customer_snapshot,created_by)
    values(origin.company_id,origin.contract_id,origin.preinvoice_id,provider_name,p_document_type,origin.id,p_issue_date,p_issue_date,'CLP',new_net,new_tax,amount,'ISSUING',p_idempotency_key,trim(p_reason),case when p_document_type='CREDIT_NOTE' then p_mode else null end,origin.customer_snapshot,p_actor_id) returning * into created;
    select coalesce(sum(round(subtotal*new_net/nullif(origin.net_amount,0))),0) into lines_sum from public.billing_document_lines where document_id=origin.id;
    diff := new_net-lines_sum;
    select id into top_line from public.billing_document_lines where document_id=origin.id order by subtotal desc, id limit 1;
    insert into public.billing_document_lines(company_id,document_id,source_preinvoice_line_id,description,quantity,unit_price,subtotal,currency,tax_category,source_reference)
    select company_id,created.id,source_preinvoice_line_id,description,quantity,
      round((round(subtotal*new_net/nullif(origin.net_amount,0))+case when id=top_line then diff else 0 end)/nullif(quantity,0)),
      round(subtotal*new_net/nullif(origin.net_amount,0))+case when id=top_line then diff else 0 end,
      currency,tax_category,source_reference
    from public.billing_document_lines where document_id=origin.id;
  else
    ratio:=amount/(case when origin.currency='UF' then origin.amount_uf else origin.total_amount end);
    insert into public.billing_documents(company_id,contract_id,preinvoice_id,provider,document_type,document_reference_id,invoice_date,due_date,currency,net_amount,tax_amount,total_amount,amount_uf,uf_reference_date,uf_value,uf_source,converted_amount_clp,status,idempotency_key,reason,correction_mode,customer_snapshot,created_by)
    values(origin.company_id,origin.contract_id,origin.preinvoice_id,provider_name,p_document_type,origin.id,p_issue_date,p_issue_date,origin.currency,round(origin.net_amount*ratio,4),round(origin.tax_amount*ratio,4),case when origin.currency='UF' then round(origin.total_amount*ratio,4) else amount end,case when origin.currency='UF' then amount else null end,origin.uf_reference_date,origin.uf_value,origin.uf_source,case when origin.currency='UF' then round(amount*origin.uf_value,2) else null end,'ISSUING',p_idempotency_key,trim(p_reason),case when p_document_type='CREDIT_NOTE' then p_mode else null end,origin.customer_snapshot,p_actor_id) returning * into created;
    insert into public.billing_document_lines(company_id,document_id,source_preinvoice_line_id,description,quantity,unit_price,subtotal,currency,tax_category,source_reference)
    select company_id,created.id,source_preinvoice_line_id,description,quantity,round(unit_price*ratio,4),round(subtotal*ratio,4),currency,tax_category,source_reference from public.billing_document_lines where document_id=origin.id;
  end if;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,reason,new_value) values(origin.company_id,origin.preinvoice_id,action,p_actor_id,trim(p_reason),jsonb_build_object('originDocumentId',origin.id,'documentId',created.id,'amount',amount,'currency',origin.currency,'mode',p_mode,'provider',provider_name));
  return jsonb_build_object('documentId',created.id,'status',created.status,'reused',false);
end $$;
revoke all on function public.billing_begin_related_document(text,uuid,text,text,text,numeric,date,text,uuid,text) from public,anon,authenticated;
grant execute on function public.billing_begin_related_document(text,uuid,text,text,text,numeric,date,text,uuid,text) to service_role;

-- SOL-2026-11-10-001 (hallazgo H18): una tarea de emisión quedaba «PENDING» aunque su documento ya estaba emitido
-- (la NC se reintentó en cola y luego se emitió por la vía directa, que no cierra la tarea). El panel «Procesamiento
-- documental» la mostraba como «Pendiente de emisión». Al quedar un documento ISSUED se completan sus tareas abiertas,
-- y se cierran las que ya quedaron así.
create or replace function public.billing_close_jobs_of_issued_document()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='ISSUED' and old.status is distinct from 'ISSUED' then
    update public.billing_document_jobs
       set status='COMPLETED', completed_at=coalesce(completed_at,now()), locked_at=null, lock_token=null, updated_at=now()
     where document_id=new.id and status in ('PENDING','RETRY');
  end if;
  return new;
end $$;
revoke all on function public.billing_close_jobs_of_issued_document() from public,anon,authenticated;

drop trigger if exists billing_close_jobs_of_issued_document on public.billing_documents;
create trigger billing_close_jobs_of_issued_document
  after update of status on public.billing_documents
  for each row execute function public.billing_close_jobs_of_issued_document();

update public.billing_document_jobs j
   set status='COMPLETED', completed_at=coalesce(j.completed_at,now()), locked_at=null, lock_token=null, updated_at=now()
  from public.billing_documents d
 where d.id=j.document_id and d.status='ISSUED' and j.status in ('PENDING','RETRY');
