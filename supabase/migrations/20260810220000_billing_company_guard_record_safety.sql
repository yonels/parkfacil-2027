-- Etapa 5: el trigger compartido opera sobre tablas con formas distintas.
-- to_jsonb evita resolver columnas inexistentes del record polimorfico NEW.
create or replace function public.billing_validate_company_links()
returns trigger language plpgsql as $$
declare
  linked_company text;
  row_data jsonb := to_jsonb(new);
  row_company text := row_data ->> 'company_id';
  row_parking uuid := nullif(row_data ->> 'parking_id', '')::uuid;
  row_contract uuid := nullif(row_data ->> 'contract_id', '')::uuid;
  row_device uuid := nullif(row_data ->> 'device_id', '')::uuid;
  row_preinvoice uuid := nullif(row_data ->> 'preinvoice_id', '')::uuid;
  row_item uuid := nullif(row_data ->> 'contract_item_id', '')::uuid;
begin
  if tg_table_name = 'billing_devices' and row_parking is not null then
    select company_id into linked_company from public.parkings where id = row_parking;
    if linked_company is distinct from row_company then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
  elsif tg_table_name = 'contract_billable_items' then
    select company_id into linked_company from public.company_contracts where id = row_contract;
    if linked_company is distinct from row_company then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
    if row_parking is not null and not exists(select 1 from public.parkings where id=row_parking and company_id=row_company) then raise exception 'BILLING_PARKING_MISMATCH' using errcode='23514'; end if;
    if row_device is not null and not exists(select 1 from public.billing_devices where id=row_device and company_id=row_company) then raise exception 'BILLING_DEVICE_MISMATCH' using errcode='23514'; end if;
  elsif tg_table_name = 'billing_preinvoices' then
    select company_id into linked_company from public.company_contracts where id = row_contract;
    if linked_company is distinct from row_company then raise exception 'BILLING_COMPANY_MISMATCH' using errcode='23514'; end if;
    if tg_op = 'UPDATE' and old.status in ('APPROVED','READY_TO_ISSUE') and row(new.net_amount,new.tax_amount,new.total_amount,new.uf_date,new.uf_value,new.converted_amount_clp) is distinct from row(old.net_amount,old.tax_amount,old.total_amount,old.uf_date,old.uf_value,old.converted_amount_clp) then raise exception 'APPROVED_PREINVOICE_IMMUTABLE' using errcode='23514'; end if;
  elsif tg_table_name = 'billing_preinvoice_lines' then
    if not exists(select 1 from public.billing_preinvoices where id=row_preinvoice and company_id=row_company) then raise exception 'BILLING_PREINVOICE_MISMATCH' using errcode='23514'; end if;
    if not exists(select 1 from public.contract_billable_items where id=row_item and company_id=row_company) then raise exception 'BILLING_ITEM_MISMATCH' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;
