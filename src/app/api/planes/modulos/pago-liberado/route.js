import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeRemainingRequest, remainingActor } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { catalogRowFromDb, normalizeCatalog, sanitizeCatalogInput } from "@/lib/releasedPayment/catalogCore.mjs";

// Off Street — Pago liberado (Fase A): catálogo comercial del módulo.
// Root → Planes → Módulos adicionales → Pago liberado. Lectura y edición
// EXCLUSIVAS de Root (platform_admin): el cliente, el operador y el
// supervisor no ven ni modifican precios. La edición se re-verifica en la
// base (RPC update_released_payment_catalog, solo service_role).

export const dynamic = "force-dynamic";

const STORAGE_MISSING_CODES = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);

function forbidden() {
  return NextResponse.json({ error: "Solo ParkFacil Root puede administrar el módulo Pago liberado.", code: "RELEASED_PAYMENT_FORBIDDEN" }, { status: 403 });
}

async function authorizeRoot(request) {
  const authorization = await authorizeRemainingRequest(request, PERMISSIONS.PLATFORM_GLOBAL);
  if (authorization.response) return { response: authorization.response };
  const actor = remainingActor(authorization.context);
  if (!actor) return { response: NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 }) };
  if (!actor.isPlatformAdmin) return { response: forbidden() };
  return { actor, context: authorization.context };
}

export async function GET(request) {
  const { response } = await authorizeRoot(request);
  if (response) return response;
  const db = getSupabaseAdminClient();
  const [catalog, audit] = await Promise.all([
    db.from("released_payment_catalog").select("*").order("period_months"),
    db.from("released_payment_catalog_audit").select("modality,previous_values,new_values,changed_by_email,changed_at").order("changed_at", { ascending: false }).limit(30),
  ]);
  if (catalog.error) {
    if (STORAGE_MISSING_CODES.has(catalog.error.code)) {
      // Migración 20261001090000 aún no aplicada: sin catálogo no hay
      // precios que mostrar (nunca se usan valores fijos en código).
      return NextResponse.json({ data: [], audit: [], storageReady: false, permissions: { canEdit: false } });
    }
    console.error("[released-payment-catalog:read]", catalog.error);
    return NextResponse.json({ error: "No fue posible cargar el catálogo de Pago liberado.", code: "RELEASED_PAYMENT_READ_FAILED" }, { status: 500 });
  }
  return NextResponse.json({
    data: normalizeCatalog((catalog.data || []).map(catalogRowFromDb)),
    audit: audit.error ? [] : audit.data || [],
    storageReady: true,
    permissions: { canEdit: true },
  });
}

export async function PATCH(request) {
  const { response, actor } = await authorizeRoot(request);
  if (response) return response;
  const { rows, errors } = sanitizeCatalogInput(await request.json().catch(() => ({})));
  if (errors.length) {
    return NextResponse.json({ error: "Revisa los valores del catálogo.", code: "VALIDATION_ERROR", details: errors }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdminClient().rpc("update_released_payment_catalog", { p_actor_id: actor.id, p_items: rows });
  if (error) {
    if (STORAGE_MISSING_CODES.has(error.code)) {
      return NextResponse.json({ error: "El catálogo de Pago liberado aún no está habilitado en la base (migración pendiente).", code: "RELEASED_PAYMENT_STORAGE_PENDING" }, { status: 503 });
    }
    const denied = error.code === "42501" || String(error.message || "").includes("FORBIDDEN");
    if (denied) return forbidden();
    console.error("[released-payment-catalog:update]", error);
    return NextResponse.json({ error: "No fue posible guardar el catálogo de Pago liberado.", code: "RELEASED_PAYMENT_UPDATE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ data: normalizeCatalog((data || []).map(catalogRowFromDb)), storageReady: true, permissions: { canEdit: true } });
}
