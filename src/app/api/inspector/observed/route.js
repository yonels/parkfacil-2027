import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { listObservedPlates } from "@/lib/inspector/inspectorRepository";

// Listado global de patentes observadas (Etapa 2, §14/§16): visible por
// cualquier Inspector, no solo quien las registró -- el antecedente de
// fiscalización es información operacional compartida, no privada de un
// inspector puntual.
export async function GET(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;
  try {
    const data = await listObservedPlates(authorization.db);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar las patentes observadas." }, { status: 503 });
  }
}
