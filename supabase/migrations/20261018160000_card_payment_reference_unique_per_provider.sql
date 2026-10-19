-- SOL-2026-10-11-001 (decisión D3 del usuario, 2026-10-18): la referencia de un pago con
-- tarjeta (sequenceNumber de TUU) es única por proveedor. Un mismo pago no puede quedar
-- registrado en dos estadías (hallazgo H2). En los intentos de pago la referencia se sigue
-- guardando sin unicidad: una referencia repetida marca el intento como incierto
-- (REFERENCE_REUSED, ver 20261011110000_pos_card_payment_attempts.sql).
--
-- Requiere 20261007100000_parking_stays_card_payment_reference.sql. Si ya existen
-- referencias repetidas, la migración se detiene sin cambios y las informa.

do $$
declare
  v_duplicates integer;
begin
  select count(*) into v_duplicates
  from (
    select card_payment_provider, card_payment_reference
    from public.parking_stays
    where card_payment_reference is not null
    group by card_payment_provider, card_payment_reference
    having count(*) > 1
  ) duplicated;
  if v_duplicates > 0 then
    raise exception 'CARD_PAYMENT_REFERENCE_DUPLICATES: % referencias repetidas en parking_stays; regularizar antes de aplicar', v_duplicates
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists parking_stays_card_payment_reference_unique_idx
  on public.parking_stays (card_payment_provider, card_payment_reference)
  where card_payment_reference is not null;

-- El índice no único anterior queda cubierto por el único.
drop index if exists public.parking_stays_card_payment_reference_idx;
