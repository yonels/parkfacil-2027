"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import ConnectivityIndicator from "./ConnectivityIndicator";

// Sincronización (Etapa 1, sección 18): sin sincronización offline real
// todavía -- deja la pantalla y el punto de enganche arquitectónico listos
// (un botón manual que simula una corrida) para que una cola de reintentos
// real se conecte aquí después, sin rediseñar la UI.
export default function InspectorSync() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(() => new Date().toISOString());

  function sync() {
    setSyncing(true);
    window.setTimeout(() => {
      setLastSync(new Date().toISOString());
      setSyncing(false);
    }, 900);
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Sincronización</h1>

      <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#041E42]">Estado</span>
          <ConnectivityIndicator className="!bg-transparent !text-[#041E42]" />
        </div>
        <p className="mt-3 text-sm text-slate-500">Última sincronización: {new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium" }).format(new Date(lastSync))}</p>
        <p className="mt-2 text-xs text-slate-400">Esta etapa no sincroniza datos reales todavía; la cola offline se implementará en una próxima etapa.</p>
        <button onClick={sync} disabled={syncing} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#3150D8] font-black text-white disabled:opacity-60">
          <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing ? "SINCRONIZANDO…" : "SINCRONIZAR AHORA"}
        </button>
      </div>
    </div>
  );
}
