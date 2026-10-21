-- Otorga a service_role los privilegios que el resto de tablas del proyecto
-- ya reciben explícitamente (ver 20260727093000_fix_abonados_service_role_permissions.sql,
-- mismo patrón) -- esta instancia local no los concede por defecto a tablas
-- nuevas.
grant select, insert, update, delete on table public.parking_code_catalog to service_role;
