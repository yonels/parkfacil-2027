alter table public.coupons
  add column if not exists redeeming_merchant_id uuid null references public.coupon_merchants(id) on delete restrict;

update public.coupons set redeeming_merchant_id=merchant_id where redeeming_merchant_id is null;
create index if not exists coupons_redeeming_merchant_idx on public.coupons(redeeming_merchant_id,status,created_at);
