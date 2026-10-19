import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA PRO2 2026-10-18 (SOL-2026-10-11-001): el aviso de pago incierto dejaba fuera de vista
// la X y CERRAR. El modal de pago debe limitarse al alto de la pantalla y desplazarse por dentro.
const terminal = readFileSync(new URL("./PosTerminal.js", import.meta.url), "utf8");

test("el modal de pago tiene alto máximo de pantalla y cuerpo desplazable", () => {
  assert.match(terminal, /<section className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" style=\{\{ maxHeight: "calc\(100vh - 1rem\)" \}\}>/);
  assert.match(terminal, /<header className="flex shrink-0 items-center justify-between bg-rose-900/);
  assert.match(terminal, /<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">/);
  assert.doesNotMatch(terminal, /fixed inset-0 z-50 grid place-items-center bg-rose-950\/55/);
});
