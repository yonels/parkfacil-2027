import "server-only";
import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import {
  dteAuditAction,
  dteAuditChanges,
  dteEncryptionConfigured,
  dteRootStatusView,
  dteSettingsView,
  DTE_STORAGE_MISSING_CODES,
  DteSettingsError,
  apiKeyLast4,
  encryptDteApiKey,
  validateDteSettingsInput,
} from "./dteSettingsCore.mjs";

// Boleta electrónica (SOL-2026-10-20-001). Decisión del usuario: la API Key la
// ingresa el administrador de la empresa; Root solo ve el estado. El operador
// no accede. La API Key nunca sale del servidor (ni cifrada).

const SETTINGS_COLUMNS = "company_id,provider,environment,api_key_ciphertext,api_key_last4,enabled_parking_ids,updated_by_email,updated_at";

export function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function authorizeDteRequest(request) {
  const authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
  if (authorization.response) return { response: authorization.response };
  const { role } = authorization.context;
  if (role !== ROLES.PLATFORM_ADMIN && role !== ROLES.COMPANY_ADMIN) {
    return { response: fail("Solo el administrador de la empresa puede configurar la boleta electrónica.", 403, { code: "DTE_FORBIDDEN" }) };
  }
  return { authorization, isRoot: role === ROLES.PLATFORM_ADMIN };
}

export function dteFailure(request, context, error, fallback) {
  const denied = operationAuthorizationError(request, context, error);
  if (denied) return denied;
  if (error instanceof DteSettingsError) return fail(error.message, error.status, { code: error.code, details: error.details || undefined });
  if (DTE_STORAGE_MISSING_CODES.has(error?.code)) return fail("La boleta electrónica aún no está instalada en la base de datos de este ambiente.", 503, { code: "DTE_STORAGE_MISSING" });
  console.error("[boleta-electronica]", { code: error?.code, message: error?.message });
  return fail(fallback, 503);
}

async function companyOffStreetParkings(db, scope) {
  return (await listParkings(db, scope)).filter((parking) => parking.type === "OFF_STREET");
}

async function loadSettingsRow(db, companyId) {
  const { data, error } = await db.from("company_dte_settings").select(SETTINGS_COLUMNS).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadCompanyDteSettings({ db, scope, context }) {
  const [row, parkings] = await Promise.all([loadSettingsRow(db, context.companyId), companyOffStreetParkings(db, scope)]);
  return { ...dteSettingsView(row, parkings), encryptionReady: dteEncryptionConfigured() };
}

// Root: estado por empresa cliente con Off Street (sin API Key).
export async function loadRootDteStatus(db, { companyId = null } = {}) {
  let companiesQuery = db.from("companies").select("id,business_name,trade_name,enabled_products").eq("relationship_type", "client").eq("status", "active").order("trade_name");
  if (companyId) companiesQuery = companiesQuery.eq("id", companyId);
  const [companies, settings] = await Promise.all([
    companiesQuery,
    db.from("company_dte_settings").select("company_id,provider,environment,api_key_ciphertext,enabled_parking_ids,updated_at"),
  ]);
  if (companies.error) throw companies.error;
  if (settings.error) throw settings.error;
  const byCompany = new Map((settings.data || []).map((row) => [row.company_id, row]));
  return (companies.data || [])
    .filter((company) => Array.isArray(company.enabled_products) && company.enabled_products.includes("OFF_STREET"))
    .map((company) => dteRootStatusView(company, byCompany.get(company.id) || null));
}

export async function saveCompanyDteSettings({ db, scope, context }, input) {
  const companyId = context.companyId;
  const [previous, parkings] = await Promise.all([loadSettingsRow(db, companyId), companyOffStreetParkings(db, scope)]);
  const next = validateDteSettingsInput(input, { allowedParkingIds: parkings.map((parking) => parking.id), hasStoredKey: Boolean(previous?.api_key_ciphertext) });

  const now = new Date().toISOString();
  const values = {
    company_id: companyId,
    provider: "HAULMER",
    environment: next.environment,
    enabled_parking_ids: next.parkingIds,
    updated_by: context.userId,
    updated_by_email: context.email || null,
    updated_at: now,
  };
  if (next.apiKeyAction === "SET") {
    values.api_key_ciphertext = encryptDteApiKey(next.apiKey);
    values.api_key_last4 = apiKeyLast4(next.apiKey);
  } else if (next.apiKeyAction === "REMOVE") {
    values.api_key_ciphertext = null;
    values.api_key_last4 = null;
  }

  const saved = await db.from("company_dte_settings").upsert(values, { onConflict: "company_id" }).select(SETTINGS_COLUMNS).single();
  if (saved.error) throw saved.error;

  const audit = await db.from("company_dte_settings_audit").insert({
    company_id: companyId,
    action: dteAuditAction(previous, next),
    changes: dteAuditChanges(previous, next),
    actor_id: context.userId,
    actor_email: context.email || null,
  });
  if (audit.error) console.error("[boleta-electronica:audit]", { code: audit.error.code, message: audit.error.message });

  return { ...dteSettingsView(saved.data, parkings), encryptionReady: dteEncryptionConfigured() };
}
