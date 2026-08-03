import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getCompany } from "@/lib/companiesRepository";

const clean = (value) => String(value || "").trim();
const numberOrNull = (value) => value === "" || value === null || value === undefined ? null : Number(value);
const planCode = {
  "Por definir": "UNASSIGNED",
  Esencial: "ESSENTIAL",
  Profesional: "PROFESSIONAL",
  Enterprise: "ENTERPRISE",
  Personalizado: "CUSTOM",
};

export async function PATCH(request, { params }) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!actor.isPlatformAdmin) {
    return NextResponse.json({ error: "Solo ParkFacil Root puede modificar empresas y contratos.", code: "COMPANY_UPDATE_FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const input = await request.json();
  const monthlyValue = numberOrNull(input.contract?.monthlyValue);
  const annualDiscount = numberOrNull(input.contract?.annualDiscountPercent);
  const paymentDueDays = numberOrNull(input.contract?.paymentDueDays);
  const reactivationValue = numberOrNull(input.contract?.reactivationValue);
  const equipmentPenalty = numberOrNull(input.contract?.equipmentPenaltyValue);
  const numericValues = [monthlyValue, annualDiscount, paymentDueDays, reactivationValue, equipmentPenalty].filter((value) => value !== null);
  if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
    return NextResponse.json({ error: "Los valores contractuales deben ser números iguales o mayores que cero.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const companyResult = await db.from("companies").update({
    trade_name: clean(input.name),
    business_name: clean(input.legalName),
    business_activity: clean(input.businessActivity),
    primary_contact: clean(input.contact),
    email: clean(input.email),
    phone: clean(input.phone),
    legal_representative: clean(input.legalRepresentative),
    address: clean(input.address),
    district: clean(input.district),
    city: clean(input.city),
    region: clean(input.region),
    country: clean(input.country) || "Chile",
    notes: clean(input.notes),
    commercial_plan: planCode[input.plan] || "UNASSIGNED",
    status: ["Activo", "active"].includes(input.status) ? "active" : ["En implementación", "onboarding"].includes(input.status) ? "onboarding" : "inactive",
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("id").single();
  if (companyResult.error) {
    console.error("[companies:update]", companyResult.error);
    return NextResponse.json({ error: "No fue posible guardar la empresa.", code: "COMPANY_UPDATE_FAILED" }, { status: 500 });
  }

  if (input.contract?.id) {
    const contractResult = await db.from("company_contracts").update({
      currency: clean(input.contract.currency) || "UF",
      tax_label: clean(input.contract.taxLabel),
      monthly_value: monthlyValue,
      monthly_value_source: "Valor actualizado por ParkFacil Root",
      starts_on: input.contract.startsOn,
      ends_on: input.contract.endsOn,
      automatic_renewal: Boolean(input.contract.automaticRenewal),
      non_renewal_notice_days: Number(input.contract.nonRenewalNoticeDays || 0),
      annual_discount_percent: annualDiscount,
      payment_due_days: paymentDueDays,
      reactivation_value: reactivationValue,
      equipment_penalty_value: equipmentPenalty,
      updated_at: new Date().toISOString(),
    }).eq("id", input.contract.id).eq("company_id", id);
    if (contractResult.error) {
      console.error("[contracts:update]", contractResult.error);
      return NextResponse.json({ error: "La empresa se actualizó, pero no fue posible guardar el contrato.", code: "CONTRACT_UPDATE_FAILED" }, { status: 500 });
    }
  }

  return NextResponse.json({ data: await getCompany(db, id) });
}
