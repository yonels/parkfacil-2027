/******************************************************************
 * PARKFACIL 2027
 * MODELO ON STREET: ESPACIOS POR LADO Y ZONAS CONFIGURABLES
 *
 * Objetivos:
 * 1. Incorporar capacidad y ocupación separadas por lado.
 * 2. Mantener los campos antiguos para compatibilidad.
 * 3. Crear zonas configurables por tramo.
 * 4. No inventar la distribución de los registros existentes.
 ******************************************************************/

BEGIN;

/******************************************************************
 * 1. AMPLIAR LOS TRAMOS ON STREET
 ******************************************************************/

ALTER TABLE public.parking_street_segments
ADD COLUMN IF NOT EXISTS right_capacity integer,
ADD COLUMN IF NOT EXISTS left_capacity integer,
ADD COLUMN IF NOT EXISTS right_occupied_spaces integer,
ADD COLUMN IF NOT EXISTS left_occupied_spaces integer;

/*
 * Los campos quedan inicialmente en NULL porque los datos antiguos
 * no indican cómo se distribuye la capacidad entre ambos lados.
 */

ALTER TABLE public.parking_street_segments
DROP CONSTRAINT IF EXISTS parking_street_segments_right_capacity_check;

ALTER TABLE public.parking_street_segments
ADD CONSTRAINT parking_street_segments_right_capacity_check
CHECK (
  right_capacity IS NULL
  OR right_capacity >= 0
);

ALTER TABLE public.parking_street_segments
DROP CONSTRAINT IF EXISTS parking_street_segments_left_capacity_check;

ALTER TABLE public.parking_street_segments
ADD CONSTRAINT parking_street_segments_left_capacity_check
CHECK (
  left_capacity IS NULL
  OR left_capacity >= 0
);

ALTER TABLE public.parking_street_segments
DROP CONSTRAINT IF EXISTS parking_street_segments_right_occupied_check;

ALTER TABLE public.parking_street_segments
ADD CONSTRAINT parking_street_segments_right_occupied_check
CHECK (
  right_occupied_spaces IS NULL
  OR (
    right_occupied_spaces >= 0
    AND right_capacity IS NOT NULL
    AND right_occupied_spaces <= right_capacity
  )
);

ALTER TABLE public.parking_street_segments
DROP CONSTRAINT IF EXISTS parking_street_segments_left_occupied_check;

ALTER TABLE public.parking_street_segments
ADD CONSTRAINT parking_street_segments_left_occupied_check
CHECK (
  left_occupied_spaces IS NULL
  OR (
    left_occupied_spaces >= 0
    AND left_capacity IS NOT NULL
    AND left_occupied_spaces <= left_capacity
  )
);

/******************************************************************
 * 2. CREAR ZONAS CONFIGURABLES POR TRAMO
 ******************************************************************/

CREATE TABLE IF NOT EXISTS public.parking_street_segment_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  segment_id uuid NOT NULL
    REFERENCES public.parking_street_segments(id)
    ON DELETE CASCADE,

  code text NOT NULL,
  name text NOT NULL,

  right_capacity integer NOT NULL DEFAULT 0,
  left_capacity integer NOT NULL DEFAULT 0,

  right_occupied_spaces integer NOT NULL DEFAULT 0,
  left_occupied_spaces integer NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'ACTIVE',
  sort_order integer NOT NULL DEFAULT 0,

  description text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT parking_street_segment_zones_segment_code_key
    UNIQUE (segment_id, code),

  CONSTRAINT parking_street_segment_zones_code_check
    CHECK (code ~ '^[A-Z0-9_-]{1,30}$'),

  CONSTRAINT parking_street_segment_zones_right_capacity_check
    CHECK (right_capacity >= 0),

  CONSTRAINT parking_street_segment_zones_left_capacity_check
    CHECK (left_capacity >= 0),

  CONSTRAINT parking_street_segment_zones_right_occupied_check
    CHECK (
      right_occupied_spaces >= 0
      AND right_occupied_spaces <= right_capacity
    ),

  CONSTRAINT parking_street_segment_zones_left_occupied_check
    CHECK (
      left_occupied_spaces >= 0
      AND left_occupied_spaces <= left_capacity
    ),

  CONSTRAINT parking_street_segment_zones_total_capacity_check
    CHECK (
      right_capacity + left_capacity > 0
    ),

  CONSTRAINT parking_street_segment_zones_status_check
    CHECK (
      status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')
    )
);

/******************************************************************
 * 3. ÍNDICES
 ******************************************************************/

CREATE INDEX IF NOT EXISTS
parking_street_segment_zones_segment_id_idx
ON public.parking_street_segment_zones(segment_id);

CREATE INDEX IF NOT EXISTS
parking_street_segment_zones_status_idx
ON public.parking_street_segment_zones(status);

/******************************************************************
 * 4. DOCUMENTACIÓN DE COLUMNAS
 ******************************************************************/

COMMENT ON COLUMN public.parking_street_segments.right_capacity IS
'Cantidad total de espacios disponibles en el lado derecho del tramo.';

COMMENT ON COLUMN public.parking_street_segments.left_capacity IS
'Cantidad total de espacios disponibles en el lado izquierdo del tramo.';

COMMENT ON COLUMN public.parking_street_segments.right_occupied_spaces IS
'Cantidad de espacios ocupados en el lado derecho del tramo.';

COMMENT ON COLUMN public.parking_street_segments.left_occupied_spaces IS
'Cantidad de espacios ocupados en el lado izquierdo del tramo.';

COMMENT ON TABLE public.parking_street_segment_zones IS
'Zonas configurables dentro de un tramo On Street, distribuidas entre los lados derecho e izquierdo.';

COMMIT;