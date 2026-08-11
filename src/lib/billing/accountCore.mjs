const DEBIT_TYPES=new Set(["INVOICE","DEBIT_NOTE"]);
const CREDIT_TYPES=new Set(["CREDIT_NOTE","PAYMENT"]);
export function movementAmounts(type,amount){const value=Number(amount);if(!DEBIT_TYPES.has(type)&&!CREDIT_TYPES.has(type))throw new Error("INVALID_MOVEMENT_TYPE");if(!Number.isFinite(value)||value<=0)throw new Error("INVALID_MOVEMENT_AMOUNT");return DEBIT_TYPES.has(type)?{debit:value,credit:0}:{debit:0,credit:value};}
export function validatePaymentInput(input={}){
  const companyId=String(input.companyId||"").trim(),reference=String(input.reference||"").trim(),description=String(input.description||"").trim(),paymentMethod=String(input.paymentMethod||"").trim().toUpperCase(),currency=String(input.currency||"CLP").trim().toUpperCase(),movementDate=String(input.movementDate||"").trim(),idempotencyKey=String(input.idempotencyKey||"").trim();
  const amount=Number(input.amount);if(!companyId)throw new Error("PAYMENT_COMPANY_REQUIRED");if(!Number.isFinite(amount)||amount<=0)throw new Error("INVALID_MOVEMENT_AMOUNT");if(!/^\d{4}-\d{2}-\d{2}$/.test(movementDate))throw new Error("PAYMENT_DATE_INVALID");if(!["CLP","USD"].includes(currency))throw new Error("PAYMENT_CURRENCY_INVALID");if(!reference||reference.length>120)throw new Error("PAYMENT_REFERENCE_INVALID");if(!description||description.length>240)throw new Error("PAYMENT_DESCRIPTION_INVALID");if(!["TRANSFER","CARD","CASH","CHECK","OTHER"].includes(paymentMethod))throw new Error("PAYMENT_METHOD_INVALID");if(idempotencyKey.length<8||idempotencyKey.length>120)throw new Error("PAYMENT_IDEMPOTENCY_INVALID");
  return{companyId,amount,movementDate,currency,reference,description,paymentMethod,idempotencyKey,documentId:input.documentId?String(input.documentId).trim():null};
}
export function calculateAccount(movements,{today=new Date().toISOString().slice(0,10)}={}){
  const currencies=new Set(movements.map(x=>x.currency));if(currencies.size>1)throw new Error("INCOMPATIBLE_ACCOUNT_CURRENCIES");
  let balance=0,totalDebits=0,totalCredits=0;
  const rows=[...movements].sort((a,b)=>String(a.movementDate).localeCompare(String(b.movementDate))||String(a.id).localeCompare(String(b.id))).map(item=>{
    const debit=Number(item.debitAmount||0),credit=Number(item.creditAmount||0);balance+=debit-credit;totalDebits+=debit;totalCredits+=credit;
    const status=balance<=0?"PAID":item.dueDate&&today>item.dueDate?"OVERDUE":credit>0?"PARTIAL":"PENDING";
    return {...item,debitAmount:debit,creditAmount:credit,runningBalance:balance,accountStatus:status};
  });
  const overdueDebits=rows.filter(x=>x.debitAmount>0&&x.dueDate&&today>x.dueDate).reduce((sum,x)=>sum+x.debitAmount,0);const positiveBalance=Math.max(0,balance),overdue=Math.min(positiveBalance,Math.max(0,overdueDebits-totalCredits));
  return {currency:[...currencies][0]||"CLP",rows,summary:{totalDebits,totalCredits,balance,overdue,current:Math.max(0,positiveBalance-overdue)}};
}
