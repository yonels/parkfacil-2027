import "server-only";
import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { authorizationFromDb } from "./authorizationCore.mjs";
import { paymentFromDb } from "./paymentCore.mjs";
import { tariffFromDb } from "./tariffCore.mjs";
import { contractFromDb, moduleFromDb, MODULE_STATUS_LABELS, resolveModuleStatus } from "./releasedStayCore.mjs";

// Off Street — Pago liberado: autorización server-side común (Etapa 1:
// fases B + C, SOL-2026-10-16-003).
// - ROOT: contratación con importe mensual, activación, desactivación y
//   reactivación (solo platform_admin).
// - ADMIN: administrador del estacionamiento = company_admin de la empresa
//   dueña (decisión del usuario, 2026-10-16). Define cupos simultáneos,
//   tarifas a beneficiarios y autorizaciones, y registra los pagos recibidos.
// - READ: Root (supervisión) o el administrador de su empresa.
// El operador POS nunca accede: usa /api/data-entry con OPERATIONS_USE.
// Cada RPC vuelve a verificar el rol en la base.

const STORAGE_MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);

export function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function authorizeReleasedPayment(request, mode) {
  const permission = mode === "root" ? PERMISSIONS.PLATFORM_GLOBAL : PERMISSIONS.PARKINGS_READ;
  const authorization = await authorizeRemainingRequest(request, permission);
  if (authorization.response) return { response: authorization.response };
  const { context, db } = authorization;
  const isRoot = context.role === ROLES.PLATFORM_ADMIN;
  const isAdmin = context.role === ROLES.COMPANY_ADMIN;
  if (mode === "root" && !isRoot) return { response: fail("Solo ParkFacil Root puede contratar, activar o desactivar Pago liberado.", 403, { code: "RELEASED_PAYMENT_FORBIDDEN" }) };
  if (mode === "admin" && !isAdmin) return { response: fail("Solo el administrador del estacionamiento gestiona las autorizaciones de Pago liberado.", 403, { code: "RELEASED_PAYMENT_FORBIDDEN" }) };
  if (mode === "read" && !isRoot && !isAdmin) return { response: fail("No tienes acceso a Pago liberado.", 403, { code: "RELEASED_PAYMENT_FORBIDDEN" }) };
  return { context, db, isRoot, isAdmin, actor: { id: context.userId, companyId: context.companyId } };
}

// Estacionamiento Off Street dentro del alcance (Root: todos; admin: su
// empresa). Fuera de alcance = 404, sin revelar existencia.
export async function requireScopedParking(db, auth, parkingId) {
  if (!parkingId) return null;
  let query = db.from("parkings").select("id,code,name,company_id,company_name,type,status").eq("id", parkingId).eq("type", "OFF_STREET");
  if (!auth.isRoot) query = query.eq("company_id", auth.context.companyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listScopedParkings(db, auth) {
  let query = db.from("parkings").select("id,code,name,company_id,company_name,status").eq("type", "OFF_STREET").order("company_name").order("name");
  if (!auth.isRoot) query = query.eq("company_id", auth.context.companyId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Estadías liberadas abiertas por estacionamiento. En la Etapa 1 el POS aún
// no registra ingresos con beneficio (no existen las columnas de estadía
// liberada): siempre 0. La Etapa 2 la reemplaza por el conteo real.
export async function countOpenReleasedStays(_db, _parkingIds) {
  return new Map();
}

// Estado del módulo por estacionamiento (lista).
export async function loadModuleStates(db, parkingIds, now = new Date()) {
  if (!parkingIds.length) return new Map();
  const [modules, contracts, counts] = await Promise.all([
    db.from("released_payment_parking_modules").select("*").in("parking_id", parkingIds),
    db.from("released_payment_contracts").select("*").in("parking_id", parkingIds).is("superseded_at", null),
    countOpenReleasedStays(db, parkingIds),
  ]);
  if (modules.error) throw modules.error;
  if (contracts.error) throw contracts.error;
  const contractByParking = new Map((contracts.data || []).map((row) => [row.parking_id, contractFromDb(row)]));
  const result = new Map();
  for (const parkingId of parkingIds) {
    const moduleRow = (modules.data || []).find((row) => row.parking_id === parkingId);
    const moduleState = moduleFromDb(moduleRow);
    const contract = contractByParking.get(parkingId) || null;
    const status = resolveModuleStatus({ module: moduleState, contract, now });
    result.set(parkingId, { module: moduleState, contract, status, statusLabel: MODULE_STATUS_LABELS[status], openReleasedStays: counts.get(parkingId) || 0 });
  }
  return result;
}

export async function loadPlateAuthorizations(db, parkingId, plate) {
  const { data, error } = await db.from("released_payment_authorizations").select("*").eq("parking_id", parkingId).eq("license_plate", plate).eq("status", "ACTIVE");
  if (error) throw error;
  return (data || []).map(authorizationFromDb);
}

// Motivo de indisponibilidad antes de validar una autorización: módulo
// desactivado o contratación vencida (la RPC lo vuelve a comprobar).
export function authorizationUnavailable(state) {
  if (state?.status === "DISABLED") return fail("Módulo desactivado: no se pueden crear ni modificar autorizaciones.", 409, { code: "RELEASED_PAYMENT_MODULE_DISABLED" });
  if (state?.status === "EXPIRED") return fail("Contratación vencida: no se pueden crear ni modificar autorizaciones hasta registrar una extensión contractual.", 409, { code: "RELEASED_PAYMENT_CONTRACT_EXPIRED" });
  return null;
}

// Pagos recibidos de beneficiarios del estacionamiento (vigentes y anulados).
export async function loadPayments(db, parkingId) {
  const { data, error } = await db.from("released_payment_beneficiary_payments").select("*").eq("parking_id", parkingId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(paymentFromDb);
}

// Tarifas vigentes (una por unidad) y su historial, por estacionamiento.
export async function loadTariffs(db, parkingId) {
  const { data, error } = await db.from("released_payment_tariffs").select("*").eq("parking_id", parkingId).order("billing_unit").order("version", { ascending: false });
  if (error) throw error;
  const all = (data || []).map(tariffFromDb);
  return { current: all.filter((item) => !item.supersededAt), all };
}

const RPC_MESSAGES = {
  RELEASED_PAYMENT_FORBIDDEN: [403, "No tienes permiso para esta acción de Pago liberado."],
  RELEASED_PAYMENT_REASON_REQUIRED: [400, "Indica el motivo del cambio."],
  RELEASED_PAYMENT_PARKING_NOT_FOUND: [404, "No se encontró el estacionamiento Off Street."],
  RELEASED_PAYMENT_MODALITY_INVALID: [400, "Selecciona una modalidad válida."],
  RELEASED_PAYMENT_FEE_INVALID: [400, "El importe mensual no es válido (UF, máximo dos decimales; la base no puede ser menor que el importe final)."],
  RELEASED_PAYMENT_TERM_INVALID: [400, "Indica el plazo contractual (12, 24 o 36 meses) y la fecha de inicio."],
  RELEASED_PAYMENT_SPOTS_UNCHANGED: [409, "Los cupos ya tienen ese valor."],
  RELEASED_PAYMENT_SPOTS_INVALID: [400, "Los cupos simultáneos no son válidos."],
  RELEASED_PAYMENT_CONTRACT_REQUIRED: [409, "El estacionamiento no tiene contratación de Pago liberado."],
  RELEASED_PAYMENT_STATE_UNCHANGED: [409, "El módulo ya está en ese estado."],
  RELEASED_PAYMENT_CONTRACT_EXPIRED: [409, "La contratación está vencida: registra una nueva versión antes de activar o autorizar."],
  RELEASED_PAYMENT_MODULE_DISABLED: [409, "Módulo desactivado: no se pueden crear ni modificar autorizaciones."],
  RELEASED_PAYMENT_VALIDITY_INVALID: [400, "La vigencia no es válida."],
  RELEASED_PAYMENT_OUTSIDE_CONTRACT: [409, "La autorización debe quedar dentro de la vigencia contratada."],
  RELEASED_PAYMENT_AUTHORIZATION_NOT_FOUND: [404, "No se encontró la autorización."],
  RELEASED_PAYMENT_AUTHORIZATION_REVOKED: [409, "La autorización ya fue revocada."],
  RELEASED_PAYMENT_TERMS_REQUIRED: [400, "Indica la tarifa acordada y la cantidad: la vigencia sola no reemplaza la configuración del cobro."],
  RELEASED_PAYMENT_TARIFF_NOT_CURRENT: [409, "La tarifa seleccionada ya no está vigente: elige la tarifa actual."],
  RELEASED_PAYMENT_QUANTITY_INVALID: [400, "La cantidad no es válida para la unidad de la tarifa."],
  RELEASED_PAYMENT_TARIFF_UNIT_INVALID: [400, "Selecciona la unidad de la tarifa: hora, día, mes o año."],
  RELEASED_PAYMENT_TARIFF_PRICE_INVALID: [400, "El precio por unidad debe estar en pesos chilenos, sin decimales."],
  RELEASED_PAYMENT_TARIFF_UNCHANGED: [409, "La tarifa ya tiene ese valor."],
  RELEASED_PAYMENT_TARIFF_NOT_FOUND: [404, "No hay una tarifa vigente para esa unidad."],
  RELEASED_PAYMENT_AUTHORIZATION_PAID: [409, "La autorización tiene un pago registrado: para cambiar tarifa, cantidad o inicio, anula primero el pago (con motivo)."],
  RELEASED_PAYMENT_PAYMENT_INVALID: [400, "Revisa el monto y la fecha del pago."],
  RELEASED_PAYMENT_PAYMENT_METHOD_INVALID: [400, "Selecciona el medio de pago: efectivo, transferencia, tarjeta u otro."],
  RELEASED_PAYMENT_PAYMENT_DETAIL_REQUIRED: [400, "Para \"Otro\" medio de pago indica la referencia o una nota."],
  RELEASED_PAYMENT_PAYMENT_DATE_INVALID: [400, "La fecha del pago no puede ser futura."],
  RELEASED_PAYMENT_PAYMENT_DUPLICATE: [409, "La autorización ya tiene un pago registrado."],
  RELEASED_PAYMENT_PAYMENT_AMOUNT_MISMATCH: [409, "No se aceptan pagos parciales: el monto debe ser el total acordado de la autorización."],
  RELEASED_PAYMENT_PAYMENT_NOT_FOUND: [404, "No se encontró el pago."],
  RELEASED_PAYMENT_PAYMENT_ALREADY_VOIDED: [409, "El pago ya fue anulado."],
};

export function rpcErrorCode(error) {
  const text = String(error?.message || "");
  return Object.keys(RPC_MESSAGES).find((code) => text.includes(code)) || null;
}

export function rpcFailure(error, fallback) {
  if (STORAGE_MISSING.has(error?.code)) return fail("Pago liberado aún no está habilitado en la base (migración pendiente).", 503, { code: "RELEASED_PAYMENT_STORAGE_PENDING" });
  const code = rpcErrorCode(error);
  if (code) {
    const [status, message] = RPC_MESSAGES[code];
    return fail(message, status, { code });
  }
  console.error("[released-payment]", error?.code, error?.message);
  return fail(fallback, 500, { code: "RELEASED_PAYMENT_FAILED" });
}

export function storageMissing(error) {
  return STORAGE_MISSING.has(error?.code);
}
