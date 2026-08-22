import "server-only";
// Punto de entrada real para el resto de la aplicación — toda la lógica
// vive en sentralandCore.mjs (sin server-only, para poder testearla en
// directo). Este archivo existe únicamente para garantizar que nada que
// toque credenciales de Sentraland pueda terminar en un bundle de cliente.
export * from "./sentralandCore.mjs";
