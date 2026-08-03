import { NextResponse } from "next/server";

export function operationalError(error, fallback = "No fue posible completar la operación.") {
  console.error("[parking:operations]", error);
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)) return NextResponse.json({ error: "La estructura operacional pendiente aún no está creada en Supabase.", code: "OPERATIONAL_SCHEMA_NOT_FOUND" }, { status: 503 });
  if (error?.code === "23505") return NextResponse.json({ error: "Ya existe un registro con esos datos.", code: "DUPLICATE_RECORD" }, { status: 409 });
  if (error?.code === "23514") return NextResponse.json({ error: "Los valores no cumplen las reglas operacionales.", code: "CONSTRAINT_ERROR" }, { status: 400 });
  return NextResponse.json({ error: fallback, code: "OPERATION_FAILED" }, { status: 500 });
}

export const validationError = (details) => NextResponse.json({ error: "Revisa los campos indicados.", code: "VALIDATION_ERROR", details }, { status: 400 });
