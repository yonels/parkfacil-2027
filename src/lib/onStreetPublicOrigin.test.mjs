import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveOnStreetPublicOrigin, ON_STREET_CANONICAL_ORIGIN } from "./onStreetPublicOrigin.mjs";

test("el dominio canónico documentado es onstreet.parkfacilapp.cl", () => {
  assert.equal(ON_STREET_CANONICAL_ORIGIN, "https://onstreet.parkfacilapp.cl");
});

test("un override explícito siempre gana, en cualquier ambiente", () => {
  assert.equal(resolveOnStreetPublicOrigin({ configuredOrigin: "https://override.test/", requestOrigin: "https://onstreet.parkfacilapp.cl", nodeEnv: "production" }), "https://override.test");
  assert.equal(resolveOnStreetPublicOrigin({ configuredOrigin: "https://override.test", requestOrigin: "http://localhost:3000", nodeEnv: "development" }), "https://override.test");
});

test("en producción, sin override, usa siempre el dominio canónico -- sin importar por qué alias llegó la petición", () => {
  assert.equal(resolveOnStreetPublicOrigin({ requestOrigin: "https://parkfacil-2027.vercel.app", nodeEnv: "production" }), ON_STREET_CANONICAL_ORIGIN);
  assert.equal(resolveOnStreetPublicOrigin({ requestOrigin: "https://root.parkfacilapp.cl", nodeEnv: "production" }), ON_STREET_CANONICAL_ORIGIN);
  assert.equal(resolveOnStreetPublicOrigin({ requestOrigin: "https://onstreet.parkfacilapp.cl", nodeEnv: "production" }), ON_STREET_CANONICAL_ORIGIN);
});

test("fuera de producción, sin override, usa el origin real de la petición (localhost sigue funcionando)", () => {
  assert.equal(resolveOnStreetPublicOrigin({ requestOrigin: "http://localhost:3000", nodeEnv: "development" }), "http://localhost:3000");
  assert.equal(resolveOnStreetPublicOrigin({ requestOrigin: "http://localhost:3000/", nodeEnv: "test" }), "http://localhost:3000");
});

test("nunca deja una barra final", () => {
  assert.equal(resolveOnStreetPublicOrigin({ configuredOrigin: "https://onstreet.parkfacilapp.cl/" }), "https://onstreet.parkfacilapp.cl");
});

// --- Contrato: los tres puntos que construyen URLs públicas On-Street usan
// este único helper, no PARKFACIL_PUBLIC_BASE_URL directamente (la causa
// exacta del incidente 2026-08-26). ---

function withoutComments(source) {
  return source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
}

test("el inicio de Webpay usa el dominio canónico On-Street, no PARKFACIL_PUBLIC_BASE_URL directamente", async () => {
  const code = withoutComments(await readFile(new URL("../app/api/public/on-street/payment-intents/[token]/webpay/route.js", import.meta.url), "utf8"));
  assert.match(code, /resolveOnStreetPublicOrigin/);
  assert.doesNotMatch(code, /PARKFACIL_PUBLIC_BASE_URL/);
});

test("el retorno de Webpay usa el dominio canónico On-Street, no PARKFACIL_PUBLIC_BASE_URL directamente", async () => {
  const code = withoutComments(await readFile(new URL("../app/api/public/on-street/webpay/return/route.js", import.meta.url), "utf8"));
  assert.match(code, /resolveOnStreetPublicOrigin/);
  assert.doesNotMatch(code, /PARKFACIL_PUBLIC_BASE_URL/);
});

test("el enlace del SMS T-15 usa el dominio canónico On-Street, no PARKFACIL_PUBLIC_BASE_URL directamente", async () => {
  const code = withoutComments(await readFile(new URL("./onStreetSmsService.js", import.meta.url), "utf8"));
  assert.match(code, /resolveOnStreetPublicOrigin/);
  assert.doesNotMatch(code, /PARKFACIL_PUBLIC_BASE_URL/);
});
