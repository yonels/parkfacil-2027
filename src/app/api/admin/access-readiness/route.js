import { NextResponse } from 'next/server';
import { authorizeApiRequest, authorizationErrorResponse } from '@/lib/auth/apiAuthorization';
import { requirePlatformAdmin } from '@/lib/auth/apiAuthorizationCore.mjs';
import { recoveryReadiness } from '@/lib/passwordRecoveryReadiness.mjs';
export async function GET(request) {
 const auth = await authorizeApiRequest(request);
 if(auth.response) return auth.response;
 try { requirePlatformAdmin(auth.context); } catch(error) { return authorizationErrorResponse(request,error,auth.context); }
 const result = recoveryReadiness();
 return NextResponse.json({data:{...result,scope:'configuration',deliveryVerified:false}},{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}});
}
