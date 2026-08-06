export function mapAuthorizedUsers({ members, authUsers, companies, parkings, access }) {
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  return members.map((member) => {
    const authUser = authById.get(member.user_id);
    const company = companies.find((item) => item.id === member.company_id);
    const parkingIds = access.filter((item) => item.user_id === member.user_id).map((item) => item.parking_id);
    const userParkings = parkings.filter((parking) => parkingIds.includes(parking.id));
    return {
      id: member.user_id,
      nombreCompleto: member.full_name,
      cargo: member.role === "company_admin" ? "Administrador de empresa" : "Operador POS",
      correo: authUser?.email || "",
      telefono: authUser?.user_metadata?.phone || "Sin teléfono informado",
      empresaId: member.company_id,
      perfilPrincipal: member.role,
      perfilesSecundarios: [],
      estado: member.status === "active" ? "active" : member.status === "invited" ? "pending" : "inactive",
      debeCambiarClave: Boolean(member.must_change_password),
      estacionamientos: parkingIds,
      ultimoAcceso: authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleString("es-CL") : "Sin acceso registrado",
      searchValues: [company?.trade_name, company?.business_name, company ? `${company.rut_number}-${company.rut_dv}` : "", ...userParkings.flatMap((parking) => [parking.code, parking.name])].filter(Boolean),
    };
  });
}
