import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetStreets } from "@/lib/onStreetAdminRepository";

export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await listOnStreetStreets(auth.db, auth.context, Object.fromEntries(new URL(request.url).searchParams)) });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_CALLES]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar las calles." }, { status: 503 });
  }
}
