import {temporaryPin} from '../../web/temporary-pin.mjs';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function fingerprint(registro) {
  const copy = structuredClone(registro);
  delete copy.aceptacion.fechaHora;
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

function encryptionKey(value) {
  if (!/^[a-f0-9]{64}$/i.test(value || '')) throw new Error('ENROLLMENT_KEY_REQUIRED');
  return Buffer.from(value, 'hex');
}

export function seal(value, key, id) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(id));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(x => x.toString('base64url')).join('.');
}

export function unseal(value, key, id) {
  const [iv, tag, bytes] = value.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString());
}

export function accountsFor(id, registro, {pinMode=false}={}) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('REQUEST_ID_INVALID');
  return ['company_admin', 'operator', 'operator'].map((role, index) => ({
    role,
    fullName: index ? `Operador ${index} — ${registro.empresa}` : `${registro.representanteNombres} ${registro.representanteApellidos}`,
    email: index ? `operador${index}.${id}@usuarios.parkfacil.cl` : registro.representanteCorreo.trim().toLowerCase(),
    ...(pinMode?{scheme:'qa_pin_v1'}:{}),
    password: pinMode?temporaryPin():`Pf!${randomBytes(24).toString('base64url')}9a`,
    recoveryEmail: registro.representanteCorreo.trim().toLowerCase(),
  }));
}

async function rpc(db, name, args) {
  const result = await db.rpc(name, args);
  if (result.error) throw new Error(name + '_FAILED');
  return result.data;
}

// An existing Auth identity is reusable only when this enrollment owns it.
// Never update somebody else's identity, password or company.
export async function ensureAccount(db, account, id) {
  const created = await db.auth.admin.createUser({
    email: account.email, ...(account.scheme==='qa_pin_v1'?{}:{password:account.password}), email_confirm: true,
    app_metadata: { role: 'pending_enrollment', enrollment_id: id, ...(account.scheme?{credential_scheme:account.scheme}:{}) },
    user_metadata: { full_name: account.fullName, must_change_password: true },
  });
  if (!created.error) return created.data.user.id;
  const code = created.error.code;
  if (!['email_exists', 'user_already_exists'].includes(code)) throw new Error('ACCOUNT_CREATE_FAILED');
  for (let page = 1; ; page++) {
    const listed = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (listed.error) throw new Error('ACCOUNT_LOOKUP_FAILED');
    const user = listed.data.users.find(x => x.email?.toLowerCase() === account.email);
    if (user) {
      if (user.app_metadata?.enrollment_id !== id || (account.scheme && user.app_metadata?.credential_scheme !== account.scheme)) throw new Error('ACCOUNT_OWNERSHIP_CONFLICT');
      return user.id;
    }
    if (listed.data.users.length < 100) throw new Error('ACCOUNT_LOOKUP_FAILED');
  }
}

// One worker at a time; expired workers are NOT automatically taken over.
// Crashed jobs require a deliberate recovery after checking the old worker.
export async function provision({ crm, operational, id, registro, key, pinStore }) {
  const encrypted = seal(accountsFor(id, registro,{pinMode:!!pinStore}), key, id);
  const job = await rpc(crm, 'contratacion_begin', {
    p_id: id, p_fingerprint: fingerprint(registro), p_payload: registro, p_credentials: encrypted,
  });
  if (job.state === 'completed') return { ok: true, referencia: id, estado: 'creada' };
  if (!job.claimed) return { ok: true, referencia: id, estado: 'procesando' };
  try {
    const accounts = unseal(job.credentials, key, id);
    const ids = [];
    for (const account of accounts) {
      const userId=await ensureAccount(operational, account, id);
      if(account.scheme==='qa_pin_v1'){if(!pinStore)throw Error('PIN_STORE_REQUIRED');await pinStore.register(account,userId,id);}
      ids.push(userId);
    }
    const mapped = accounts.map((account, index) => ({
      id: ids[index], role: account.role, fullName: account.fullName,
      email: account.email, recoveryEmail: account.recoveryEmail,
    }));
    const result = await rpc(operational, 'contratacion_operational_finish', {
      p_id: id, p_fingerprint: job.fingerprint, p_payload: job.payload, p_accounts: mapped,
    });
    // Alta completa no autoriza acceso: conserva pending_enrollment en Auth.
    await rpc(crm, 'contratacion_complete', { p_id: id, p_operational: result });
    return { ok: true, referencia: id, estado: 'creada' };
  } catch {
    // No raw error, passwords, email, request body or provider response is logged/returned.
    await rpc(crm, 'contratacion_fail', { p_id: id });
    throw new Error('ENROLLMENT_RETRY_REQUIRED');
  }
}

