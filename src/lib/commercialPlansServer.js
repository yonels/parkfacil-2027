import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export async function getCommercialPlanPageData(id) {
  const { data, error } = await getSupabaseAdminClient().from("commercial_plans").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, codigo: data.code, nombre: data.name, descripcion: data.description, estado: data.status, tipo: data.type, moneda: data.currency, modalidadCobro: data.billing_mode, monthlyFee: Number(data.monthly_fee), annualFee: Number(data.annual_fee), implementationFee: Number(data.implementation_fee), transactionFee: Number(data.transaction_fee), deviceFee: Number(data.device_fee), parkingFee: Number(data.parking_fee), supportFee: Number(data.support_fee), discountPercentage: Number(data.discount_percentage), minimumMonthlyCharge: Number(data.minimum_monthly_charge), estacionamientosIncluidos: data.included_parkings, dispositivosIncluidos: data.included_devices, usuariosIncluidos: data.included_users, modulos: data.modules || [], equipamiento: data.equipment || [], limites: [], soporte: [], implementacion: [], capacitacion: [], reportes: [], integraciones: [], condiciones: [], vigencia: "Sin vigencia definida", fechaCreacion: data.created_at?.slice(0,10), contractIds: [], observaciones: data.notes || data.description };
}
