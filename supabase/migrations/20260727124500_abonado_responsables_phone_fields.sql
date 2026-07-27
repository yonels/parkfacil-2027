-- Etapa 18: telefonos internacionales para responsables de abonados

alter table public.abonado_responsables
  add column if not exists telefono_pais text not null default 'CL',
  add column if not exists telefono_codigo text not null default '+56',
  add column if not exists telefono_numero text;

update public.abonado_responsables
set
  telefono_pais = coalesce(nullif(telefono_pais, ''), 'CL'),
  telefono_codigo = coalesce(nullif(telefono_codigo, ''), '+56')
where telefono_pais is null
   or telefono_pais = ''
   or telefono_codigo is null
   or telefono_codigo = '';

grant select, insert, update, delete on table public.abonado_responsables to service_role;