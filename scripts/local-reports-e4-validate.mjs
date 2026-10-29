// E4 LOCAL (SOL-2026-10-28-005): valida los reportes de Patentes Autorizadas
// contra consultas SQL independientes, la API de gestión y los permisos.
// Solo base local (127.0.0.1) y servidor local. No escribe datos de negocio;
// crea/actualiza usuarios de prueba locales con contraseña aleatoria por
// ejecución (no se guarda).
// Uso: LOCAL_SUPABASE_SERVICE_KEY=… LOCAL_APP_URL=http://127.0.0.1:3070 node scripts/local-reports-e4-validate.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import pg from "pg";

const apiUrl = "http://127.0.0.1:54321";
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3070";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;
assert(serviceKey, "LOCAL_SUPABASE_SERVICE_KEY es requerida");
const outDir = process.env.E4_OUT_DIR || "";
const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });
const sql = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:6543/postgres" });
await sql.connect();

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); };
const password = `Local-${randomBytes(9).toString("base64url")}!9a`;

async function token(email, { role, company, meta } = {}) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = listed.data.users.find((u) => u.email === email);
  if (!user) user = (await admin.auth.admin.createUser({ email, password, email_confirm: true, ...(meta ? { app_metadata: meta } : {}) })).data.user;
  else await admin.auth.admin.updateUserById(user.id, { password, ...(meta ? { app_metadata: meta } : {}) });
  if (role) {
    const up = await admin.from("company_members").upsert({ user_id: user.id, company_id: company, full_name: email, role, status: "active", pos_only: role === "operator", must_change_password: false }, { onConflict: "user_id" });
    if (up.error) throw up.error;
  }
  const login = await createClient(apiUrl, serviceKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return login.data.session.access_token;
}

const call = (tok, path, host = "cliente.localhost") => fetch(`${appUrl}${path}`, { headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(host ? { "x-forwarded-host": host } : {}) } });
const report = async (tok, id, query = "periodo=mes", host) => { const r = await call(tok, `/api/reportes/${id}?${query}`, host); return { status: r.status, body: await r.json().catch(() => null) }; };
const kpi = (body, key) => body.data.kpis.find((k) => k.key === key)?.value;

try {
  const adminTok = await token("pl.cliente.admin@parkfacil.test", { role: "company_admin", company: "emp-5q" });
  const rootTok = await token("pl.cliente.root@parkfacil.test", { meta: { role: "platform_admin" } });
  const opTok = await token("pl.cliente.op@parkfacil.test", { role: "operator", company: "emp-5q" });
  const ramisTok = await token("pl.reportes.ramis@parkfacil.test", { role: "company_admin", company: "emp-ramis" });

  // Período «mes» en Chile, calculado por SQL de forma independiente.
  const { rows: [p] } = await sql.query(`select (date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago') as desde,
    ((date_trunc('month', now() at time zone 'America/Santiago') + interval '1 month') at time zone 'America/Santiago') as hasta`);
  const C = "emp-5q";
  const q = async (text, params = []) => (await sql.query(text, params)).rows[0];

  // --- Cálculos -----------------------------------------------------------
  const list = await report(adminTok, "pl-listado");
  const dbList = await q(`select count(*)::int n,
      count(*) filter (where modality='FREE')::int free, count(*) filter (where modality='THIRD_PARTY')::int third,
      coalesce(sum(third_party_amount) filter (where third_party_currency='UF'),0)::numeric uf,
      coalesce(sum(third_party_amount) filter (where third_party_currency='CLP'),0)::numeric clp, coalesce(sum(uses_count),0)::int uses,
      count(*) filter (where status='ACTIVE' and now() >= valid_from and now() < valid_to and (max_uses is null or uses_count < max_uses))::int current
    from released_plate_authorizations where company_id=$1 and status<>'DELETED' and valid_from < $3 and valid_to > $2`, [C, p.desde, p.hasta]);
  check("listado: total", kpi(list.body, "total") === dbList.n, `${kpi(list.body, "total")} vs SQL ${dbList.n}`);
  check("listado: sin costo / terceros", kpi(list.body, "free") === dbList.free && kpi(list.body, "thirdParty") === dbList.third, `${kpi(list.body, "free")}/${kpi(list.body, "thirdParty")} vs ${dbList.free}/${dbList.third}`);
  check("listado: UF y $ separados", Number(kpi(list.body, "thirdPartyUf")) === Number(dbList.uf) && Number(kpi(list.body, "thirdPartyClp")) === Number(dbList.clp), `UF ${kpi(list.body, "thirdPartyUf")} vs ${dbList.uf}; $ ${kpi(list.body, "thirdPartyClp")} vs ${dbList.clp}`);
  check("listado: entradas", kpi(list.body, "entries") === dbList.uses, `${kpi(list.body, "entries")} vs ${dbList.uses}`);
  check("listado: vigentes", kpi(list.body, "current") === dbList.current, `${kpi(list.body, "current")} vs ${dbList.current}`);

  const cur = await report(adminTok, "pl-vigentes", "");
  const dbCur = await q(`select count(*)::int n from released_plate_authorizations where company_id=$1 and status='ACTIVE' and now() >= valid_from and now() < valid_to and (max_uses is null or uses_count < max_uses)`, [C]);
  check("vigentes", cur.body.data.rows.length === dbCur.n, `${cur.body.data.rows.length} vs ${dbCur.n}`);
  const sch = await report(adminTok, "pl-programadas", "");
  const dbSch = await q(`select count(*)::int n from released_plate_authorizations where company_id=$1 and status='ACTIVE' and now() < valid_from and (max_uses is null or uses_count < max_uses)`, [C]);
  check("programadas", sch.body.data.rows.length === dbSch.n, `${sch.body.data.rows.length} vs ${dbSch.n}`);
  const exp30 = await report(adminTok, "pl-vencimientos", "ventana=30");
  const dbExp = await q(`select count(*)::int n from released_plate_authorizations where company_id=$1 and status='ACTIVE' and now() >= valid_from and now() < valid_to and valid_to <= now() + interval '30 days' and (max_uses is null or uses_count < max_uses)`, [C]);
  check("próximos vencimientos 30 días", exp30.body.data.rows.length === dbExp.n, `${exp30.body.data.rows.length} vs ${dbExp.n}`);
  const ven = await report(adminTok, "pl-vencidas");
  const dbVen = await q(`select count(*)::int n from released_plate_authorizations where company_id=$1 and status='ACTIVE' and valid_to >= $2 and valid_to < $3 and (now() >= valid_to or (max_uses is not null and uses_count >= max_uses))`, [C, p.desde, p.hasta]);
  check("vencidas", ven.body.data.rows.length === dbVen.n, `${ven.body.data.rows.length} vs ${dbVen.n}`);
  const fin = await report(adminTok, "pl-finalizadas");
  const dbFin = await q(`select count(*)::int n from released_plate_authorizations where company_id=$1 and status in ('FINISHED','DELETED') and coalesce(deleted_at, finished_at) >= $2 and coalesce(deleted_at, finished_at) < $3`, [C, p.desde, p.hasta]);
  check("finalizadas y eliminadas", fin.body.data.rows.length === dbFin.n, `${fin.body.data.rows.length} vs ${dbFin.n}`);
  const his = await report(adminTok, "pl-historial");
  const dbHis = await q(`select count(*)::int n, count(*) filter (where event_type='USED')::int used from released_plate_authorization_events where company_id=$1 and created_at >= $2 and created_at < $3`, [C, p.desde, p.hasta]);
  check("historial: eventos y entradas", his.body.data.rows.length === dbHis.n && kpi(his.body, "used") === dbHis.used, `${his.body.data.rows.length}/${kpi(his.body, "used")} vs ${dbHis.n}/${dbHis.used}`);
  const org = await report(adminTok, "pl-organizacion");
  const dbOrg = await q(`select count(distinct third_party_rut || third_party_name)::int orgs from released_plate_authorizations where company_id=$1 and status<>'DELETED' and modality='THIRD_PARTY' and valid_from < $3 and valid_to > $2`, [C, p.desde, p.hasta]);
  check("organización: terceros distintos", kpi(org.body, "organizations") === dbOrg.orgs, `${kpi(org.body, "organizations")} vs ${dbOrg.orgs}`);
  check("organización = listado (patentes)", kpi(org.body, "plates") === kpi(list.body, "total"), `${kpi(org.body, "plates")} vs ${kpi(list.body, "total")}`);
  const uso = await report(adminTok, "pl-uso");
  const dbUso = await q(`select count(*)::int n, count(distinct s.license_plate)::int plates,
      coalesce(sum(s.total_amount) filter (where s.status not in ('OPEN','CANCELLED')),0)::int excess,
      coalesce(sum(s.released_covered_seconds/60) filter (where s.status not in ('OPEN','CANCELLED')),0)::int covered
    from parking_stays s join parkings pk on pk.id=s.parking_id where pk.company_id=$1 and pk.type='OFF_STREET' and pk.status='ACTIVE'
      and s.released_plate_authorization_id is not null and s.entry_at >= $2 and s.entry_at < $3`, [C, p.desde, p.hasta]);
  check("uso: entradas, patentes, excedente y minutos", kpi(uso.body, "entries") === dbUso.n && kpi(uso.body, "plates") === dbUso.plates && kpi(uso.body, "excess") === dbUso.excess && kpi(uso.body, "covered") === dbUso.covered,
    `${kpi(uso.body, "entries")}/${kpi(uso.body, "plates")}/$${kpi(uso.body, "excess")}/${kpi(uso.body, "covered")}min vs ${dbUso.n}/${dbUso.plates}/$${dbUso.excess}/${dbUso.covered}min`);
  check("uso = eventos USED del historial", kpi(uso.body, "entries") === dbHis.used, `${kpi(uso.body, "entries")} vs ${dbHis.used}`);

  // Pantalla de gestión: mismas patentes vigentes.
  const mgmt = await (await call(adminTok, "/api/pago-liberado/patentes")).json();
  const nowMs = Date.now();
  const mgmtCurrent = mgmt.data.authorizations.filter((a) => a.status === "ACTIVE" && nowMs >= Date.parse(a.validFrom) && nowMs < Date.parse(a.validTo) && (a.maxUses === null || a.usesCount < a.maxUses)).length;
  check("gestión = reporte de vigentes", mgmtCurrent === cur.body.data.rows.length, `${mgmtCurrent} vs ${cur.body.data.rows.length}`);

  // --- Permisos -------------------------------------------------------------
  check("sin sesión → 401", (await report(null, "pl-listado")).status === 401);
  check("operador → 403", (await report(opTok, "pl-listado", "periodo=mes", null)).status === 403, "portal terminal/raíz");
  const otherCo = await report(adminTok, "pl-listado", "companyId=emp-ramis");
  check("admin no puede pedir otra empresa", otherCo.status === 200 && otherCo.body.data.meta.companyId === C, otherCo.body.data?.meta?.companyId);
  const ramis = await report(ramisTok, "pl-listado");
  check("admin de otra empresa ve solo la suya", ramis.status === 200 && ramis.body.data.meta.companyId === "emp-ramis" && !ramis.body.data.rows.some((r) => list.body.data.rows.some((x) => x.id === r.id)), `${ramis.body.data?.meta?.companyId} filas ${ramis.body.data?.rows?.length}`);
  const foreignParking = (await q(`select id from parkings where company_id='emp-ramis' and type='OFF_STREET' limit 1`)).id;
  check("admin: estacionamiento de otra empresa → 404", (await report(adminTok, "pl-uso", `estacionamiento=${foreignParking}`)).status === 404);
  const rootView = await report(rootTok, "pl-listado", `companyId=${C}`, null);
  check("Root lee la empresa elegida", rootView.status === 200 && rootView.body.data.meta.viewer === "ROOT" && rootView.body.data.rows.length === list.body.data.rows.length);
  check("Root: empresa inexistente → 404", (await report(rootTok, "pl-listado", "companyId=no-existe", null)).status === 404);
  check("reporte planificado → 409", (await report(adminTok, "oc-hora")).status === 409);
  check("reporte inexistente → 404", (await report(adminTok, "../pago-liberado")).status === 404);
  check("período inválido → 400", (await report(adminTok, "pl-listado", "periodo=personalizado&desde=2026-13-40&hasta=2026-10-01")).status === 400);
  const w999 = await report(adminTok, "pl-vencimientos", "ventana=999");
  const w7 = await report(adminTok, "pl-vencimientos", "ventana=7");
  check("ventana fuera de lista usa 7 días", w999.status === 200 && w999.body.data.rows.length === w7.body.data.rows.length, `${w999.body.data.rows.length} vs ${w7.body.data.rows.length}`);

  // --- Excel: los 11 reportes ------------------------------------------------
  const ids = ["pl-listado", "pl-gratuitas", "pl-terceros", "pl-vigentes", "pl-programadas", "pl-vencimientos", "pl-vencidas", "pl-finalizadas", "pl-historial", "pl-organizacion", "pl-uso"];
  if (outDir) mkdirSync(outDir, { recursive: true });
  let excelOk = 0;
  for (const id of ids) {
    const json = await report(adminTok, id);
    const started = Date.now();
    const response = await call(adminTok, `/api/reportes/${id}?periodo=mes&formato=xlsx`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const ms = Date.now() - started;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const detail = book.getWorksheet("Detalle");
    const expected = 1 + json.body.data.rows.length + (Object.keys(json.body.data.totals || {}).length ? 1 : 0);
    const header = detail.getRow(1).values.slice(1);
    const ok = response.headers.get("content-type").includes("spreadsheetml") && buffer.subarray(0, 2).toString() === "PK"
      && ["Resumen", "Detalle", "Gráficos"].every((n) => book.getWorksheet(n)) && detail.rowCount === expected
      && header.join("|") === json.body.data.columns.map((c) => c.label).join("|");
    if (ok) excelOk += 1;
    if (outDir) writeFileSync(`${outDir}/${id}.xlsx`, buffer);
    check(`Excel ${id}`, ok, `${buffer.length} bytes, ${ms} ms, detalle ${detail.rowCount}/${expected}`);
  }
  check("Excel: 11 de 11 válidos", excelOk === ids.length, `${excelOk}/${ids.length}`);
} finally {
  await sql.end();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "OK  " : "FALLA"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length} de ${results.length} verificaciones correctas`);
process.exit(failed.length ? 1 : 0);
