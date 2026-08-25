import "server-only";
import { decryptPaymentToken, encryptPaymentToken, hashPaymentToken } from "./paymentTokenCrypto.mjs";
import { webpayPaymentType } from "./webpayCore.mjs";

function fail(error) { if (error) throw error; }

export async function createPaymentTransaction(db, { intentToken, idempotencyKey, buyOrder, providerSessionId }) {
  const result = await db.rpc("create_on_street_payment_transaction", { p_intent_token:intentToken, p_idempotency_key:idempotencyKey, p_buy_order:buyOrder, p_provider_session_id:providerSessionId });
  fail(result.error);
  return { transactionId:result.data.transactionId, reused:Boolean(result.data.reused) };
}

export async function getPaymentTransaction(db, id) {
  const result = await db.from("payment_transactions").select("*").eq("id",id).maybeSingle(); fail(result.error); return result.data;
}

export async function getPaymentTransactionByToken(db, token) {
  const result = await db.from("payment_transactions").select("*").eq("token_ws_hash",hashPaymentToken(token)).maybeSingle(); fail(result.error); return result.data;
}

export async function abortPaymentTransactionByBuyOrder(db,buyOrder){const found=await db.from("payment_transactions").select("id,source_id,status").eq("buy_order",buyOrder).maybeSingle();fail(found.error);if(!found.data)return null;if(found.data.status!=="COMMITTED"){await markTransactionFailed(db,found.data.id,{status:"ABORTED",providerStatus:"ABORTED"});}return found.data;}

export async function markTransactionRedirected(db, id, { token, url }) {
  const result = await db.from("payment_transactions").update({ status:"REDIRECTED",token_ws_hash:hashPaymentToken(token),token_ws_encrypted:encryptPaymentToken(token),gateway_url:String(url),redirected_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq("id",id).eq("status","CREATED").select("*").single(); fail(result.error); return result.data;
}

export async function claimTransactionCommit(db, token) {
  const result=await db.rpc("claim_on_street_webpay_commit",{p_token_hash:hashPaymentToken(token)});fail(result.error);return result.data;
}

export async function markTransactionFailed(db,id,{status="FAILED",providerStatus=null,responseCode=null,response=null}={}) {
  const result=await db.from("payment_transactions").update({status,provider_status:providerStatus,response_code:responseCode,sanitized_provider_response:response,failed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).neq("status","COMMITTED");fail(result.error);
  const transaction=await getPaymentTransaction(db,id);
  if(transaction)await db.from("on_street_payment_intents").update({status:"PAYMENT_FAILED",updated_at:new Date().toISOString()}).eq("id",transaction.source_id).neq("status","PAID");
}

export async function finalizeAuthorizedPayment(db,id,response) {
  const paymentType=webpayPaymentType(response.paymentTypeCode);
  if(!paymentType)throw Object.assign(new Error("WEBPAY_PAYMENT_TYPE_UNSUPPORTED"),{code:"WEBPAY_PAYMENT_TYPE_UNSUPPORTED"});
  const result=await db.rpc("finalize_authorized_on_street_payment",{p_transaction_id:id,p_provider_status:response.status,p_authorization_code:response.authorizationCode||"",p_response_code:response.responseCode,p_provider_response:response,p_payment_type:paymentType,p_provider_payment_type_code:response.paymentTypeCode});fail(result.error);return result.data;
}

export function storedProviderToken(transaction){return decryptPaymentToken(transaction.token_ws_encrypted);}
