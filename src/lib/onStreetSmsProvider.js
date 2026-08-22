import "server-only";
// Punto de entrada real para el resto de la aplicación — la lógica vive en
// onStreetSmsProviderCore.mjs (sin server-only, testeable en directo).
export * from "./onStreetSmsProviderCore.mjs";
