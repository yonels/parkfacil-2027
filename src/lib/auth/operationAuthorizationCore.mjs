import { AuthorizationError } from "./contextCore.mjs";
import { ROLES } from "./permissions.mjs";

export function requireOperationRow(context, row, label = "recurso operacional") {
  if (!row) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, `No se encontro el ${label} solicitado.`, context);
  return row;
}

export function requireOwnShift(context, shift) {
  requireOperationRow(context, shift, "turno");
  if (context.role === ROLES.OPERATOR && shift.operator_id !== context.userId) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro el turno solicitado.", context);
  }
  return shift;
}
