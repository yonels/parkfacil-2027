import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, posParkingSelectionRequiredResponse, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { listOpenPosStays } from "@/lib/posStaysService";
import { getPlatePhotoSettings } from "@/lib/offStreet/offStreetPlatePhotoSettingsRepository";

const PLATE_PHOTO_DISABLED = { plateMode: "DISABLED", printOnTicket: false, gpsMode: "DISABLED" };

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const resolved = await resolvePosOperationalParking(authorization);
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      return NextResponse.json(posParkingSelectionRequiredResponse(), { status: 409 });
    }
    const parking = resolved.parking;
    if (!parking) {
      return fail("El usuario no tiene un estacionamiento autorizado.", 404);
    }

    // platePhotoSettings: el POS carga su estado desde esta ruta; sin este
    // campo el modo de foto que configura el administrador nunca llegaba y
    // el ingreso lo trataba siempre como DISABLED. Mismo criterio que
    // /api/data-entry: sin fila (o ante error) -> DISABLED.
    const [summary, platePhotoSettings] = await Promise.all([
      listOpenPosStays(authorization.db, parking.id, { now: new Date() }),
      getPlatePhotoSettings(authorization.db, parking.id).catch(() => PLATE_PHOTO_DISABLED),
    ]);

    return NextResponse.json({
      data: {
        parking: summary.parking || parking,
        serverNow: summary.serverNow,
        stays: summary.stays,
        actor: { ...posOperationActor(authorization.context), parkingId: parking.id },
        platePhotoSettings: { mode: platePhotoSettings.plateMode, printOnTicket: platePhotoSettings.printOnTicket, gpsMode: platePhotoSettings.gpsMode },
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible cargar los vehículos estacionados.", 503);
  }
}
