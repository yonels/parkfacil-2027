"use client";

/******************************************************************
 * PARKFACIL 2027
 *---------------------------------------------------------------
 * COMPONENTE: "Entrar como cliente" (impersonación Root -> Cliente)
 *---------------------------------------------------------------
 * Toma el token de la sesión REAL de Root ya activa (nunca hace un
 * login nuevo ni conoce contraseña del cliente) y navega de forma
 * completa al origen del Portal Cliente, que establece la sesión de
 * impersonación server-side (ver /api/auth/impersonacion,
 * src/app/impersonar/page.js).
 ******************************************************************/

import { useState } from "react";
import { LogIn } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { buildImpersonationHandoffUrl } from "@/lib/auth/impersonationCore.mjs";

export default function EntrarComoClienteButton({ empresaId, empresaNombre }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const entrar = async () => {
    setError("");
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data?.session?.access_token) {
        throw new Error("No se pudo obtener la sesión actual de Root.");
      }
      const destino = buildImpersonationHandoffUrl({
        currentHost: window.location.host,
        companyId: empresaId,
        accessToken: data.session.access_token,
      });
      window.location.href = destino;
    } catch (impersonationError) {
      setError(impersonationError.message || "No fue posible iniciar la sesión de administración.");
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={entrar}
        disabled={loading}
        title={`Entrar como cliente en ${empresaNombre || "esta empresa"}`}
        className="inline-flex items-center gap-2 rounded-full border border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
      >
        <LogIn className="h-4 w-4" />
        {loading ? "Entrando…" : "Entrar como cliente"}
      </button>
      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
