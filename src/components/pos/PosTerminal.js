"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, RefreshCw } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";

function normalizePlateInput(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function formatEntryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "-", time: "-" };
  return {
    date: new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date),
    time: new Intl.DateTimeFormat("es-CL", { timeStyle: "short" }).format(date),
  };
}

function formatBridgeEntryDateTime(value) {
  const source = String(value ?? "");
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return { entryDate: `${day}-${month}-${year}`, entryTime: `${hour}:${minute}` };
  }

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return null;

  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  return { entryDate: `${day}-${month}-${year}`, entryTime: `${hour}:${minute}` };
}

function formatTicketPlate(value) {
  const normalized = normalizePlateInput(value);
  if (normalized.length === 6) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  }
  return String(value ?? "").toUpperCase();
}

function buildEntryPrintPayload(stay, parkingResponse) {
  if (!stay || !parkingResponse) return null;
  const normalizedDateTime = formatBridgeEntryDateTime(stay.entry_at);
  if (!normalizedDateTime) return null;

  const payload = {
    type: "ENTRY",
    companyName: String(parkingResponse?.company?.business_name || parkingResponse?.company_name || "").trim(),
    parkingName: String(parkingResponse?.name || "").trim(),
    operator: String(stay?.entry_operator_name || "").trim(),
    plate: formatTicketPlate(stay?.license_plate),
    entryDate: normalizedDateTime.entryDate,
    entryTime: normalizedDateTime.entryTime,
    ticketNumber: String(stay?.code || "").trim(),
    qrValue: String(stay?.qr_token || "").trim(),
  };

  if (!payload.companyName || !payload.parkingName || !payload.operator || !payload.ticketNumber || !payload.qrValue) {
    return null;
  }

  return payload;
}

function getNativePrinterBridge() {
  if (typeof window === "undefined") return null;
  const bridge = window?.ParkFacilDevice;
  if (!bridge || typeof bridge.print !== "function") return null;
  return bridge;
}

async function executeNativePrint(payload) {
  const bridge = getNativePrinterBridge();
  if (!bridge || !payload) return { attempted: false, ok: false };

  try {
    const raw = await bridge.print(JSON.stringify(payload));
    let response = raw;
    if (typeof raw === "string") {
      try {
        response = JSON.parse(raw);
      } catch {
        return {
          attempted: true,
          ok: false,
          code: "INVALID_BRIDGE_RESPONSE",
          message: `Respuesta no JSON: ${raw}`,
        };
      }
    }

    return {
      attempted: true,
      ok: Boolean(response?.ok),
      code: response?.code ? String(response.code) : "",
      message: response?.message ? String(response.message) : "",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      code: "PRINT_EXCEPTION",
      message: error instanceof Error ? error.message : String(error ?? "Error desconocido"),
    };
  }
}

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
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryPlate, setEntryPlate] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [entrySuccess, setEntrySuccess] = useState(null);
  const [entryPrintPayload, setEntryPrintPayload] = useState(null);
  const [entryPrintBusy, setEntryPrintBusy] = useState(false);
  const [entryPrintStatus, setEntryPrintStatus] = useState("");

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

  function openEntryForm() {
    setEntrySuccess(null);
    setEntryPrintPayload(null);
    setEntryPrintStatus("");
    setEntryError("");
    setEntryPlate("");
    setEntryOpen(true);
  }

  function closeEntryForm() {
    setEntryOpen(false);
    setEntryError("");
  }

  async function printLastEntryTicket(payload) {
    const printPayload = payload || entryPrintPayload;
    if (!printPayload) {
      setEntryPrintStatus("No hay un ticket disponible para reimpresión.");
      return;
    }

    const bridge = getNativePrinterBridge();
    if (!bridge) {
      setEntryPrintStatus("Impresión disponible solo desde el dispositivo POS.");
      return;
    }

    setEntryPrintBusy(true);
    setEntryPrintStatus("Imprimiendo...");

    try {
      const result = await executeNativePrint(printPayload);

      if (result.ok) {
        setEntryPrintStatus("Ticket impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setEntryPrintStatus([
          "Entrada registrada. No fue posible imprimir el ticket.",
          ...details,
        ].join("\n"));
      }
    } finally {
      setEntryPrintBusy(false);
    }
  }

  async function submitEntry(event) {
    event.preventDefault();
    const plate = normalizePlateInput(entryPlate);
    if (plate.length !== 6) {
      setEntryError("Ingresa una patente válida. Ejemplo: CXPY93.");
      return;
    }

    setEntrySubmitting(true);
    setEntryError("");

    try {
      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkfacil-portal": "terminal",
        },
        cache: "no-store",
        body: JSON.stringify({ action: "ENTRY", plate, source: "POS" }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setEntryError(payload?.error || "No fue posible registrar la entrada.");
        return;
      }

      const stay = payload?.data?.stay || null;
      const parkingResponse = payload?.data?.parking || parking;
      setEntrySuccess(stay ? { stay, parking: parkingResponse } : null);
      const printPayload = buildEntryPrintPayload(stay, parkingResponse);
      setEntryPrintPayload(printPayload);
      setEntryPlate("");
      setEntryOpen(false);
      setVehiclesInside((current) => current + 1);
      void loadTerminalState(true);
      if (printPayload) {
        await printLastEntryTicket(printPayload);
      } else {
        setEntryPrintStatus("Entrada registrada. No fue posible imprimir el ticket.");
      }
    } catch {
      setEntryError("Error de red al registrar la entrada.");
    } finally {
      setEntrySubmitting(false);
    }
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

            {entrySuccess ? (
              <article className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Entrada registrada</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Patente</p>
                    <p className="mt-1 text-lg font-black">{entrySuccess.stay?.license_plate || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ticket / operación</p>
                    <p className="mt-1 text-lg font-black">{entrySuccess.stay?.code || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Fecha</p>
                    <p className="mt-1 font-bold">{formatEntryDate(entrySuccess.stay?.entry_at).date}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Hora</p>
                    <p className="mt-1 font-bold">{formatEntryDate(entrySuccess.stay?.entry_at).time}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Estacionamiento</p>
                    <p className="mt-1 font-bold">{entrySuccess.parking?.name || parking?.name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Operador</p>
                    <p className="mt-1 font-bold">{entrySuccess.stay?.entry_operator_name || context?.email || "-"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Empresa</p>
                    <p className="mt-1 font-bold">{entrySuccess.parking?.company?.business_name || entrySuccess.parking?.company_name || "-"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">QR</p>
                    <p className="mt-1 break-all font-mono text-sm font-bold">{entrySuccess.stay?.qr_token || "-"}</p>
                  </div>
                </div>

                {entryPrintStatus ? (
                  <div className="mt-4 whitespace-pre-line rounded-2xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-800">
                    {entryPrintStatus}
                  </div>
                ) : null}

                {entryPrintPayload ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => void printLastEntryTicket(entryPrintPayload)}
                      disabled={entryPrintBusy}
                      className="rounded-2xl border border-emerald-400 bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-900 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {entryPrintBusy ? "Reimprimiendo..." : "REIMPRIMIR TICKET"}
                    </button>
                  </div>
                ) : null}
              </article>
            ) : null}

            {entryOpen ? (
              <form onSubmit={submitEntry} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Entrada</p>
                    <h2 className="mt-1 text-xl font-black text-slate-800">Registrar vehículo</h2>
                    <p className="mt-1 text-sm text-slate-600">Se usará el estacionamiento asignado a tu sesión.</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeEntryForm}
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white"
                  >
                    Cancelar
                  </button>
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">Patente</span>
                  <input
                    value={entryPlate}
                    onChange={(event) => setEntryPlate(event.target.value.toUpperCase())}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="CXPY93"
                    maxLength={12}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-2xl font-black tracking-[0.16em] text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-amber-500"
                  />
                </label>

                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Formato sugerido: CXPY93
                </p>

                {entryError ? (
                  <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                    {entryError}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="submit"
                    disabled={entrySubmitting}
                    className="rounded-2xl bg-amber-500 px-4 py-4 text-lg font-black text-slate-950 shadow-lg shadow-amber-200 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {entrySubmitting ? "Registrando..." : "Confirmar entrada"}
                  </button>
                  <button
                    type="button"
                    onClick={closeEntryForm}
                    disabled={entrySubmitting}
                    className="rounded-2xl border border-slate-300 px-4 py-4 text-lg font-black text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={openEntryForm}
                className="w-full rounded-3xl bg-amber-500 px-6 py-8 text-3xl font-black tracking-[0.16em] text-slate-950 shadow-xl shadow-amber-200 transition hover:bg-amber-400"
              >
                ENTRADA
              </button>
            )}

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