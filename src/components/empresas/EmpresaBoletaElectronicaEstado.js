"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { DTE_ENVIRONMENT_LABELS, DTE_STATUS_LABELS } from "@/lib/boletaElectronica/dteSettingsConstants.mjs";

// Detalle de empresa (Root): estado de la boleta electrónica (SOL-2026-10-20-001).
// Root solo ve el estado; la API Key la ingresa el administrador de la empresa.
export default function EmpresaBoletaElectronicaEstado({ companyId }) {
  const [status, setStatus] = useState({ loading: true, row: null, error: "" });

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/boleta-electronica?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) setStatus({ loading: false, row: null, error: body.error || "No disponible." });
        else setStatus({ loading: false, row: (body.data?.companies || [])[0] || null, error: "" });
      })
      .catch(() => { if (active) setStatus({ loading: false, row: null, error: "No disponible." }); });
    return () => { active = false; };
  }, [companyId]);

  const row = status.row;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-[#3150D8]"><Receipt className="h-5 w-5" /><h3 className="text-xl font-semibold text-[#041E42]">Boleta electrónica</h3></div>
      <p className="mt-2 text-sm text-slate-600">
        {status.loading ? "Cargando…"
          : status.error ? status.error
          : !row ? "Aplica solo a empresas cliente con Off Street."
          : `${DTE_STATUS_LABELS[row.status] || row.status}${row.provider ? " · Haulmer" : ""}${row.environment ? ` · ${DTE_ENVIRONMENT_LABELS[row.environment]}` : ""} · ${row.enabledParkings} estacionamiento(s) activo(s)`}
      </p>
      <p className="mt-1 text-xs text-slate-500">La API Key la ingresa el administrador de la empresa; nunca se muestra. <Link href="/tarifas/modulos/boleta-electronica" className="font-semibold text-[#3150D8]">Ver todas</Link></p>
    </section>
  );
}
