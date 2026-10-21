import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { couponModuleStatusForSession } from "./couponModuleServer";

// Agrega al contexto de sesión el estado del módulo Cupones de la empresa
// (SOL-2026-10-19-002, etapa C) cuando se necesita: Portal Cliente y ruta
// /cupones (proxy) o la sesión que arma el menú. canAccessPath lo usa para
// ocultar Cupones a una empresa que no lo contrató. Nunca lanza.
export async function withCouponModuleStatus(context, pathname) {
  if (!context || context.portal !== "client" || !context.companyId) return context;
  if (!(pathname === "/cupones" || String(pathname || "").startsWith("/cupones/"))) return context;
  const couponModuleStatus = await couponModuleStatusForSession(getSupabaseAdminClient(), context.companyId);
  return { ...context, couponModuleStatus };
}
