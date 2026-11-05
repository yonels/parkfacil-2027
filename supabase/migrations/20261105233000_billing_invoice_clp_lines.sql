-- SOL-2026-11-05-005, F1.3: la factura queda entera en pesos (decisión D2: precios en UF + IVA, factura en CLP
-- con la UF del día de facturación). Antes, las líneas del documento copiaban total_amount de la prefactura
-- (con IVA y en UF) y el encabezado mezclaba neto/IVA en pesos con total en UF.
-- Cambios (misma firma, se conservan los permisos):
--   * subtotal de cada línea = subtotal neto de la prefactura (sin IVA);
--   * si el documento es CLP y la prefactura es UF, línea convertida: round(subtotal_UF × UF) y precio unitario
--     round(precio_UF × UF, 2). La aplicación calcula el neto como suma de esas líneas redondeadas.
--   * vencimiento = fecha de emisión + días de pago del contrato (o, si no tiene, los de billing_settings,
--     migración 20261105235000); en EasyDoc: emisión 01-11-2026, vencimiento 07-11-2026.
create or replace function public.billing_enqueue_invoice(
  p_preinvoice_id uuid,p_invoice_date date,p_idempotency_key text,p_actor_id uuid,
  p_currency text,p_net numeric,p_tax numeric,p_total numeric,p_amount_uf numeric,
  p_uf_reference_date date,p_uf_value numeric,p_uf_source text,p_converted_amount_clp numeric,
  p_customer_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.billing_preinvoices%rowtype; d public.billing_documents%rowtype; j public.billing_document_jobs%rowtype; convert_uf boolean; due_days integer; due date;
begin
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
  values(p.company_id,p.contract_id,p.id,'mock','INVOICE',p_invoice_date,due,p_currency,p_net,p_tax,p_total,p_amount_uf,p_uf_reference_date,p_uf_value,p_uf_source,p_converted_amount_clp,'ISSUING',p_idempotency_key,coalesce(p_customer_snapshot,'{}'),p_actor_id) returning * into d;
  insert into public.billing_document_lines(company_id,document_id,source_preinvoice_line_id,description,quantity,unit_price,subtotal,currency,tax_category,source_reference)
  select l.company_id,d.id,l.id,l.description,l.quantity,
    case when convert_uf then round(l.unit_price*p_uf_value,2) else l.unit_price end,
    case when convert_uf then round(l.subtotal*p_uf_value) else l.subtotal end,
    d.currency,coalesce(c.tax_category,'UNDEFINED'),
    jsonb_build_object('preinvoiceId',p.id,'sourceCurrency',p.currency,'sourceSubtotal',l.subtotal,'sourceUnitPrice',l.unit_price)
  from public.billing_preinvoice_lines l join public.billable_concepts c on c.id=l.concept_id where l.preinvoice_id=p.id and l.line_status='ACTIVE';
  insert into public.billing_document_jobs(company_id,document_id,operation,provider,idempotency_key,created_by)
  values(d.company_id,d.id,'ISSUE','mock',p_idempotency_key,p_actor_id) returning * into j;
  insert into public.billing_audit_events(company_id,preinvoice_id,action,actor_id,new_value) values(d.company_id,p.id,'DOCUMENT_JOB_CREATED',p_actor_id,jsonb_build_object('documentId',d.id,'jobId',j.id));
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',false);
exception when unique_violation then
  select * into d from public.billing_documents where idempotency_key=p_idempotency_key;
  select * into j from public.billing_document_jobs where document_id=d.id and operation='ISSUE';
  return jsonb_build_object('documentId',d.id,'jobId',j.id,'status',j.status,'reused',true);
end $$;
