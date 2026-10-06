-- Off Street: additive card classification. Existing CASH/CARD amounts,
-- quote signatures, paid stays and immutable closures are not rewritten.
begin;

alter table public.parking_stays add column if not exists payment_card_type text null;
alter table public.parking_stays drop constraint if exists parking_stays_payment_card_type_check;
alter table public.parking_stays add constraint parking_stays_payment_card_type_check
  check (payment_card_type is null or (
    payment_method is not distinct from 'CARD' and status = 'PAID'
    and payment_card_type in ('CREDIT', 'DEBIT')
  ));
comment on column public.parking_stays.payment_card_type is
  'Explicit card type recorded with the approved payment. NULL means unclassified; no historical inference.';

-- close_operator_shift already locks the shift and builds its financial
-- snapshot atomically. Enrich only NEW Off Street closure snapshots with
-- the persisted type, preserving totals, order and existing fields.
create or replace function public.enrich_offstreet_closure_card_types()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.parkings where id=new.parking_id and type='OFF_STREET')
    and jsonb_typeof(new.payments_snapshot)='array' then
    select coalesce(jsonb_agg(
      item.value || jsonb_build_object('paymentCardType',stay.payment_card_type)
      order by item.ordinality
    ), '[]'::jsonb)
    into new.payments_snapshot
    from jsonb_array_elements(new.payments_snapshot) with ordinality as item(value,ordinality)
    left join public.parking_stays stay on stay.id::text=item.value->>'stayId'
      and stay.parking_id=new.parking_id and stay.payment_shift_id=new.shift_id
      and stay.status='PAID';
  end if;
  return new;
end;
$$;
revoke all on function public.enrich_offstreet_closure_card_types() from public;
drop trigger if exists offstreet_closure_card_types on public.shift_closures;
create trigger offstreet_closure_card_types before insert on public.shift_closures
  for each row execute function public.enrich_offstreet_closure_card_types();

commit;
