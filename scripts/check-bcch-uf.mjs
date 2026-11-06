// Verifica la conexión con la API BDE del Banco Central (SOL-2026-11-05-005, F1.3).
// Uso: node scripts/check-bcch-uf.mjs [AAAA-MM-DD]
// Lee BCCH_API_TOKEN (y opcionalmente BCCH_UF_SERIES_ID) desde .env.local. Nunca imprime el token.
// Lee .env.local con @next/env, igual que la aplicación: el token del Banco Central contiene «$» y Next.js
// expande variables con «$», así que en .env.local cada «$» debe escribirse como «\$».
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { buildBcchUfUrl, BCCH_ENDPOINT, DEFAULT_UF_SERIES_ID, parseBcchUfResponse } from "../src/lib/billing/ufRateCore.mjs";

nextEnv.loadEnvConfig(fileURLToPath(new URL("..", import.meta.url)), true, { info: () => {}, error: console.error });
const env = process.env;
const token = env.BCCH_API_TOKEN;
if (!token) { console.error("Falta BCCH_API_TOKEN en .env.local."); process.exit(1); }
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const seriesId = env.BCCH_UF_SERIES_ID || DEFAULT_UF_SERIES_ID;

const search = new URL(BCCH_ENDPOINT);
search.searchParams.set("token", token); search.searchParams.set("function", "SearchSeries"); search.searchParams.set("frequency", "DAILY");
const found = await fetch(search).then((r) => r.json()).catch((error) => ({ error: String(error) }));
if (Number(found?.Codigo) !== 0) console.log("SearchSeries:", found?.Codigo, found?.Descripcion || found?.error);
else {
  const uf = (found.SeriesInfos || []).filter((s) => /unidad de fomento/i.test(s.spanishTitle || ""));
  console.log("Series diarias con «Unidad de Fomento»:");
  for (const s of uf) console.log(`  ${s.seriesId} · ${s.spanishTitle} · ${s.firstObservation} → ${s.lastObservation}`);
}

const response = await fetch(buildBcchUfUrl({ token, seriesId, date })).then((r) => r.json()).catch((error) => ({ error: String(error) }));
try {
  const uf = parseBcchUfResponse(response, date);
  console.log(`UF ${date} (${seriesId}): ${uf.value} — OK`);
} catch (error) {
  console.log(`UF ${date} (${seriesId}): ERROR ${error.code}: ${error.message}`);
  process.exitCode = 1;
}
