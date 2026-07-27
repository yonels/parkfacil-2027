grant usage on schema public to service_role;

grant select, insert, update, delete
on table
  public.abonados,
  public.abonado_vehiculos,
  public.abonado_credenciales
to service_role;

grant usage, select
on all sequences in schema public
to service_role;

grant execute on function public.next_abonado_codigo() to service_role;