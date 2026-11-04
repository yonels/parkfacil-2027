// Renovación de la sesión del POS (SOL-2026-11-04-010). El POS se autentica con una cookie de 55
// minutos y nadie la renovaba: cada 55 minutos el operador volvía al inicio de sesión. Lógica sin
// React ni Supabase, para probarla con node --test.
export const POS_SESSION_RENEW_MS = 10 * 60 * 1000;
export const POS_TOKEN_MIN_REMAINING_MS = 15 * 60 * 1000;

export function tokenNeedsRefresh(session, now = Date.now()) {
  const expiresAt = Number(session?.expires_at) * 1000;
  return !Number.isFinite(expiresAt) || expiresAt - now < POS_TOKEN_MIN_REMAINING_MS;
}

// Sin sesión local (por ejemplo, tras cerrar sesión) no hace nada: nunca revive una sesión cerrada.
// Si falla el refresco, usa el token vigente; si ya no sirve, el servidor lo rechaza.
export async function renewPosSession({ getSession, refreshSession, postSession, now = Date.now() }) {
  let session = await getSession();
  if (!session?.access_token) return { ok: false, reason: "NO_SESSION" };
  if (tokenNeedsRefresh(session, now)) {
    const refreshed = await refreshSession().catch(() => null);
    if (refreshed?.access_token) session = refreshed;
  }
  const status = await postSession(session.access_token);
  return status >= 200 && status < 300 ? { ok: true } : { ok: false, reason: "REJECTED", status };
}
