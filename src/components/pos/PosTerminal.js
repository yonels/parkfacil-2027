"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, RefreshCw } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";

async function getSessionContext() {
  const response = await fetch("/api/auth/session", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, payload: {} };
  const payload = await response.json().catch(() => ({}));
  return { ok: true, status: response.status, payload };
}

async function getDataEntrySummary() {
  const response = await fetch("/api/data-entry", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

export default function PosTerminal() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);
  const [parking, setParking] = useState(null);
  const [vehiclesInside, setVehiclesInside] = useState(0);

  const loadTerminalState = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const session = await getSessionContext();
      if (!session.ok) {
        if (session.status === 401) {
          router.replace("/pos/login?next=/pos");
          return;
        }
        setError("No fue posible validar la sesión del terminal.");
        return;
      }

      const summary = await getDataEntrySummary();
      if (!summary.ok) {
        if (summary.status === 401) {
          router.replace("/pos/login?next=/pos");
          return;
        }
        if (summary.status === 403) {
          setError(summary.payload?.error || "Tu cuenta no tiene permisos operativos POS.");
          return;
        }
        setError(summary.payload?.error || "No fue posible cargar el estacionamiento asignado.");
        return;
      }

      setContext(session.payload?.data || null);
      setParking(summary.payload?.data?.parking || null);
      setVehiclesInside(Array.isArray(summary.payload?.data?.stays) ? summary.payload.data.stays.length : 0);
    } catch {
      setError("Error de red al cargar el terminal POS.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    router.replace("/pos/login");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTerminalState(false);
  }, [loadTerminalState]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-300 bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">ParkFacil POS</p>
            <h1 className="mt-2 text-2xl font-black text-slate-800">Terminal operativo</h1>
            <p className="mt-1 text-sm text-slate-600">Estado del operador y estacionamiento asignado.</p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </header>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Cargando terminal POS...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Operador</p>
                <p className="mt-1 break-all text-sm font-bold text-slate-800">{context?.email || "-"}</p>
                <p className="text-xs text-slate-600">Rol: {context?.role || "-"}</p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estacionamiento activo</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{parking?.name || "Sin asignación"}</p>
                <p className="text-xs text-slate-600">Código: {parking?.code || "-"}</p>
              </article>
            </div>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Vehículos dentro</p>
              <p className="mt-1 text-2xl font-black text-slate-800">{vehiclesInside}</p>
            </article>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void loadTerminalState(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          ParkFacil POS · Versión {POS_FRONTEND_VERSION}
        </p>
      </section>
    </main>
  );
}