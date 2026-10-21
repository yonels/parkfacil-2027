import "server-only";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission, requireProduct } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { PERMISSIONS, PRODUCTS, ROLES } from "@/lib/auth/permissions.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export async function authorizeOnStreetAdminRequest(request) {
  const authorization=await authorizeApiRequest(request);
  if(authorization.response)return authorization;
  try {
    requirePermission(authorization.context,PERMISSIONS.ON_STREET_QR_READ);
    if(authorization.context.role!==ROLES.PLATFORM_ADMIN&&authorization.context.role!==ROLES.COMPANY_ADMIN)throw new AuthorizationError("ON_STREET_QR_FORBIDDEN",403,"No tienes permiso para acceder a On Street QR.",authorization.context);
    // Una empresa sin On Street habilitado no puede leer datos On Street ni
    // manipulando la URL/API directamente -- no basta con ocultarlo en el
    // Sidebar (ver §7/§28 de la auditoría de acceso por producto).
    requireProduct(authorization.context,PRODUCTS.ON_STREET);
    return {context:authorization.context,db:getSupabaseAdminClient(),response:null};
  } catch(error) {
    if(error instanceof AuthorizationError)return {...authorization,response:authorizationErrorResponse(request,error,authorization.context)};
    throw error;
  }
}

// Igual que arriba, pero exige ON_STREET_QR_MANAGE: crear ubicaciones QR y
// editar nombre/estado. Un company_admin solo administra ubicaciones de su
// propia empresa (se valida en el repositorio, nunca confiando en IDs que
// llegan del cliente).
export async function authorizeOnStreetAdminManageRequest(request) {
  const authorization=await authorizeApiRequest(request);
  if(authorization.response)return authorization;
  try {
    requirePermission(authorization.context,PERMISSIONS.ON_STREET_QR_MANAGE);
    if(authorization.context.role!==ROLES.PLATFORM_ADMIN&&authorization.context.role!==ROLES.COMPANY_ADMIN)throw new AuthorizationError("ON_STREET_QR_FORBIDDEN",403,"No tienes permiso para administrar On Street QR.",authorization.context);
    requireProduct(authorization.context,PRODUCTS.ON_STREET);
    return {context:authorization.context,db:getSupabaseAdminClient(),response:null};
  } catch(error) {
    if(error instanceof AuthorizationError)return {...authorization,response:authorizationErrorResponse(request,error,authorization.context)};
    throw error;
  }
}
