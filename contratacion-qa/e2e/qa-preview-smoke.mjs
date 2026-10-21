// Prueba de humo QA (SOL-2026-10-16-001, lote QA paso 5, autorizada por el usuario 2026-10-21): el mismo recorrido
// del E2E local contra los Preview de feature/contratacion-integral y sus bases QA. Solo datos ficticios
// (example.invalid), correo simulado. Las claves (bypass de Vercel, service_role QA) se leen en memoria desde las CLI
// de Vercel y Supabase ya autenticadas; nunca se imprimen ni se guardan.
// Uso: node contratacion-qa/e2e/qa-preview-smoke.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const CRM_DIR = 'C:/proyectos/parkfacil-v2-contratacion-integral', BACKUPS = 'C:/proyectos/parkfacil-qa-respaldos';
const OP_REF = 'pzpmioutzlnkbsssupip', CRM_REF = 'yghhmhxqhjluldthvsse';
const OP = 'https://parkfacil-2027-git-feature-contratacion-integral-pa-rkfacilapp.vercel.app';
const CRM = 'https://parkfacil-v2-git-feature-contratacion-integral-pa-rkfacilapp.vercel.app';
const npx = (args, opts = {}) => execFileSync('npx.cmd', args, { shell: true, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
// Bypass de protección de cada proyecto (ya existente; no se crea ninguno).
const bypass = (project, pick) => {
  const raw = npx(['vercel', 'api', `/v9/projects/${project}`], { cwd: 'C:/proyectos/parkfacil-2027', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  const entries = Object.entries(JSON.parse(raw.slice(raw.indexOf('{'))).protectionBypass || {}).filter(([, v]) => v.scope === 'automation-bypass');
  const found = entries.find(([, v]) => pick(v)) || entries[0];
  if (!found) throw Error(`sin bypass en ${project}`); return found[0];
};
const BYPASS = { [new URL(OP).host]: bypass('parkfacil-2027', () => true), [new URL(CRM).host]: bypass('parkfacil-v2', v => /contratacion-integral/.test(v.note || '')) };
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
  const host = new URL(url).host, headers = { ...(init.headers || {}) };
  if (BYPASS[host]) headers['x-vercel-protection-bypass'] = BYPASS[host];
  return realFetch(url, { ...init, headers, redirect: 'manual' });
};
// SQL sobre las bases QA con la CLI de Supabase (carpetas aisladas enlazadas a cada ref).
const tmp = mkdtempSync(join(tmpdir(), 'qa-smoke-'));
const sql = (ref, query) => {
  const file = join(tmp, `${randomUUID()}.sql`); writeFileSync(file, query);
  let out; try { out = npx(['supabase', 'db', 'query', '--linked', '--workdir', '.', '-f', file, '--output-format', 'json'], { cwd: `${BACKUPS}/${ref}` }); }
  catch (e) { throw Error(`SQL ${ref}: ${String(e.stdout || '').slice(0, 400)} ${String(e.stderr || '').slice(0, 400)}`); } finally { rmSync(file, { force: true }); }
  const rows = JSON.parse(out.slice(out.indexOf('{'))).rows || [];
  return rows.map(row => Object.values(row).map(v => v === null ? '' : String(v)).join('|')).join('\n');
};
const crmSql = q => sql(CRM_REF, q), opSql = q => sql(OP_REF, q);
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const step = (name, detail = '') => console.log(`✔ ${name}${detail ? ` — ${detail}` : ''}`);
// Sesión del Root de prueba de QA sin usar ni cambiar su clave: enlace de recuperación generado en el servidor
// (no envía correo) y verificado al instante, igual que el ingreso con PIN de la aplicación.
const require = createRequire('C:/proyectos/parkfacil-2027-contratacion-integral/package.json');
const { createClient } = require('@supabase/supabase-js');
const keys = JSON.parse(npx(['supabase', 'projects', 'api-keys', '--project-ref', OP_REF, '-o', 'json'], { cwd: `${BACKUPS}/${OP_REF}` }));
const keyOf = name => keys.find(k => k.name === name && k.type === 'legacy')?.api_key;
const opAdmin = createClient(`https://${OP_REF}.supabase.co`, keyOf('service_role'), { auth: { persistSession: false, autoRefreshToken: false } });
const opAnon = createClient(`https://${OP_REF}.supabase.co`, keyOf('anon'), { auth: { persistSession: false, autoRefreshToken: false } });
const rootSession = async () => {
  const link = await opAdmin.auth.admin.generateLink({ type: 'recovery', email: 'root.contratacion.qa@example.invalid' });
  if (link.error || link.data?.user?.app_metadata?.role !== 'platform_admin') throw Error('ROOT_QA_UNAVAILABLE');
  const v = await opAnon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'recovery' });
  if (v.error || !v.data?.session?.access_token) throw Error('ROOT_QA_SESSION_FAILED'); return v.data.session.access_token;
};
step('acceso a los Preview protegidos y a las bases QA preparado', `operativa ${new URL(OP).host}, CRM ${new URL(CRM).host}`);

// 1. Formulario público del CRM (datos ficticios).
const id = randomUUID(), tag = id.slice(0, 8), rep = `rep.${tag}@example.invalid`;
// RUT ficticio válido y distinto por corrida (un RUT repetido deja la solicitud en revisión, como corresponde).
const rutBody = String(60000000 + Math.floor(Math.random() * 9000000));
const rutDv = (() => { let sum = 0, m = 2; for (const d of [...rutBody].reverse()) { sum += Number(d) * m; m = m === 7 ? 2 : m + 1; } const v = 11 - (sum % 11); return v === 11 ? '0' : v === 10 ? 'K' : String(v); })();
const { CAMPOS_CONTRATACION, DOCUMENTOS_CONTRATACION } = await import(`file:///${CRM_DIR}/src/lib/contratacion/formulario.mjs`);
const form = { ...Object.fromEntries(CAMPOS_CONTRATACION.map(([k]) => [k, `Dato ficticio ${tag}`])), requestId: id, rut: `${rutBody}-${rutDv}`, representanteRut: '22.222.222-2',
  correo: `empresa.${tag}@example.invalid`, representanteCorreo: rep, telefono: '+56900000000', representanteTelefono: '+56900000000', planId: 'start', plazas: 50,
  aceptaCondiciones: true, lecturaPrivacidad: true, documentos: DOCUMENTOS_CONTRATACION, representanteApellidoPaterno: 'Prueba', representanteApellidoMaterno: 'QA' };
let r = await fetch(`${CRM}/api/contratacion/solicitudes`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: CRM }, body: JSON.stringify(form) });
let body = await r.json();
assert.equal(r.status, 200, JSON.stringify(body)); step('formulario recibido por el CRM', `HTTP ${r.status}`);

// 2. Provisión: trabajo completado en el CRM, alta inactiva y 3 cuentas pendientes en la operativa.
assert.equal(crmSql(`select state from contratacion_integral.jobs where id=${lit(id)}`), 'completed'); step('provisión completada en el CRM');
const enrollment = opSql(`select c.status||'|'||e.company_id||'|'||e.flow_version from public.web_enrollments e join public.companies c on c.id=e.company_id where e.id=${lit(id)}`).split('|');
assert.equal(enrollment[2], 'integral_v1'); assert.notEqual(enrollment[0], 'active'); step('alta creada en la operativa', `empresa ${enrollment[0]} (no activa)`);
const company = enrollment[1];
assert.equal(opSql(`select count(*) from public.company_members where company_id=${lit(company)}`), '3');
assert.equal(opSql(`select count(*) from auth.users where raw_app_meta_data->>'enrollment_id'=${lit(id)}`), '3'); step('3 cuentas creadas (administrador y 2 operadores)');
const outbox = crmSql(`select string_agg(kind||':'||state,',' order by kind) from contratacion_integral.outbox where request_id=${lit(id)}`);
step('correos del alta', outbox);
assert.match(crmSql(`select body from public.crm_emails where idempotency_key=${lit(`contratacion:${id}:account_created`)}`), /Banco Santander/); step('correo de cuenta creada archivado con datos de transferencia');

// 3. Contrato aceptado ficticio en UF (mensualidad 3,5 + servicios 10, sin IVA incluido).
const lead = crmSql(`select lead_id from public.contratacion_solicitudes where id=${lit(id)}`), contract = randomUUID(), doc = randomUUID();
crmSql(`insert into public.contratos(id,lead_id,numero,empresa,rut,estado,valor_mensual,valor_servicios,moneda,incluye_iva,aceptado_electronicamente,aceptado_at,aceptado_correo)
 values(${lit(contract)},${lit(lead)},'CT-LOCAL-${tag}','Empresa ficticia',${lit(`${rutBody}-${rutDv}`)},'Firmado',3.5,10,'UF',false,true,now(),${lit(rep)});
 insert into public.contrato_documentos(id,contrato_id,titulo,hash,es_version_actual) values(${lit(doc)},${lit(contract)},'Contrato ficticio',${lit(createHash('sha256').update(tag).digest('hex'))},true);
 update public.contratos set documento_aceptado_id=${lit(doc)} where id=${lit(contract)};`);
step('contrato ficticio aceptado en el CRM', '3,5 UF + 10 UF servicios');

// 4. Root en la operativa → proxy → CRM.
const token = await rootSession(); assert.ok(token, 'sesión Root QA');
const action = async payload => { const res = await fetch(`${OP}/api/contratacion/root`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: OP, authorization: `Bearer ${token}` }, body: JSON.stringify({ id, ...payload }) }); return { status: res.status, body: await res.json() }; };
const recovery = async payload => { const res = await fetch(`${OP}/api/contratacion/recuperacion`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: OP, authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }); return { status: res.status, body: await res.json() }; };
const client = async (payload, cookie = '') => { const res = await fetch(`${OP}/api/contratacion/${payload.path || 'acceso'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: OP, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(payload.body) });
  const set = res.headers.getSetCookie().find(c => c.startsWith('pf_enrollment=')); return { status: res.status, body: await res.json(), cookie: set ? set.split(';')[0] : '' }; };
const session = async cookie => { const res = await fetch(`${OP}/api/contratacion/acceso`, { headers: { cookie } }); return { status: res.status, body: await res.json() }; };
const admin = opSql(`select id from auth.users where lower(email)=${lit(rep)}`);

// 4a. Acceso comercial antes de activar: Root renueva el PIN (en local no se archivan PIN) y el representante ingresa.
const renewed = await recovery({ action: 'renew_pin', userId: admin, identityConfirmed: true, reason: 'Entrega verificada al representante (prueba de humo QA)' });
assert.equal(renewed.status, 200, JSON.stringify(renewed.body)); assert.match(renewed.body.pin, /^\d{4}$/); const pin = renewed.body.pin;
step('Root renueva el PIN del representante', 'PIN de 4 dígitos entregado solo a Root');
const wrongPin = await client({ body: { action: 'login', email: rep, password: pin === '0000' ? '0001' : '0000' } });
assert.notEqual(wrongPin.body.ok, true); step('PIN incorrecto rechazado');
const pinLogin = await client({ body: { action: 'login', email: rep, password: pin } });
assert.equal(pinLogin.status, 200, JSON.stringify(pinLogin.body)); assert.ok(pinLogin.cookie);
let me = await session(pinLogin.cookie);
assert.equal(me.body.scope, 'commercial', JSON.stringify(me.body)); assert.equal(me.body.mustChangePassword, true); step('ingreso con PIN antes de activar', 'alcance comercial, debe cambiar clave');
const operatorEmail = opSql(`select email from auth.users where raw_app_meta_data->>'enrollment_id'=${lit(id)} and lower(email)<>${lit(rep)} limit 1`);
const operatorPin = await client({ body: { action: 'login', email: operatorEmail, password: pin } });
assert.notEqual(operatorPin.body.ok, true); step('operador no ingresa antes de activar');
const password1 = `Clave-Local-${tag}-1`;
const badPolicy = await client({ body: { action: 'personal_password', currentPin: pin, password: 'corta', confirmPassword: 'corta' } }, pinLogin.cookie);
assert.notEqual(badPolicy.body.ok, true); step('clave corta rechazada');
const personal = await client({ body: { action: 'personal_password', currentPin: pin, password: password1, confirmPassword: password1 } }, pinLogin.cookie);
assert.equal(personal.status, 200, JSON.stringify(personal.body)); step('clave personal establecida', personal.body.mensaje);
assert.notEqual((await session(pinLogin.cookie)).body.ok, true); step('sesión con PIN revocada tras el cambio');
assert.notEqual((await client({ body: { action: 'login', email: rep, password: pin } })).body.ok, true); step('PIN anterior ya no sirve');

const quote = await action({ action: 'payment_quote' });
assert.equal(quote.status, 200, JSON.stringify(quote.body)); assert.equal(quote.body.data.requiredAmount, '16.0650'); assert.equal(quote.body.data.contractId, contract);
step('cuota consultada por Root', `${quote.body.data.requiredAmount} UF, UF del ${quote.body.data.ufDate}`);
const ufDate = quote.body.data.ufDate, transferDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const payment = { action: 'verify_payment', contractId: contract, ufValue: '39.500,25'.replace(/\./g, '').replace(',', '.'), reference: `OP-${tag}`, transferDate, confirmed: true };
const low = await action({ ...payment, paidAmountClp: '600000' });
assert.equal(low.status, 400); assert.equal(low.body.codigo, 'PAYMENT_OUTSIDE_TOLERANCE'); step('pago fuera de tolerancia rechazado', low.body.mensaje);
const blocked = await action({ action: 'activate', contractId: contract, paymentId: randomUUID(), reason: 'Intento sin pago verificado' });
assert.notEqual(blocked.body.ok, true); step('activación sin pago verificado rechazada', `HTTP ${blocked.status}`);
const ok = await action({ ...payment, paidAmountClp: '634404' });
assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.data.payment.expectedAmountClp, '634572');
step('pago verificado y registrado en el CRM', `esperado $634.572, transferido $634.404 (${ok.body.data.payment.differencePct} %)`);
const again = await action({ ...payment, paidAmountClp: '634404' });
assert.equal(again.body.data.paymentId, ok.body.data.paymentId); step('reintento idempotente: mismo pago');
assert.equal(crmSql(`select count(*) from contratacion_integral.payments where request_id=${lit(id)}`), '1');

// 5. Activación.
const active = await action({ action: 'activate', contractId: contract, paymentId: ok.body.data.paymentId, reason: 'Pago de primera cuota verificado en cuenta Santander' });
assert.equal(active.status, 200, JSON.stringify(active.body)); step('servicio activado por Root');
const after = opSql(`select c.status||'|'||(e.activated_at is not null) from public.web_enrollments e join public.companies c on c.id=e.company_id where e.id=${lit(id)}`);
step('estado final en la operativa', after);
assert.equal(after, 'active|true');

// 6. Después de activar: ingreso operativo con la clave personal.
const login1 = await client({ body: { action: 'login', email: rep, password: password1 } });
assert.equal(login1.status, 200, JSON.stringify(login1.body)); me = await session(login1.cookie);
assert.equal(me.body.scope, 'operational', JSON.stringify(me.body)); assert.equal(me.body.mustChangePassword, false); step('ingreso con clave personal tras activar', 'alcance operativo');

// 7. Recuperación: solicitud pública genérica → Root emite enlace tras verificar identidad → nueva clave.
const generic = await client({ path: 'recuperacion', body: { action: 'request', email: `nadie.${tag}@example.invalid` } });
const asked = await client({ path: 'recuperacion', body: { action: 'request', email: rep } });
assert.equal(asked.body.mensaje, generic.body.mensaje); step('solicitud de recuperación con respuesta genérica');
const list = await action({ action: 'recoveries' }); const pending = (list.body.data || []).find(x => x.email === rep && x.state === 'pending');
assert.ok(pending, JSON.stringify(list.body)); step('Root ve la recuperación pendiente');
assert.notEqual((await recovery({ action: 'issue', id: pending.id, identityConfirmed: false, reason: 'Sin verificar identidad' })).body.ok, true); step('enlace sin verificar identidad rechazado');
const issued = await recovery({ action: 'issue', id: pending.id, identityConfirmed: true, reason: 'Identidad verificada por teléfono (prueba de humo QA)' });
assert.equal(issued.status, 200, JSON.stringify(issued.body)); const link = new URL(issued.body.url), recoveryToken = link.hash.replace('#recuperar=', '');
assert.equal(link.origin, OP); step('Root emite enlace de recuperación', `${link.origin}${link.pathname}#recuperar=…`);
const password2 = `Clave-Local-${tag}-2`;
const completed = await client({ path: 'recuperacion', body: { action: 'complete', token: recoveryToken, password: password2, confirmPassword: password2 } });
assert.equal(completed.status, 200, JSON.stringify(completed.body)); step('nueva clave por recuperación', completed.body.mensaje);
assert.notEqual((await client({ path: 'recuperacion', body: { action: 'complete', token: recoveryToken, password: password2, confirmPassword: password2 } })).body.ok, true); step('enlace de recuperación de un solo uso');
assert.notEqual((await session(login1.cookie)).body.ok, true); step('sesión anterior revocada por la recuperación');
assert.notEqual((await client({ body: { action: 'login', email: rep, password: password1 } })).body.ok, true); step('clave anterior ya no sirve');
const login2 = await client({ body: { action: 'login', email: rep, password: password2 } });
assert.equal(login2.status, 200, JSON.stringify(login2.body)); assert.equal((await session(login2.cookie)).body.scope, 'operational'); step('ingreso con la nueva clave');

// 7b. Operador tras la activación: Root renueva su PIN y el operador ingresa (debe cambiar clave).
const operatorId = opSql(`select id from auth.users where lower(email)=${lit(operatorEmail)}`);
const opRenew = await recovery({ action: 'renew_pin', userId: operatorId, identityConfirmed: true, reason: 'Entrega verificada al operador (prueba de humo QA)' });
assert.equal(opRenew.status, 200, JSON.stringify(opRenew.body));
const opLogin = await client({ body: { action: 'login', email: operatorEmail, password: opRenew.body.pin } });
assert.equal(opLogin.status, 200, JSON.stringify(opLogin.body)); const opMe = await session(opLogin.cookie);
assert.equal(opMe.body.scope, 'operational'); assert.equal(opMe.body.mustChangePassword, true); step('operador ingresa con PIN tras activar', 'alcance operativo, debe cambiar clave');

// 8. Suspensión por Root: la sesión abierta deja de servir.
const suspended = await action({ action: 'change_status', status: 'inactive', reason: 'Suspensión de prueba de humo QA' });
assert.equal(suspended.status, 200, JSON.stringify(suspended.body)); step('Root suspende la empresa');
assert.notEqual((await session(login2.cookie)).body.ok, true); assert.notEqual((await session(opLogin.cookie)).body.ok, true); step('sesiones abiertas (representante y operador) invalidadas por la suspensión');
assert.notEqual((await client({ body: { action: 'login', email: rep, password: password2 } })).body.ok, true); step('ingreso bloqueado mientras está suspendida');
console.log(`\nReferencia de prueba: ${id}`);
