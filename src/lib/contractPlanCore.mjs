// Planes por contrato (SOL-2026-10-28-002): reglas puras de la API de
// asignación (validación de fechas y traducción de errores de las funciones
// SQL contract_assign_plan / contract_unassign_plan).
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (valor) => UUID.test(String(valor || ""));

export function fechaValida(valor) {
  const texto = String(valor || "");
  if (!FECHA.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

export function validarAccionPlan(body) {
  const accion = String(body?.accion || "");
  const motivo = String(body?.reason || "").trim().slice(0, 500);
  if (accion === "asignar") {
    if (!esUuid(body?.planId)) return { ok: false, error: "Selecciona un plan." };
    if (!fechaValida(body?.validFrom)) return { ok: false, error: "Indica la fecha desde la que rige el plan." };
    return { ok: true, accion, planId: body.planId, fecha: body.validFrom, motivo };
  }
  if (accion === "quitar") {
    if (!fechaValida(body?.validTo)) return { ok: false, error: "Indica la fecha de término del plan." };
    return { ok: true, accion, fecha: body.validTo, motivo };
  }
  return { ok: false, error: "Acción no válida." };
}

const ERRORES = {
  PLAN_NO_ACTIVO: [400, "Solo se pueden asignar planes en estado Activo."],
  PLAN_INEXISTENTE: [404, "Plan no encontrado."],
  CONTRATO_INEXISTENTE: [404, "Contrato no encontrado."],
  CONTRATO_CERRADO: [409, "El contrato está vencido, terminado o cancelado: no se le puede asignar un plan."],
  MONEDA_DISTINTA: [400, "La moneda del plan no coincide con la del contrato."],
  MISMO_PLAN: [409, "El contrato ya tiene este plan con los mismos valores."],
  FECHA_ANTERIOR_AL_PLAN_VIGENTE: [400, "La fecha debe ser posterior al inicio del plan vigente."],
  SIN_PLAN_VIGENTE: [409, "El contrato no tiene un plan vigente."],
};

export function traducirErrorPlan(error) {
  const mensaje = String(error?.message || "");
  const codigo = Object.keys(ERRORES).find((clave) => mensaje === clave);
  if (codigo) return { status: ERRORES[codigo][0], error: ERRORES[codigo][1], codigo };
  if (error?.code === "23505") return { status: 409, error: "Otra persona cambió el plan de este contrato al mismo tiempo. Recarga la página.", codigo: "CONFLICTO" };
  return { status: 500, error: "No fue posible actualizar el plan del contrato.", codigo: "ERROR" };
}
