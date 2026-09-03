"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, CheckCircle2, MapPin, WifiOff, X } from "lucide-react";
import { Camera as CapacitorCamera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera";
import { normalizeInspectorPlate } from "@/lib/inspector/inspectorMocks.mjs";
import { compressImageFile } from "@/lib/inspector/inspectorImageCompression";
import InspectorLocationPicker, { readStoredContext } from "./InspectorLocationPicker";
import { contextToInspectionPayload } from "@/lib/inspector/inspectorContextCore.mjs";
import { INSPECTOR_FISCALIZACION_MOTIVOS, INSPECTOR_FISCALIZACION_TYPE_BY_MOTIVO } from "./inspectorFiscalizacionMotivos.mjs";
import { inspectorSmsStatusMessage, inspectorSmsShortStatus, inspectorCopySmsShortStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";
import CourtesyTicketPrint from "./CourtesyTicketPrint";
import { detectPlatform, PLATFORM } from "@/lib/inspector/printerAdapter";

const MAX_FOTOS = 3;

// Fila compacta de estado (2026-09-03, "decouple printing + sms copy",
// §7): tono neutral por defecto -- "no disponible"/"no configurada" NUNCA
// se pintan como error, solo un fallo real del proveedor/impresión lo es.
// Un solo lugar para el mapeo de color, reutilizado por las 4 filas.
const STATUS_TONE_CLASSES = { success: "text-emerald-700", error: "text-rose-700", neutral: "text-slate-500" };
function StatusRow({ label, status }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-bold text-[#041E42]">{label}</span>
      <span className={`font-semibold ${STATUS_TONE_CLASSES[status?.tone] || STATUS_TONE_CLASSES.neutral}`}>{status?.label || "—"}</span>
    </div>
  );
}

// Cámara nativa Android (corrección 2026-08-31): <input type="file"
// capture="environment"> abre el selector de archivos en vez de la cámara
// dentro del WebView de Capacitor (comportamiento real reportado en el
// Samsung físico) -- el atributo "capture" no es fiable dentro de un
// WebView empaquetado, solo en navegador/PWA real. Se usa el plugin
// OFICIAL @capacitor/camera (ya instalado, mismo criterio "elegir la
// solución más simple" del informe de compatibilidad de la impresora) en
// vez de un plugin propio: a diferencia de la MTP-II (donde no existía
// ningún plugin que hablara Bluetooth Classic SPP), para cámara SÍ existe
// un plugin oficial ya probado -- reimplementarlo a mano solo agregaría
// riesgo (FileProvider, permisos, cámaras OEM como la de Samsung) sin
// ningún beneficio real. PC/navegador sigue exactamente igual: solo se usa
// el plugin nativo cuando detectPlatform()===ANDROID Y el plugin está
// realmente registrado (isPluginAvailable) -- si no, cae al mismo <input
// type="file"> de siempre, así que una APK vieja sin este plugin sincronizado
// sigue funcionando sin romperse.
function isNativeCameraAvailable() {
  if (typeof window === "undefined") return false;
  return detectPlatform() === PLATFORM.ANDROID && Boolean(window.Capacitor?.isPluginAvailable?.("Camera"));
}

// Nueva fiscalización real (Etapa 2 §9/§10/§12/§13/§17/§21, completada en
// Etapa 3 §13-20/§42):
//  - idempotency-key propia de este montaje del formulario (§12): un
//    reintento/doble click del MISMO formulario reutiliza la misma clave,
//    nunca duplica el registro ni reenvía el SMS.
//  - confirmación deliberada de "vehículo presente" (§9), obligatoria y
//    bloqueante para el tipo Exceso de tiempo.
//  - geolocalización opcional, mejor esfuerzo (§17), con accuracy/timestamp.
//  - contexto territorial opcional para NO_SESSION/OTHER (§13/§14): la
//    sesión real de OVERSTAY ya trae su propio estacionamiento inequívoco,
//    así que el selector no aplica ahí.
//  - guarda de conexión (§21/§36): sin conexión, no se intenta ni se simula
//    éxito -- se informa con claridad.
//  - evidencia fotográfica real (§17-20/§42): se sube DESPUÉS de que la
//    fiscalización quede registrada (nunca antes) -- así una foto nunca
//    queda huérfana de una fiscalización inexistente. Si el registro
//    principal tiene éxito pero la subida de alguna foto falla, la
//    fiscalización sigue siendo válida (no se pierde ni se duplica) y se
//    ofrece reintentar solo esa foto -- decisión documentada en la
//    migración 20260828150000 y en el informe de Etapa 3.
// existingRegistro (2026-09-03, "abrir detalle desde la lista de
// Fiscalizaciones"): reabre esta MISMA pantalla de resultado para una
// fiscalización YA registrada (leída solo-lectura vía
// GET /api/inspector/inspections/[id], ver InspectorApp.js) -- nunca pasa
// por el formulario ni por submit()/POST, así que reabrir jamás registra
// otra fiscalización ni reenvía SMS. Es la misma forma que body.data
// (registro) trae justo después de un submit() real, así que el resto del
// componente no necesita distinguir entre ambos casos.
export default function InspectorFiscalizacion({ plate: initialPlate, lockToOverstay = false, existingRegistro = null, onRegistrado, onCancelar }) {
  const [plateInput, setPlateInput] = useState(initialPlate || "");
  const [motivo, setMotivo] = useState(INSPECTOR_FISCALIZACION_MOTIVOS[0]);
  const [observaciones, setObservaciones] = useState("");
  const [vehiclePresentConfirmed, setVehiclePresentConfirmed] = useState(false);
  const [coords, setCoords] = useState(null);
  const [gpsError, setGpsError] = useState(false);
  const [context, setContext] = useState(null);
  const [fotos, setFotos] = useState([]); // [{ id, file, previewUrl }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registro, setRegistro] = useState(existingRegistro); // { id, ... } una vez creada (o reabierta, ver arriba)
  const [evidenceErrors, setEvidenceErrors] = useState([]);
  // Resumen de impresión (2026-09-03, "decouple printing + sms copy"):
  // reportado por CourtesyTicketPrint vía onStatusChange -- null hasta que
  // ese componente monta y calcula su primer estado (siempre síncrono, ver
  // printSummaryFor ahí), así que en la práctica nunca queda visible como
  // null en pantalla real.
  const [printSummary, setPrintSummary] = useState(null);
  const [online, setOnline] = useState(true);
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInputRef = useRef(null);
  const [useNativeCamera] = useState(() => isNativeCameraAvailable());

  const normalized = normalizeInspectorPlate(plateInput);
  const platePrefilled = Boolean(initialPlate);
  const inspectionType = lockToOverstay ? "OVERSTAY" : INSPECTOR_FISCALIZACION_TYPE_BY_MOTIVO[motivo];
  const requiresPresenceConfirmation = inspectionType === "OVERSTAY";
  const showLocationPicker = inspectionType !== "OVERSTAY";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      if (showLocationPicker) setContext(readStoredContext());
    }, 0);
    const goOnline = () => setOnline(true), goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          timestamp: position.timestamp,
        }),
        () => setGpsError(true),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    } else {
      setGpsError(true);
    }
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { for (const f of fotos) URL.revokeObjectURL(f.previewUrl); }, [fotos]);

  // Única función que realmente agrega una foto al estado -- reutilizada
  // tanto por el <input type="file"> (PC/web, y Android como respaldo si
  // el plugin nativo no está sincronizado) como por la cámara nativa
  // Android: mismo flujo de compresión y mismo almacenamiento en memoria
  // (foto.file, subida después vía inspectorEvidenceRepository -- sin
  // cambios) para cualquier origen de la imagen.
  const agregarFotoBlob = useCallback(async (rawFile) => {
    const comprimido = await compressImageFile(rawFile);
    setFotos((current) => (current.length >= MAX_FOTOS ? current : [...current, { id: crypto.randomUUID(), file: comprimido, previewUrl: URL.createObjectURL(comprimido) }]));
  }, []);

  async function agregarFoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || fotos.length >= MAX_FOTOS) return;
    await agregarFotoBlob(file);
  }

  // Cámara nativa Android (ver isNativeCameraAvailable arriba): abre
  // directamente la cámara trasera del teléfono (CameraSource.Camera,
  // nunca la galería), toma UNA foto y la entrega aquí mismo -- nunca se
  // guarda en la galería pública del teléfono (saveToGallery: false,
  // coherente con "almacenamiento privado de evidencias": la única copia
  // vive en memoria de la app hasta subirse al bucket privado). Cancelar
  // la cámara (botón atrás) no es un error real -- se descarta en
  // silencio, igual que cerrar el selector de archivos sin elegir nada en
  // el flujo web no agrega ninguna foto tampoco.
  async function capturarFotoNativa() {
    if (fotos.length >= MAX_FOTOS) return;
    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera, // fuerza la cámara -- nunca el selector de archivos/galería.
        direction: CameraDirection.Rear,
        saveToGallery: false,
      });
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      await agregarFotoBlob(blob);
    } catch (cause) {
      const message = String(cause?.message || cause || "");
      if (/cancel/i.test(message)) return; // el inspector cerró la cámara sin tomar foto -- no es un error.
      setError("No fue posible tomar la fotografía. Verifica el permiso de cámara en Ajustes de Android.");
    }
  }

  function quitarFoto(id) {
    setFotos((current) => {
      const foto = current.find((f) => f.id === id);
      if (foto) URL.revokeObjectURL(foto.previewUrl);
      return current.filter((f) => f.id !== id);
    });
  }

  const subirFoto = useCallback(async (inspectionId, foto) => {
    const body = new FormData();
    body.append("file", foto.file, `evidencia.${foto.file.type === "image/png" ? "png" : foto.file.type === "image/webp" ? "webp" : "jpg"}`);
    const response = await fetch(`/api/inspector/inspections/${inspectionId}/evidence`, {
      method: "POST",
      headers: { "x-parkfacil-portal": "inspector" },
      body,
    });
    if (!response.ok) {
      const respBody = await response.json().catch(() => ({}));
      throw new Error(respBody.error || "No fue posible subir la fotografía.");
    }
  }, []);

  async function reintentarFoto(inspectionId, foto) {
    try {
      await subirFoto(inspectionId, foto);
      setEvidenceErrors((current) => current.filter((e) => e.fotoId !== foto.id));
    } catch (cause) {
      setEvidenceErrors((current) => current.map((e) => (e.fotoId === foto.id ? { ...e, message: cause.message } : e)));
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!normalized || busy) return;
    if (!navigator.onLine) { setError("Sin conexión: no es posible registrar la fiscalización. Vuelve a intentar cuando tengas conexión."); return; }
    if (requiresPresenceConfirmation && !vehiclePresentConfirmed) { setError("Debes confirmar que el vehículo continúa estacionado antes de registrar."); return; }
    setBusy(true);
    setError("");
    try {
      const contextPayload = showLocationPicker ? contextToInspectionPayload(context) : { contextParkingId: null, contextQrLocationId: null };
      const response = await fetch("/api/inspector/inspections", {
        method: "POST",
        headers: { "content-type": "application/json", "x-parkfacil-portal": "inspector", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          plate: normalized,
          inspectionType,
          vehicleStillPresent: requiresPresenceConfirmation ? vehiclePresentConfirmed : true,
          observations: observaciones || null,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          ...contextPayload,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible registrar la fiscalización.");
      setRegistro(body.data);
      onRegistrado?.(body.data);

      // Evidencia (§42): se sube DESPUÉS de confirmado el registro. Un
      // fallo aquí no invalida la fiscalización ya creada -- se informa y
      // se ofrece reintentar solo la foto que falló.
      const errores = [];
      for (const foto of fotos) {
        try {
          await subirFoto(body.data.id, foto);
        } catch (cause) {
          errores.push({ fotoId: foto.id, message: cause.message });
        }
      }
      setEvidenceErrors(errores);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (registro) {
    // smsRequired (2026-09-03, "abrir detalle desde la lista"): esta
    // pantalla se reutiliza tanto justo después de registrar (donde
    // requiresPresenceConfirmation, derivado del FORMULARIO, coincide
    // exactamente con registro.smsRequired -- ver comentario del prop
    // existingRegistro) como al reabrir una fiscalización YA existente
    // (donde no hay formulario en absoluto, requiresPresenceConfirmation no
    // aplica). registro.smsRequired es la misma fuente de verdad real en
    // ambos casos (viene del servidor, nunca del cliente).
    const smsRequired = Boolean(registro.smsRequired);
    return (
      <div className="mx-auto grid w-full max-w-2xl place-items-center p-4 pb-8 text-center">
        <div className="mt-10 w-full rounded-3xl bg-white p-8 shadow-sm">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-black text-[#041E42]">Fiscalización registrada</h1>
          <p className="mt-2 text-slate-600">{smsRequired ? inspectorSmsStatusMessage(registro) : "Quedó registrada correctamente."}</p>

          {/* Estados separados (2026-09-03, "decouple printing + sms copy",
             §7): fiscalización/SMS conductor/copia inspector/impresión
             nunca se mezclan en un solo veredicto de éxito/fallo -- la
             impresión en particular nunca debe leerse como que "algo
             falló" solo por no estar disponible en este dispositivo (tono
             neutral, ver StatusRow). Solo aplica a OVERSTAY
             (requiresPresenceConfirmation): es el único tipo que dispara
             SMS/copia/multa de cortesía. */}
          {smsRequired ? (
            <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-left">
              <StatusRow label="Fiscalización" status={{ label: "Registrada", tone: "success" }} />
              <StatusRow label="SMS conductor" status={inspectorSmsShortStatus(registro)} />
              <StatusRow label="Copia inspector" status={inspectorCopySmsShortStatus(registro)} />
              <StatusRow label="Impresión" status={printSummary || { label: "Verificando…", tone: "neutral" }} />
            </div>
          ) : null}

          {evidenceErrors.length ? (
            <div className="mt-5 space-y-3 text-left">
              <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                La fiscalización quedó registrada, pero {evidenceErrors.length === 1 ? "una fotografía no pudo subirse" : "algunas fotografías no pudieron subirse"}. Puedes reintentar ahora.
              </p>
              {evidenceErrors.map((e) => {
                const foto = fotos.find((f) => f.id === e.fotoId);
                return (
                  <div key={e.fotoId} className="flex items-center gap-3 rounded-2xl border border-amber-200 p-3">
                    {foto ? <img src={foto.previewUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : null}
                    <div className="min-w-0 flex-1 break-words text-xs text-slate-600">{e.message}</div>
                    <button type="button" onClick={() => reintentarFoto(registro.id, foto)} className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">Reintentar</button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Multa de cortesía (Etapa 3 final, 2026-08-30): SOLO para
              fiscalizaciones OVERSTAY (exceso de tiempo = sesión VENCIDO)
              ya confirmadas por el servidor -- requiresPresenceConfirmation
              es exactamente esa condición (submit() bloquea el registro de
              un OVERSTAY sin confirmación de presencia, así que si
              "registro" existe con este flag en true, el servidor ya
              validó status==='VENCIDO' antes de aceptar el POST -- ver
              /api/inspector/inspections/route.js). La impresión es
              opcional y 100% local (ver CourtesyTicketPrint.js): nunca
              vuelve a tocar esta fiscalización. */}
          {smsRequired ? (
            <CourtesyTicketPrint plate={registro.plate || normalized} inspectedAt={registro.inspectedAt} inspectionId={registro.id} onStatusChange={setPrintSummary} />
          ) : null}

          <button onClick={onCancelar} className="mt-6 min-h-14 w-full rounded-2xl bg-[#3150D8] font-black text-white">VOLVER</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Nueva fiscalización</h1>
      {!online ? (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sin conexión: no podrás registrar la fiscalización hasta reconectarte.
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-bold text-[#041E42]" htmlFor="fiscalizacion-plate">Patente</label>
          {platePrefilled ? (
            <p id="fiscalizacion-plate" className="mt-2 text-3xl font-black tracking-widest text-[#041E42]">{normalized}</p>
          ) : (
            <input
              id="fiscalizacion-plate"
              value={plateInput}
              onChange={(event) => setPlateInput(event.target.value)}
              placeholder="ABC123"
              autoCapitalize="characters"
              className="mt-2 min-h-14 w-full rounded-2xl border-2 px-4 text-2xl font-black uppercase tracking-widest text-[#041E42]"
            />
          )}
        </div>

        {lockToOverstay ? (
          <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">Motivo: Exceso de tiempo (sesión vencida)</p>
        ) : (
          <label className="block text-sm font-bold text-[#041E42]">
            Motivo
            <select value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-2 min-h-14 w-full rounded-2xl border-2 px-4 text-base">
              {INSPECTOR_FISCALIZACION_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}

        {requiresPresenceConfirmation ? (
          <label className="flex items-start gap-3 rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
            <input type="checkbox" checked={vehiclePresentConfirmed} onChange={(event) => setVehiclePresentConfirmed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span className="text-sm font-bold text-rose-900">Confirme que el vehículo continúa estacionado en el lugar. Sin esta confirmación no se registra la fiscalización ni se envía el aviso SMS.</span>
          </label>
        ) : null}

        {showLocationPicker ? (
          <div>
            <p className="mb-2 text-sm font-bold text-[#041E42]">Ubicación de la fiscalización</p>
            <InspectorLocationPicker context={context} onChange={setContext} />
          </div>
        ) : null}

        <label className="block text-sm font-bold text-[#041E42]">
          Observaciones
          <textarea
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            rows={4}
            placeholder="Detalle lo observado en terreno…"
            className="mt-2 w-full rounded-2xl border-2 px-4 py-3 text-base"
          />
        </label>

        <div>
          <p className="text-sm font-bold text-[#041E42]">Fotografías (hasta {MAX_FOTOS})</p>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={agregarFoto} className="hidden" />
          <div className="mt-2 grid grid-cols-3 gap-3">
            {fotos.map((foto) => (
              <div key={foto.id} className="relative aspect-square overflow-hidden rounded-2xl border-2 border-slate-200">
                <img src={foto.previewUrl} alt="Evidencia" className="h-full w-full object-cover" />
                <button type="button" onClick={() => quitarFoto(foto.id)} aria-label="Quitar fotografía" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS ? (
              <button
                type="button"
                onClick={useNativeCamera ? capturarFotoNativa : () => fileInputRef.current?.click()}
                aria-label="Agregar fotografía"
                className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-slate-300 text-slate-400"
              >
                <CameraIcon className="h-7 w-7" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-slate-500">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          {coords ? `Ubicación GPS capturada${coords.accuracy != null ? ` (±${Math.round(coords.accuracy)} m)` : ""}.` : gpsError ? "Ubicación GPS no disponible (opcional, no impide registrar)." : "Obteniendo ubicación GPS…"}
        </p>

        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}

        <button disabled={!normalized || busy || !online || (requiresPresenceConfirmation && !vehiclePresentConfirmed)} className="min-h-16 w-full rounded-2xl bg-[#3150D8] text-lg font-black text-white disabled:opacity-50">
          {busy ? "REGISTRANDO…" : "REGISTRAR FISCALIZACIÓN"}
        </button>
        <button type="button" onClick={onCancelar} className="block w-full text-center text-sm font-bold text-slate-500">Cancelar</button>
      </form>
    </div>
  );
}
