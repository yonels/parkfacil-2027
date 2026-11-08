-- SOL-2026-11-05-005: descartar un documento que el proveedor rechazó o que no se pudo emitir.
-- Pedido del usuario 2026-11-08 («si hazlo»): la factura de prueba rechazada por Haulmer (OF-02, RUT con dígito
-- verificador inválido) quedaba sin salida. Descartar solo se permite si el documento nunca existió en el SII (sin
-- folio ni token del proveedor). El documento y su intento quedan como registro (no se borran), y la prefactura vuelve a
-- «En revisión» para corregir los datos y emitir de nuevo con otro documento.

alter table public.billing_documents drop constraint if exists billing_documents_status_check;
alter table public.billing_documents add constraint billing_documents_status_check
  check (status in ('ISSUING','ISSUED','PROVIDER_PENDING','PROVIDER_REJECTED','ISSUE_ERROR','DISCARDED'));

alter table public.billing_document_jobs drop constraint if exists billing_document_jobs_status_check;
alter table public.billing_document_jobs add constraint billing_document_jobs_status_check
  check (status in ('PENDING','PROCESSING','COMPLETED','RETRY','FAILED','CANCELLED'));

-- Una sola factura vigente por prefactura: la descartada no cuenta, para poder emitir la nueva.
drop index if exists public.billing_invoice_preinvoice_uidx;
create unique index billing_invoice_preinvoice_uidx on public.billing_documents(preinvoice_id)
  where document_type = 'INVOICE' and status <> 'DISCARDED';

-- Agrega DOCUMENT_DISCARDED a las acciones de auditoría conservando todas las existentes.
do $$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid = 'public.billing_audit_events'::regclass and conname = 'billing_audit_events_action_check';
  if definition is not null and position('DOCUMENT_DISCARDED' in definition) = 0 then
    alter table public.billing_audit_events drop constraint billing_audit_events_action_check;
    execute 'alter table public.billing_audit_events add constraint billing_audit_events_action_check '
      || replace(definition, ']))', ', ''DOCUMENT_DISCARDED''::text]))');
  end if;
end $$;

create or replace function public.billing_discard_failed_document(p_company_id text, p_document_id uuid, p_actor_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.billing_documents%rowtype;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  preinvoice_status text := null;
begin
  if reason is null or length(reason) < 5 then raise exception 'DISCARD_REASON_REQUIRED' using errcode = '22023'; end if;
  select * into d from public.billing_documents where id = p_document_id for update;
  if not found or (p_company_id is not null and d.company_id <> p_company_id) then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if d.status = 'DISCARDED' then return jsonb_build_object('documentId', d.id, 'status', d.status, 'reused', true); end if;
  if d.status not in ('PROVIDER_REJECTED', 'ISSUE_ERROR') then raise exception 'DOCUMENT_DISCARD_INVALID' using errcode = '23514'; end if;
  -- Si el proveedor alcanzó a asignar folio o token, el documento puede existir en el SII: no se descarta.
  if d.folio is not null or d.provider_document_id is not null then raise exception 'DOCUMENT_HAS_PROVIDER_ID' using errcode = '23514'; end if;
  if exists (select 1 from public.billing_document_jobs j where j.document_id = d.id and j.status = 'PROCESSING') then
    raise exception 'DOCUMENT_JOB_IN_PROGRESS' using errcode = '55000';
  end if;

  update public.billing_documents set status = 'DISCARDED', updated_at = now() where id = d.id;
  update public.billing_document_jobs
    set status = 'CANCELLED', locked_at = null, lock_token = null, error_message = left('Descartado: ' || reason, 500), updated_at = now()
    where document_id = d.id and status <> 'COMPLETED';

  if d.document_type = 'INVOICE' then
    update public.billing_preinvoices set status = 'UNDER_REVIEW', version = version + 1, updated_at = now()
      where id = d.preinvoice_id and status in ('ISSUING', 'PROVIDER_REJECTED', 'ISSUE_ERROR')
      returning status into preinvoice_status;
  end if;

  insert into public.billing_audit_events(company_id, preinvoice_id, action, actor_id, previous_value, new_value)
  values (d.company_id, d.preinvoice_id, 'DOCUMENT_DISCARDED', p_actor_id,
    jsonb_build_object('documentId', d.id, 'status', d.status, 'providerStatus', d.provider_status),
    jsonb_build_object('documentId', d.id, 'status', 'DISCARDED', 'reason', reason, 'preinvoiceStatus', preinvoice_status));

  return jsonb_build_object('documentId', d.id, 'status', 'DISCARDED', 'preinvoiceStatus', preinvoice_status, 'reused', false);
end;
$$;

revoke all on function public.billing_discard_failed_document(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.billing_discard_failed_document(text, uuid, uuid, text) to service_role;
