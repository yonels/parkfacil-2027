import { NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { authorizationErrorResponse } from "@/lib/auth/apiAuthorization";

export function operationalError(error, fallback = "No fue posible completar la operación.", request = null) {
  if (error instanceof AuthorizationError && request) return authorizationErrorResponse(request, error, error.auditContext);
  console.error("[parking:operations]", { code: error?.code || "UNKNOWN", message: error?.message || fallback });
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)) return NextResponse.json({ error: "La estructura operacional pendiente aún no está creada en Supabase.", code: "OPERATIONAL_SCHEMA_NOT_FOUND" }, { status: 503 });
  if (error?.code === "23505") return NextResponse.json({ error: "Ya existe un registro con esos datos.", code: "DUPLICATE_RECORD" }, { status: 409 });
  if (error?.code === "23514") return NextResponse.json({ error: "Los valores no cumplen las reglas operacionales.", code: "CONSTRAINT_ERROR" }, { status: 400 });
  return NextResponse.json({ error: fallback, code: "OPERATION_FAILED" }, { status: 500 });
}

export const validationError = (details) => NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details }, { status: 400 });
