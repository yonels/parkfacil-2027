import assert from "node:assert/strict";
import test from "node:test";
import { buildInspectorCopySmsText } from "./inspectorCopySms.mjs";

test("incluye la patente en mayúsculas y la fecha/hora en horario de Chile", () => {
  const text = buildInspectorCopySmsText({ plate: "abc123", sentAtIso: "2026-09-03T14:05:00Z" });
  assert.match(text, /ABC123/);
  assert.match(text, /^COPIA INSPECTOR - Fiscalizacion patente ABC123\. Aviso SMS enviado al conductor el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\.$/);
});

test("nunca incluye el texto legal aprobado del SMS al conductor ni ningún dato sensible del conductor (teléfono/nombre)", () => {
  const text = buildInspectorCopySmsText({ plate: "ABC123", sentAtIso: "2026-09-03T14:05:00Z" });
  assert.doesNotMatch(text, /multada/i);
  assert.doesNotMatch(text, /\+?56\d{9}/, "no debe contener un número de teléfono");
});

test("patente ausente no lanza -- se degrada a texto vacío en vez de romper el envío", () => {
  assert.doesNotThrow(() => buildInspectorCopySmsText({ plate: undefined, sentAtIso: "2026-09-03T14:05:00Z" }));
});
