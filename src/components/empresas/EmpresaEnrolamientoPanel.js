"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Mail, TriangleAlert } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import EmpresaEnrolamientoResendButton from "./EmpresaEnrolamientoResendButton";

// Estado de enrolamiento en la ficha de la empresa (§12 del encargo "cierre
// de reenvío de enrolamiento"): pendiente/enviado/error/reenviado. Reutiliza
// GET /api/empresas/[id]/enrolamiento -- ningún estado nuevo en BD, se
// deriva de company_enrollment_notifications tal como ya existía.
const STATUS_META = {
  pendiente: { label: "Pendiente de envío", tone: "border-slate-200 bg-slate-50 text-slate-600", Icon: Clock },
  enviado: { label: "Enviado", tone: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
  reenviado: { label: "Reenviado", tone: "border-blue-200 bg-blue-50 text-blue-800", Icon: Mail },
  error: { label: "Error de envío", tone: "border-amber-200 bg-amber-50 text-amber-900", Icon: TriangleAlert },
};

export default function EmpresaEnrolamientoPanel({ companyId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await authenticatedFetch(`/api/empresas/${companyId}/enrolamiento`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible obtener el estado del enrolamiento.");
      setState({ loading: false, error: "", data: body.data });
    } catch (error) {
      setState({ loading: false, error: error.message, data: null });
    }
  }

  useEffect(() => {
    // Mismo patrón que InspectorSmsReport.js/InspectorFiscalizacion.js: un
    // setTimeout(...,0) evita un setState síncrono dentro del cuerpo del
    // efecto (regla react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => { load(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const meta = state.data ? STATUS_META[state.data.status] || STATUS_META.pendiente : null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-[#041E42]">Enrolamiento</h3>
      <p className="mt-2 text-sm text-slate-600">Estado del correo con las credenciales de las cuentas iniciales (administrador y operadores), enviado al correo de contacto de la empresa.</p>

      {state.loading ? <p className="mt-4 text-sm text-slate-500">Consultando estado…</p> : null}
      {state.error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{state.error}</p> : null}

      {meta ? (
        <div className={`mt-4 flex items-center gap-3 rounded-2xl border p-4 ${meta.tone}`}>
          <meta.Icon className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">{meta.label}</p>
            {state.data.latest?.destinatario ? <p>Destinatario: {state.data.latest.destinatario}</p> : null}
            {state.data.latest?.estado === "failed" && state.data.latest?.error_mensaje ? <p className="mt-1">{state.data.latest.error_mensaje}</p> : null}
            <p className="mt-1 text-xs opacity-80">{state.data.attempts} {state.data.attempts === 1 ? "intento" : "intentos"} registrados.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <EmpresaEnrolamientoResendButton
          companyId={companyId}
          onResult={load}
          className="inline-flex items-center gap-2 rounded-xl border border-[#3150D8] bg-white px-3 py-2 text-sm font-bold text-[#3150D8] disabled:opacity-60"
        />
      </div>
    </section>
  );
}
