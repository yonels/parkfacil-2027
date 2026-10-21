"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Banner de instalación PWA para Inspector (2026-09-02, "PWA instalable"):
// no bloquea el login -- este componente solo se monta desde InspectorApp.js
// DESPUÉS de confirmar sesión (ver ese archivo), nunca en /inspector/login
// ni en la pantalla de "cargando"/"sesión inválida". No cachea ni lee
// ningún dato de fiscalización/patente -- solo estado de UI (visto/
// descartado) en localStorage, igual de sensible que un "no volver a
// mostrar este aviso" cualquiera.
const DISMISS_KEY = "parkfacil:inspector:install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  // display-mode:standalone cubre Android/Chrome/Edge; navigator.standalone
  // es el equivalente histórico de iOS Safari (no soporta display-mode).
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) || window.navigator?.standalone === true;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return undefined; // ya instalada -- nunca molestar.

    let alreadyDismissed = false;
    try {
      alreadyDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // localStorage no disponible (modo privado, etc.) -- se muestra igual,
      // simplemente no recordará el descarte entre sesiones.
    }
    if (alreadyDismissed) return undefined;

    function onBeforeInstallPrompt(event) {
      // Evita el mini-infobar nativo del navegador -- se ofrece el propio
      // botón, no invasivo, en su lugar (mismo criterio que el resto de
      // notificaciones/avisos de la plataforma).
      event.preventDefault();
      setDeferredPrompt(event);
      setDismissed(false);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // iOS/Safari nunca dispara beforeinstallprompt -- se ofrece la
    // instrucción manual en su lugar, en vez de no mostrar nada. setTimeout
    // (mismo patrón que InspectorApp.js/useReorderableColumns.js) evita
    // disparar setState de forma síncrona dentro del cuerpo del efecto.
    let iosTimer;
    if (isIos()) {
      iosTimer = window.setTimeout(() => {
        setShowIosHint(true);
        setDismissed(false);
      }, 0);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Sin persistencia disponible: se descarta solo para esta sesión.
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
    dismiss();
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] px-4 py-3 text-[#041E42] shadow-sm md:mx-6">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#041E42] text-white">
        <Download className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">Instalar ParkFacil Inspector</p>
        <p className="mt-0.5 text-xs leading-snug text-[#041E42]/70">
          {deferredPrompt
            ? "Acceso rápido desde tu pantalla de inicio, como una app."
            : "Toca Compartir y luego \"Agregar a inicio\" para instalarla."}
        </p>
      </div>
      {deferredPrompt ? (
        <button type="button" onClick={install} className="shrink-0 rounded-full bg-[#041E42] px-3 py-1.5 text-xs font-bold text-white">
          Instalar
        </button>
      ) : null}
      <button type="button" onClick={dismiss} aria-label="Cerrar aviso de instalación" className="shrink-0 rounded-full p-1.5 text-[#041E42]/60 hover:bg-white">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
