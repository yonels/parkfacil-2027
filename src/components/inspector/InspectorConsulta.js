"use client";
import { useState } from "react";
import { Camera, Search } from "lucide-react";
import { normalizeInspectorPlate } from "@/lib/inspector/inspectorMocks.mjs";
import { relativeTimeFromNow } from "@/lib/inspector/inspectorTime.mjs";
import InspectorStatusBadge from "./InspectorStatusBadge";

// Pantalla principal (Etapa 1, sección 7 y 10): consulta de patente +
// Últimas consultas. La cámara es solo un botón preparado visualmente --
// sin OCR real todavía (sección 7) -- por eso abre un aviso en vez de
// intentar capturar algo.
export default function InspectorConsulta({ history, onConsult, onOpenPast, error }) {
  const [plateInput, setPlateInput] = useState("");
  const [cameraNotice, setCameraNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const normalized = normalizeInspectorPlate(plateInput);

  async function submit(event) {
    event.preventDefault();
    if (!normalized || busy) return;
    setBusy(true);
    try {
      await onConsult(normalized);
      setPlateInput("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Consulta de patente</h1>

      <form onSubmit={submit} className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
        <label className="block text-sm font-bold text-[#041E42]" htmlFor="inspector-plate-input">
          PATENTE
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="inspector-plate-input"
            value={plateInput}
            onChange={(event) => setPlateInput(event.target.value)}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            aria-label="Patente a consultar"
            className="min-h-16 min-w-0 flex-1 rounded-2xl border-2 px-4 text-2xl font-black uppercase tracking-widest text-[#041E42]"
          />
          <button
            type="button"
            onClick={() => setCameraNotice(true)}
            aria-label="Escanear patente con la cámara (disponible en una próxima etapa)"
            className="grid min-h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 border-[#3150D8] text-[#3150D8]"
          >
            <Camera className="h-7 w-7" aria-hidden="true" />
          </button>
        </div>
        {cameraNotice ? <p className="mt-2 text-xs font-bold text-[#3150D8]">La lectura automática por cámara estará disponible en una próxima etapa. Por ahora, ingresa la patente manualmente.</p> : null}
        {error ? <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}

        <button disabled={!normalized || busy} className="mt-4 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#3150D8] text-lg font-black text-white disabled:opacity-50">
          <Search className="h-5 w-5" aria-hidden="true" />
          {busy ? "CONSULTANDO…" : "CONSULTAR"}
        </button>
      </form>

      <section className="mt-6">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Últimas consultas</h2>
        {history.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">Aún no hay consultas en esta sesión.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((entry, index) => (
              <li key={`${entry.plate}-${entry.at}-${index}`}>
                <button
                  onClick={() => onOpenPast(entry.plate)}
                  className="flex min-h-16 w-full items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
                >
                  <span className="min-w-0 flex-1 truncate font-black tracking-wide text-[#041E42]">{entry.plate}</span>
                  <InspectorStatusBadge status={entry.status} className="shrink-0" />
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{relativeTimeFromNow(entry.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
