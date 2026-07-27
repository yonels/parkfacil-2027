grant select, insert, update, delete on table public.abonados to service_role;
grant select, insert, update, delete on table public.abonado_vehiculos to service_role;
grant select, insert, update, delete on table public.abonado_credenciales to service_role;

grant usage, select on all sequences in schema public to service_role;