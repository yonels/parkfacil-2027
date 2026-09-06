"use client";

import { useEffect, useRef, useState } from "react";

import { computePlateCropOutputSize, computePlateFrameRect } from "@/lib/offStreet/platePhotoFrame.mjs";
import { averageLuminance, isLowLight } from "@/lib/offStreet/platePhotoLowLight.mjs";
import { gpsRequirementMessage } from "@/lib/offStreet/offStreetPlatePhoto.mjs";

// Captura de fotografía de patente para ENTRY (Off Street, Fase 6). Cámara
// en vivo vía getUserMedia con guía rectangular de encuadre -- esto SÍ
// permite dibujar la guía sobre la imagen (a diferencia de abrir la cámara
// nativa del sistema operativo, que ocupa toda la pantalla y no admite
// overlays propios). Si el navegador/dispositivo no ofrece getUserMedia
// (o el usuario niega el permiso), cae a <input type="file" capture">, que
// sigue abriendo la cámara del dispositivo pero sin guía superpuesta -- es
// una limitación real del mecanismo nativo, no simulada.
//
// Salida: SOLO el recorte del marco (patente chilena estándar 360x130mm +
// 10% de holgura, ~2,77:1 -- ver platePhotoFrame.mjs), ya reorientado y
// comprimido a JPEG -- nunca la foto completa del vehículo, y nunca el
// frame/archivo original de varios MB. Una única imagen: la misma que se
// guarda como evidencia y la misma que se usa para imprimir (Fase 6B) --
// no existe una segunda captura ni un segundo recorte en ningún punto del
// flujo (POS-2027, PosTerminal.js reutiliza tal cual entryPhoto.base64).
const PLATE_CROP_MAX_WIDTH_PX = 900;
const JPEG_QUALITY = 0.82;
const TARGET_MAX_BYTES = 300 * 1024;
const LOW_LIGHT_SAMPLE_MS = 800;

// Sin object-fit/cover en el <video> (ver JSX abajo, className solo
// "w-full h-auto"): así se muestra siempre en su proporción NATIVA, sin
// recorte/escalado propios del navegador. Esto es deliberado -- es lo que
// permite calcular el marco directamente en píxeles NATIVOS
// (video.videoWidth/videoHeight) con la MISMA fórmula proporcional que
// posiciona la guía en pantalla (computePlateFrameRect), sin tener que
// reproducir la matemática de "object-cover" (escala + offset de recorte)
// para volver de coordenadas CSS a coordenadas de imagen. devicePixelRatio
// tampoco entra en juego: videoWidth/videoHeight son la resolución nativa
// del stream de la cámara, no depende de la densidad de píxeles de la
// pantalla. Tampoco hay espejado (mirror): es la cámara trasera
// (facingMode: "environment"), nunca se le aplica transform de espejo en
// este componente -- lo que la cámara entrega es exactamente lo que se
// recorta.
function drawPlateCrop(source, sourceWidth, sourceHeight) {
  const frame = computePlateFrameRect(sourceWidth, sourceHeight);
  if (!frame) return null;

  const outSize = computePlateCropOutputSize(frame, PLATE_CROP_MAX_WIDTH_PX);
  if (!outSize || outSize.width <= 0 || outSize.height <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = outSize.width;
  canvas.height = outSize.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, outSize.width, outSize.height);
  return canvas;
}

// Comprime iterando calidad hacia abajo si el resultado supera el objetivo
// (~100-300 KB) -- solo hasta un piso razonable, nunca degrada al punto de
// volver la patente ilegible. Calidad inicial más alta que en la foto
// completa histórica: el recorte ya es mucho más pequeño en píxeles
// (patente, no el vehículo entero), así que mantener nitidez de caracteres
// cuesta poco tamaño de archivo extra.
async function canvasToCompressedBlob(canvas) {
  let quality = JPEG_QUALITY;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return null;
    if (blob.size <= TARGET_MAX_BYTES || quality <= 0.5) return blob;
    quality -= 0.1;
  }
  return null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Bridge nativo del POS (ver src/components/pos/PosTerminal.js) -- se
// reutiliza tal cual, nunca se crea un segundo bridge. hasFlash()/
// setTorch() son un fallback opcional para cuando el WebView no expone
// torch vía MediaTrackConstraints (ver detectTorchSupport): si no existen
// en este bridge (versión de la app aún sin el método, o navegador de
// escritorio sin window.ParkFacilDevice), el control de flash simplemente
// no aparece -- nunca rompe la captura.
function getNativeDeviceBridge() {
  if (typeof window === "undefined") return null;
  return window.ParkFacilDevice || null;
}

async function parseBridgeJson(raw) {
  const value = await raw;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function detectNativeFlash() {
  const bridge = getNativeDeviceBridge();
  if (!bridge || typeof bridge.hasFlash !== "function") return false;
  try {
    const result = await parseBridgeJson(bridge.hasFlash());
    return Boolean(result?.hasFlash);
  } catch {
    return false;
  }
}

async function setNativeTorch(enabled) {
  const bridge = getNativeDeviceBridge();
  if (!bridge || typeof bridge.setTorch !== "function") return false;
  try {
    const result = await parseBridgeJson(bridge.setTorch(enabled));
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}

// Ajuste final, §18/§19: GPS configurable por proyecto (DISABLED/OPTIONAL/
// REQUIRED, mismo enum que gpsMode). Una sola lectura (getCurrentPosition,
// no watchPosition -- no hace falta seguimiento continuo para una foto
// puntual), nunca inventa una coordenada cuando no está disponible.
function requestGpsPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

export default function PlatePhotoCapture({ plate, required, gpsMode = "DISABLED", onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const webTorchSupportedRef = useRef(false);
  const torchOnRef = useRef(false);
  const [mode, setMode] = useState("LOADING"); // LOADING | LIVE | PREVIEW | FALLBACK | ERROR
  const [preview, setPreview] = useState(null); // { url, blob }
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Flash/torch (§7-§13 del encargo): torch CONTINUO antes de capturar
  // (nunca un destello único al momento de la foto) -- el operador lo
  // enciende, ve la patente ya iluminada en la vista previa, y recién ahí
  // captura. torchAvailable solo se activa tras detección real (web o
  // nativa) -- nunca se asume soporte.
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchError, setTorchError] = useState("");
  const [lowLightWarning, setLowLightWarning] = useState(false);

  // GPS (§18/§19): nunca se solicita si gpsMode es DISABLED (ni siquiera el
  // permiso del navegador). "IDLE" = no aplica; "LOADING"/"READY"/"ERROR"
  // reflejan el intento real -- gpsData se lee en vivo al confirmar "Usar
  // foto" (nunca queda congelado desde el instante de "Capturar": si la
  // ubicación termina de resolverse mientras el operador revisa la vista
  // previa, igual se usa).
  // Estado inicial vía inicializador perezoso (no un setState síncrono
  // dentro del efecto de abajo, que solo debe reaccionar al resultado
  // async -- ver retryGps para el mismo criterio en el reintento manual):
  // si GPS aplica, arranca directamente en "LOADING" desde el primer
  // render, sin un paso intermedio en "IDLE" que nunca se vería.
  const [gpsStatus, setGpsStatus] = useState(() => (gpsMode === "DISABLED" ? "IDLE" : "LOADING"));
  const [gpsData, setGpsData] = useState(null);
  const [gpsRetryToken, setGpsRetryToken] = useState(0);

  useEffect(() => {
    // gpsMode DISABLED: ni siquiera se solicita el permiso de ubicación
    // (§18). gpsMode no cambia durante la vida de este diálogo (viene fijo
    // de la configuración ya cargada por PosTerminal.js).
    if (gpsMode === "DISABLED") return undefined;
    let cancelled = false;
    requestGpsPosition().then((result) => {
      if (cancelled) return;
      if (result) {
        setGpsData(result);
        setGpsStatus("READY");
      } else {
        setGpsStatus("ERROR");
      }
    });
    return () => { cancelled = true; };
  }, [gpsMode, gpsRetryToken]);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setMode("FALLBACK");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] || null;
        trackRef.current = track;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setMode("LIVE");
        await detectTorchSupport(track);
      } catch {
        // Permiso denegado o sin cámara utilizable: fallback al selector de
        // archivo nativo (sigue permitiendo tomar la foto en móviles).
        if (!cancelled) setMode("FALLBACK");
      }
    }

    // §7/§8: detección REAL, nunca asumida. Primero el mecanismo estándar
    // del navegador (MediaStreamTrack.getCapabilities().torch -- soportado
    // en Chromium/Android WebView cuando el hardware tiene flash trasero);
    // solo si eso no está disponible se prueba el fallback nativo opcional
    // del bridge del POS. Si ninguno responde, el control simplemente no
    // se muestra -- nunca rompe la captura (§8/§11).
    async function detectTorchSupport(track) {
      let webSupported = false;
      try {
        const capabilities = track?.getCapabilities?.();
        webSupported = Boolean(capabilities && "torch" in capabilities && capabilities.torch !== false);
      } catch {
        webSupported = false;
      }
      webTorchSupportedRef.current = webSupported;
      if (cancelled) return;
      if (webSupported) {
        setTorchAvailable(true);
        return;
      }
      const nativeAvailable = await detectNativeFlash();
      if (!cancelled) setTorchAvailable(nativeAvailable);
    }

    void startCamera();
    return () => {
      cancelled = true;
      void turnOffTorch();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // §10: estimación simple de luminancia (promedio de luma sobre una
  // muestra minúscula, downscaleada -- nada de visión artificial) mientras
  // la cámara está en vivo. Se detiene apenas se sale de LIVE (capturado,
  // cancelado, o cayó a FALLBACK).
  useEffect(() => {
    // El aviso solo se renderiza dentro del bloque LIVE del JSX (ver más
    // abajo) -- no hace falta resetear el estado al salir de LIVE, ya
    // queda oculto igual; si se vuelve a LIVE (p.ej. "Tomar nuevamente"),
    // el propio muestreo de abajo lo recalcula dentro de LOW_LIGHT_SAMPLE_MS.
    if (mode !== "LIVE") return undefined;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 32;
    sampleCanvas.height = 24;
    const ctx = sampleCanvas.getContext("2d");
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !ctx) return;
      try {
        ctx.drawImage(video, 0, 0, 32, 24);
        const { data } = ctx.getImageData(0, 0, 32, 24);
        setLowLightWarning(isLowLight(averageLuminance(data)));
      } catch {
        // getImageData puede fallar en algún entorno -- nunca debe romper
        // la captura, solo se deja de mostrar el aviso.
      }
    }, LOW_LIGHT_SAMPLE_MS);
    return () => clearInterval(interval);
  }, [mode]);

  // §13: apaga el torch en cualquier salida (cierre normal, cancelación,
  // error, desmonte) -- nunca debe quedar encendido por accidente. Prueba
  // primero el mismo camino que se usó para encenderlo (web vs. nativo);
  // "best effort" -- un fallo acá nunca bloquea el cierre de la cámara.
  async function turnOffTorch() {
    if (!torchOnRef.current) return;
    try {
      if (webTorchSupportedRef.current && trackRef.current) {
        await trackRef.current.applyConstraints({ advanced: [{ torch: false }] });
      } else {
        await setNativeTorch(false);
      }
    } catch {
      // Ver nota de la función.
    }
    torchOnRef.current = false;
    setTorchOn(false);
  }

  async function toggleTorch() {
    const next = !torchOn;
    setTorchError("");
    try {
      if (webTorchSupportedRef.current && trackRef.current) {
        await trackRef.current.applyConstraints({ advanced: [{ torch: next }] });
        torchOnRef.current = next;
        setTorchOn(next);
        return;
      }
      const ok = await setNativeTorch(next);
      if (ok) {
        torchOnRef.current = next;
        setTorchOn(next);
        return;
      }
    } catch {
      // Cae al mensaje de abajo -- §11: nunca aborta la captura.
    }
    setTorchError("No fue posible activar el flash. Mejore la iluminación o acerque el dispositivo.");
  }

  function stopStream() {
    void turnOffTorch();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setError("");
    try {
      const canvas = drawPlateCrop(video, video.videoWidth, video.videoHeight);
      if (!canvas) {
        setError("No fue posible procesar la fotografía. Intenta nuevamente.");
        return;
      }
      const blob = await canvasToCompressedBlob(canvas);
      if (!blob) {
        setError("No fue posible procesar la fotografía. Intenta nuevamente.");
        return;
      }
      // capturedAt (§17): el instante REAL del disparo -- nunca el de
      // impresión/consulta/reimpresión, que ocurren después.
      setPreview({ url: URL.createObjectURL(blob), blob, capturedAt: new Date().toISOString() });
      setMode("PREVIEW");
    } catch {
      setError("No fue posible tomar la fotografía. Intenta nuevamente.");
    }
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const bitmap = await createImageBitmap(file).catch(async () => {
        // Safari/iOS antiguos sin createImageBitmap: fallback vía <img>.
        // Ambos caminos ya reorientan según EXIF al decodificar (mismo
        // comportamiento que antes de este cambio) -- el ancho/alto que se
        // usa para el recorte es siempre el YA reorientado.
        const url = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        return img;
      });
      const width = bitmap.width || bitmap.naturalWidth;
      const height = bitmap.height || bitmap.naturalHeight;
      const canvas = drawPlateCrop(bitmap, width, height);
      if (!canvas) {
        setError("No fue posible procesar la fotografía. Intenta nuevamente.");
        return;
      }
      const blob = await canvasToCompressedBlob(canvas);
      if (!blob) {
        setError("No fue posible procesar la fotografía. Intenta nuevamente.");
        return;
      }
      setPreview({ url: URL.createObjectURL(blob), blob, capturedAt: new Date().toISOString() });
      setMode("PREVIEW");
    } catch {
      setError("No fue posible procesar la fotografía seleccionada.");
    }
  }

  function retake() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setError("");
    setMode(streamRef.current ? "LIVE" : "FALLBACK");
  }

  function retryGps() {
    // setState directo aquí es un manejador de clic normal, no el cuerpo de
    // un efecto -- válido mostrar "Obteniendo ubicación…" de inmediato.
    setGpsStatus("LOADING");
    setGpsRetryToken((current) => current + 1);
  }

  // §19: GPS REQUIRED nunca completa la evidencia sin una posición válida
  // -- se bloquea "Usar foto" (nunca la fotografía en sí, que ya se tomó)
  // hasta tener una lectura real. OPTIONAL/DISABLED nunca bloquean.
  const gpsBlocksConfirm = gpsMode === "REQUIRED" && gpsStatus !== "READY";

  async function usePhoto() {
    if (!preview?.blob || gpsBlocksConfirm) return;
    const base64 = await blobToBase64(preview.blob);
    stopStream();
    onCapture({
      base64,
      mimeType: "image/jpeg",
      sizeBytes: preview.blob.size,
      previewUrl: preview.url,
      capturedAt: preview.capturedAt,
      latitude: gpsData?.latitude ?? null,
      longitude: gpsData?.longitude ?? null,
      gpsAccuracyM: gpsData?.accuracy ?? null,
    });
  }

  function cancel() {
    stopStream();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    onCancel();
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Fotografía de patente</p>
            <h2 className="mt-1 text-lg font-black text-slate-800">{plate || "Patente"}</h2>
          </div>
          <button type="button" onClick={cancel} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Cerrar
          </button>
        </div>

        {required ? (
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-rose-600">Obligatoria para continuar</p>
        ) : (
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Opcional</p>
        )}

        {error ? <div className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div> : null}

        {mode === "LOADING" ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Activando cámara…</div> : null}

        {mode === "LIVE" ? (
          <div className="mt-4">
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="block w-full h-auto" />

              {/* Marco de encuadre: proporción FIJA 2,77:1 (patente chilena
                  360x130mm + 10% de holgura = 396x143mm) -- misma razón
                  exacta usada para el recorte real al capturar (ver
                  drawPlateCrop/computePlateFrameRect arriba). 88% del ancho
                  del video, centrado: el propio tamaño del marco (más
                  grande que la patente real) YA es el margen visual
                  uniforme alrededor de la patente pedido en el encargo. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className="w-[88%] rounded-lg border-4 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                  style={{ aspectRatio: "396 / 143" }}
                />
              </div>

              {torchAvailable ? (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  aria-pressed={torchOn}
                  className={`absolute right-3 top-3 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide shadow ${
                    torchOn ? "bg-amber-400 text-amber-950" : "bg-white/90 text-slate-700"
                  }`}
                >
                  Flash {torchOn ? "ON" : "OFF"}
                </button>
              ) : null}
            </div>

            <p className="mt-2 text-center text-xs font-semibold text-slate-500">Ubique la patente completamente dentro del recuadro</p>

            {lowLightWarning ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-800">
                Poca iluminación detectada. Active el flash.
              </p>
            ) : null}
            {torchError ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-800">{torchError}</p> : null}

            <button type="button" onClick={() => void capture()} className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-lg font-black text-white hover:bg-emerald-500">
              Capturar
            </button>
          </div>
        ) : null}

        {mode === "FALLBACK" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-600">
              No fue posible activar la cámara del navegador. Usa el botón para tomar la fotografía con la cámara del dispositivo.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-lg font-black text-white hover:bg-emerald-500">
              Tomar fotografía
            </button>
          </div>
        ) : null}

        {mode === "PREVIEW" && preview ? (
          <div className="mt-4">
            <img src={preview.url} alt={`Fotografía de la patente ${plate || ""}`} className="w-full rounded-2xl border border-slate-200 object-cover" />

            {gpsMode === "REQUIRED" && gpsStatus === "LOADING" ? (
              <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-600">Obteniendo ubicación…</p>
            ) : null}
            {gpsMode === "REQUIRED" && gpsStatus === "ERROR" ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                <p className="text-xs font-bold text-rose-700">{gpsRequirementMessage("REQUIRED")}</p>
                <button type="button" onClick={retryGps} className="mt-2 rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100">
                  Reintentar ubicación
                </button>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={usePhoto} disabled={gpsBlocksConfirm} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                Usar foto
              </button>
              <button type="button" onClick={retake} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                Tomar nuevamente
              </button>
            </div>
          </div>
        ) : null}

        {!required && mode !== "PREVIEW" ? (
          <button type="button" onClick={cancel} className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Continuar sin fotografía
          </button>
        ) : null}
      </div>
    </div>
  );
}
