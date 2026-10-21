import {accessScope} from './access-scope.mjs';
import { randomInt, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const denied = () => new Error('No se pudo autorizar el acceso.');
export function temporaryPin() { return String(randomInt(10000)).padStart(4, '0'); }
export async function pinVerifier(pin) {
 if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw denied();
 const salt = randomBytes(32).toString('hex');
 const hash = Buffer.from(await scrypt(pin, salt, 32)).toString('hex');
 return {salt, hash};
}
export async function matchesPin(pin, verifier) {
 const valid = typeof pin === 'string' && /^\d{4}$/.test(pin);
 // Missing identities perform the same expensive verification. No public identity lookup.
 const salt = verifier?.salt || '0'.repeat(64);
 const expected = verifier?.hash || '0'.repeat(64);
 const actual = Buffer.from(await scrypt(valid ? pin : 'invalid', salt, 32));
 return valid && !!verifier && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
// This adapter never creates a long Auth password. Auth remains the session issuer.
// store.reserveAttempt must atomically persist the attempt BEFORE returning a verifier,
// enforce 5 attempts / 10 minutes across processes, and return null for unknown users.
// store.confirm atomically checks credential version and resets attempts after success.
// The temporary credential remains valid until personal change or expiry.
// Implementations must keep both operations outside public/anonymous database access.
export async function exchangeTemporaryPin({email,pin,store,auth,access,allowCommercial=false}) {
 const normalized = String(email || '').trim().toLowerCase();
 let record;
 try {
  record = await store.reserveAttempt(normalized);
  const valid = await matchesPin(pin, record);
  if (!valid || !record?.userId || !record?.enrollmentId) throw denied();
  // Query actual membership and company on each exchange, never user_metadata.
  const allowed = await access(record.userId, record.enrollmentId);
  const scope=accessScope(allowed,{allowCommercial});
  // Recovery links require an existing identity; magiclink can implicitly create users.
  // generateLink does not send email. Its hashed token stays entirely on the server.
  const link = await auth.admin.generateLink({type:'recovery',email:normalized});
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token || link.data?.user?.id !== record.userId) throw denied();
  const result = await auth.verifyOtp({token_hash:token,type:'recovery'});
  if (result.error || result.data?.user?.id !== record.userId || !result.data?.session?.access_token) throw denied();
  if (!await store.confirm(record.userId,record.revision)) throw denied();
  // No refresh token / link / PIN is returned. Cookie sessions stay on the server.
  return {userId:record.userId,accessToken:result.data.session.access_token,mustChangePassword:true,scope};
 } catch { throw denied(); }
}

