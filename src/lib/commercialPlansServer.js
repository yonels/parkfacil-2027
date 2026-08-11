import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export async function getCommercialPlanPageData(id) {
  const { data, error } = await getSupabaseAdminClient().from("commercial_plans").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, codigo: data.code, nombre: data.name, descripcion: data.description, estado: data.status, tipo: data.type, moneda: data.currency, modalidadCobro: data.billing_mode, monthlyFee: Number(data.monthly_fee), annualFee: Number(data.annual_fee), implementationFee: Number(data.implementation_fee), transactionFee: Number(data.transaction_fee), deviceFee: Number(data.device_fee), parkingFee: Number(data.parking_fee), supportFee: Number(data.support_fee), discountPercentage: Number(data.discount_percentage), minimumMonthlyCharge: Number(data.minimum_monthly_charge), estacionamientosIncluidos: data.included_parkings, dispositivosIncluidos: data.included_devices, usuariosIncluidos: data.included_users, modulos: data.modules || [], equipamiento: data.equipment || [], limites: [], soporte: [], implementacion: [], capacitacion: [], reportes: [], integraciones: [], condiciones: [], vigencia: "Sin vigencia definida", fechaCreacion: data.created_at?.slice(0,10), contractIds: [], observaciones: data.notes || data.description };
}

export async function getCommercialPlanAssignments(idOrCode){
  const db=getSupabaseAdminClient(),field=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(idOrCode))?"id":"code",plan=await db.from("commercial_plans").select("id,code,name,status").eq(field,idOrCode).maybeSingle();
  if(plan.error||!plan.data)return[];
  const versions=await db.from("commercial_plan_versions").select("id,version,status,valid_from,valid_to").eq("commercial_plan_id",plan.data.id);if(versions.error)return[];
  const versionIds=(versions.data||[]).map(x=>x.id);if(!versionIds.length)return[];
  const contracts=await db.from("company_contracts").select("id,company_id,contract_number,status,starts_on,ends_on,commercial_plan_version_id,companies(id,business_name,trade_name),contract_parking_spaces(parking_id,parkings(id,code,name,status))").in("commercial_plan_version_id",versionIds);
  if(contracts.error)return[];const byVersion=new Map((versions.data||[]).map(x=>[x.id,x]));
  return(contracts.data||[]).flatMap(c=>{const v=byVersion.get(c.commercial_plan_version_id),spaces=c.contract_parking_spaces||[];return spaces.length?spaces.map(s=>({company:c.companies,contractId:c.id,contractNumber:c.contract_number,contractStatus:c.status,startsOn:c.starts_on,endsOn:c.ends_on,version:v,parking:s.parkings})): [{company:c.companies,contractId:c.id,contractNumber:c.contract_number,contractStatus:c.status,startsOn:c.starts_on,endsOn:c.ends_on,version:v,parking:null}]});
}
