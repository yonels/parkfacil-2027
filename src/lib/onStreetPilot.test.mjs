import test from "node:test";
import assert from "node:assert/strict";
import { formatChileDateTime, formatChileanPhoneForDisplay, formatCountdownClock, formatDuration, isPublicCode, isPublicToken, localChileanMobile, maskPhone, normalizeChileanMobile,normalizePurchasedMinutes,remainingSeconds,simulatedAmount,MIN_PURCHASED_MINUTES,MAX_PURCHASED_MINUTES } from "./onStreetPilot.mjs";
import { normalizePlate } from "./dataEntry.mjs";
import { publicSmsMessage, secureSessionUrl } from "./onStreetSms.mjs";
test("normaliza móviles chilenos sin aceptar otros formatos",()=>{assert.equal(normalizeChileanMobile("+56 9 1234 5678"),"+56912345678");assert.equal(normalizeChileanMobile("912345678"),"+56912345678");assert.equal(normalizeChileanMobile("221234567"),null);assert.equal(normalizeChileanMobile("91234"),null);});
test("normaliza todas las variantes inequívocas sin duplicar el código país", () => {
  for (const value of ["966514044", "+56966514044", "56966514044", "+56 966514044", "+56-966514044", "56 966514044"]) {
    assert.equal(normalizeChileanMobile(value), "+56966514044", value);
    assert.equal(localChileanMobile(value), "966514044", value);
  }
});
test("rechaza móviles chilenos ambiguos o inválidos", () => {
  for (const value of ["866514044", "96651404", "9665140440", "9ABC14044", "", "5656966514044", "++56966514044", "56(9)66514044", "56/966514044"]) {
    assert.equal(normalizeChileanMobile(value), null, value);
  }
});
test("formatea comprobantes siempre en America/Santiago", () => {
  assert.match(formatChileDateTime("2026-08-25T15:42:06.000Z"), /11:42:06/);
});
test("reutiliza la normalización común de patente",()=>{assert.equal(normalizePlate("abcd12",{truncate:false}),"ABCD12");assert.equal(normalizePlate("AB-CD-12",{truncate:false}),"ABCD12");assert.equal(normalizePlate(" ab cd 12 ",{truncate:false}),"ABCD12");assert.equal(normalizePlate("...---",{truncate:false}),"");assert.equal(normalizePlate("ABCDEFGHI",{truncate:false}),"ABCDEFGHI");});
test("enmascara el teléfono administrativo",()=>assert.equal(maskPhone("+56912345678"),"+569 **** 5678"));

// Letrero QR On Street (2026-08-30): formatChileanPhoneForDisplay reutiliza
// normalizeChileanMobile -- misma regla de reconocimiento, nunca duplica +56.
test("formatChileanPhoneForDisplay: móvil chileno reconocido en cualquier formato de entrada -> siempre '+56 9 XXXX XXXX'", () => {
  for (const value of ["+56912345678", "912345678", "56912345678", "+56 9 1234 5678", "+56-912345678"]) {
    assert.equal(formatChileanPhoneForDisplay(value), "+56 9 1234 5678", value);
  }
});
test("formatChileanPhoneForDisplay: nunca duplica +56 (nunca produce '+56 +56 ...' ni '+5656...')", () => {
  assert.doesNotMatch(formatChileanPhoneForDisplay("+56912345678"), /\+56.*\+56|5656/);
});
test("formatChileanPhoneForDisplay: un fijo chileno, un número de otro país, o texto sin teléfono se muestran TAL CUAL -- nunca se les fuerza el formato de móvil chileno", () => {
  assert.equal(formatChileanPhoneForDisplay("+56 2 2345 6789"), "+56 2 2345 6789");
  assert.equal(formatChileanPhoneForDisplay("+57 4 3210 9876"), "+57 4 3210 9876");
  assert.equal(formatChileanPhoneForDisplay("Sin teléfono informado"), "Sin teléfono informado");
});
test("formatChileanPhoneForDisplay: vacío/nulo -> null (no fabrica un teléfono)", () => {
  assert.equal(formatChileanPhoneForDisplay(""), null);
  assert.equal(formatChileanPhoneForDisplay(null), null);
  assert.equal(formatChileanPhoneForDisplay(undefined), null);
});
test("formatea duración sin dinero ni tarifas",()=>{assert.equal(formatDuration(8),"8 s");assert.equal(formatDuration(125),"2 min 5 s");assert.equal(formatDuration(3720),"1 h 2 min");});
test("valida identificadores públicos opacos",()=>{assert.equal(isPublicCode("12345678901234567890"),true);assert.equal(isPublicCode("corto"),false);assert.equal(isPublicToken("123e4567-e89b-42d3-a456-426614174000"),true);assert.equal(isPublicToken("1"),false);});
test("valida el ingreso libre de minutos en el rango 1-1440",()=>{assert.equal(MIN_PURCHASED_MINUTES,1);assert.equal(MAX_PURCHASED_MINUTES,1440);assert.equal(normalizePurchasedMinutes(75),75);assert.equal(normalizePurchasedMinutes(1),1);assert.equal(normalizePurchasedMinutes(1440),1440);assert.equal(normalizePurchasedMinutes(0),null);assert.equal(normalizePurchasedMinutes(1441),null);assert.equal(normalizePurchasedMinutes(721),721);assert.equal(normalizePurchasedMinutes(1.5),null);});
test("calcula monto simulado y tiempo restante",()=>{assert.equal(simulatedAmount(30,30),900);assert.equal(simulatedAmount(120,30),3600);assert.equal(remainingSeconds("2026-08-14T12:01:00Z",Date.parse("2026-08-14T12:00:00Z")),60);assert.equal(remainingSeconds("2026-08-14T11:59:00Z",Date.parse("2026-08-14T12:00:00Z")),0);});
test("formatea el contador en vivo del comprobante en MM:SS bajo una hora y H:MM:SS desde una hora",()=>{
  assert.equal(formatCountdownClock(0),"00:00");
  assert.equal(formatCountdownClock(59),"00:59");
  assert.equal(formatCountdownClock(17*60),"17:00");
  assert.equal(formatCountdownClock(3720),"1:02:00");
  assert.equal(formatCountdownClock(-5),"00:00","nunca debe mostrar tiempo negativo tras vencer");
});
test("el contador en vivo del comprobante usa expiresAt real, igual que remainingSeconds de la sesión activa",()=>{
  const now=Date.parse("2026-08-26T12:00:00Z");
  // 7 minutos restantes + 10 minutos agregados en el mismo pago de extensión
  // -> el vencimiento real ya quedó en +17 min, nunca "10:00" (solo lo agregado).
  const expiresAt=new Date(now+7*60000+10*60000).toISOString();
  assert.equal(formatCountdownClock(remainingSeconds(expiresAt,now)),"17:00");
});
test("construye un enlace seguro sin teléfono ni IDs administrativos",()=>{const stored="ParkFacil: vence pronto /estacionar/sesion/123e4567-e89b-42d3-a456-426614174000";const url=secureSessionUrl("https://parkfacil.test/",stored);assert.equal(url,"https://parkfacil.test/estacionar/sesion/123e4567-e89b-42d3-a456-426614174000");assert.equal(url.includes("+569"),false);assert.match(publicSmsMessage("https://parkfacil.test",stored),/^ParkFacil:/);assert.equal(secureSessionUrl("https://parkfacil.test","mensaje sin token"),null);});
