// LPR Off Street — Fase 1 (SOL-2026-11-01-001): registro de lecturas y decisión.
// Única capa que lee/escribe lpr_* desde POST /api/lpr/events. La ruta ya validó
// el cuerpo (lprCore.mjs); aquí se autentica el equipo local y se decide.

import {
  decidirLectura,
  DECISIONES,
  hashClaveGateway,
  pulsoBarreraMs,
} from "@/lib/lpr/lprCore.mjs";

export class LprError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function fallar(contexto, error) {
  console.error(`[lpr] ${contexto}`, { code: error?.code || null, message: error?.message || String(error) });
  throw new LprError(503, "No fue posible procesar la lectura.");
}

// Equipo local por su clave (sha256). null si no existe, está desactivado o revocado.
export async function autenticarGateway(db, clave) {
  const { data, error } = await db
    .from("lpr_gateways")
    .select("id, parking_id, enabled, revoked_at")
    .eq("key_hash", hashClaveGateway(clave))
    .maybeSingle();
  if (error) fallar("gateway", error);
  if (!data || !data.enabled || data.revoked_at) return null;

  await db.from("lpr_gateways").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

async function leerUno(consulta, contexto) {
  const { data, error } = await consulta;
  if (error) fallar(contexto, error);
  return data;
}

// Marca la salida física solo si nadie la marcó antes: dos lecturas casi
// simultáneas de la misma salida no abren dos veces por la misma estadía.
async function marcarSalidaFisica(db, estadiaId, ahora) {
  const data = await leerUno(
    db
      .from("parking_stays")
      .update({ gate_exit_at: ahora, exit_plate_source: "CAMERA" })
      .eq("id", estadiaId)
      .eq("status", "PAID")
      .is("gate_exit_at", null)
      .select("id"),
    "salida física"
  );
  return Array.isArray(data) && data.length === 1;
}

export async function procesarLectura(db, gateway, datos, { ahora = new Date() } = {}) {
  const ahoraIso = new Date(ahora).toISOString();

  const camara = await leerUno(
    db
      .from("lpr_devices")
      .select("id, parking_id, access_point_id, gateway_id, type, enabled, health, config")
      .eq("id", datos.deviceId)
      .maybeSingle(),
    "cámara"
  );
  // La cámara debe ser del mismo estacionamiento que el equipo local.
  if (!camara || camara.type !== "LPR_CAMERA" || camara.parking_id !== gateway.parking_id) {
    throw new LprError(404, "La cámara no existe o no pertenece a este equipo local.");
  }

  if (datos.externalId) {
    const repetida = await leerUno(
      db
        .from("lpr_events")
        .select("id, decision, decision_detail, plate_normalized, stay_id")
        .eq("device_id", camara.id)
        .eq("external_id", datos.externalId)
        .maybeSingle(),
      "lectura repetida"
    );
    if (repetida) {
      const comando = await leerUno(
        db.from("lpr_barrier_commands").select("id").eq("event_id", repetida.id).maybeSingle(),
        "orden repetida"
      );
      return { repetida: true, evento: repetida, comandoId: comando?.id ?? null };
    }
  }

  const acceso = camara.access_point_id
    ? await leerUno(
        db
          .from("lpr_access_points")
          .select("id, parking_id, direction, enabled, exit_grace_minutes")
          .eq("id", camara.access_point_id)
          .maybeSingle(),
        "acceso"
      )
    : null;

  let estadiaAbierta = null;
  let ultimaPagada = null;
  if (datos.patente) {
    [estadiaAbierta, ultimaPagada] = await Promise.all([
      leerUno(
        db
          .from("parking_stays")
          .select("id")
          .eq("parking_id", camara.parking_id)
          .eq("license_plate", datos.patente)
          .eq("status", "OPEN")
          .maybeSingle(),
        "estadía abierta"
      ),
      leerUno(
        db
          .from("parking_stays")
          .select("id, exit_at")
          .eq("parking_id", camara.parking_id)
          .eq("license_plate", datos.patente)
          .eq("status", "PAID")
          .is("gate_exit_at", null)
          .order("exit_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "estadía pagada"
      ),
    ]);
  }

  let decision = decidirLectura({
    acceso,
    camara,
    patente: datos.patente,
    confianza: datos.confianza,
    estadiaAbierta,
    ultimaPagada,
    ahora,
  });

  // La barrera de ese acceso (la primera activa). Sin barrera no se abre.
  let barrera = null;
  if (decision.abrir) {
    barrera = await leerUno(
      db
        .from("lpr_devices")
        .select("id, config")
        .eq("access_point_id", acceso.id)
        .eq("type", "BARRIER")
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      "barrera"
    );
    if (!barrera) {
      decision = { ...decision, abrir: false, detalle: `${decision.detalle} El acceso no tiene una barrera activa.` };
    } else if (!(await marcarSalidaFisica(db, decision.estadiaId, ahoraIso))) {
      // Otra lectura ya registró la salida de esta estadía.
      decision = { ...decision, decision: DECISIONES.EXIT_NO_STAY, abrir: false, detalle: "La salida de esta estadía ya fue registrada." };
    }
  }

  const evento = await leerUno(
    db
      .from("lpr_events")
      .insert({
        parking_id: camara.parking_id,
        device_id: camara.id,
        access_point_id: acceso?.id ?? null,
        gateway_id: gateway.id,
        external_id: datos.externalId,
        captured_at: datos.capturadaEn,
        plate_raw: datos.patenteCruda,
        plate_normalized: datos.patente,
        confidence: datos.confianza,
        source: "CAMERA",
        stay_id: decision.estadiaId,
        decision: decision.decision,
        decision_detail: decision.detalle,
        raw_payload: datos.resumen,
      })
      .select("id, decision, decision_detail, plate_normalized, stay_id")
      .single(),
    "registro de lectura"
  );

  await db.from("lpr_devices").update({ last_seen_at: ahoraIso }).eq("id", camara.id);

  let comandoId = null;
  if (decision.abrir && barrera) {
    const comando = await leerUno(
      db
        .from("lpr_barrier_commands")
        .insert({
          parking_id: camara.parking_id,
          device_id: barrera.id,
          action: "OPEN",
          origin: "AUTO",
          event_id: evento.id,
          pulse_ms: pulsoBarreraMs(barrera.config),
        })
        .select("id")
        .single(),
      "orden de apertura"
    );
    comandoId = comando.id;
  }

  return { repetida: false, evento, comandoId };
}
