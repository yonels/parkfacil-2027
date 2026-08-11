import {NextResponse} from "next/server";
import {authorizeRemainingRequest} from "@/lib/auth/remainingAuthorization";
import {PERMISSIONS} from "@/lib/auth/permissions.mjs";
import {BillingService,BillingServiceError} from "@/lib/billing/BillingService.mjs";
import {BillingDocumentRepository} from "@/lib/billing/billingDocumentRepository";
import {MockBillingProviderAdapter} from "@/lib/billing/providers/MockBillingProviderAdapter.mjs";
import {UfRateService} from "@/lib/billing/ufRateService";

export async function POST(request,{params}){const auth=await authorizeRemainingRequest(request,PERMISSIONS.BILLING_ISSUE);if(auth.response)return auth.response;try{const{id}=await params,body=await request.json(),invoiceDate=String(body.invoiceDate||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate))return NextResponse.json({error:"La fecha de emisión no es válida.",code:"INVOICE_DATE_INVALID"},{status:422});const idempotencyKey=String(request.headers.get("idempotency-key")||"");if(idempotencyKey.length<8)return NextResponse.json({error:"Falta clave de idempotencia.",code:"IDEMPOTENCY_KEY_REQUIRED"},{status:422});const service=new BillingService({repository:new BillingDocumentRepository(auth.db),provider:new MockBillingProviderAdapter(),ufRateService:new UfRateService()});const data=await service.issueInvoice({preinvoiceId:id,invoiceDate,idempotencyKey,actorId:auth.context.userId});return NextResponse.json({data},{status:201});}catch(error){return NextResponse.json({error:error.message||"No fue posible emitir con el proveedor Mock.",code:error.code||"BILLING_ISSUE_FAILED",retryable:Boolean(error.retryable)},{status:error instanceof BillingServiceError?422:500});}}
