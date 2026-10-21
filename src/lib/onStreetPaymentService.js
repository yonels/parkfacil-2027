import "server-only";
import { randomUUID } from "node:crypto";
import { getPublicQrLocation, getPublicPilotSession } from "./onStreetPilotRepository";
import { normalizeChileanMobile, normalizePurchasedMinutes } from "./onStreetPilot.mjs";
import { normalizePlate } from "./dataEntry.mjs";
import { abortPaymentTransactionByBuyOrder, claimTransactionCommit, createPaymentTransaction, finalizeAuthorizedPayment, getPaymentTransaction, getPaymentTransactionByToken, markTransactionFailed, markTransactionRedirected, storedProviderToken } from "./payments/paymentTransactionRepository";
import { createTransbankWebpayProvider, isAuthorizedWebpayResponse, sanitizeWebpayResponse } from "./payments/transbankWebpayProvider";

function error(code,status=400){const e=new Error(code);e.code=code;e.status=status;return e;}
const intentSelect="id,public_token,qr_location_id,parking_id,license_plate_normalized,phone_normalized,operation_type,target_session_id,purchased_minutes,rate_id,rate_per_minute,amount,currency,location_snapshot,status,expires_at,paid_at,resulting_session_id,created_at";

async function enforceIntentRateLimit(db,qrLocationId,clientHash){if(!/^[a-f0-9]{64}$/.test(String(clientHash||"")))throw error("PAYMENT_CLIENT_INVALID");const since=new Date(Date.now()-60000).toISOString();const count=await db.from("on_street_pilot_attempts").select("id",{count:"exact",head:true}).eq("qr_location_id",qrLocationId).eq("client_hash",clientHash).gt("attempted_at",since);if(count.error)throw count.error;if((count.count||0)>=5)throw error("PAYMENT_RATE_LIMITED",429);const inserted=await db.from("on_street_pilot_attempts").insert({qr_location_id:qrLocationId,client_hash:clientHash});if(inserted.error)throw inserted.error;}

export async function createInitialPaymentIntent(db,{qrCode,licensePlate,phone,minutes,idempotencyKey,clientHash}){
  const normalizedPlate=normalizePlate(licensePlate,{truncate:false}),normalizedPhone=normalizeChileanMobile(phone),normalizedMinutes=normalizePurchasedMinutes(minutes);
  if(!/^[A-Z0-9]{4,8}$/.test(normalizedPlate)||!normalizedPhone||!normalizedMinutes)throw error("PAYMENT_INTENT_INPUT_INVALID");
  if(String(idempotencyKey||"").length<8)throw error("IDEMPOTENCY_KEY_REQUIRED");
  const location=await getPublicQrLocation(qrCode,db);if(!location)throw error("QR_LOCATION_NOT_FOUND",404);if(!location.rate)throw error("PILOT_RATE_NOT_FOUND",409);
  await enforceIntentRateLimit(db,location.qr.id,clientHash);
  const rate=Number(location.rate.minute_amount),amount=Math.round(normalizedMinutes*rate);if(!Number.isInteger(amount)||amount<=0)throw error("PAYMENT_AMOUNT_INVALID",409);
  const row={qr_location_id:location.qr.id,parking_id:location.parking.id,license_plate_normalized:normalizedPlate,phone_normalized:normalizedPhone,operation_type:"INITIAL",purchased_minutes:normalizedMinutes,rate_id:location.rate.id,rate_per_minute:rate,amount,currency:location.rate.currency||"CLP",location_snapshot:{parkingName:location.parking.name,sectorName:location.sector.name,streetName:location.street.name,segmentName:location.segment.name},rate_snapshot:{rateId:location.rate.id,ratePerMinute:rate,currency:location.rate.currency||"CLP"},idempotency_key:String(idempotencyKey),status:"PENDING_PAYMENT",expires_at:new Date(Date.now()+10*60*1000).toISOString()};
  const created=await db.from("on_street_payment_intents").insert(row).select(intentSelect).single();
  if(created.error?.code==="23505"){const existing=await db.from("on_street_payment_intents").select(intentSelect).eq("qr_location_id",location.qr.id).eq("idempotency_key",String(idempotencyKey)).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return existing.data;}
  if(created.error)throw created.error;return created.data;
}

export async function createExtensionPaymentIntent(db,{sessionToken,minutes,idempotencyKey,clientHash}){
  const normalizedMinutes=normalizePurchasedMinutes(minutes);if(!normalizedMinutes||String(idempotencyKey||"").length<8)throw error("PAYMENT_INTENT_INPUT_INVALID");
  const current=await getPublicPilotSession(sessionToken,db);if(!current||current.session.status!=="ACTIVE")throw error("PILOT_SESSION_NOT_ACTIVE",409);
  await enforceIntentRateLimit(db,current.session.qr_location_id,clientHash);
  const rate=Number(current.location.rate?.minute_amount);if(!rate)throw error("PILOT_RATE_NOT_FOUND",409);const amount=Math.round(normalizedMinutes*rate);
  const row={qr_location_id:current.session.qr_location_id,parking_id:current.session.parking_id,license_plate_normalized:current.session.license_plate_normalized,phone_normalized:current.session.phone_normalized,operation_type:"EXTENSION",target_session_id:current.session.id,purchased_minutes:normalizedMinutes,rate_id:current.location.rate.id,rate_per_minute:rate,amount,currency:current.location.rate.currency||"CLP",location_snapshot:{parkingName:current.location.parking.name,sectorName:current.location.sector.name,streetName:current.location.street.name,segmentName:current.location.segment.name},rate_snapshot:{rateId:current.location.rate.id,ratePerMinute:rate,currency:current.location.rate.currency||"CLP"},idempotency_key:String(idempotencyKey),status:"PENDING_PAYMENT",expires_at:new Date(Date.now()+10*60*1000).toISOString()};
  const created=await db.from("on_street_payment_intents").insert(row).select(intentSelect).single();if(created.error?.code==="23505"){const existing=await db.from("on_street_payment_intents").select(intentSelect).eq("qr_location_id",row.qr_location_id).eq("idempotency_key",String(idempotencyKey)).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return existing.data;}if(created.error)throw created.error;return created.data;
}

export async function getPublicPaymentIntent(db,token){const result=await db.from("on_street_payment_intents").select(intentSelect).eq("public_token",token).maybeSingle();if(result.error)throw result.error;return result.data;}

export async function startWebpayPayment(db,{intentToken,idempotencyKey,returnUrl,provider=createTransbankWebpayProvider()}){
  const intent=await getPublicPaymentIntent(db,intentToken);if(!intent)throw error("PAYMENT_INTENT_NOT_FOUND",404);if(new Date(intent.expires_at)<=new Date())throw error("PAYMENT_INTENT_EXPIRED",409);
  const transactionId=randomUUID(),buyOrder=`PF${transactionId.replaceAll("-","").slice(0,24)}`,providerSessionId=transactionId.replaceAll("-","").slice(0,61);
  const created=await createPaymentTransaction(db,{intentToken,idempotencyKey,buyOrder,providerSessionId});const transaction=await getPaymentTransaction(db,created.transactionId);
  if(created.reused){if(transaction.status==="REDIRECTED")return{transactionId:transaction.id,url:transaction.gateway_url,token:storedProviderToken(transaction),reused:true};if(transaction.status==="COMMITTED")return{transactionId:transaction.id,completed:true,reused:true};throw error("PAYMENT_ALREADY_PROCESSING",409);}
  try{const response=await provider.createTransaction({buyOrder:transaction.buy_order,sessionId:transaction.provider_session_id,amount:transaction.amount,returnUrl});const saved=await markTransactionRedirected(db,transaction.id,{token:response.token,url:response.url});return{transactionId:saved.id,url:saved.gateway_url,token:response.token,reused:false};}catch(cause){await markTransactionFailed(db,transaction.id);throw cause;}
}

export async function processWebpayReturn(db,{token,provider=createTransbankWebpayProvider()}){
  const transaction=await getPaymentTransactionByToken(db,token);if(!transaction)throw error("PAYMENT_TRANSACTION_NOT_FOUND",404);
  if(transaction.status==="COMMITTED"){const intent=await getPublicPaymentIntentById(db,transaction.source_id);return{status:"COMMITTED",intentToken:intent.public_token,sessionToken:await sessionTokenFor(db,intent.resulting_session_id)};}
  const claim=await claimTransactionCommit(db,token);
  if(claim.completed){const intent=await getPublicPaymentIntentById(db,transaction.source_id);return{status:"COMMITTED",intentToken:intent.public_token,sessionToken:await sessionTokenFor(db,intent.resulting_session_id)};}
  if(claim.busy){const intent=await getPublicPaymentIntentById(db,transaction.source_id);return{status:"PROCESSING",intentToken:intent.public_token};}
  let response;
  try{response=claim.recover?await provider.getTransactionStatus(token):await provider.commitTransaction(token);}catch(commitError){try{response=await provider.getTransactionStatus(token);}catch{throw commitError;}}
  const safe=sanitizeWebpayResponse(response);if(!isAuthorizedWebpayResponse(response,{buyOrder:transaction.buy_order,amount:transaction.amount})){await markTransactionFailed(db,transaction.id,{status:String(response?.status).toUpperCase()==="ABORTED"?"ABORTED":"REJECTED",providerStatus:safe.status,responseCode:safe.responseCode,response:safe});const intent=await getPublicPaymentIntentById(db,transaction.source_id);return{status:"REJECTED",intentToken:intent.public_token};}
  const finalized=await finalizeAuthorizedPayment(db,transaction.id,safe);const intent=await getPublicPaymentIntentById(db,transaction.source_id);return{status:"COMMITTED",intentToken:intent.public_token,sessionToken:finalized.sessionToken};
}

export async function abortWebpayReturn(db,buyOrder){const transaction=await abortPaymentTransactionByBuyOrder(db,buyOrder);if(!transaction)return null;const intent=await getPublicPaymentIntentById(db,transaction.source_id);return{intentToken:intent.public_token};}

export async function recoverWebpayTransaction(db,{transactionId,provider=createTransbankWebpayProvider()}){const transaction=await getPaymentTransaction(db,transactionId);if(!transaction)throw error("PAYMENT_TRANSACTION_NOT_FOUND",404);if(transaction.status==="COMMITTED")return{status:"COMMITTED"};const token=storedProviderToken(transaction),response=await provider.getTransactionStatus(token),safe=sanitizeWebpayResponse(response);if(!isAuthorizedWebpayResponse(response,{buyOrder:transaction.buy_order,amount:transaction.amount}))return{status:"PENDING",providerStatus:safe.status};await claimTransactionCommit(db,token);const finalized=await finalizeAuthorizedPayment(db,transaction.id,safe);return{status:"COMMITTED",...finalized};}

async function getPublicPaymentIntentById(db,id){const result=await db.from("on_street_payment_intents").select(intentSelect).eq("id",id).single();if(result.error)throw result.error;return result.data;}
async function sessionTokenFor(db,id){const result=await db.from("on_street_pilot_sessions").select("public_token").eq("id",id).single();if(result.error)throw result.error;return result.data.public_token;}
