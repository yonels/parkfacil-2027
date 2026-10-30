import "server-only";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";
import { buildCompanySetup, sortCompanySetups } from "./companySetupCore.mjs";

// «Configurar empresa», fase 1 (SOL-2026-10-29-014): diagnóstico de solo
// lectura de todas las cuentas. El estado de cada estacionamiento Off Street
// sale del mismo configurador que usa la ficha del estacionamiento
// (getConfigurator), para que ambas vistas digan lo mismo.
export async function loadCompanySetupOverview(db) {
  const [companiesResult, membersResult, parkings] = await Promise.all([
    db.from("companies").select("id,business_name,trade_name,rut_number,rut_dv,email").order("business_name"),
    db.from("company_members").select("user_id,company_id,role,status"),
    listParkings(db),
  ]);
  if (companiesResult.error) throw companiesResult.error;
  if (membersResult.error) throw membersResult.error;
  const members = membersResult.data || [];
  const userIds = members.map((member) => member.user_id);
  let memberParkings = [];
  if (userIds.length) {
    const access = await db.from("company_member_parkings").select("user_id,parking_id").in("user_id", userIds);
    if (access.error) throw access.error;
    memberParkings = access.data || [];
  }
  const withConfigurator = await Promise.all(parkings.map(async (parking) => ({
    parking,
    configurator: parking.type === "OFF_STREET" ? await getConfigurator(db, parking.id, { parking }) : null,
  })));
  const companies = (companiesResult.data || []).map((company) => buildCompanySetup({
    company,
    parkings: withConfigurator.filter((item) => item.parking.companyId === company.id),
    members,
    memberParkings,
  }));
  return sortCompanySetups(companies);
}
