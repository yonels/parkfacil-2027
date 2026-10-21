-- QA ONLY: schema subset from CRM production metadata, no customer data.
SET search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE SEQUENCE public.contratos_numero_seq;
CREATE TABLE public."contrato_documentos" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"contrato_id" uuid NOT NULL,
"tipo_documento" text DEFAULT 'Otro'::text NOT NULL,
"titulo" text NOT NULL,
"descripcion" text,
"version" integer DEFAULT 1 NOT NULL,
"archivo_nombre" text,
"archivo_ruta" text,
"archivo_url" text,
"archivo_tipo" text,
"archivo_tamano" bigint,
"texto_extraido" text,
"documento_generado" boolean DEFAULT false NOT NULL,
"documento_firmado" boolean DEFAULT false NOT NULL,
"es_version_actual" boolean DEFAULT true NOT NULL,
"fecha_documento" date,
"fecha_firma" date,
"observaciones" text,
"contenido_busqueda" text DEFAULT ''::text NOT NULL,
"contenido_busqueda_normalizado" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_by" uuid,
"hash" text,
"enviado_at" timestamp with time zone,
"aceptado_at" timestamp with time zone,
"estado_documental" text);
CREATE TABLE public."contratos" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"numero" text NOT NULL,
"lead_id" uuid,
"cotizacion_id" uuid,
"numero_cotizacion" text,
"empresa" text NOT NULL,
"rut" text NOT NULL,
"representante_legal" text,
"representante_rut" text,
"correo" text,
"telefono" text,
"direccion" text,
"comuna" text,
"ciudad" text,
"estado" text DEFAULT 'Borrador'::text NOT NULL,
"fecha_contrato" date,
"fecha_inicio" date,
"fecha_termino" date,
"fecha_firma" date,
"duracion_meses" integer DEFAULT 12 NOT NULL,
"renovacion_automatica" boolean DEFAULT true NOT NULL,
"dias_aviso_no_renovacion" integer DEFAULT 30 NOT NULL,
"valor_mensual" numeric(14,4) DEFAULT 0 NOT NULL,
"valor_servicios" numeric(14,4) DEFAULT 0 NOT NULL,
"valor_total_contrato" numeric(16,4) DEFAULT 0 NOT NULL,
"moneda" text DEFAULT 'UF'::text NOT NULL,
"incluye_iva" boolean DEFAULT false NOT NULL,
"modalidad_pago" text DEFAULT 'Mensual'::text NOT NULL,
"dia_pago" integer DEFAULT 7 NOT NULL,
"descuento_anual" numeric(6,2) DEFAULT 0 NOT NULL,
"costo_reactivacion_uf" numeric(10,2) DEFAULT 0 NOT NULL,
"tiene_comodato" boolean DEFAULT false NOT NULL,
"plan_contratado" text,
"licencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
"modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
"servicios" jsonb DEFAULT '[]'::jsonb NOT NULL,
"equipos_comodato" jsonb DEFAULT '[]'::jsonb NOT NULL,
"condiciones_especiales" text,
"texto_contrato" text,
"anexo_a" text,
"anexo_b" text,
"datos_cotizacion" jsonb DEFAULT '{}'::jsonb NOT NULL,
"version" integer DEFAULT 1 NOT NULL,
"metodo_aceptacion" text,
"aceptado_electronicamente" boolean DEFAULT false NOT NULL,
"aceptado_por" text,
"aceptado_correo" text,
"aceptado_ip" text,
"aceptado_user_agent" text,
"aceptado_at" timestamp with time zone,
"responsable_id" uuid,
"responsable_nombre" text,
"observaciones" text,
"contenido_busqueda" text DEFAULT ''::text NOT NULL,
"contenido_busqueda_normalizado" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"razon_social" text,
"giro" text,
"representante_cargo" text,
"representante_direccion" text,
"representante_comuna" text,
"representante_ciudad" text,
"parkfacil_representante" text DEFAULT 'Yonel Stifel Carja'::text,
"parkfacil_representante_rut" text,
"parkfacil_direccion" text,
"plantilla_version" integer DEFAULT 1,
"firma_tipo" text DEFAULT 'Pendiente'::text,
"pdf_contrato" text,
"pdf_firmado" text,
"empresa_id" uuid,
"token_aceptacion" text,
"token_aceptacion_expira" timestamp with time zone,
"plazo_aceptacion" timestamp with time zone,
"documento_aceptado_id" uuid);
CREATE TABLE public."cotizaciones" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"numero" character varying(30) NOT NULL,
"lead_id" uuid,
"cliente" character varying(200) NOT NULL,
"rut" character varying(20),
"contacto" character varying(150),
"correo" character varying(200),
"estado" character varying(30) DEFAULT 'Borrador'::character varying NOT NULL,
"valor_mensual" numeric(12,2) DEFAULT 0 NOT NULL,
"valor_servicios" numeric(12,2) DEFAULT 0 NOT NULL,
"valor_proyecto" numeric(12,2) DEFAULT 0 NOT NULL,
"propuesta" jsonb DEFAULT '{}'::jsonb NOT NULL,
"pdf_url" text,
"enviada" boolean DEFAULT false NOT NULL,
"enviada_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"empresa_id" uuid);
CREATE TABLE public."crm_profiles" (
"code" text NOT NULL,
"name" text NOT NULL,
"description" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."empresas" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"razon_social" text NOT NULL,
"nombre_fantasia" text,
"rut" text NOT NULL,
"representante_legal" text,
"rut_representante" text,
"correo" text,
"telefono" text,
"direccion" text,
"comuna" text,
"ciudad" text,
"region" text,
"pais" text DEFAULT 'Chile'::text,
"giro" text,
"estado" text DEFAULT 'Activa'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"cargo_representante" text,
"direccion_representante" text,
"comuna_representante" text,
"ciudad_representante" text);
CREATE TABLE public."leads" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"empresa" text NOT NULL,
"contacto" text NOT NULL,
"correo" text NOT NULL,
"telefono" text NOT NULL,
"plazas" integer,
"mensaje" text,
"origen" text DEFAULT 'Sitio Web'::text NOT NULL,
"estado" text DEFAULT 'Nuevo'::text NOT NULL,
"responsable" text,
"observaciones" text,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"responsable_id" uuid,
"proximo_seguimiento" timestamp with time zone,
"ultima_gestion_at" timestamp with time zone,
"rut" text,
"proxima_accion" text,
"empresa_id" uuid,
"convertido" boolean DEFAULT false NOT NULL,
"convertido_at" timestamp with time zone,
"convertido_por" uuid);
CREATE TABLE public."usuarios_comerciales" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nombre" text NOT NULL,
"correo" text NOT NULL,
"activo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"cargo" text,
"telefono" text,
"rol" text DEFAULT 'EJECUTIVO_COMERCIAL'::text NOT NULL,
"telefono_pais" character varying(2) DEFAULT 'CL'::character varying,
"telefono_codigo_pais" character varying(8) DEFAULT '+56'::character varying,
"telefono_numero" character varying(30),
"apellido_paterno" character varying(100),
"apellido_materno" character varying(100));
ALTER TABLE public."contrato_documentos" ADD CONSTRAINT "contrato_documentos_tipo_valido" CHECK ((tipo_documento = ANY (ARRAY['Contrato generado'::text, 'Contrato firmado'::text, 'Anexo A'::text, 'Anexo B'::text, 'Adenda'::text, 'Acta de implementación'::text, 'Acta de capacitación'::text, 'Recepción conforme'::text, 'Cotización aceptada'::text, 'Otro'::text, 'WORD_CONTRATO'::text, 'PDF_CONTRATO'::text])));
ALTER TABLE public."contrato_documentos" ADD CONSTRAINT "contrato_documentos_version_valida" CHECK ((version > 0));
ALTER TABLE public."contrato_documentos" ADD CONSTRAINT "contrato_documentos_tamano_valido" CHECK (((archivo_tamano IS NULL) OR (archivo_tamano >= 0)));
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_valores_validos" CHECK (((valor_mensual >= (0)::numeric) AND (valor_servicios >= (0)::numeric) AND (valor_total_contrato >= (0)::numeric) AND (costo_reactivacion_uf >= (0)::numeric)));
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_descuento_valido" CHECK (((descuento_anual >= (0)::numeric) AND (descuento_anual <= (100)::numeric)));
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_dia_pago_valido" CHECK (((dia_pago >= 1) AND (dia_pago <= 31)));
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_dias_aviso_validos" CHECK ((dias_aviso_no_renovacion >= 0));
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_duracion_valida" CHECK ((duracion_meses > 0));
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_estado_valido" CHECK ((estado = ANY (ARRAY['Borrador'::text, 'Pendiente de revisión'::text, 'Enviado'::text, 'Pendiente de firma'::text, 'Firmado'::text, 'Vigente'::text, 'Suspendido'::text, 'Finalizado'::text, 'Renovado'::text, 'Anulado'::text])));
ALTER TABLE public."cotizaciones" ADD CONSTRAINT "cotizaciones_estado_check" CHECK (((estado)::text = ANY ((ARRAY['Borrador'::character varying, 'Generada'::character varying, 'Enviada'::character varying, 'Aceptada'::character varying, 'Rechazada'::character varying, 'Vencida'::character varying])::text[])));
ALTER TABLE public."crm_profiles" ADD CONSTRAINT "crm_profiles_code_check" CHECK ((code = upper(code)));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_proxima_accion_check" CHECK (((proxima_accion IS NULL) OR (proxima_accion = ANY (ARRAY['Llamar'::text, 'Enviar correo'::text, 'Agendar demostración'::text, 'Enviar propuesta'::text, 'Reunión'::text, 'Esperando respuesta'::text, 'Negociar condiciones'::text, 'Cerrar venta'::text, 'Sin acción definida'::text]))));
ALTER TABLE public."contrato_documentos" ADD CONSTRAINT "contrato_documentos_pkey" PRIMARY KEY (id);
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_pkey" PRIMARY KEY (id);
ALTER TABLE public."cotizaciones" ADD CONSTRAINT "cotizaciones_pkey" PRIMARY KEY (id);
ALTER TABLE public."crm_profiles" ADD CONSTRAINT "crm_profiles_pkey" PRIMARY KEY (code);
ALTER TABLE public."empresas" ADD CONSTRAINT "empresas_pkey" PRIMARY KEY (id);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."usuarios_comerciales" ADD CONSTRAINT "usuarios_comerciales_pkey" PRIMARY KEY (id);
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_numero_key" UNIQUE (numero);
ALTER TABLE public."cotizaciones" ADD CONSTRAINT "cotizaciones_numero_key" UNIQUE (numero);
ALTER TABLE public."empresas" ADD CONSTRAINT "empresas_rut_key" UNIQUE (rut);
ALTER TABLE public."usuarios_comerciales" ADD CONSTRAINT "usuarios_comerciales_correo_key" UNIQUE (correo);
ALTER TABLE public."contrato_documentos" ADD CONSTRAINT "contrato_documentos_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_cotizacion_id_fkey" FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_empresa_fk" FOREIGN KEY (empresa_id) REFERENCES empresas(id);
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_documento_aceptado_id_fkey" FOREIGN KEY (documento_aceptado_id) REFERENCES contrato_documentos(id) ON DELETE SET NULL;
ALTER TABLE public."contratos" ADD CONSTRAINT "contratos_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public."cotizaciones" ADD CONSTRAINT "cotizaciones_empresa_fk" FOREIGN KEY (empresa_id) REFERENCES empresas(id);
ALTER TABLE public."cotizaciones" ADD CONSTRAINT "cotizaciones_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_convertido_por_fkey" FOREIGN KEY (convertido_por) REFERENCES usuarios_comerciales(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_responsable_id_fkey" FOREIGN KEY (responsable_id) REFERENCES usuarios_comerciales(id) ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_empresa_fk" FOREIGN KEY (empresa_id) REFERENCES empresas(id);
ALTER TABLE public."usuarios_comerciales" ADD CONSTRAINT "usuarios_comerciales_rol_fkey" FOREIGN KEY (rol) REFERENCES crm_profiles(code) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION public.normalizar_busqueda(valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
    translate(
      lower(COALESCE(valor, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunAEIOUUN'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.actualizar_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.asignar_numero_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  correlativo BIGINT;
BEGIN
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    correlativo := nextval('public.contratos_numero_seq');

    NEW.numero :=
      'CT-PF-' ||
      to_char(COALESCE(NEW.fecha_contrato, CURRENT_DATE), 'YYYY') ||
      '-' ||
      lpad(correlativo::TEXT, 6, '0');
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.preparar_busqueda_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.contenido_busqueda := concat_ws(
    ' ',

    NEW.numero,
    NEW.numero_cotizacion,

    NEW.empresa,
    NEW.rut,

    NEW.representante_legal,
    NEW.representante_rut,

    NEW.correo,
    NEW.telefono,

    NEW.direccion,
    NEW.comuna,
    NEW.ciudad,

    NEW.estado,

    NEW.fecha_contrato::TEXT,
    NEW.fecha_inicio::TEXT,
    NEW.fecha_termino::TEXT,
    NEW.fecha_firma::TEXT,

    NEW.duracion_meses::TEXT,
    NEW.renovacion_automatica::TEXT,
    NEW.dias_aviso_no_renovacion::TEXT,

    NEW.valor_mensual::TEXT,
    NEW.valor_servicios::TEXT,
    NEW.valor_total_contrato::TEXT,

    NEW.moneda,
    NEW.modalidad_pago,
    NEW.dia_pago::TEXT,
    NEW.descuento_anual::TEXT,
    NEW.costo_reactivacion_uf::TEXT,

    NEW.plan_contratado,

    NEW.licencias::TEXT,
    NEW.modulos::TEXT,
    NEW.servicios::TEXT,
    NEW.equipos_comodato::TEXT,

    NEW.condiciones_especiales,

    NEW.texto_contrato,
    NEW.anexo_a,
    NEW.anexo_b,

    NEW.metodo_aceptacion,
    NEW.aceptado_por,
    NEW.aceptado_correo,

    NEW.responsable_nombre,
    NEW.observaciones
  );

  NEW.contenido_busqueda_normalizado :=
    public.normalizar_busqueda(NEW.contenido_busqueda);

  NEW.updated_at := NOW();

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.preparar_busqueda_documento_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.contenido_busqueda := concat_ws(
    ' ',

    NEW.tipo_documento,
    NEW.titulo,
    NEW.descripcion,

    NEW.version::TEXT,

    NEW.archivo_nombre,
    NEW.archivo_tipo,

    NEW.texto_extraido,

    NEW.fecha_documento::TEXT,
    NEW.fecha_firma::TEXT,

    NEW.observaciones
  );

  NEW.contenido_busqueda_normalizado :=
    public.normalizar_busqueda(NEW.contenido_busqueda);

  NEW.updated_at := NOW();

  RETURN NEW;
END;
$function$
;
CREATE INDEX contratos_lead_id_idx ON public.contratos USING btree (lead_id);
CREATE INDEX contratos_fecha_inicio_idx ON public.contratos USING btree (fecha_inicio);
CREATE INDEX idx_contratos_cotizacion ON public.contratos USING btree (cotizacion_id);
CREATE INDEX cotizaciones_created_at_idx ON public.cotizaciones USING btree (created_at DESC);
CREATE INDEX leads_estado_idx ON public.leads USING btree (estado);
CREATE INDEX contratos_created_at_idx ON public.contratos USING btree (created_at DESC);
CREATE INDEX idx_leads_convertido ON public.leads USING btree (convertido);
CREATE INDEX leads_correo_idx ON public.leads USING btree (correo);
CREATE INDEX contratos_busqueda_normalizada_trgm_idx ON public.contratos USING gin (contenido_busqueda_normalizado gin_trgm_ops);
CREATE INDEX idx_contratos_estado ON public.contratos USING btree (estado);
CREATE INDEX idx_contratos_token_aceptacion ON public.contratos USING btree (token_aceptacion) WHERE (token_aceptacion IS NOT NULL);
CREATE INDEX idx_contratos_numero ON public.contratos USING btree (numero);
CREATE INDEX cotizaciones_estado_idx ON public.cotizaciones USING btree (estado);
CREATE INDEX idx_leads_empresa_id ON public.leads USING btree (empresa_id);
CREATE INDEX leads_responsable_id_idx ON public.leads USING btree (responsable_id);
CREATE INDEX idx_contratos_empresa ON public.contratos USING btree (empresa);
CREATE INDEX idx_contratos_lead ON public.contratos USING btree (lead_id);
CREATE INDEX idx_contratos_rut ON public.contratos USING btree (rut);
CREATE INDEX leads_proximo_seguimiento_idx ON public.leads USING btree (proximo_seguimiento);
CREATE INDEX contratos_empresa_idx ON public.contratos USING btree (empresa);
CREATE UNIQUE INDEX contratos_numero_unique ON public.contratos USING btree (numero);
CREATE INDEX contratos_estado_idx ON public.contratos USING btree (estado);
CREATE INDEX leads_rut_idx ON public.leads USING btree (rut);
CREATE INDEX contratos_rut_idx ON public.contratos USING btree (rut);
CREATE INDEX cotizaciones_lead_id_idx ON public.cotizaciones USING btree (lead_id);
CREATE INDEX contrato_documentos_busqueda_normalizada_trgm_idx ON public.contrato_documentos USING gin (contenido_busqueda_normalizado gin_trgm_ops);
CREATE INDEX usuarios_comerciales_activo_idx ON public.usuarios_comerciales USING btree (activo);
CREATE INDEX contrato_documentos_tipo_idx ON public.contrato_documentos USING btree (tipo_documento);
CREATE INDEX contratos_numero_idx ON public.contratos USING btree (numero);
CREATE INDEX contrato_documentos_contrato_id_idx ON public.contrato_documentos USING btree (contrato_id);
CREATE UNIQUE INDEX usuarios_comerciales_correo_unico ON public.usuarios_comerciales USING btree (lower(correo)) WHERE ((correo IS NOT NULL) AND (TRIM(BOTH FROM correo) <> ''::text));
CREATE INDEX contratos_busqueda_trgm_idx ON public.contratos USING gin (contenido_busqueda gin_trgm_ops);
CREATE INDEX contratos_fecha_termino_idx ON public.contratos USING btree (fecha_termino);
CREATE INDEX contratos_cotizacion_id_idx ON public.contratos USING btree (cotizacion_id);
CREATE INDEX contrato_documentos_firmado_idx ON public.contrato_documentos USING btree (documento_firmado);
CREATE INDEX idx_contratos_fecha_termino ON public.contratos USING btree (fecha_termino);
CREATE INDEX leads_created_at_idx ON public.leads USING btree (created_at DESC);
CREATE INDEX idx_leads_rut ON public.leads USING btree (rut);
CREATE INDEX contrato_documentos_busqueda_trgm_idx ON public.contrato_documentos USING gin (contenido_busqueda gin_trgm_ops);
CREATE INDEX idx_contrato_documentos_contrato_tipo_version ON public.contrato_documentos USING btree (contrato_id, tipo_documento, version DESC);
CREATE TRIGGER trigger_preparar_busqueda_documento_contrato BEFORE INSERT OR UPDATE ON public.contrato_documentos FOR EACH ROW EXECUTE FUNCTION preparar_busqueda_documento_contrato();
CREATE TRIGGER trigger_asignar_numero_contrato BEFORE INSERT ON public.contratos FOR EACH ROW EXECUTE FUNCTION asignar_numero_contrato();
CREATE TRIGGER trigger_preparar_busqueda_contrato BEFORE INSERT OR UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION preparar_busqueda_contrato();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
CREATE TRIGGER usuarios_comerciales_updated_at BEFORE UPDATE ON public.usuarios_comerciales FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
ALTER TABLE public."contrato_documentos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contrato_documentos" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."contrato_documentos" TO service_role;
ALTER TABLE public."contratos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contratos" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."contratos" TO service_role;
ALTER TABLE public."cotizaciones" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."cotizaciones" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."cotizaciones" TO service_role;
ALTER TABLE public."crm_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."crm_profiles" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."crm_profiles" TO service_role;
ALTER TABLE public."empresas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."empresas" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."empresas" TO service_role;
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."leads" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."leads" TO service_role;
ALTER TABLE public."usuarios_comerciales" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."usuarios_comerciales" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public."usuarios_comerciales" TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.contratos_numero_seq TO service_role;

