function requestPath(request) {
  try { return request.nextUrl?.pathname || new URL(request.url).pathname; } catch { return "unknown"; }
}

function requestIp(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return String(forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

export function createDeniedAccessEvent({ request, context, error, now = new Date() }) {
  const actor = context || error?.auditContext || {};
  return {
    event: "access_denied",
    userId: actor.userId || null,
    companyId: actor.companyId || null,
    portal: actor.portal || null,
    ip: requestIp(request),
    path: requestPath(request),
    occurredAt: now.toISOString(),
    reason: error?.code || "ACCESS_DENIED",
    httpStatus: Number(error?.status) || 403,
  };
}
