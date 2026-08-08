import { NextResponse } from "next/server";
import { getConfigurator } from "@/lib/parkingConfiguratorRepository";
import { authorizeParkingRequest } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

function knownActivationFailure(error) {
  const marker = String(error?.message || error?.details || "").toUpperCase();
  if (marker.includes("ACTIVATION_RATE_REQUIRED")) {
    return {
      status: 409,
      body: {
        error: "No existe una tarifa activa y vigente para activar el estacionamiento.",
        code: "ACTIVATION_RATE_REQUIRED",
      },
    };
  }
  if (marker.includes("ACTIVATION_STREET_REQUIRED")) {
    return {
      status: 409,
      body: {
        error: "Debes configurar al menos una calle activa antes de activar el estacionamiento.",
        code: "ACTIVATION_STREET_REQUIRED",
      },
    };
  }
  if (marker.includes("ACTIVATION_STRUCTURE_PENDING")) {
    return {
      status: 409,
      body: {
        error: "El estacionamiento todavía tiene requisitos de estructura pendientes.",
        code: "ACTIVATION_STRUCTURE_PENDING",
      },
    };
  }
  if (marker.includes("ACTIVATION_REQUIREMENTS_PENDING")) {
    return {
      status: 409,
      body: {
        error: "El estacionamiento todavía tiene requisitos pendientes.",
        code: "ACTIVATION_REQUIREMENTS_PENDING",
      },
    };
  }
  return null;
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeParkingRequest(request, id, PERMISSIONS.PARKINGS_MANAGE); if (auth.response) return auth.response;
    const { db } = auth;
    const configuration = await getConfigurator(db, auth.parking.id, { parking: auth.parking });
    if (!configuration.activation.allowed) return NextResponse.json({ error: "El estacionamiento todavía tiene requisitos pendientes.", code: "ACTIVATION_REQUIREMENTS_PENDING", details: configuration.activation.requirements }, { status: 409 });
    const { error } = await db.rpc("activate_parking_configuration", { p_parking_id: configuration.parking.id, p_actor_id: auth.context.userId });
    if (error) throw error;
    return NextResponse.json({ data: await getConfigurator(db, configuration.parking.id, { parking: auth.parking }) });
  } catch (error) {
    const known = knownActivationFailure(error);
    if (known) return NextResponse.json(known.body, { status: known.status });
    console.error("[parking:configurator:activate]", { code: error?.code, message: error?.message, details: error?.details });
    return NextResponse.json({ error: "No fue posible completar la operación. Intente nuevamente o contacte al administrador.", code: "ACTIVATION_FAILED" }, { status: 500 });
  }
}
