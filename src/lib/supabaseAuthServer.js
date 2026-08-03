import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
export async function authenticateRequest(request){
  const header=request.headers.get("authorization")||"";const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!token)return null;
  const {data,error}=await getSupabaseAdminClient().auth.getUser(token);
  if(error||!data?.user)return null;
  const role=data.user.app_metadata?.role;
  return {id:data.user.id,name:data.user.user_metadata?.full_name||data.user.email||data.user.id,email:data.user.email||"",role:role||"authenticated",companyId:data.user.app_metadata?.company_id||null,parkingId:data.user.app_metadata?.parking_id||null,accessScope:data.user.app_metadata?.access_scope||null,isPlatformAdmin:role==="platform_admin",isAdmin:["admin","platform_admin","organization_admin","company_admin"].includes(role),isSupervisor:role==="supervisor"};
}
