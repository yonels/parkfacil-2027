// Boleta electrónica (SOL-2026-10-20-001): constantes sin dependencias de
// servidor, para usarlas también en componentes del navegador.

export const DTE_PROVIDERS = Object.freeze({ HAULMER: "HAULMER" });
export const DTE_ENVIRONMENTS = Object.freeze({ TEST: "TEST", PRODUCTION: "PRODUCTION" });
export const DTE_ENVIRONMENT_LABELS = Object.freeze({ TEST: "Prueba", PRODUCTION: "Producción" });

export const DTE_STATUS = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  CONFIGURED_INACTIVE: "CONFIGURED_INACTIVE",
  CONFIGURED: "CONFIGURED",
});
export const DTE_STATUS_LABELS = Object.freeze({
  NOT_CONFIGURED: "Sin configurar",
  CONFIGURED_INACTIVE: "API Key cargada, sin estacionamientos activos",
  CONFIGURED: "Configurada",
});
