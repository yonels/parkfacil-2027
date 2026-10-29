import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import {
  cancelSmsCentral,
  checkCentralDeliveries,
  processDueSms,
  resendSmsCentral,
  resolveCenterSmsProvider,
  sendSmsCentral,
} from "./smsCenterServiceCore.mjs";

// Punto de entrada del servicio SMS centralizado (SOL-2026-10-29-007): provee
// los valores por defecto (Supabase real, proveedor según SMS_PROVIDER) sobre
// smsCenterServiceCore.mjs. Cualquier módulo nuevo que necesite enviar SMS
// debe usar sendSms() en vez de llamar al proveedor directamente.
function deps(overrides = {}) {
  return { db: overrides.db || getSupabaseAdminClient(), provider: overrides.provider || resolveCenterSmsProvider(), now: overrides.now };
}

export function sendSms(input, overrides) { return sendSmsCentral(input, deps(overrides)); }
export function queueSms(input, overrides) { return sendSmsCentral(input, { ...deps(overrides), send: false }); }
export function processDueCentralSms({ limit, ...overrides } = {}) { return processDueSms({ ...deps(overrides), limit }); }
export function checkCentralSmsDeliveries({ limit, ...overrides } = {}) { return checkCentralDeliveries({ ...deps(overrides), limit }); }
export function resendSms(input, overrides) { return resendSmsCentral(input, deps(overrides)); }
export function cancelSms(input, overrides) { return cancelSmsCentral(input, deps(overrides)); }
