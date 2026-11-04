"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, LoaderCircle } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { extractDisplayUsername } from "@/lib/auth/accessUsernameDomain.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

// Reporte de claves de operadores (SOL-2026-11-04-004). Las claves se piden una por una, porque
// cada lectura queda auditada, y solo viven en la memoria de esta pantalla.
const dateTime = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" });

export default function ClavesOperadoresPage() {
  const [state, setState] = useState({ loading: true, rows: [], canView: false, error: "" });
  const [visible, setVisible] = useState({});
  const [busyId, setBusyId] = useState("");
  const [rowError, setRowError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/usuarios/claves", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible cargar el reporte de claves.");
        if (active) setState({ loading: false, rows: body.data || [], canView: body.canView === true, error: "" });
      })
      .catch((error) => { if (active) setState({ loading: false, rows: [], canView: false, error: error.message }); });
    return () => { active = false; };
  }, []);

  async function toggle(row) {
    setRowError("");
    if (visible[row.id]) {
      setVisible((current) => ({ ...current, [row.id]: "" }));
      return;
    }
    setBusyId(row.id);
    try {
      const response = await authenticatedFetch(`/api/usuarios/claves/${row.id}`, { method: "POST", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible mostrar la clave.");
      setVisible((current) => ({ ...current, [row.id]: body.data.password }));
    } catch (error) {
      setRowError(error.message);
    } finally {
      setBusyId("");
    }
  }

  async function copy(row) {
    try {
      await navigator.clipboard.writeText(visible[row.id]);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      setRowError("No fue posible copiar la clave.");
    }
  }

  const description = "Usuario y clave de cada operador. La clave se actualiza aquí cada vez que el administrador la cambia.";
  return <AppShell title="Claves de operadores" description="Usuarios">
    <div className="space-y-6">
      <PageHeader title="Claves de operadores" description={description} backHref="/usuarios/operadores" backLabel="Volver a Operadores" />
      {state.error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {rowError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{rowError}</p> : null}
      {!state.loading && !state.error && !state.canView ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Las claves solo las ve el administrador de cada empresa desde el Portal Cliente. Aquí se muestra si están registradas.</p> : null}
      {state.loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando…</p> : null}
      {!state.loading && !state.error ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#3150D8] text-white"><tr>{["Nombre", "Usuario de acceso", "Clave", "Última modificación", "Acción"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>
            {state.rows.map((row) => <tr key={row.id} className="border-t border-slate-100">
              <td className="px-3 py-3">{row.nombre}</td>
              <td className="px-3 py-3">{extractDisplayUsername(row.usuarioAcceso)}</td>
              <td className="px-3 py-3">{!row.hasCredential ? <span className="text-slate-500">Sin clave registrada</span> : !state.canView ? <span className="text-slate-600">Registrada</span> : <span className="flex items-center gap-2">
                <span className="font-mono">{visible[row.id] || "••••••••"}</span>
                <button type="button" disabled={busyId === row.id} onClick={() => void toggle(row)} aria-label={visible[row.id] ? "Ocultar clave" : "Mostrar clave"} className="text-[#3150D8] disabled:opacity-50">{busyId === row.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : visible[row.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                {visible[row.id] ? <button type="button" onClick={() => void copy(row)} aria-label="Copiar clave" className="text-[#3150D8]">{copiedId === row.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button> : null}
              </span>}</td>
              <td className="px-3 py-3 text-slate-600">{row.updatedAt ? dateTime.format(new Date(row.updatedAt)) : "—"}</td>
              <td className="px-3 py-3"><Link href="/usuarios/operadores" className="font-semibold text-[#3150D8] hover:underline">Cambiar clave</Link></td>
            </tr>)}
            {!state.rows.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No hay operadores.</td></tr> : null}
          </tbody>
        </table>
      </div> : null}
    </div>
  </AppShell>;
}
