import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { sanitizeModulePricing, validateModulePricing } from "@/lib/modulePricing.mjs";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export const dynamic = "force-dynamic";

function authRequired() {
  return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
}

export async function GET(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.COMPANY_READ);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return authRequired();
  const { data, error } = await getSupabaseAdminClient()
    .from("module_pricing")
    .select("module_id,monthly_uf,benefit,active,updated_at")
    .eq("active", true)
    .order("module_id");
  if (error) {
    console.error("[module-pricing:read]", error);
    return NextResponse.json({ error: "No fue posible cargar el tarifario.", code: "MODULE_PRICING_READ_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ data, permissions: { canEdit: actor.isPlatformAdmin } });
}

export async function PATCH(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return authorization.response;
  const actor = remainingActor(authorization.context);
  if (!actor) return authRequired();
  if (!actor.isPlatformAdmin) {
    return NextResponse.json({ error: "Solo ParkFacil Root puede modificar el tarifario.", code: "MODULE_PRICING_FORBIDDEN" }, { status: 403 });
  }

  const items = sanitizeModulePricing(await request.json());
  const validation = validateModulePricing(items);
  if (validation.length) {
    return NextResponse.json({ error: "Revisa los valores del tarifario.", code: "VALIDATION_ERROR", details: validation }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdminClient().rpc("update_module_pricing", {
    p_actor_id: actor.id,
    p_items: items,
  });
  if (error) {
    console.error("[module-pricing:update]", error);
    const forbidden = error.code === "42501" || error.message?.includes("FORBIDDEN");
    return NextResponse.json({
      error: forbidden ? "Solo ParkFacil Root puede modificar el tarifario." : "No fue posible guardar el tarifario.",
      code: forbidden ? "MODULE_PRICING_FORBIDDEN" : "MODULE_PRICING_UPDATE_FAILED",
    }, { status: forbidden ? 403 : 500 });
  }
  return NextResponse.json({ data, permissions: { canEdit: true } });
}
