// Alcance por empresa del Inspector (SOL-2026-11-16-003, decisión P1): un
// inspector solo ve las sesiones y fiscalizaciones de SU empresa.
//
// scope = { companyId, parkingIds, inspectorUserIds }
//   parkingIds: estacionamientos On Street de la empresa (cualquier estado,
//     para no perder historial de un estacionamiento desactivado).
//   inspectorUserIds: inspectores de la empresa (company_members
//     role='inspector'), para incluir fiscalizaciones sin estacionamiento
//     (NO_SESSION/OTHER sin contexto) hechas por alguien de la misma empresa.
//
// Fail-closed: un scope ausente o vacío nunca cae a "sin filtro". Se usa un
// id imposible para que la consulta devuelva 0 filas.

export const IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000";

function cleanIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function buildInspectorCompanyScope({ companyId, parkingIds, inspectorUserIds }) {
  return {
    companyId: companyId ? String(companyId) : null,
    parkingIds: cleanIds(parkingIds),
    inspectorUserIds: cleanIds(inspectorUserIds),
  };
}

export function scopeParkingIds(scope) {
  const ids = cleanIds(scope?.parkingIds);
  return scope?.companyId && ids.length ? ids : [IMPOSSIBLE_ID];
}

function quoteList(ids) {
  return ids.map((id) => `"${id.replaceAll('"', "")}"`).join(",");
}

// Filtro PostgREST .or(...) para on_street_inspections: del estacionamiento
// de la empresa, o hecha por un inspector de la empresa.
export function inspectionScopeOrFilter(scope) {
  const parkingIds = scopeParkingIds(scope);
  const inspectorIds = scope?.companyId && cleanIds(scope?.inspectorUserIds).length ? cleanIds(scope.inspectorUserIds) : [IMPOSSIBLE_ID];
  return `parking_id.in.(${quoteList(parkingIds)}),inspector_user_id.in.(${quoteList(inspectorIds)})`;
}

export function parkingInScope(scope, parkingId) {
  if (!scope?.companyId || !parkingId) return false;
  return cleanIds(scope.parkingIds).includes(String(parkingId));
}

export function inspectionRowInScope(scope, row) {
  if (!scope?.companyId || !row) return false;
  return parkingInScope(scope, row.parking_id) || cleanIds(scope.inspectorUserIds).includes(String(row.inspector_user_id || ""));
}
