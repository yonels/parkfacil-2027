import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetAreas } from "@/lib/onStreetAdminRepository";

export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await listOnStreetAreas(auth.db, auth.context, Object.fromEntries(new URL(request.url).searchParams)) });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_AREAS]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar las áreas." }, { status: 503 });
  }
}
