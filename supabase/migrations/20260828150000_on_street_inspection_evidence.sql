-- ParkFacil Inspectores — Etapa 3: evidencia fotográfica de fiscalización.
--
-- §17-20/§32 del encargo de Etapa 3: la evidencia es material probatorio
-- operacional, nunca pública. Bucket privado (public=false): sin policies
-- para anon/authenticated, mismo patrón ya usado por TODA otra tabla
-- operacional On-Street (on_street_inspections, on_street_pilot_sessions,
-- payment_transactions, etc.) -- toda lectura/escritura pasa exclusivamente
-- por rutas server-side con service_role que ya validan sesión + rol antes
-- de tocar el bucket/la tabla. El acceso de lectura para visualizar una
-- foto se resuelve con signed URL de corta duración (createSignedUrl),
-- nunca con una URL pública permanente.
--
-- Límites (§20, documentados aquí): 8 MiB por archivo, JPEG/PNG/WebP
-- únicamente -- validado tanto por el bucket (file_size_limit/
-- allowed_mime_types) como otra vez en la ruta de subida (defensa en
-- profundidad, igual criterio que el resto del proyecto). El cliente
-- comprime antes de subir (ver InspectorEvidenceUpload.js) a ~1600px de
-- lado mayor / calidad JPEG 0.82, muy por debajo de este techo en el caso
-- normal -- el límite del servidor es la garantía real, no la compresión
-- del cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('on-street-inspection-evidence', 'on-street-inspection-evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Metadatos de cada fotografía asociada a una fiscalización (§19). Hasta 3
-- fotos por fiscalización (§17): validado en la ruta de subida, no aquí --
-- una restricción de conteo por fila no es expresable como check simple
-- sin una consulta agregada, y la ruta ya necesita consultar el conteo
-- existente de todos modos antes de aceptar un nuevo archivo.
create table if not exists public.on_street_inspection_evidence (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.on_street_inspections(id) on delete cascade,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists on_street_inspection_evidence_inspection_idx
  on public.on_street_inspection_evidence(inspection_id);

alter table public.on_street_inspection_evidence enable row level security;
revoke all on public.on_street_inspection_evidence from anon, authenticated;
grant select, insert on public.on_street_inspection_evidence to service_role;
