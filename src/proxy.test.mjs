import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Causa raíz real del bug "recuperación de contraseña no envía el POST"
// (auditoría 2026-08-28, ver también passwordRecoveryCore.test.mjs): el
// matcher del proxy solo excluía "_next/static" y "_next/image", así que
// "/_next/webpack-hmr" (el WebSocket de Hot Module Reload en desarrollo)
// SÍ pasaba por el proxy. Sin sesión, eso producía un 307 hacia /login
// para la propia conexión de HMR -- un WebSocket no puede seguir una
// redirección, así que la conexión fallaba en bucle, Next.js recargaba la
// página una y otra vez, y React nunca llegaba a hidratar: cualquier
// <form> (no solo el de recuperación) quedaba con su envío nativo (GET a
// la misma URL) en vez del onSubmit/fetch de React. Este test fija el
// matcher real por contrato -- exactamente como Next.js lo evalúa -- para
// que una futura edición no vuelva a excluir "_next/webpack-hmr" por
// accidente. Solo afecta a desarrollo (esta ruta no existe en Producción,
// donde HMR no corre), así que el fix es seguro sin importar el entorno.

async function leerMatcher() {
  const source = await readFile(new URL("./proxy.js", import.meta.url), "utf8");
  const match = source.match(/matcher:\s*\[\s*"([^"]+)"\s*\]/);
  assert.ok(match, "no se encontró config.matcher en src/proxy.js");
  return match[1];
}

// Next.js evalúa un matcher de esta forma (patrón "/(...)")  como un regex
// real sobre el pathname -- se reconstruye igual aquí para probar el
// comportamiento real, no solo el texto del patrón.
function compilarMatcher(patron) {
  return new RegExp(`^${patron}$`);
}

test("el matcher del proxy excluye /_next/webpack-hmr (el WebSocket de HMR nunca debe pasar por el auth gate)", async () => {
  const patron = await leerMatcher();
  const regex = compilarMatcher(patron);
  assert.equal(regex.test("/_next/webpack-hmr"), false, "/_next/webpack-hmr debe quedar excluido del proxy");
  assert.equal(regex.test("/_next/webpack-hmr?id=abc123"), false);
});

test("el matcher del proxy sigue excluyendo api, _next/static, _next/image y favicon.ico (sin regresión)", async () => {
  const patron = await leerMatcher();
  const regex = compilarMatcher(patron);
  for (const path of ["/api/auth/recuperar-contrasena", "/_next/static/chunks/main.js", "/_next/image", "/favicon.ico"]) {
    assert.equal(regex.test(path), false, `${path} debe seguir excluido`);
  }
});

test("el matcher del proxy sigue incluyendo rutas normales de la app (el fix no abre el gate de más)", async () => {
  const patron = await leerMatcher();
  const regex = compilarMatcher(patron);
  for (const path of ["/", "/login", "/recuperar-contrasena", "/nueva-contrasena", "/estacionamientos", "/on-street-qr", "/empresas"]) {
    assert.equal(regex.test(path), true, `${path} debe seguir pasando por el proxy`);
  }
});
