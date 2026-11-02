import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FINAL_SMS_MAX_LENGTH, isExpiredNoticeWindowOpen, isReminderWindowOpen, publicSmsMessage, secureSessionUrl, selectCurrentReminder } from "./onStreetSms.mjs";
const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20260814180000_on_street_pilot_sms_notifications.sql", import.meta.url)), "utf8");
const publicSessionRoute = readFileSync(fileURLToPath(new URL("../app/api/public/on-street/sessions/[token]/route.js", import.meta.url)), "utf8");
test("programa aviso previo y aviso de vencimiento", () => { assert.match(migration, /'EXPIRING_SOON'.*expires_at-interval '10 minutes'/s); assert.match(migration, /'EXPIRED'.*new\.expires_at/s); });
test("el enlace reutiliza únicamente el token público seguro", () => { const message="ParkFacil /estacionar/sesion/123e4567-e89b-42d3-a456-426614174000"; assert.equal(secureSessionUrl("https://demo.test",message),"https://demo.test/estacionar/sesion/123e4567-e89b-42d3-a456-426614174000"); assert.doesNotMatch(publicSmsMessage("https://demo.test",message),/phone|session_id|parking_id/); });
test("el mensaje productivo final conserva la URL y no supera 160 caracteres", () => {
  const stored = "Texto histórico deliberadamente largo /estacionar/sesion/123e4567-e89b-42d3-a456-426614174000";
  const message = publicSmsMessage("https://parkfacil-2027.vercel.app", stored);
  assert.ok(message.length <= FINAL_SMS_MAX_LENGTH);
  assert.match(message, /^ParkFacil:/);
  assert.match(message, /https:\/\/parkfacil-2027\.vercel\.app\/estacionar\/sesion\/123e4567-e89b-42d3-a456-426614174000$/);
});
test("rechaza defensivamente un origen que produciría más de 160 sin truncar la URL", () => {
  const stored = "ParkFacil /estacionar/sesion/123e4567-e89b-42d3-a456-426614174000";
  assert.throws(() => publicSmsMessage(`https://${"x".repeat(100)}.test`, stored), { code: "SMS_MESSAGE_TOO_LONG" });
});
test("una extensión cancela pendientes y programa el nuevo vencimiento", () => { assert.match(migration, /old\.expires_at is distinct from new\.expires_at/); assert.match(migration, /status='CANCELLED'.*status='PENDING'/s); assert.match(migration, /after insert or update of expires_at,status/); });
test("el cierre anticipado cancela avisos posteriores", () => { assert.match(migration, /new\.status='CLOSED'/); assert.match(migration, /where session_id=new\.id and status='PENDING'/); });
test("al expirar no envía tardíamente el aviso previo", () => { assert.match(migration, /new\.status='EXPIRED'/); assert.match(migration, /type='EXPIRING_SOON' and status='PENDING'/); });
test("el modelo admite PENDING a SENT y FAILED", () => { assert.match(migration, /'PENDING','SENT','FAILED','CANCELLED'/); assert.match(migration, /attempts integer/); });
test("la tabla conserva aislamiento por estacionamiento y privacidad", () => { assert.match(migration, /parking_id uuid not null references public\.parkings/); assert.match(migration, /qr_location_id uuid not null/); assert.match(migration, /enable row level security/); assert.match(migration, /revoke all.*anon,authenticated/); assert.doesNotMatch(migration, /grant select.*authenticated/); });
test("la API pública de sesión no expone el teléfono", () => assert.doesNotMatch(publicSessionRoute, /phone_normalized/));

const STORED = "ParkFacil /estacionar/sesion/123e4567-e89b-42d3-a456-426614174000";
const MIN = 60 * 1000;
test("el texto indica los minutos de cada aviso y cabe en 160 caracteres con el dominio real", () => {
  for (const minutes of [15, 10, 5]) {
    const message = publicSmsMessage("https://cliente.parkfacilapp.cl", STORED, minutes);
    assert.ok(message.startsWith(`ParkFacil: tu estacionamiento vence en ${minutes} minutos. Extiende aquí: https://cliente.parkfacilapp.cl/estacionar/sesion/`));
    assert.ok(message.length <= FINAL_SMS_MAX_LENGTH, `${message.length} caracteres`);
  }
});
test("un aviso sin anticipación válida conserva el texto histórico", () => {
  for (const minutes of [undefined, null, 0, 7]) assert.ok(publicSmsMessage("https://demo.test", STORED, minutes).includes("vence pronto."));
});
test("cada aviso solo es vigente hasta que corresponde el siguiente", () => {
  assert.equal(isReminderWindowOpen(15, 15 * MIN), true);
  assert.equal(isReminderWindowOpen(15, 15 * MIN + 1), false);
  assert.equal(isReminderWindowOpen(15, 10 * MIN + 1), true);
  assert.equal(isReminderWindowOpen(15, 10 * MIN), false);
  assert.equal(isReminderWindowOpen(10, 10 * MIN), true);
  assert.equal(isReminderWindowOpen(10, 5 * MIN), false);
  assert.equal(isReminderWindowOpen(5, 5 * MIN), true);
  assert.equal(isReminderWindowOpen(5, 1), true);
  assert.equal(isReminderWindowOpen(5, 0), false);
});
test("un aviso sin anticipación registrada conserva la ventana de 15 minutos", () => {
  assert.equal(isReminderWindowOpen(undefined, 15 * MIN), true);
  assert.equal(isReminderWindowOpen(0, 15 * MIN + 1), false);
  assert.equal(isReminderWindowOpen(0, 0), false);
});
test("la sesión se representa por su último aviso procesado o por el próximo pendiente", () => {
  const row = (id, status, minute) => ({ id, status, scheduled_at: `2026-11-02T10:${minute}:00.000Z` });
  assert.equal(selectCurrentReminder([]), null);
  assert.equal(selectCurrentReminder([row("c", "PENDING", "20"), row("a", "SENT", "10"), row("b", "PENDING", "15")]).id, "a");
  assert.equal(selectCurrentReminder([row("a", "SENT", "10"), row("b", "FAILED", "15"), row("c", "PENDING", "20")]).id, "b");
  assert.equal(selectCurrentReminder([row("c", "PENDING", "20"), row("b", "PENDING", "15")]).id, "b");
  assert.equal(selectCurrentReminder([row("a", "CANCELLED", "10"), row("b", "CANCELLED", "15")]).id, "b");
});
test("el aviso al vencer no ofrece extender y cabe en 160 caracteres con el dominio real", () => {
  const message = publicSmsMessage("https://cliente.parkfacilapp.cl", STORED, 0, "EXPIRED");
  assert.ok(message.startsWith("ParkFacil: tu tiempo terminó. Paga de nuevo o retira tu vehículo: https://cliente.parkfacilapp.cl/estacionar/sesion/"));
  assert.ok(!message.includes("Extiende"));
  assert.ok(message.length <= FINAL_SMS_MAX_LENGTH, `${message.length} caracteres`);
});
test("el aviso al vencer solo se envía desde el vencimiento y hasta 15 minutos después", () => {
  assert.equal(isExpiredNoticeWindowOpen(1), false);
  assert.equal(isExpiredNoticeWindowOpen(0), true);
  assert.equal(isExpiredNoticeWindowOpen(-15 * MIN + 1), true);
  assert.equal(isExpiredNoticeWindowOpen(-15 * MIN), false);
});
