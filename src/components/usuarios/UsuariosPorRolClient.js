"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import UsuariosGrid from "@/components/usuarios/UsuariosGrid";
import { normalizeUserSearch, getPerfilLabel } from "@/data/usuarios.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

// Vista compartida por /usuarios/administradores y /usuarios/operadores:
// mismo catálogo real (GET /api/usuarios, ya autorizado y acotado por
// empresa en el servidor) filtrado por rol, con buscador independiente.
// Cada resultado es clickeable y abre directamente /usuarios/[id].
export default function UsuariosPorRolClient({ rol, titulo, descripcion, placeholderBusqueda, backHref, backLabel }) {
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/usuarios", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los usuarios.");
      setUsuarios(body.data || []);
      setEmpresas(body.companies || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  const resultados = useMemo(() => {
    const normalized = normalizeUserSearch(busqueda);
    return usuarios
      .filter((usuario) => usuario.perfilPrincipal === rol)
      .filter((usuario) => {
        if (!normalized) return true;
        const valores = [
          usuario.nombreCompleto,
          usuario.correo,
          usuario.telefono,
          getPerfilLabel(usuario.perfilPrincipal),
          ...(usuario.searchValues || []),
        ];
        return valores.some((value) => normalizeUserSearch(value).includes(normalized));
      })
      .sort((left, right) => String(left.nombreCompleto || "").localeCompare(String(right.nombreCompleto || ""), "es"));
  }, [busqueda, rol, usuarios]);

  return (
    <AppShell title={titulo} description={descripcion}>
      <div className="space-y-6">
        <PageHeader title={titulo} description={descripcion} backHref={backHref} backLabel={backLabel} />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <Search className="h-4 w-4 text-[#3150D8]" />
            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder={placeholderBusqueda}
              className="w-full bg-transparent outline-none"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error === "SESSION_EXPIRED" ? "Tu sesión expiró. Vuelve a iniciar sesión." : error}
            </p>
          ) : null}

          <div className="mt-6">
            {loading ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                Cargando…
              </div>
            ) : resultados.length > 0 ? (
              <UsuariosGrid usuarios={resultados} empresas={empresas} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                {busqueda ? "No hay resultados para tu búsqueda." : "No hay usuarios en esta categoría todavía."}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
