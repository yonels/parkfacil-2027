"use client";

import { useEffect, useRef, useState } from "react";

// Lector del QR del ticket de entrada (POS Salida por QR). Cámara trasera vía
// getUserMedia (mismas opciones que PlatePhotoCapture). Decodifica con
// BarcodeDetector cuando el navegador lo tiene y, si no (WebView 83 de la
// TUU PRO2), con jsQR — cargado solo al abrir el lector.
// Liviano para la TUU PRO2 (WebView 83): solo se analiza el recuadro central
// (donde se apunta el QR), reducido a SCAN_SIZE px, cada SCAN_INTERVAL_MS.
const SCAN_INTERVAL_MS = 400;
const SCAN_SIZE = 400;
const SCAN_REGION = 0.7;

const CAMERA_MESSAGES = {
  PERMISSION_DENIED: "Permiso de cámara denegado. Habilítalo en el equipo o escribe el código del ticket.",
  NOT_FOUND: "No se encontró una cámara trasera. Escribe el código del ticket.",
  UNAVAILABLE: "La cámara no está disponible en este equipo. Escribe el código del ticket.",
  FAILED: "No fue posible iniciar la cámara. Reintenta o escribe el código del ticket.",
};

export default function QrTicketScanner({ onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  const [cameraIssue, setCameraIssue] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let timer = null;
    let decoding = false;
    let detector = null;
    let jsQR = null;

    async function decodeFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled || decoding || !video || !canvas || video.readyState < 2 || !video.videoWidth) return;
      decoding = true;
      try {
        let value = null;
        if (detector) {
          const codes = await detector.detect(video);
          value = codes && codes[0] ? codes[0].rawValue : null;
        } else if (jsQR) {
          const side = Math.floor(Math.min(video.videoWidth, video.videoHeight) * SCAN_REGION);
          const size = Math.min(SCAN_SIZE, side);
          if (canvas.width !== size) {
            canvas.width = size;
            canvas.height = size;
          }
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
          const image = ctx.getImageData(0, 0, size, size);
          const code = jsQR(image.data, size, size, { inversionAttempts: "dontInvert" });
          value = code ? code.data : null;
        }
        if (value && !cancelled) {
          cancelled = true;
          window.clearInterval(timer);
          if (stream) stream.getTracks().forEach((track) => track.stop());
          onDetectedRef.current?.(value);
        }
      } catch {
        // Un cuadro que falla no detiene el lector: se reintenta en el siguiente.
      } finally {
        decoding = false;
      }
    }

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraIssue("UNAVAILABLE");
        return;
      }
      try {
        if (typeof window.BarcodeDetector === "function") {
          try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            if (formats.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          } catch {
            detector = null;
          }
        }
        if (!detector) {
          const jsqrModule = await import("jsqr");
          jsQR = jsqrModule.default || jsqrModule;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setReady(true);
        timer = window.setInterval(() => void decodeFrame(), SCAN_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        const name = error && error.name;
        if (name === "NotAllowedError" || name === "SecurityError") setCameraIssue("PERMISSION_DENIED");
        else if (name === "NotFoundError" || name === "OverconstrainedError") setCameraIssue("NOT_FOUND");
        else setCameraIssue("FAILED");
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (cameraIssue) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-white p-4 text-sm font-semibold text-amber-900">
        {CAMERA_MESSAGES[cameraIssue] || CAMERA_MESSAGES.FAILED}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="block h-auto w-full" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-48 w-48 rounded-2xl border-4 border-white/80" />
      </div>
      <p className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-2 text-center text-xs font-bold text-white">
        {ready ? "Apunta al QR del ticket de entrada" : "Iniciando cámara..."}
      </p>
    </div>
  );
}
