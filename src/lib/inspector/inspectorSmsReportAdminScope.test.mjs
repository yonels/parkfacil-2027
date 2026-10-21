import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// inspectorSmsReportAdminScope.js importa "server-only" -- se verifica por
// inspección de código fuente, mismo criterio que el resto de este módulo.
const source = await readFile(new URL("./inspectorSmsReportAdminScope.js", import.meta.url), "utf8");

test("TAREA E: platform_admin resuelve a scope 'global' -- sin ninguna restricción de parkingIds", () => {
  assert.match(source, /if \(context\.role === ROLES\.PLATFORM_ADMIN\) return \{ type: "global" \};/);
});

test("company_admin resuelve a scope 'company' reutilizando scopedParkings -- el MISMO mecanismo ya usado por el resto del backoffice On Street, nunca uno nuevo", () => {
  assert.match(source, /import \{ scopedParkings \} from "@\/lib\/onStreetAdminRepository";/);
  assert.match(source, /const parkings = await scopedParkings\(db, context, null\);/);
  assert.match(source, /return \{ type: "company", parkingIds: parkings\.map\(\(p\) => p\.id\) \};/);
});

test("nunca confía en un companyId que llegue del cliente -- scopedParkings resuelve la empresa desde context (server-side), el segundo argumento aquí siempre es null", () => {
  assert.doesNotMatch(source, /request\.|searchParams|body\?\.|body\./);
});
