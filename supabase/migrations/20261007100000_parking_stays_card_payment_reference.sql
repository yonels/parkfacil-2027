-- SOL-2026-10-07-002: referencia del cobro con tarjeta en el proveedor (TUU
-- Inter-App), para conciliar cobros "aprobado por TUU, salida no
-- registrada" (CHARGED_NOT_REGISTERED).
--
-- TUU documenta sequenceNumber como "cadena de 12 dígitos, identificador
-- único", sin precisar si es único global o por terminal: por eso solo se
-- indexa para búsqueda, sin restricción de unicidad.

alter table public.parking_stays
  add column if not exists card_payment_provider text null,
  add column if not exists card_payment_reference text null;

alter table public.parking_stays drop constraint if exists parking_stays_card_payment_reference_check;
alter table public.parking_stays add constraint parking_stays_card_payment_reference_check check (
  (card_payment_provider is null and card_payment_reference is null)
  or (
    card_payment_provider is not null
    and card_payment_reference is not null
    and payment_method is not null
    and card_payment_provider = 'TUU'
    and card_payment_reference ~ '^[0-9]{12}$'
    and payment_method = 'CARD'
  )
);

create index if not exists parking_stays_card_payment_reference_idx
  on public.parking_stays (card_payment_provider, card_payment_reference)
  where card_payment_reference is not null;

comment on column public.parking_stays.card_payment_provider is
  'Proveedor del cobro con tarjeta (TUU). Null si no hubo cobro integrado.';
comment on column public.parking_stays.card_payment_reference is
  'sequenceNumber de TUU (12 dígitos) devuelto por la app de pago.';
