"use client";
import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

// Indicador En línea / Sin conexión (Etapa 1, sección 18): detecta
// navigator.onLine y sus eventos -- todavía NO implementa sincronización
// offline real, solo deja la señal arquitectónica lista (ver también
// InspectorSync.js) para que una futura cola de reintentos pueda
// engancharse aquí sin rediseñar la UI.
export default function ConnectivityIndicator({ className = "" }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Mismo patrón que useReorderableColumns.js para leer estado externo al
    // montar sin disparar un setState síncrono dentro del cuerpo del efecto.
    const timer = window.setTimeout(() => setOnline(navigator.onLine), 0);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${online ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/20 text-rose-200"} ${className}`} role="status">
      {online ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
      {online ? "En línea" : "Sin conexión"}
    </span>
  );
}
