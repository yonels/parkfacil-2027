import test from "node:test";
import assert from "node:assert/strict";
import {
  requireSentralandConfig,
  parseSentralandTokenResponse,
  sentralandGetToken,
  parseSentralandSendResponse,
  sentralandSendSms,
  mapSentralandDeliveryState,
  parseSentralandStatusResponse,
  sentralandQueryStatus,
  parseSentralandBalanceResponse,
  SENTRALAND_SMS_MAX_LENGTH,
} from "./sentralandCore.mjs";

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const FULL_CONFIG_ENV = {
  SENTRALAND_INSTITUCION: "999",
  SENTRALAND_TIPO_SERVICIO: "1",
  SENTRALAND_USUARIO: "parkfacil",
  SENTRALAND_PASSWORD: "secret",
};

function fakeFetch(jsonBody, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => jsonBody };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// --- 1. Configuración fail-closed, incluida SENTRALAND_TIPO_SERVICIO (condición 2 de la autorización) ---
test("sin ninguna variable configurada, falla explícito y no permite armar la petición", () => {
  withEnv({ SENTRALAND_INSTITUCION: "", SENTRALAND_TIPO_SERVICIO: "", SENTRALAND_USUARIO: "", SENTRALAND_PASSWORD: "" }, () => {
    assert.throws(() => requireSentralandConfig(), { code: "SENTRALAND_INSTITUCION_NOT_CONFIGURED" });
  });
});

test("con todo configurado salvo tipo_servicio, falla con SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED y no con otro código", () => {
  withEnv({ SENTRALAND_INSTITUCION: "999", SENTRALAND_TIPO_SERVICIO: "", SENTRALAND_USUARIO: "parkfacil", SENTRALAND_PASSWORD: "secret" }, () => {
    assert.throws(() => requireSentralandConfig(), { code: "SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED" });
  });
});

test("sentralandGetToken no llama a fetch en absoluto si falta tipo_servicio", async () => {
  await withEnv({ SENTRALAND_INSTITUCION: "999", SENTRALAND_TIPO_SERVICIO: "", SENTRALAND_USUARIO: "parkfacil", SENTRALAND_PASSWORD: "secret" }, async () => {
    const fetchImpl = fakeFetch({});
    await assert.rejects(() => sentralandGetToken({ fetchImpl }), { code: "SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED" });
    assert.equal(fetchImpl.calls.length, 0, "no debe llamar al proveedor sin tipo_servicio configurado");
  });
});

test("sentralandSendSms tampoco llama al proveedor sin tipo_servicio", async () => {
  await withEnv({ SENTRALAND_INSTITUCION: "999", SENTRALAND_TIPO_SERVICIO: "", SENTRALAND_USUARIO: "parkfacil", SENTRALAND_PASSWORD: "secret" }, async () => {
    const fetchImpl = fakeFetch({});
    await assert.rejects(() => sentralandSendSms({ fono: "+56912345678", mensaje: "hola", token: "t", fetchImpl }), { code: "SENTRALAND_TIPO_SERVICIO_NOT_CONFIGURED" });
    assert.equal(fetchImpl.calls.length, 0);
  });
});

// --- 2. Token: éxito y error de autenticación ---
test("token correcto: codigo 0 devuelve el valor tomado de descripcion (parsing provisional encapsulado)", () => {
  assert.equal(parseSentralandTokenResponse({ codigo: 0, descripcion: "abc123token" }), "abc123token");
});

test("token con codigo distinto de 0 lanza SENTRALAND_TOKEN_ERROR con el detalle del proveedor", () => {
  assert.throws(() => parseSentralandTokenResponse({ codigo: 6, descripcion: "DATOS INGRESADOS NO VALIDOS." }), (err) => err.code === "SENTRALAND_TOKEN_ERROR" && err.providerCode === 6);
});

test("sentralandGetToken hace POST a la URL de token con credenciales y arma bien el body", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({ codigo: 0, descripcion: "el-token-real" });
    const token = await sentralandGetToken({ fetchImpl });
    assert.equal(token, "el-token-real");
    assert.equal(fetchImpl.calls.length, 1);
    assert.match(fetchImpl.calls[0].url, /^https:\/\/ws\.sentraland\.net\/token\/index\.ams$/);
    const sent = new URLSearchParams(fetchImpl.calls[0].init.body);
    assert.equal(sent.get("institucion"), "999");
    assert.equal(sent.get("tipo_servicio"), "1");
    assert.equal(sent.get("usuario"), "parkfacil");
    assert.equal(sent.get("password"), "secret");
  });
});

test("error de autenticación (codigo distinto de 0) propaga el rechazo sin token utilizable", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({ codigo: 6, descripcion: "DATOS INGRESADOS NO VALIDOS." });
    await assert.rejects(() => sentralandGetToken({ fetchImpl }), { code: "SENTRALAND_TOKEN_ERROR" });
  });
});

// --- 3. Envío SMS correcto, almacenamiento de idmensaje, error sin bolsa, teléfono inválido, longitud máxima ---
test("envío correcto: codigo 0 conserva idmensaje", () => {
  const parsed = parseSentralandSendResponse({ codigo: 0, descripcion: "Ok mensaje enviado", idmensaje: "778899" });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.idmensaje, "778899");
});

test("error sin SMS en bolsa (codigo 2) se reconoce y no se confunde con éxito", () => {
  const parsed = parseSentralandSendResponse({ codigo: 2, descripcion: "ERROR SIN SMS EN BOLSA" });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, 2);
  assert.equal(parsed.idmensaje, null);
});

test("teléfono inválido se rechaza antes de llamar al proveedor", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({});
    await assert.rejects(() => sentralandSendSms({ fono: "no-es-un-fono", mensaje: "hola", token: "t", fetchImpl }), { code: "SENTRALAND_PHONE_INVALID" });
    assert.equal(fetchImpl.calls.length, 0);
  });
});

test("mensaje sobre 160 caracteres se rechaza antes de llamar al proveedor", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({});
    const largo = "x".repeat(SENTRALAND_SMS_MAX_LENGTH + 1);
    await assert.rejects(() => sentralandSendSms({ fono: "+56912345678", mensaje: largo, token: "t", fetchImpl }), { code: "SENTRALAND_MESSAGE_TOO_LONG" });
    assert.equal(fetchImpl.calls.length, 0);
  });
});

test("mensaje de exactamente 160 caracteres sí se envía", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({ codigo: 0, descripcion: "Ok mensaje enviado", idmensaje: "1" });
    const justo = "x".repeat(SENTRALAND_SMS_MAX_LENGTH);
    const result = await sentralandSendSms({ fono: "+56912345678", mensaje: justo, token: "t", fetchImpl });
    assert.equal(result.ok, true);
  });
});

test("sentralandSendSms envía fono, mensaje y token en el body", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({ codigo: 0, descripcion: "Ok mensaje enviado", idmensaje: "42" });
    await sentralandSendSms({ fono: "+56912345678", mensaje: "vence en 15 min", token: "tok-1", fetchImpl });
    const sent = new URLSearchParams(fetchImpl.calls[0].init.body);
    assert.equal(sent.get("fono"), "+56912345678");
    assert.equal(sent.get("mensaje"), "vence en 15 min");
    assert.equal(sent.get("token"), "tok-1");
    assert.match(fetchImpl.calls[0].url, /tkFinanciero\/index\.ams$/);
  });
});

// --- 4. Consulta de DLR y mapeo DELIVRD -> DELIVERED ---
test("DELIVRD con estado 0 mapea a DELIVERED", () => {
  assert.equal(mapSentralandDeliveryState("0", "DELIVRD"), "DELIVERED");
});

test("estado 0 con descripcion distinta de DELIVRD no se asume entregado (ACCEPTED, no DELIVERED)", () => {
  assert.equal(mapSentralandDeliveryState("0", "ENROUTE"), "ACCEPTED");
});

test("idmensaje inexistente (estado 7) y datos inválidos (estado 104) mapean a UNKNOWN, nunca a DELIVERED", () => {
  assert.equal(mapSentralandDeliveryState("7", ""), "UNKNOWN");
  assert.equal(mapSentralandDeliveryState("104", ""), "UNKNOWN");
});

test("sentralandQueryStatus exige idmensaje y no llama al proveedor sin él", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({});
    await assert.rejects(() => sentralandQueryStatus({ idmensaje: "", fetchImpl }), { code: "SENTRALAND_IDMENSAJE_REQUIRED" });
    assert.equal(fetchImpl.calls.length, 0);
  });
});

test("sentralandQueryStatus consulta con idmensaje y devuelve deliveryState calculado", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = fakeFetch({ idmensaje: "778899", fechainicio: "2026-08-21 10:00:00", fechatermino: "2026-08-21 10:00:05", fono: "56912345678", estado: "0", descripcion: "DELIVRD", operador: "ENTEL" });
    const status = await sentralandQueryStatus({ idmensaje: "778899", fetchImpl });
    assert.equal(status.deliveryState, "DELIVERED");
    assert.equal(status.idmensaje, "778899");
    assert.match(fetchImpl.calls[0].url, /smsstatus\/index\.ams$/);
    assert.equal(new URLSearchParams(fetchImpl.calls[0].init.body).get("idmensaje"), "778899");
  });
});

test("parseSentralandStatusResponse nunca lanza ante los ejemplos de error documentados", () => {
  const errorSinAcceso = parseSentralandStatusResponse({ idmensaje: 0, fechainicio: null, fechatermino: null, fono: null, estado: 7, descripcion: "ERROR IDMENSAJE NO EXISTE O SIN ACCESO.", operador: "" });
  assert.equal(errorSinAcceso.deliveryState, "UNKNOWN");
});

// --- 5. Estado de bolsa ---
test("estado de bolsa parsea la lista de bolsas cuando codigo es 0", () => {
  const parsed = parseSentralandBalanceResponse({ codigo: 0, descripcion: [{ bolsa_id: 1, banco_id: 2, cantidad: 1000, saldo: 400, fecha_creacion: "a", fecha_fin: "b", status: "vigente", creado: "c" }] });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.bags.length, 1);
  assert.equal(parsed.bags[0].saldo, 400);
  assert.equal(parsed.bags[0].status, "vigente");
});

test("estado de bolsa con datos inválidos (codigo 6) no lanza y reporta ok:false", () => {
  const parsed = parseSentralandBalanceResponse({ codigo: 6, descripcion: "DATOS INGRESADOS NO VALIDOS." });
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.bags, []);
});

// --- 6. TLS estándar: nunca se debilita la verificación ---
test("el núcleo nunca configura opciones de deshabilitar TLS", async () => {
  // Se excluyen las líneas de comentario: el archivo documenta a propósito
  // qué NO replicar de los manuales de Sentraland (que sí deshabilitan
  // TLS), así que esas palabras aparecen en prosa explicativa, nunca en
  // código real.
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./sentralandCore.mjs", import.meta.url), "utf8"));
  const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /rejectUnauthorized\s*:\s*false/);
  assert.doesNotMatch(code, /NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.doesNotMatch(code, /VERIFYPEER/i);
  assert.doesNotMatch(code, /trustAllCerts|TrustManager|new https\.Agent/);
});

// --- 7. Credenciales nunca expuestas al cliente ---
test("ninguna variable de Sentraland usa el prefijo NEXT_PUBLIC_", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./sentralandCore.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /NEXT_PUBLIC_SENTRALAND/);
});

test("el punto de entrada real (sentralandClient.mjs) lleva la marca server-only y no duplica lógica", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./sentralandClient.mjs", import.meta.url), "utf8"));
  assert.match(source, /import "server-only"/);
  assert.match(source, /export \* from ".\/sentralandCore\.mjs"/);
});

test("HTTP 500 al obtener token se reintenta una vez y luego puede recuperarse", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return calls === 1 ? { ok: false, status: 500 } : { ok: true, status: 200, json: async () => ({ codigo: 0, descripcion: "token" }) }; };
    assert.equal(await sentralandGetToken({ fetchImpl }), "token");
    assert.equal(calls, 2);
  });
});

test("timeout se clasifica y el token reintenta solo el maximo seguro", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    let calls = 0;
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => { calls += 1; signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
    await assert.rejects(() => sentralandGetToken({ fetchImpl, timeoutMs: 5 }), { code: "SENTRALAND_TIMEOUT" });
    assert.equal(calls, 2);
  });
});

test("respuesta JSON invalida falla cerrada", async () => {
  await withEnv(FULL_CONFIG_ENV, async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } });
    await assert.rejects(() => sentralandSendSms({ fono: "+56912345678", mensaje: "hola", token: "t", fetchImpl }), { code: "SENTRALAND_RESPONSE_INVALID" });
  });
});
