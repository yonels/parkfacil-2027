import { NextResponse } from "next/server";
const headers={"Cache-Control":"no-store"};
export async function POST(){return NextResponse.json({error:"La extensión requiere pago previo por Webpay.",code:"PREPAID_PAYMENT_REQUIRED"},{status:410,headers})}
