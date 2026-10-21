-- Off Street — Eliminar cupones no utilizados (SOL-2026-10-20-002).
--
-- service_role no tiene DELETE sobre public.coupons (20260803110000 solo concede
-- select, insert y update). En vez de concederlo para toda la tabla, la
-- eliminación pasa por delete_unused_coupon(), que en una sola transacción:
--   1. bloquea el cupón (FOR UPDATE);
--   2. exige la empresa del administrador (NULL = Root) y el módulo activo
--      (inactivo = solo lectura, D3);
--   3. conserva los cupones utilizados o asociados a una estadía (historial y
--      reportes);
--   4. conserva los cupones de un pago con tarjeta en curso o por resolver.
--
-- La reserva del pago con tarjeta (reserve_pos_card_payment) inserta el intento
-- con el cálculo firmado; el disparador coupon_guard_card_attempt bloquea el
-- cupón (FOR SHARE) en esa misma transacción. Así, eliminar y reservar se
-- ordenan: si se eliminó antes, la reserva falla sin cobrar; si se reservó
-- antes, la eliminación ve el intento y se rechaza. El canje sigue sin
-- bloquearse en la base (ver 20261019180200): ocurre después del cobro en TUU.

do $$
begin
  if to_regprocedure('public.coupon_module_active(text)') is null then
    raise exception 'Falta la contratación del módulo Cupones (20261019180100).';
  end if;
  if to_regclass('public.pos_card_payment_attempts') is null then
    raise exception 'Falta la reserva de pagos con tarjeta (20261011110000).';
  end if;
end $$;

create or replace function public.delete_unused_coupon(p_coupon_id uuid, p_company_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
begin
  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  -- Inexistente o de otra empresa: mismo error, sin revelar que existe.
  if not found or (p_company_id is not null and v_coupon.company_id is distinct from p_company_id) then
    raise exception 'COUPON_NOT_DELETABLE' using errcode = 'P0002';
  end if;
  if not public.coupon_module_active(v_coupon.company_id) then
    raise exception 'COUPON_MODULE_INACTIVE' using errcode = '42501';
  end if;
  if v_coupon.status = 'REDEEMED' or v_coupon.redeemed_at is not null or v_coupon.redeemed_stay_id is not null then
    raise exception 'COUPON_USED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.parking_stays where coupon_id = p_coupon_id) then
    raise exception 'COUPON_LINKED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.pos_card_payment_attempts
    where charge_snapshot->>'couponId' = p_coupon_id::text
      and status in ('RESERVED', 'SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN', 'PAID')
  ) then
    raise exception 'COUPON_PAYMENT_IN_PROGRESS' using errcode = 'P0001';
  end if;
  delete from public.coupons where id = p_coupon_id;
  return p_coupon_id;
end;
$$;

revoke all on function public.delete_unused_coupon(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_unused_coupon(uuid, text) to service_role;

create or replace function public.coupon_guard_card_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon_id text := new.charge_snapshot->>'couponId';
begin
  if v_coupon_id is null or v_coupon_id = '' then
    return new;
  end if;
  perform 1 from public.coupons
    where id = v_coupon_id::uuid and status = 'ACTIVE' and redeemed_at is null
    for share;
  if not found then
    raise exception 'CARD_ATTEMPT_COUPON_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.coupon_guard_card_attempt() from public, anon, authenticated;

drop trigger if exists pos_card_payment_attempts_coupon_guard on public.pos_card_payment_attempts;
create trigger pos_card_payment_attempts_coupon_guard
  before insert on public.pos_card_payment_attempts
  for each row execute function public.coupon_guard_card_attempt();
