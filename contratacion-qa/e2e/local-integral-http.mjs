// Prueba integrada LOCAL (SOL-2026-10-16-001): formulario → provisión → pago → activación por HTTP real entre
// la operativa (localhost:3030) y el CRM (localhost:3041), cada uno con su Supabase local.
// Solo datos ficticios. Lee claves de archivos .env locales ignorados; no imprime secretos.
// Uso: node contratacion-qa/e2e/local-integral-http.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const env = file => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
const OP_DIR = 'C:/proyectos/parkfacil-2027-contratacion-integral', CRM_DIR = 'C:/proyectos/parkfacil-v2-contratacion-integral';
const op = { ...env(`${OP_DIR}/.env.local`), ...env(`${OP_DIR}/.env.development.local`) }, crm = env(`${CRM_DIR}/.env.local`), root = env(`${OP_DIR}/.env.contratacion-root.local`);
for (const url of [op.NEXT_PUBLIC_SUPABASE_URL, crm.NEXT_PUBLIC_SUPABASE_URL, crm.CONTRATACION_OPERATIONAL_URL]) assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/?$/, 'solo bases locales');
const OP = 'http://localhost:3030', CRM = 'http://localhost:3041';
const sql = (container, query) => { try { return execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); } catch (error) { throw Error(`SQL ${container}: ${error.stderr?.toString().trim()}`); } };
const crmSql = q => sql('supabase_db_parkfacil-crm-local', q), opSql = q => sql('supabase_db_parkfacil-2027', q);
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const step = (name, detail = '') => console.log(`✔ ${name}${detail ? ` — ${detail}` : ''}`);

// 1. Formulario público del CRM (datos ficticios).
const id = randomUUID(), tag = id.slice(0, 8), rep = `rep.${tag}@example.test`;
// RUT ficticio válido y distinto por corrida (un RUT repetido deja la solicitud en revisión, como corresponde).
const rutBody = String(60000000 + Math.floor(Math.random() * 9000000));
const rutDv = (() => { let sum = 0, m = 2; for (const d of [...rutBody].reverse()) { sum += Number(d) * m; m = m === 7 ? 2 : m + 1; } const v = 11 - (sum % 11); return v === 11 ? '0' : v === 10 ? 'K' : String(v); })();
const { CAMPOS_CONTRATACION, DOCUMENTOS_CONTRATACION } = await import(`file:///${CRM_DIR}/src/lib/contratacion/formulario.mjs`);
const form = { ...Object.fromEntries(CAMPOS_CONTRATACION.map(([k]) => [k, `Dato ficticio ${tag}`])), requestId: id, rut: `${rutBody}-${rutDv}`, representanteRut: '22.222.222-2',
  correo: `empresa.${tag}@example.test`, representanteCorreo: rep, telefono: '+56900000000', representanteTelefono: '+56900000000', planId: 'start', plazas: 50,
  aceptaCondiciones: true, lecturaPrivacidad: true, documentos: DOCUMENTOS_CONTRATACION, representanteApellidoPaterno: 'Prueba', representanteApellidoMaterno: 'Local' };
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
const auth = await fetch(`${op.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: op.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: root.ROOT_LOCAL_EMAIL, password: root.ROOT_LOCAL_PASSWORD }) });
const token = (await auth.json()).access_token; assert.ok(token, 'sesión Root local');
const action = async payload => { const res = await fetch(`${OP}/api/contratacion/root`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: OP, authorization: `Bearer ${token}` }, body: JSON.stringify({ id, ...payload }) }); return { status: res.status, body: await res.json() }; };
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
console.log(`\nReferencia de prueba: ${id}`);
