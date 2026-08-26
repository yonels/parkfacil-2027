-- Piloto On Street QR: permite que el propio cliente cree y administre sus
-- ubicaciones QR. on_street_qr_locations no tenía ningún campo de texto libre
-- para que el cliente describa la ubicación con su propio nombre (área/calle/
-- tramo/lado ya se resuelven vía la jerarquía existente, y "referencia física"
-- se puede resolver del nombre del tramo). Se agrega una única columna nueva,
-- opcional, sin afectar filas existentes ni ningún otro flujo.
alter table public.on_street_qr_locations
  add column if not exists label text not null default '';
