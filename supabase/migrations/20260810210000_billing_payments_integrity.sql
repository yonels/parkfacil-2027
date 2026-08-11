-- Etapa 5: pagos idempotentes y múltiples aplicaciones futuras por documento.
alter table public.billing_account_movements
  add column if not exists idempotency_key text null,
  add column if not exists payment_method text null;

alter table public.billing_account_movements drop constraint if exists billing_account_payment_method_check;
alter table public.billing_account_movements add constraint billing_account_payment_method_check
  check (
    (movement_type = 'PAYMENT' and payment_method in ('TRANSFER','CARD','CASH','CHECK','OTHER') and idempotency_key is not null)
    or (movement_type <> 'PAYMENT' and payment_method is null)
  );

drop index if exists public.billing_movement_document_type_uidx;
create unique index billing_movement_document_type_uidx
  on public.billing_account_movements(document_id,movement_type)
  where document_id is not null and movement_type in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE') and reversal_of is null;
create unique index billing_payment_idempotency_uidx
  on public.billing_account_movements(company_id,idempotency_key)
  where movement_type='PAYMENT' and reversal_of is null;
create index billing_account_payment_reference_idx
  on public.billing_account_movements(company_id,reference)
  where movement_type='PAYMENT';
