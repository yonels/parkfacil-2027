import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Mismo enfoque que el resto de pruebas de este repo sobre componentes con
// JSX (ver src/app/modelo-dashboard/page.filtering.test.mjs y
// src/lib/onStreetWebpay.test.mjs): sin infraestructura de render de React
// (sin jsdom/testing-library), Node no puede parsear JSX directamente. Este
// page.js es un Server Component async cuyo cuerpo relevante (resolución del
// QR: no existe / falla de infraestructura / válido) es lógica pura sin JSX
// -- se extrae tal cual del archivo fuente y se ejecuta de verdad con
// `new Function`, inyectando dobles de isPublicCode/getPublicQrLocation y
// capturando console.error, para probar comportamiento real y no una
// reimplementación paralela. Las tres ramas de JSX que consumen el
// resultado (servicio no disponible / no válido / válido) se verifican por
// contrato sobre el código fuente, igual que onStreetWebpay.test.mjs.

const source = await readFile(new URL("./page.js", import.meta.url), "utf8");

const logicStart = source.indexOf("let result = null, serviceUnavailable = false;");
const logicEnd = source.indexOf("\n  if (serviceUnavailable)");
assert.ok(logicStart > -1 && logicEnd > logicStart, "no se encontró el bloque de resolución del QR en page.js");
const logicSrc = source.slice(logicStart, logicEnd);

async function resolveQr({ qrCode, isPublicCode, getPublicQrLocation, onError }) {
  const console = { error: (...args) => onError(args) };
  const driver = new Function(
    "qrCode", "isPublicCode", "getPublicQrLocation", "console",
    `return (async () => { ${logicSrc} ; return { result, serviceUnavailable }; })();`,
  );
  return driver(qrCode, isPublicCode, getPublicQrLocation, console);
}

// --- Comportamiento real (ejecutado, no solo inspeccionado) ---

test("QR válido: devuelve el resultado real y no marca falla de servicio", async () => {
  const location = { qr: { id: "loc-1" }, rate: { minute_amount: 35 } };
  const { result, serviceUnavailable } = await resolveQr({
    qrCode: "abc123",
    isPublicCode: () => true,
    getPublicQrLocation: async () => location,
    onError: () => assert.fail("no debe loguear error alguno para un QR válido"),
  });
  assert.equal(result, location);
  assert.equal(serviceUnavailable, false);
});

test("QR inexistente/inactivo: getPublicQrLocation resuelve null sin lanzar, no se marca falla de servicio", async () => {
  const { result, serviceUnavailable } = await resolveQr({
    qrCode: "no-existe",
    isPublicCode: () => true,
    getPublicQrLocation: async () => null,
    onError: () => assert.fail("un QR inexistente no es un error de infraestructura"),
  });
  assert.equal(result, null);
  assert.equal(serviceUnavailable, false);
});

test("código con formato inválido: ni siquiera se consulta el backend", async () => {
  const { result, serviceUnavailable } = await resolveQr({
    qrCode: "??",
    isPublicCode: () => false,
    getPublicQrLocation: async () => assert.fail("no debe consultarse si el formato ya es inválido"),
    onError: () => assert.fail("no debe loguear error alguno"),
  });
  assert.equal(result, null);
  assert.equal(serviceUnavailable, false);
});

test("falla de infraestructura (Supabase caída): se marca serviceUnavailable, nunca se confunde con QR inexistente", async () => {
  const logged = [];
  const { result, serviceUnavailable } = await resolveQr({
    qrCode: "abc123",
    isPublicCode: () => true,
    getPublicQrLocation: async () => { throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED", stack: "at secret/internal/path.js:1:1" }); },
    onError: (args) => logged.push(args),
  });
  assert.equal(result, null);
  assert.equal(serviceUnavailable, true, "una excepción real debe distinguirse de un QR inexistente");
  assert.equal(logged.length, 1, "el error debe quedar registrado server-side exactamente una vez");
});

test("el registro server-side nunca expone el stack trace ni el objeto de error completo", async () => {
  const logged = [];
  await resolveQr({
    qrCode: "abc123",
    isPublicCode: () => true,
    getPublicQrLocation: async () => { throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED", stack: "at secret/internal/path.js:1:1", serviceRoleKey: "sb_secret_should_never_be_logged" }); },
    onError: (args) => logged.push(args),
  });
  const [, payload] = logged[0];
  assert.equal(payload.code, "ECONNREFUSED");
  assert.equal("stack" in payload, false);
  assert.equal("serviceRoleKey" in payload, false);
  assert.equal(JSON.stringify(payload).includes("secret/internal/path.js"), false);
});

test("un error sin .code cae de vuelta a .message, nunca al objeto Error completo", async () => {
  const logged = [];
  await resolveQr({
    qrCode: "abc123",
    isPublicCode: () => true,
    getPublicQrLocation: async () => { throw new Error("timeout genérico"); },
    onError: (args) => logged.push(args),
  });
  const [, payload] = logged[0];
  assert.equal(payload.code, "timeout genérico");
});

// --- Contrato sobre las tres ramas de JSX que consumen result/serviceUnavailable ---

test("la rama de falla de servicio nunca usa el texto de 'código no válido', y viceversa", () => {
  const serviceBranch = source.slice(source.indexOf("if (serviceUnavailable)"), source.indexOf("if (!result)"));
  const notFoundBranch = source.slice(source.indexOf("if (!result) return"), source.indexOf("if (!result.rate)"));
  assert.match(serviceBranch, /Servicio no disponible/);
  assert.doesNotMatch(serviceBranch, /no válido/);
  assert.match(notFoundBranch, /Código QR no válido/);
  assert.doesNotMatch(notFoundBranch, /Servicio no disponible/);
});

test("el flujo de QR válido (PublicParkingStart) no fue tocado por la corrección", () => {
  assert.match(source, /return <PublicParkingStart qrCode=\{qrCode\} location=\{location\}\/>/);
});
