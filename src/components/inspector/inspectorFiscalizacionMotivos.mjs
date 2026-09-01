// Separado de InspectorFiscalizacion.js (que tiene JSX y por lo tanto no
// puede importarse directamente con node --test) para poder probarlo.
export const INSPECTOR_FISCALIZACION_MOTIVOS = Object.freeze(["Exceso de tiempo", "Sin sesión", "Otro"]);

// Traduce la etiqueta visible al inspection_type real que espera la API
// (Etapa 2) -- un único punto de verdad, para que UI y servidor nunca
// diverjan en el mapeo.
export const INSPECTOR_FISCALIZACION_TYPE_BY_MOTIVO = Object.freeze({
  "Exceso de tiempo": "OVERSTAY",
  "Sin sesión": "NO_SESSION",
  "Otro": "OTHER",
});
