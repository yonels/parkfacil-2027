import "server-only";
import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { couponModuleRpcError } from "./couponModuleCore.mjs";

// Autorización común de las API Root del módulo Cupones (SOL-2026-10-19-002,
// etapa C). Catálogo, contratación y activación son EXCLUSIVOS de Root (D8);
// cada RPC vuelve a verificar el rol en la base. No dependen de
// COUPONS_ENABLED: Root puede contratar antes de encender el ambiente.

export const STORAGE_MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST200", "42883", "PGRST202"]);

export function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function authorizeCouponModuleRoot(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return { response: authorization.response };
  const actor = remainingActor(authorization.context);
  if (!actor?.isPlatformAdmin) return { response: fail("Solo ParkFacil Root puede administrar el módulo de cupones.", 403, { code: "COUPON_MODULE_FORBIDDEN" }) };
  return { db: authorization.db, actor };
}

export function rpcFailure(error, fallback) {
  if (STORAGE_MISSING_CODES.has(error?.code)) return fail("El módulo de cupones aún no está instalado en la base de datos.", 503, { code: "COUPON_MODULE_STORAGE_MISSING" });
  const known = couponModuleRpcError(error);
  if (known) return fail(known.message, known.status, { code: known.code });
  console.error("[coupon-module:rpc]", error?.code || null, error?.message || error);
  return fail(fallback, 503);
}
