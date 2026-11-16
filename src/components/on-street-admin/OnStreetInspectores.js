"use client";

// Inspectores dentro de On Street (§21 del brief; ficha dedicada en el
// cierre de Etapa 3 -- §5). Desde SOL-2026-11-16-003 cada inspector
// pertenece a una empresa y se crea, edita y elimina en el Catálogo de
// usuarios (Usuarios › Inspectores); aquí se listan con su empresa y se
// activan/desactivan (Root o el administrador de esa empresa). El listado se preserva
// tal cual; el doble clic ahora abre /on-street-qr/inspectores/[id] (ficha
// dedicada, reutiliza el mismo GET ya existente) en vez del panel inline de
// actividad que había antes -- esa ficha ya muestra identificación completa
// + actividad, así que el panel quedaba redundante.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Power } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");

export default function OnStreetInspectores() {
  const router = useRouter();
  const [inspectors, setInspectors] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await authenticatedFetch("/api/on-street-qr/inspectores", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los inspectores.");
      setInspectors(body.data);
    } catch (cause) {
      setError(cause.message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      // Solo para mostrar la columna Empresa a Root -- la autorización real
      // (server-side) vive en las rutas GET/PATCH, no aquí.
      authenticatedFetch("/api/auth/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((body) => setIsPlatformAdmin(body?.data?.role === "platform_admin"))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleActive(inspector) {
    setBusyId(inspector.id);
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/inspectores/${inspector.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !inspector.active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible actualizar el estado.");
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    { key: "fullName", label: "Nombre", render: (v) => v || "—" },
    { key: "email", label: "Correo" },
    ...(isPlatformAdmin ? [{ key: "companyName", label: "Empresa", render: (v) => v || "Sin empresa" }] : []),
    { key: "active", label: "Estado", render: (v) => (v ? "Activo" : "Inactivo") },
    { key: "createdAt", label: "Creado", render: dt },
    { key: "lastSignInAt", label: "Último acceso", render: dt },
    { key: "_actions", label: "Acciones", sortable: false, exportValue: () => "", render: (v) => v },
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[var(--pf-color-onstreet-border)] bg-gradient-to-br from-[var(--pf-color-onstreet-primary-700)] to-[var(--pf-color-onstreet-primary-800)] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">Inspectores On Street</h1>
            <p className="mt-1 text-sm text-white/85">Cuentas con acceso al portal Inspectores. Cada inspector fiscaliza el On Street de su empresa.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/usuarios/inspectores/crear" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
              <UserPlus className="h-4 w-4" /> Nuevo inspector
            </Link>
            <Link href="/usuarios/inspectores" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
              Administrar en Usuarios
            </Link>
            {/* Botón "Volver" (2026-08-30: "todas las páginas de On Street
                deben tener un botón Volver que lleve a la sesión
                inmediatamente precedente") -- router.back() real, en vez
                del destino fijo/condicional anterior: vuelve exactamente a
                donde estaba el usuario (la ficha del Proyecto si llegó
                desde "Ver Inspectores", el Dashboard si llegó desde el
                Sidebar, etc.), sin necesidad de leer ?parkingId=. */}
            <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver</button>
          </div>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <ParkFacilDataGrid
          storageKey="on-street:inspectores"
          columns={columns}
          rows={(inspectors || []).map((i) => ({
            ...i,
            _actions: (
              <button type="button" disabled={busyId === i.id} onClick={() => toggleActive(i)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${i.active ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                <Power className="h-3 w-3" /> {i.active ? "Desactivar" : "Activar"}
              </button>
            ),
          }))}
          onRowDoubleClick={(row) => router.push(`/on-street-qr/inspectores/${row.id}`)}
          emptyMessage="Sin inspectores registrados."
          exportFilename="on_street_inspectores"
          exportSheetName="Inspectores"
        />
      </section>
    </div>
  );
}
