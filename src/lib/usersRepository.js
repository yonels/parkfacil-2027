import "server-only";
import { companyScope } from "@/lib/auth/apiAuthorizationCore.mjs";
import { mapAuthorizedUsers } from "@/lib/usersRepositoryCore.mjs";

async function authUsersForMembers(db, members, global) {
  if (global) {
    const result = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (result.error) throw result.error;
    return result.data.users || [];
  }
  const results = await Promise.all(members.map((member) => db.auth.admin.getUserById(member.user_id)));
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  return results.map((result) => result.data?.user).filter(Boolean);
}

export async function listAuthorizedUsers(db, context) {
  const scope = companyScope(context);
  let membersQuery = db.from("company_members").select("*").order("full_name");
  let companiesQuery = db.from("companies").select("id,business_name,trade_name,rut_number,rut_dv");
  let parkingsQuery = db.from("parkings").select("id,code,name,company_id");
  if (scope) {
    membersQuery = membersQuery.eq("company_id", scope);
    companiesQuery = companiesQuery.eq("id", scope);
    parkingsQuery = parkingsQuery.eq("company_id", scope);
  }
  const [membersResult, companiesResult, parkingsResult] = await Promise.all([membersQuery, companiesQuery, parkingsQuery]);
  const baseError = membersResult.error || companiesResult.error || parkingsResult.error;
  if (baseError) throw baseError;
  const members = membersResult.data || [];
  const memberIds = members.map((member) => member.user_id);
  let accessResult = { data: [], error: null };
  if (memberIds.length) {
    accessResult = await db.from("company_member_parkings").select("user_id,parking_id,access_level").in("user_id", memberIds);
  }
  if (accessResult.error) throw accessResult.error;
  const authUsers = await authUsersForMembers(db, members, !scope);
  const companies = companiesResult.data || [];
  const parkings = parkingsResult.data || [];
  const access = accessResult.data || [];
  return {
    data: mapAuthorizedUsers({ members, authUsers, companies, parkings, access }),
    companies: companies.map((company) => ({ id: company.id, nombreFantasia: company.trade_name, razonSocial: company.business_name })),
    parkings: parkings.map((parking) => ({ id: parking.id, codigo: parking.code, nombre: parking.name, empresaId: parking.company_id })),
  };
}
