import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePlatformAdmin(authorization.context);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80).replace(/[%_\\]/g, "");
  if (query.length < 2) return NextResponse.json({ data: [] });

  try {
    const db = getSupabaseAdminClient();
    const pattern = `%${query}%`;
    const rutDigits = query.replace(/[^0-9]/g, "");
    const searches = [
      ["company", "companies", "id,business_name,trade_name,rut_number,rut_dv", "business_name"],
      ["company", "companies", "id,business_name,trade_name,rut_number,rut_dv", "trade_name"],
      ["company", "companies", "id,business_name,trade_name,rut_number,rut_dv", "id"],
      ["company", "companies", "id,business_name,trade_name,rut_number,rut_dv", "rut_number", rutDigits.length >= 3 ? `%${rutDigits}%` : pattern],
      ["parking", "parkings", "id,code,name,company_name", "name"],
      ["parking", "parkings", "id,code,name,company_name", "code"],
      ["user", "company_members", "user_id,full_name,recovery_email,role,company_id", "full_name"],
      ["user", "company_members", "user_id,full_name,recovery_email,role,company_id", "recovery_email"],
    ];
    const responses = await Promise.all(searches.map(([, table, fields, column, customPattern]) =>
      db.from(table).select(fields).ilike(column, customPattern || pattern).limit(6)
    ));
    const failure = responses.find((response) => response.error);
    if (failure) throw failure.error;

    const seen = new Set();
    const counts = { company: 0, parking: 0, user: 0 };
    const data = [];
    responses.forEach((response, index) => {
      const [type] = searches[index];
      for (const row of response.data || []) {
        const id = type === "user" ? row.user_id : row.id;
        if (!id || seen.has(`${type}:${id}`) || counts[type] >= 6) continue;
        seen.add(`${type}:${id}`);
        counts[type]++;
        data.push(type === "company"
          ? { type, title: row.trade_name || row.business_name, detail: `${row.business_name || "Empresa"} · RUT ${row.rut_number || "—"}-${row.rut_dv || ""}`, href: `/empresas/${encodeURIComponent(id)}` }
          : type === "parking"
            ? { type, title: row.name || row.code, detail: `${row.code || ""} · ${row.company_name || "Estacionamiento"}`, href: `/estacionamientos/${encodeURIComponent(row.code)}` }
            : { type, title: row.full_name || row.recovery_email || "Usuario", detail: `${row.role === "company_admin" ? "Administrador" : row.role === "operator" ? "Operador" : "Usuario"} · ${row.recovery_email || row.company_id || ""}`, href: `/usuarios/${encodeURIComponent(id)}` });
      }
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[root-search]", error);
    return NextResponse.json({ error: "No fue posible buscar en los registros." }, { status: 500 });
  }
}
