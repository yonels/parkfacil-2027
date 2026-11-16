import { functionLabel, resolveDisplayStatus, DISPLAY_STATUS_LABELS } from "./auth/memberActivationCore.mjs";

export function mapAuthorizedUsers({ members, authUsers, companies, parkings, access, now = new Date() }) {
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const activatorIds = [...new Set(members.flatMap((member) => [member.activated_by, member.suspended_by]).filter(Boolean))];
  const activatorById = new Map(activatorIds.map((id) => [id, authById.get(id)]));
  return members.map((member) => {
    const authUser = authById.get(member.user_id);
    const company = companies.find((item) => item.id === member.company_id);
    const parkingIds = access.filter((item) => item.user_id === member.user_id).map((item) => item.parking_id);
    const userParkings = parkings.filter((parking) => parkingIds.includes(parking.id));
    const displayStatus = resolveDisplayStatus({ status: member.status, accessExpiresAt: member.access_expires_at, now });
    const actorId = member.status === "suspended" ? member.suspended_by : member.activated_by;
    const actor = actorId ? activatorById.get(actorId) : null;
    return {
      id: member.user_id,
      nombreCompleto: member.full_name,
      cargo: member.role === "company_admin" ? "Administrador de empresa" : "Operador POS",
      // Etiqueta amigable de "Función" (FASE 7/8 del modelo de usuarios por
      // empresa): Administrador / Operador Off Street / Inspector On Street
      // -- aunque estos dos últimos sigan siendo role=operator en BD.
      funcion: functionLabel({ role: member.role, productScope: member.product_scope }),
      productoAlcance: member.product_scope || null,
      usuarioAcceso: authUser?.email || "",
      // Alias temporal para consumidores no migrados; representa login, no
      // correo de recuperación.
      correo: authUser?.email || "",
      recoveryEmail: member.recovery_email || null,
      telefono: authUser?.user_metadata?.phone || "Sin teléfono informado",
      empresaId: member.company_id,
      perfilPrincipal: member.role,
      perfilesSecundarios: [],
      estado: member.status === "active" ? "active" : member.status === "invited" ? "pending" : "inactive",
      // Estado calculado (incluye "expired") para UI -- ver FASE 5: nunca
      // se agrega un status="expired" real en BD, es puramente derivado.
      estadoDetallado: displayStatus,
      estadoDetalladoLabel: DISPLAY_STATUS_LABELS[displayStatus] || displayStatus,
      accessExpiresAt: member.access_expires_at || null,
      activatedAt: member.activated_at || null,
      activatedBy: member.status === "suspended" ? null : actor ? { id: actor.id, email: actor.email } : null,
      suspendedAt: member.suspended_at || null,
      suspendedBy: member.status === "suspended" && actor ? { id: actor.id, email: actor.email } : null,
      debeCambiarClave: Boolean(member.must_change_password),
      estacionamientos: parkingIds,
      ultimoAcceso: authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleString("es-CL") : "Sin acceso registrado",
      fechaCreacion: authUser?.created_at ? new Date(authUser.created_at).toLocaleString("es-CL") : "Sin fecha informada",
      searchValues: [company?.trade_name, company?.business_name, company ? `${company.rut_number}-${company.rut_dv}` : "", ...userParkings.flatMap((parking) => [parking.code, parking.name])].filter(Boolean),
    };
  });
}
