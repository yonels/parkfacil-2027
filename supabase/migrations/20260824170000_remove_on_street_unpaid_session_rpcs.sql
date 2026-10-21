-- QR On-Street es exclusivamente pagado. Estas RPC históricas permitían
-- crear o extender sesiones ACTIVE sin acreditar previamente un pago Webpay.
-- Se retiran sin modificar ni eliminar sesiones, pagos o intenciones existentes.

revoke all on function public.create_on_street_pilot_session_free(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_on_street_pilot_session(text,text,text,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.extend_on_street_pilot_session(uuid,integer)
  from public, anon, authenticated, service_role;

drop function if exists public.create_on_street_pilot_session_free(text,text,text);
drop function if exists public.create_on_street_pilot_session(text,text,text,integer);
drop function if exists public.extend_on_street_pilot_session(uuid,integer);
