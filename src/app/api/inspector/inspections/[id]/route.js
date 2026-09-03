import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { getInspectorInspectionById } from "@/lib/inspector/inspectorRepository";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";
import { inspectorCopySmsFromPersistedStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";

// Detalle de UNA fiscalización YA registrada (2026-09-03, "abrir detalle
// desde la lista de Fiscalizaciones"): SOLO LECTURA -- un simple SELECT
// (ver getInspectorInspectionById), nunca INSERT/UPDATE, nunca vuelve a
// llamar register_on_street_inspection ni reenvía ningún SMS. Reconstruye la
// misma forma que ya consume InspectorFiscalizacion.js justo después de
// registrar (id/plate/inspectedAt/smsRequired/smsStatus/inspectorCopySms)
// para reabrir exactamente la misma pantalla de resultado, sin duplicarla.
export async function GET(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Fiscalización no válida." }, { status: 400 });

  try {
    const row = await getInspectorInspectionById(id, authorization.context.userId, authorization.db);
    if (!row) return NextResponse.json({ error: "Fiscalización no encontrada." }, { status: 404 });

    return NextResponse.json({
      data: {
        id: row.id,
        plate: row.license_plate_normalized,
        motivo: inspectionMotivoLabel(row),
        inspectedAt: row.inspected_at,
        smsRequired: Boolean(row.sms_required),
        smsStatus: row.sms_status,
        inspectorCopySms: inspectorCopySmsFromPersistedStatus(row.inspector_copy_sms_status),
      },
    });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar la fiscalización." }, { status: 503 });
  }
}
