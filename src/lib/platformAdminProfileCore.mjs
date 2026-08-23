import { esEmailValido, normalizarEmail } from "./passwordRecoveryCore.mjs";

export function normalizePlatformAdminProfileInput(input) {
  const recoveryEmail = normalizarEmail(input?.recoveryEmail);
  if (recoveryEmail && !esEmailValido(recoveryEmail)) {
    return { recoveryEmail: undefined, error: "El correo de recuperación no es válido." };
  }
  return { recoveryEmail: recoveryEmail || null, error: null };
}

export function assertSelfPlatformAdmin({ context, targetUser }) {
  if (!context?.userId || context.portal !== "root" || context.role !== "platform_admin") {
    return { ok: false, status: 403, code: "PLATFORM_ADMIN_REQUIRED" };
  }
  if (!targetUser || targetUser.id !== context.userId) {
    return { ok: false, status: 404, code: "ROOT_PROFILE_NOT_FOUND" };
  }
  if (targetUser.app_metadata?.role !== "platform_admin") {
    return { ok: false, status: 403, code: "PLATFORM_ADMIN_ROLE_REQUIRED" };
  }
  return { ok: true };
}
