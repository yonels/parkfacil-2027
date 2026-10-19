-- Off Street — Cupones y descuentos como módulo contratable (SOL-2026-10-19-002,
-- etapa C). Parte 3: defensa en la base.
--
-- Las API ya exigen el módulo activo (couponModuleServer). Esta defensa evita
-- que una API olvidada emita cupones, registre tiendas o marque entregas para
-- una empresa sin el módulo activo (D3).
--
-- El CANJE no se bloquea aquí a propósito: un pago con tarjeta con cupón se
-- canjea DESPUÉS del cobro en TUU. Si el módulo se desactivara en ese lapso,
-- bloquearlo en la base dejaría un pago cobrado sin registrar. El canje se
-- bloquea antes de cobrar (cálculo con cupón, EXIT y reserva de tarjeta).

do $$
begin
  if to_regprocedure('public.coupon_module_active(text)') is null then
    raise exception 'Falta la contratación del módulo Cupones (20261019180100).';
  end if;
end $$;

create or replace function public.coupon_module_require_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- En UPDATE solo se controla la entrega (delivered_at de NULL a valor). IF
  -- anidado: OLD no existe en INSERT y SQL no garantiza cortocircuito.
  if tg_op = 'UPDATE' then
    if not (old.delivered_at is null and new.delivered_at is not null) then
      return new;
    end if;
  end if;
  if not public.coupon_module_active(new.company_id) then
    raise exception 'COUPON_MODULE_INACTIVE' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.coupon_module_require_active() from public, anon, authenticated;

drop trigger if exists coupons_require_active_module on public.coupons;
create trigger coupons_require_active_module
  before insert or update of delivered_at on public.coupons
  for each row execute function public.coupon_module_require_active();

drop trigger if exists coupon_merchants_require_active_module on public.coupon_merchants;
create trigger coupon_merchants_require_active_module
  before insert on public.coupon_merchants
  for each row execute function public.coupon_module_require_active();
