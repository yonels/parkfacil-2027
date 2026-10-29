import "server-only";
import { NextResponse } from "next/server";
import { authorizeReleasedPayment } from "@/lib/releasedPayment/releasedPaymentServer";
import { releasedPlateFromDb } from "./releasedPlateCore.mjs";
import { fetchAllRows } from "@/lib/reports/engine/fetchAll.mjs";

// Off Street — Pago liberado gestionado por el cliente (SOL-2026-10-28-003).
// Solo el administrador de la empresa (company_admin con Off Street
// contratado) activa el módulo por estacionamiento y gestiona las patentes.
// ParkFacil Root solo supervisa (lectura por empresa, sin cambios). Cada RPC
// vuelve a verificar el rol en la base.

const STORAGE_MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202", "42703", "PGRST204"]);

export function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function authorizeReleasedPlates(request) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth;
  if (!auth.actor.companyId) return { response: fail("Tu usuario no tiene una empresa asignada.", 403, { code: "RELEASED_PLATE_FORBIDDEN" }) };
  return auth;
}

// Lectura: administrador (su empresa) o Root (empresa elegida con ?companyId=).
export async function authorizeReleasedPlatesRead(request) {
  const auth = await authorizeReleasedPayment(request, "read");
  if (auth.response) return auth;
  if (!auth.isRoot) {
    if (!auth.actor.companyId) return { response: fail("Tu usuario no tiene una empresa asignada.", 403, { code: "RELEASED_PLATE_FORBIDDEN" }) };
    return { ...auth, viewer: "ADMIN", companyId: auth.actor.companyId };
  }
  const requested = String(new URL(request.url).searchParams.get("companyId") || "").trim();
  return { ...auth, viewer: "ROOT", companyId: requested || null };
}

// Empresas cliente activas con Off Street (selector de Root).
export async function listOffStreetCompanies(db) {
  const { data, error } = await db.from("companies").select("id,business_name,trade_name,status,relationship_type,enabled_products")
    .eq("status", "active").order("business_name");
  if (error) throw error;
  return (data || [])
    .filter((c) => c.relationship_type === "client" && (!Array.isArray(c.enabled_products) || c.enabled_products.includes("OFF_STREET")))
    .map((c) => ({ id: c.id, name: c.trade_name || c.business_name }));
}

export function storageMissing(error) {
  return STORAGE_MISSING.has(error?.code);
}

const RPC_MESSAGES = {
  RELEASED_PLATE_FORBIDDEN: [403, "Solo el administrador de la empresa gestiona Pago liberado."],
  RELEASED_PLATE_PARKING_NOT_FOUND: [404, "Estacionamiento no encontrado."],
  RELEASED_PLATE_NOT_FOUND: [404, "No se encontró la patente liberada."],
  RELEASED_PLATE_CONFLICT: [409, "Otra persona modificó esta patente mientras la editabas. Recarga antes de guardar."],
  RELEASED_PLATE_NOT_EDITABLE: [409, "Solo se pueden editar autorizaciones vigentes o programadas."],
  RELEASED_PLATE_OVERLAP: [409, "La patente ya tiene una autorización vigente o programada. Edita ese registro o finalízalo."],
  RELEASED_PLATE_MAX_BELOW_USES: [409, "El máximo de usos no puede ser menor que los usos ya registrados."],
  RELEASED_PLATE_NOT_CURRENT: [409, "Solo se puede finalizar una autorización vigente."],
  RELEASED_PLATE_ALREADY_DELETED: [409, "La patente ya estaba eliminada."],
  RELEASED_PLATE_NOT_DELETED: [409, "La patente no está eliminada."],
  RELEASED_PLATE_ACTION_INVALID: [400, "Acción no válida."],
};

export function rpcErrorCode(error) {
  const message = String(error?.message || "");
  return Object.keys(RPC_MESSAGES).find((code) => message.includes(code)) || null;
}

export function rpcFailure(error, fallback) {
  if (storageMissing(error)) return fail("Pago liberado aún no está habilitado en la base (migración pendiente).", 503, { code: "RELEASED_PLATE_STORAGE_PENDING" });
  const code = rpcErrorCode(error);
  if (code) {
    const [status, message] = RPC_MESSAGES[code];
    return fail(message, status, { code });
  }
  if (error?.code === "23514") return fail("Revisa los datos: alguno no cumple el formato requerido.", 400, { code: "RELEASED_PLATE_INVALID" });
  console.error("[released-plates]", error?.code, error?.message);
  return fail(fallback, 500, { code: "RELEASED_PLATE_FAILED" });
}

// Estacionamientos Off Street activos de la empresa con su activación.
export async function listCompanyParkings(db, companyId) {
  const { data: parkings, error } = await db.from("parkings").select("id,code,name,status")
    .eq("company_id", companyId).eq("type", "OFF_STREET").eq("status", "ACTIVE").order("name");
  if (error) throw error;
  const ids = (parkings || []).map((p) => p.id);
  const settings = ids.length
    ? await db.from("released_plate_parking_settings").select("parking_id,enabled,updated_at,updated_by_email").in("parking_id", ids)
    : { data: [], error: null };
  if (settings.error) throw settings.error;
  const byParking = new Map((settings.data || []).map((row) => [row.parking_id, row]));
  return (parkings || []).map((p) => ({
    id: p.id, code: p.code, name: p.name,
    enabled: byParking.get(p.id)?.enabled === true,
    updatedAt: byParking.get(p.id)?.updated_at || null,
    updatedByEmail: byParking.get(p.id)?.updated_by_email || "",
  }));
}

export async function listCompanyAuthorizations(db, companyId) {
  // Por páginas: Supabase entrega máx. 1.000 filas por consulta (SOL-2026-10-28-005).
  const data = await fetchAllRows(() => db.from("released_plate_authorizations").select("*")
    .eq("company_id", companyId).order("valid_from", { ascending: false }).order("id"), { max: 50000 });
  return data.map(releasedPlateFromDb);
}

export async function loadCompanyAuthorization(db, companyId, id) {
  const { data, error } = await db.from("released_plate_authorizations").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw error;
  return releasedPlateFromDb(data);
}

export async function loadAuthorizationEvents(db, companyId, id) {
  const { data, error } = await db.from("released_plate_authorization_events")
    .select("event_type,parking_id,actor_email,created_at,new_values,parkings(name)")
    .eq("company_id", companyId).eq("authorization_id", id).order("created_at", { ascending: true }).limit(500);
  if (error) throw error;
  return (data || []).map((row) => ({
    type: row.event_type, at: row.created_at, actorEmail: row.actor_email || "", parkingName: row.parkings?.name || null,
    useNumber: row.event_type === "USED" ? Number(row.new_values?.uses_count || 0) : null,
    stayCode: row.event_type === "USED" ? row.new_values?.stay_code || null : null,
  }));
}

// Autorizaciones ACTIVAS de una patente en la empresa del estacionamiento
// (POS). Sin la migración, ninguna (el flujo normal no cambia).
export async function loadPlateEntryContext(db, parkingId, plate) {
  const parking = await db.from("parkings").select("company_id").eq("id", parkingId).maybeSingle();
  if (parking.error) throw parking.error;
  const companyId = parking.data?.company_id;
  if (!companyId) return { enabled: false, authorizations: [] };
  const [settings, authorizations] = await Promise.all([
    db.from("released_plate_parking_settings").select("enabled").eq("parking_id", parkingId).maybeSingle(),
    db.from("released_plate_authorizations").select("*").eq("company_id", companyId).eq("license_plate", plate).eq("status", "ACTIVE"),
  ]);
  if (settings.error) throw settings.error;
  if (authorizations.error) throw authorizations.error;
  return { enabled: settings.data?.enabled === true, authorizations: (authorizations.data || []).map(releasedPlateFromDb) };
}
