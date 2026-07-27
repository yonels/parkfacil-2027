-- Etapa 18: credencial QR + Patente y relacion con vehiculo

alter table public.abonado_credenciales
  add column if not exists vehiculo_id uuid;

alter table public.abonado_credenciales drop constraint if exists abonado_credenciales_vehiculo_id_fk;
alter table public.abonado_credenciales
  add constraint abonado_credenciales_vehiculo_id_fk
  foreign key (vehiculo_id) references public.abonado_vehiculos(id) on delete set null;

create index if not exists abonado_credenciales_vehiculo_id_idx
  on public.abonado_credenciales (vehiculo_id);

alter table public.abonado_credenciales drop constraint if exists abonado_credenciales_tipo_check;
alter table public.abonado_credenciales
  add constraint abonado_credenciales_tipo_check check (tipo in ('rfid_card','qr_code','qr_plate','mobile','barcode','pin','other'));

alter table public.abonado_credenciales drop constraint if exists abonado_credenciales_qr_plate_vehiculo_check;
alter table public.abonado_credenciales
  add constraint abonado_credenciales_qr_plate_vehiculo_check check (tipo <> 'qr_plate' or vehiculo_id is not null);

grant select, insert, update, delete on table public.abonado_credenciales to service_role;
