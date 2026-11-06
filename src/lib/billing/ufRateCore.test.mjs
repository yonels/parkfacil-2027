import test from "node:test";
import assert from "node:assert/strict";
import { buildBcchUfUrl, DEFAULT_UF_SERIES_ID, isoToBcchDate, parseBcchUfResponse, parseUfValue } from "./ufRateCore.mjs";

const ok = (obs) => ({ Codigo: 0, Descripcion: "Success", Series: { seriesId: DEFAULT_UF_SERIES_ID, Obs: obs }, SeriesInfos: [] });

test("la consulta usa token (forma REST vigente) y la fecha en ambos límites", () => {
  const url = buildBcchUfUrl({ token: "tok", date: "2026-11-05" });
  assert.equal(url.searchParams.get("token"), "tok");
  assert.equal(url.searchParams.get("user"), null);
  assert.equal(url.searchParams.get("function"), "GetSeries");
  assert.equal(url.searchParams.get("timeseries"), DEFAULT_UF_SERIES_ID);
  assert.equal(url.searchParams.get("firstdate"), "2026-11-05");
  assert.equal(url.searchParams.get("lastdate"), "2026-11-05");
});

test("sin token ni usuario y contraseña, falla con mensaje de configuración", () => {
  assert.throws(() => buildBcchUfUrl({ date: "2026-11-05" }), (e) => e.code === "BCCH_NOT_CONFIGURED");
});

test("el valor con punto decimal no se multiplica por 100 (error del código anterior)", () => {
  assert.equal(parseUfValue("39643.21"), 39643.21);
  assert.equal(parseUfValue("39.643,21"), 39643.21);
  assert.ok(Number.isNaN(parseUfValue("NaN")));
});

test("toma la observación de la fecha pedida, aunque el Banco Central responda DD-MM-AAAA", () => {
  assert.equal(isoToBcchDate("2026-11-05"), "05-11-2026");
  const result = parseBcchUfResponse(ok([{ indexDateString: "04-11-2026", value: "39600.10", statusCode: "OK" }, { indexDateString: "05-11-2026", value: "39643.21", statusCode: "OK" }]), "2026-11-05");
  assert.equal(result.value, 39643.21);
  assert.equal(result.source, "Banco Central de Chile");
});

test("sin dato del día (ND / NaN) o sin la fecha, no inventa un valor", () => {
  assert.throws(() => parseBcchUfResponse(ok([{ indexDateString: "05-11-2026", value: "NaN", statusCode: "ND" }]), "2026-11-05"), (e) => e.code === "BCCH_UF_NOT_AVAILABLE");
  assert.throws(() => parseBcchUfResponse(ok([{ indexDateString: "04-11-2026", value: "39600.10", statusCode: "OK" }]), "2026-11-05"), (e) => e.code === "BCCH_UF_NOT_FOUND");
});

test("rechazo del Banco Central o valor fuera de rango", () => {
  assert.throws(() => parseBcchUfResponse({ Codigo: -5, Descripcion: "Invalid username or password" }, "2026-11-05"), (e) => e.code === "BCCH_REJECTED");
  assert.throws(() => parseBcchUfResponse(ok([{ indexDateString: "05-11-2026", value: "3964321", statusCode: "OK" }]), "2026-11-05"), (e) => e.code === "BCCH_INVALID_RESPONSE");
});
