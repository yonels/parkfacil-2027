export function movementAmounts(type,amount){const value=Number(amount);if(!Number.isFinite(value)||value<=0)throw new Error("INVALID_MOVEMENT_AMOUNT");return ["INVOICE","DEBIT_NOTE"].includes(type)?{debit:value,credit:0}:{debit:0,credit:value};}
export function calculateAccount(movements,{today=new Date().toISOString().slice(0,10)}={}){
  const currencies=new Set(movements.map(x=>x.currency));if(currencies.size>1)throw new Error("INCOMPATIBLE_ACCOUNT_CURRENCIES");
  let balance=0,totalDebits=0,totalCredits=0,overdue=0;
  const rows=[...movements].sort((a,b)=>String(a.movementDate).localeCompare(String(b.movementDate))||String(a.id).localeCompare(String(b.id))).map(item=>{
    const debit=Number(item.debitAmount||0),credit=Number(item.creditAmount||0);balance+=debit-credit;totalDebits+=debit;totalCredits+=credit;
    const status=balance<=0?"PAID":item.dueDate&&today>item.dueDate?"OVERDUE":credit>0?"PARTIAL":"PENDING";if(status==="OVERDUE")overdue=balance;
    return {...item,debitAmount:debit,creditAmount:credit,runningBalance:balance,accountStatus:status};
  });
  return {currency:[...currencies][0]||"CLP",rows,summary:{totalDebits,totalCredits,balance,overdue,current:Math.max(0,balance-overdue)}};
}
