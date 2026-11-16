import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { listObservedPlates } from "@/lib/inspector/inspectorRepository";

// Patentes observadas de la empresa del inspector (SOL-2026-11-16-003; antes
// global, Etapa 2 §14/§16): visible por
// cualquier inspector de la empresa, no solo quien las registró -- el antecedente de
// fiscalización es información operacional compartida, no privada de un
// inspector puntual.
export async function GET(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;
  try {
    const data = await listObservedPlates(authorization.db, 100, authorization.scope);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar las patentes observadas." }, { status: 503 });
  }
}
