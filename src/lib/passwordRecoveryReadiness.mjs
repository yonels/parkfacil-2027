import { detectarPortal, construirRedirectTo, esEntornoLocal } from './passwordRecoveryCore.mjs';
const required = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','MICROSOFT_TENANT_ID','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','MICROSOFT_SENDER_EMAIL'];
export function recoveryReadiness(env = process.env) {
 const problems = required.filter(key => !String(env[key] || '').trim()).map(key => `${key}_MISSING`);
 if (String(env.PASSWORD_RECOVERY_DELIVERY || '').trim().toLowerCase() !== 'microsoft') problems.push('PASSWORD_RECOVERY_DELIVERY_INVALID');
 try { const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL); if(url.protocol !== 'https:') problems.push('SUPABASE_URL_INVALID'); } catch { problems.push('SUPABASE_URL_INVALID'); }
 if(env.MICROSOFT_SENDER_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.MICROSOFT_SENDER_EMAIL)) problems.push('MICROSOFT_SENDER_EMAIL_INVALID');
 if(env.VERCEL_ENV === "preview" && ![env.VERCEL_URL,env.VERCEL_BRANCH_URL].some(host => /^[a-z0-9-]+\.vercel\.app$/.test(String(host || "")))) problems.push("PREVIEW_RECOVERY_HOST_MISSING");
 return { ok: problems.length === 0, problems };
}
export function resolveRecoveryRequest({ host, portalPrueba, requestedPortal, env = process.env }) {
 const normalized = String(host || '').trim().toLowerCase();
 const knownPortal = detectarPortal({host:normalized,portalPrueba});
 if (knownPortal) return {portal:knownPortal,redirectTo:construirRedirectTo(knownPortal,{local:esEntornoLocal(normalized),origin:esEntornoLocal(normalized)?`http://${normalized}`:null})};
 // Exact Vercel-generated hosts only; no suffix trust and no arbitrary redirects.
 const hosts = [env.VERCEL_URL,env.VERCEL_BRANCH_URL].filter(Boolean).map(value => String(value).toLowerCase());
 if(env.VERCEL_ENV === 'preview' && hosts.includes(normalized) && /^[a-z0-9-]+\.vercel\.app$/.test(normalized)) {
  const portal = requestedPortal === 'root' ? 'root' : 'cliente';
  return {portal,redirectTo:`https://${normalized}/nueva-contrasena?portal=${portal}`};
 }
 return {portal:null,redirectTo:null};
}
