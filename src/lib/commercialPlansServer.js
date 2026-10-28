import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { mapPlan } from "@/lib/commercialPlanInput.mjs";

export async function getCommercialPlanPageData(id) {
  const { data, error } = await getSupabaseAdminClient().from("commercial_plans").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapPlan(data);
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
