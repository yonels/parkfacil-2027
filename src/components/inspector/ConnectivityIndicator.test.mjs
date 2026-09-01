import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./ConnectivityIndicator.js", import.meta.url), "utf8");

test("es un componente de cliente que detecta navigator.onLine y sus eventos", () => {
  assert.match(source, /^"use client";/);
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /addEventListener\("online"/);
  assert.match(source, /addEventListener\("offline"/);
});

test("limpia los listeners al desmontar", () => {
  assert.match(source, /removeEventListener\("online"/);
  assert.match(source, /removeEventListener\("offline"/);
});

test("no implementa sincronización offline real todavía (solo el indicador)", () => {
  const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(withoutComments, /fetch\(|serviceWorker|IndexedDB|indexedDB/);
});
