import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePaymentCardType, summarizeCardTypes, matchesRevenueMethod, closureCardTypes, readCardTypedQuery } from './paymentCardType.mjs';
test('validates explicit card types without inventing historical types',()=>{
 assert.equal(validatePaymentCardType('CARD','CREDIT'),'CREDIT');
 assert.equal(validatePaymentCardType('CARD','DEBIT'),'DEBIT');
 assert.equal(validatePaymentCardType('CARD',null),null);
 assert.throws(()=>validatePaymentCardType('CASH','CREDIT'));
 assert.throws(()=>validatePaymentCardType('CARD','OTHER'));
});
const rows=[{payment_method:'CARD',payment_card_type:'CREDIT',total_amount:100},{payment_method:'CARD',payment_card_type:'DEBIT',total_amount:200},{payment_method:'CARD',total_amount:300},{payment_method:'CASH',total_amount:400}];
test('typed totals and filters preserve legacy cards separately',()=>{
 assert.deepEqual(summarizeCardTypes(rows),{creditAmount:100,debitAmount:200,unclassifiedCardAmount:300});
 assert.equal(rows.filter(r=>matchesRevenueMethod(r,'CARD')).length,3);
 assert.equal(rows.filter(r=>matchesRevenueMethod(r,'CREDIT')).length,1);
 assert.equal(rows.filter(r=>matchesRevenueMethod(r,'DEBIT')).length,1);
 assert.equal(rows.filter(r=>matchesRevenueMethod(r,'CARD_UNCLASSIFIED')).length,1);
});
test('closure historical totals remain unclassified without explicit snapshots',()=>{
 assert.deepEqual(closureCardTypes({card_amount:600}),{creditAmount:0,debitAmount:0,unclassifiedCardAmount:600});
 assert.deepEqual(closureCardTypes({card_amount:600,payments_snapshot:[{paymentMethod:'CARD',paymentCardType:'CREDIT',amount:100},{paymentMethod:'CARD',paymentCardType:'DEBIT',amount:200}]}),{creditAmount:100,debitAmount:200,unclassifiedCardAmount:300});
});
test('read compatibility retries only missing additive column and preserves errors',async()=>{
 const calls=[];
 const result=await readCardTypedQuery(async typed=>{calls.push(typed);return typed?{error:{code:'42703',message:'payment_card_type absent'}}:{data:rows,error:null};});
 assert.deepEqual(calls,[true,false]);assert.equal(result.cardTypeSupported,false);
 const outage={code:'500',message:'outage'};let count=0;
 const failed=await readCardTypedQuery(async()=>{count++;return {error:outage};});
 assert.equal(count,1);assert.equal(failed.error,outage);
});
