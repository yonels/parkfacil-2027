"use client";

import { useEffect } from "react";

function announceWaitingWorker(worker) {
  window.dispatchEvent(
    new CustomEvent("parkfacil:pwa-update-ready", { detail: { worker } }),
  );
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    let disposed = false;
    let refreshing = false;
    let registration;

    function inspectWorker(candidate) {
      if (!candidate) return;
      candidate.addEventListener("statechange", () => {
        if (!disposed && candidate.state === "installed" && navigator.serviceWorker.controller) {
          announceWaitingWorker(candidate);
        }
      });
    }

    function onControllerChange() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((current) => {
        if (disposed) return;
        registration = current;
        if (current.waiting && navigator.serviceWorker.controller) announceWaitingWorker(current.waiting);
        current.addEventListener("updatefound", () => inspectWorker(current.installing));
      })
      .catch(() => {
        // La operación web continúa aunque el navegador no permita instalar PWA.
      });

    const interval = window.setInterval(() => registration?.update(), 60_000);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") registration?.update();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
