import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });

  const db = getSupabaseAdminClient();
  const [membersResult, accessResult, companiesResult, parkingsResult, authResult] = await Promise.all([
    db.from("company_members").select("*").order("full_name"),
    db.from("company_member_parkings").select("user_id,parking_id,access_level"),
    db.from("companies").select("id,business_name,trade_name,rut_number,rut_dv"),
    db.from("parkings").select("id,code,name,company_id"),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const error = membersResult.error || accessResult.error || companiesResult.error || parkingsResult.error || authResult.error;
  if (error) {
    console.error("[users:list]", error);
    return NextResponse.json({ error: "No fue posible obtener los usuarios.", code: "USERS_READ_FAILED" }, { status: 500 });
  }

  let members = membersResult.data || [];
  if (!actor.isPlatformAdmin) {
    const actorCompanyId = actor.companyId;
    members = actorCompanyId ? members.filter((member) => member.company_id === actorCompanyId) : members.filter((member) => member.user_id === actor.id);
  }

  const authUsers = new Map((authResult.data.users || []).map((user) => [user.id, user]));
  const companies = companiesResult.data || [];
  const parkings = parkingsResult.data || [];
  const data = members.map((member) => {
    const authUser = authUsers.get(member.user_id);
    const company = companies.find((item) => item.id === member.company_id);
    const parkingIds = (accessResult.data || []).filter((item) => item.user_id === member.user_id).map((item) => item.parking_id);
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
      searchValues: [
        company?.trade_name,
        company?.business_name,
        company ? `${company.rut_number}-${company.rut_dv}` : "",
        ...userParkings.flatMap((parking) => [parking.code, parking.name]),
      ].filter(Boolean),
    };
  });

  return NextResponse.json({
    data,
    companies: companies.map((company) => ({ id: company.id, nombreFantasia: company.trade_name, razonSocial: company.business_name })),
    parkings: parkings.map((parking) => ({ id: parking.id, codigo: parking.code, nombre: parking.name, empresaId: parking.company_id })),
    canManageCredentials: actor.isPlatformAdmin,
    persistent: true,
  });
}
