import { NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { authorizationErrorResponse } from "@/lib/auth/apiAuthorization";

// Reglas de base de datos con un mensaje propio (SOL-2026-10-29-016): antes todas
// caían en el genérico «Los valores no cumplen las reglas operacionales».
const CONSTRAINT_MESSAGES = {
  ACTIVE_RATE_VALIDITY_OVERLAP: "Ya hay otra tarifa activa en ese período para este estacionamiento: solo puede haber una a la vez. Para cobrar distinto según la hora usa «Precio por franja horaria» en una sola tarifa, crea una «Nueva versión» de la vigente o guarda esta como Borrador.",
  RATE_FIRST_BLOCK_REQUIRED: "Configura el tramo inicial de la tarifa.",
};

export function operationalError(error, fallback = "No fue posible completar la operación.", request = null) {
  if (error instanceof AuthorizationError && request) return authorizationErrorResponse(request, error, error.auditContext);
  console.error("[parking:operations]", { code: error?.code || "UNKNOWN", message: error?.message || fallback });
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)) return NextResponse.json({ error: "La estructura operacional pendiente aún no está creada en Supabase.", code: "OPERATIONAL_SCHEMA_NOT_FOUND" }, { status: 503 });
  if (error?.code === "23505") return NextResponse.json({ error: "Ya existe un registro con esos datos.", code: "DUPLICATE_RECORD" }, { status: 409 });
  if (error?.code === "23503") return NextResponse.json({ error: "El registro tiene actividad o relaciones asociadas y debe conservarse para mantener su trazabilidad.", code: "RELATED_ACTIVITY_EXISTS" }, { status: 409 });
  if (error?.code === "23514") {
    const rule = Object.keys(CONSTRAINT_MESSAGES).find((key) => String(error?.message || "").includes(key));
    if (rule) return NextResponse.json({ error: CONSTRAINT_MESSAGES[rule], code: rule }, { status: 409 });
    return NextResponse.json({ error: "Los valores no cumplen las reglas operacionales.", code: "CONSTRAINT_ERROR" }, { status: 400 });
  }
  return NextResponse.json({ error: fallback, code: "OPERATION_FAILED" }, { status: 500 });
}

export const validationError = (details) => NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details }, { status: 400 });
