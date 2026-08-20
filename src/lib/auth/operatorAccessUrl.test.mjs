import assert from "node:assert/strict";
import test from "node:test";

import {
  OPERATOR_ACCESS_FALLBACK_URL,
  buildOperatorAccessUrl,
} from "./operatorAccessUrl.mjs";

test("desde el Portal Root de producción, apunta al Portal Cliente de producción", () => {
  assert.equal(
    buildOperatorAccessUrl("root.parkfacilapp.cl"),
    "https://cliente.parkfacilapp.cl/acceso-operador"
  );
});

test("desde el Portal Cliente de producción, sigue apuntando al Portal Cliente", () => {
  assert.equal(
    buildOperatorAccessUrl("cliente.parkfacilapp.cl"),
    "https://cliente.parkfacilapp.cl/acceso-operador"
  );
});

test("localhost (Root local) apunta a cliente.localhost conservando el puerto", () => {
  assert.equal(
    buildOperatorAccessUrl("localhost:3000"),
    "http://cliente.localhost:3000/acceso-operador"
  );
  assert.equal(
    buildOperatorAccessUrl("127.0.0.1:3000"),
    "http://cliente.localhost:3000/acceso-operador"
  );
});

test("cliente.localhost conserva el puerto", () => {
  assert.equal(
    buildOperatorAccessUrl("cliente.localhost:3000"),
    "http://cliente.localhost:3000/acceso-operador"
  );
});

test("host desconocido cae al dominio de producción del Portal Cliente", () => {
  assert.equal(
    buildOperatorAccessUrl("preview-123.vercel.app"),
    OPERATOR_ACCESS_FALLBACK_URL
  );
  assert.equal(buildOperatorAccessUrl(""), OPERATOR_ACCESS_FALLBACK_URL);
  assert.equal(buildOperatorAccessUrl(undefined), OPERATOR_ACCESS_FALLBACK_URL);
});
