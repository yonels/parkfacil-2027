import test from "node:test";
import assert from "node:assert/strict";
import { buildCredentialEmailHtml, buildCredentialQrPayload, generateCredentialQrPngBase64, sendAbonadoCredentialEmail, CredentialEmailValidationError, getCredentialOperationalStatus } from "./abonadosCredentialEmailCore.js";

const ids = {
  abonado: "00000000-0000-4000-8000-000000000001",
  other: "00000000-0000-4000-8000-000000000002",
  cred: "00000000-0000-4000-8000-000000000003",
  vehicle: "00000000-0000-4000-8000-000000000004",
};

function createSupabase({ credencial = {}, abonado = {}, vehiculo = {}, traceInsertError = null } = {}) {
  const data = {
    abonados: abonado === null ? null : { id: ids.abonado, codigo: "AB-TEST", nombre: "Persona Test", correo: "persona@example.com", rut: "11111111-1", ...abonado },
    abonado_credenciales: credencial === null ? null : { id: ids.cred, abonado_id: ids.abonado, numero: "QR-MS3P06XB-FB1RAF", tipo: "qr_code", status: "active", ...credencial },
    abonado_vehiculos: vehiculo === null ? null : { id: ids.vehicle, abonado_id: ids.abonado, license_plate: "TEST12", ...vehiculo },
  };
  const traces = [];
  return {
    traces,
    from(table) {
      const state = { table, op: "select", values: null };
      const api = {
        select() { return api; },
        eq() { return api; },
        insert(values) { state.op = "insert"; state.values = values; return api; },
        update(values) { state.op = "update"; state.values = values; return api; },
        single: async () => {
          if (state.op === "insert" && table === "abonado_credencial_envios") {
            if (traceInsertError) return { data: null, error: traceInsertError };
            const id = `trace-${traces.length + 1}`;
            traces.push({ id, ...state.values });
            return { data: { id }, error: null };
          }
          return { data: data[table] || null, error: data[table] ? null : { message: "not found" } };
        },
        then(resolve) {
          if (state.op === "update" && table === "abonado_credencial_envios") {
            traces.push({ update: true, ...state.values });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: data[table] ? [data[table]] : [], error: null }).then(resolve);
        },
      };
      return api;
    },
  };
}

test("QR payload is generated only from credential number", () => {
  const credencial = { numero: "QR-MS3P06XB-FB1RAF", rut: "11111111-1", correo: "secret@example.com", vehiculo_id: ids.vehicle };
  assert.equal(buildCredentialQrPayload(credencial), "QR-MS3P06XB-FB1RAF");
  assert.equal(buildCredentialQrPayload(credencial).includes(credencial.rut), false);
  assert.equal(buildCredentialQrPayload(credencial).includes(credencial.correo), false);
});

test("QR PNG is generated from credential number", async () => {
  const qr = await generateCredentialQrPngBase64({ numero: "QR-MS3P06XB-FB1RAF" });
  assert.equal(typeof qr, "string");
  assert.ok(qr.length > 100);
});

test("missing credential, wrong subscriber and inactive credential are controlled", async () => {
  await assert.rejects(() => sendAbonadoCredentialEmail({ supabase: createSupabase({ credencial: null }), abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "a@example.com" }), CredentialEmailValidationError);
  await assert.rejects(() => sendAbonadoCredentialEmail({ supabase: createSupabase({ credencial: { abonado_id: ids.other } }), abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "a@example.com" }), /pertenece/);
  await assert.rejects(() => sendAbonadoCredentialEmail({ supabase: createSupabase({ credencial: { status: "revoked" } }), abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "a@example.com" }), /activa/);
});

test("invalid recipient is rejected before sending", async () => {
  await assert.rejects(() => sendAbonadoCredentialEmail({ supabase: createSupabase(), abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "bad" }), /destinatario/);
});

test("endpoint payload source cannot override QR base64", async () => {
  const supabase = createSupabase();
  let attachment = null;
  await sendAbonadoCredentialEmail({ supabase, abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "a@example.com", base64: "client-value", sendMail: async ({ attachments }) => { attachment = attachments[0]; return { remitente: "sender@example.com" }; } });
  assert.notEqual(attachment.contentBytes, "client-value");
});

test("sent and failed traces are registered", async () => {
  const sentDb = createSupabase();
  const sent = await sendAbonadoCredentialEmail({ supabase: sentDb, abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "a@example.com", sendMail: async () => ({ remitente: "sender@example.com" }) });
  assert.equal(sent.traceId, "trace-1");
  assert.equal(sentDb.traces.some((item) => item.estado === "sent"), true);

  const failedDb = createSupabase();
  await assert.rejects(() => sendAbonadoCredentialEmail({ supabase: failedDb, abonadoId: ids.abonado, credencialId: ids.cred, destinatario: "a@example.com", sendMail: async () => { throw Object.assign(new Error("Graph failed"), { code: "403" }); } }));
  assert.equal(failedDb.traces.some((item) => item.estado === "failed"), true);
});

test("QR + Patente shows plate in email but not in QR", async () => {
  const credencial = { id: ids.cred, abonado_id: ids.abonado, numero: "QRP-OPAQUE-123", tipo: "qr_plate", status: "active", vehiculo_id: ids.vehicle };
  const html = buildCredentialEmailHtml({ abonado: { codigo: "AB-TEST", nombre: "Persona Test" }, credencial, vehiculo: { license_plate: "TEST12" } });
  assert.match(html, /TEST12/);
  assert.equal(buildCredentialQrPayload(credencial).includes("TEST12"), false);
});
test("operational status mapping covers access states", () => {
  assert.deepEqual(getCredentialOperationalStatus("active"), {
    label: "Activa",
    title: "Acceso habilitado",
    description: "Su credencial está activa y puede utilizarse desde este momento para acceder al estacionamiento.",
    canAccess: true,
    tone: "green",
  });
  assert.equal(getCredentialOperationalStatus("pending_activation").title, "Pendiente de activación");
  assert.equal(getCredentialOperationalStatus("pending_activation").canAccess, false);
  assert.equal(getCredentialOperationalStatus("suspended").title, "Acceso suspendido");
  assert.equal(getCredentialOperationalStatus("revoked").title, "Acceso revocado");
  assert.equal(getCredentialOperationalStatus("unknown").title, "Estado por confirmar");
});

test("active credential email shows operational status and usage guide", () => {
  const html = buildCredentialEmailHtml({
    abonado: { codigo: "AB-TEST", nombre: "Persona Test", rut: "11111111-1" },
    credencial: { numero: "QR-MS3P06XB-FB1RAF", tipo: "qr_plate", status: "active" },
    vehiculo: { license_plate: "TEST12" },
    mensaje: "Adjuntamos su credencial de acceso ParkFacil.",
    qrBase64: "BASE64PNG",
  });
  const duplicateCount = (html.match(/Adjuntamos su credencial de acceso ParkFacil\./g) || []).length;
  assert.match(html, /Acceso habilitado/);
  assert.match(html, /Abra este correo desde su teléfono móvil/);
  assert.match(html, /Puede utilizar el código QR incluido en este correo o el archivo adjunto/);
  assert.match(html, /Tipo de credencial/);
  assert.match(html, /Código/);
  assert.match(html, /Fecha de emisión/);
  assert.match(html, /Estado/);
  assert.match(html, /data:image\/png;base64,BASE64PNG/);
  assert.match(html, /También encontrará este código QR como archivo adjunto/);
  assert.equal(/RUT/i.test(html), false);
  assert.equal(duplicateCount, 1);
});

test("inactive operational states do not suggest access usage", () => {
  for (const [status, title] of [["pending_activation", "Pendiente de activación"], ["suspended", "Acceso suspendido"], ["revoked", "Acceso revocado"], ["unknown", "Estado por confirmar"]]) {
    const html = buildCredentialEmailHtml({
      abonado: { codigo: "AB-TEST", nombre: "Persona Test" },
      credencial: { numero: "QR-MS3P06XB-FB1RAF", tipo: "qr_code", status },
      qrBase64: "BASE64PNG",
    });
    assert.match(html, new RegExp(title));
    assert.doesNotMatch(html, /Puede utilizar el código QR incluido en este correo o el archivo adjunto/);
    assert.doesNotMatch(html, /Presente el código QR frente al lector de acceso/);
    assert.match(html, /Conserve este correo como referencia/);
    assert.match(html, /Esta credencial no se encuentra habilitada para acceso/);
  }
});

test("credential email template verification keeps required quality signals", () => {
  const activeHtml = buildCredentialEmailHtml({
    abonado: { codigo: "AB-TEST", nombre: "Persona Test", rut: "11111111-1" },
    credencial: { numero: "QRP-OPAQUE-123", tipo: "qr_plate", status: "active" },
    vehiculo: { license_plate: "TEST12" },
    mensaje: "Adjuntamos su credencial de acceso ParkFacil.",
    qrBase64: "BASE64PNG",
  });
  const inactiveHtml = buildCredentialEmailHtml({
    abonado: { codigo: "AB-TEST", nombre: "Persona Test" },
    credencial: { numero: "QR-MS3P06XB-FB1RAF", tipo: "qr_code", status: "inactive" },
    qrBase64: "BASE64PNG",
  });
  const verification = {
    brandOk: activeHtml.includes("ParkFacil") && !activeHtml.includes("PARKFACIL") && !activeHtml.includes("Parkfacil"),
    duplicateCount: (activeHtml.match(/Adjuntamos su credencial de acceso ParkFacil\./g) || []).length,
    hasEmbeddedQr: activeHtml.includes("data:image/png;base64,BASE64PNG"),
    hasAttachmentText: activeHtml.includes("archivo adjunto"),
    hasRut: /RUT/i.test(activeHtml),
    hasPlate: activeHtml.includes("TEST12"),
    width650: activeHtml.includes('width="650"'),
    hasOperationalStatus: activeHtml.includes("Acceso habilitado"),
    hasUsageGuideForActive: activeHtml.includes("Abra este correo desde su teléfono móvil"),
    blocksUsageForInactive: inactiveHtml.includes("Esta credencial no se encuentra habilitada para acceso") && !inactiveHtml.includes("Presente el código QR frente al lector de acceso"),
  };
  assert.deepEqual(verification, {
    brandOk: true,
    duplicateCount: 1,
    hasEmbeddedQr: true,
    hasAttachmentText: true,
    hasRut: false,
    hasPlate: true,
    width650: true,
    hasOperationalStatus: true,
    hasUsageGuideForActive: true,
    blocksUsageForInactive: true,
  });
});