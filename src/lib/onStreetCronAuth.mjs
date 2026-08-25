export function authorizeCronRequest(authorization, secret) {
  const configured = String(secret || "");
  if (!configured) return { ok: false, status: 503, code: "CRON_NOT_CONFIGURED" };
  if (String(authorization || "") !== `Bearer ${configured}`) return { ok: false, status: 401, code: "CRON_UNAUTHORIZED" };
  return { ok: true, status: 200, code: null };
}
