"use client";

import { useEffect, useRef, useState } from "react";

// Captura de fotografía de patente para ENTRY (Off Street, Fase 6). Cámara
// en vivo vía getUserMedia con guía rectangular de encuadre — esto SÍ
// permite dibujar la guía sobre la imagen (a diferencia de abrir la cámara
// nativa del sistema operativo, que ocupa toda la pantalla y no admite
// overlays propios). Si el navegador/dispositivo no ofrece getUserMedia
// (o el usuario niega el permiso), cae a <input type="file" capture>, que
// sigue abriendo la cámara del dispositivo pero sin guía superpuesta -- es
// una limitación real del mecanismo nativo, no simulada.
//
// Salida: siempre una imagen ya reorientada, redimensionada y comprimida a
// JPEG (§5 del encargo) -- nunca el archivo/frame original de varios MB.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;
const TARGET_MAX_BYTES = 300 * 1024;

function drawToCanvas(source, sw, sh) {
  let width = sw;
  let height = sh;
  if (width > height && width > MAX_DIMENSION) {
    height = Math.round((height * MAX_DIMENSION) / width);
    width = MAX_DIMENSION;
  } else if (height >= width && height > MAX_DIMENSION) {
    width = Math.round((width * MAX_DIMENSION) / height);
    height = MAX_DIMENSION;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  // drawImage a un tamaño distinto ya reorienta correctamente en navegadores
  // modernos (respetan EXIF orientation al decodificar <video>/<img>/
  // ImageBitmap) y, al recodificar como JPEG plano, se descarta el resto de
  // metadata EXIF (GPS incluido, §11 del encargo) sin tratamiento aparte.
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

// Comprime iterando calidad hacia abajo si el resultado supera el objetivo
// (~100-300 KB, §5) -- solo hasta un piso razonable, nunca degrada al punto
// de volver la patente ilegible.
async function canvasToCompressedBlob(canvas) {
  let quality = JPEG_QUALITY;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return null;
    if (blob.size <= TARGET_MAX_BYTES || quality <= 0.4) return blob;
    quality -= 0.12;
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

export default function PlatePhotoCapture({ plate, required, onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [mode, setMode] = useState("LOADING"); // LOADING | LIVE | PREVIEW | FALLBACK | ERROR
  const [preview, setPreview] = useState(null); // { url, blob }
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setMode("LIVE");
      } catch {
        // Permiso denegado o sin cámara utilizable: fallback al selector de
        // archivo nativo (sigue permitiendo tomar la foto en móviles).
        if (!cancelled) setMode("FALLBACK");
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setError("");
    try {
      const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight);
      const blob = await canvasToCompressedBlob(canvas);
      if (!blob) {
        setError("No fue posible procesar la fotografía. Intenta nuevamente.");
        return;
      }
      setPreview({ url: URL.createObjectURL(blob), blob });
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
      const canvas = drawToCanvas(bitmap, width, height);
      const blob = await canvasToCompressedBlob(canvas);
      if (!blob) {
        setError("No fue posible procesar la fotografía. Intenta nuevamente.");
        return;
      }
      setPreview({ url: URL.createObjectURL(blob), blob });
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

  async function usePhoto() {
    if (!preview?.blob) return;
    const base64 = await blobToBase64(preview.blob);
    stopStream();
    onCapture({ base64, mimeType: "image/jpeg", sizeBytes: preview.blob.size, previewUrl: preview.url });
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
              <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
              {/* Guía visual de encuadre (§4 del encargo): un recuadro fijo
                  centrado para orientar al operador -- no recorta la
                  imagen, solo ayuda a apuntar la cámara a la placa. */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-8">
                <div className="h-1/3 w-4/5 rounded-lg border-4 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-slate-500">Encuadra la patente dentro del recuadro</p>
            <button type="button" onClick={capture} className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-lg font-black text-white hover:bg-emerald-500">
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
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={usePhoto} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500">
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
