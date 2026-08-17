import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("/pos y las rutas data-entry reutilizan un único PosTerminal", async () => {
  const [pos, dataEntry, legacy, terminal] = await Promise.all([
    read("../app/pos/page.js"),
    read("../app/data-entry/page.js"),
    read("../app/data-entry/pos/page.js"),
    read("../components/pos/PosTerminal.js"),
  ]);
  assert.match(pos, /components\/pos\/PosTerminal/);
  assert.match(dataEntry, /components\/pos\/PosTerminal/);
  assert.match(legacy, /DataEntryPage/);
  assert.match(terminal, /export default function PosTerminal/);
});

test("manifest define /pos como PWA standalone", async () => {
  const source = await read("../app/manifest.js");
  assert.match(source, /name: "ParkFacil POS"/);
  assert.match(source, /start_url: "\/pos"/);
  assert.match(source, /display: "standalone"/);
  assert.match(source, /purpose: "maskable"/);
});

test("service worker excluye APIs y mutaciones de su caché", async () => {
  const source = await read("../app/sw.js/route.js");
  assert.match(source, /request\.method !== "GET"/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /SKIP_WAITING/);
});

test("recursos de instalación PWA son públicos sin abrir rutas operacionales", async () => {
  const source = await read("../proxy.js");
  assert.match(source, /"\/manifest\.webmanifest"/);
  assert.match(source, /"\/sw\.js"/);
  assert.match(source, /startsWith\("\/icons\/"\)/);
  assert.doesNotMatch(source, /PUBLIC_PATHS[^;]+"\/pos"/s);
});

test("login y cliente POS declaran el contexto Terminal en APIs", async () => {
  const [login, terminal] = await Promise.all([
    read("../components/auth/LoginForm.js"),
    read("../components/pos/PosTerminal.js"),
  ]);
  assert.match(login, /"x-parkfacil-portal": "terminal"/);
  assert.match(terminal, /"x-parkfacil-portal": "terminal"/);
});
