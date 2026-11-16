"use client";

/******************************************************************
 * PARKFACIL 2027
 *---------------------------------------------------------------
 * PÁGINA DE ENTREGA (HANDOFF) DE IMPERSONACIÓN ROOT -> CLIENTE
 *---------------------------------------------------------------
 * Destino de la navegación completa entre orígenes que dispara
 * "Entrar como cliente" desde Root (mismo patrón ya usado por
 * "Acceso Operador", ver src/lib/auth/operatorAccessUrl.mjs: cada
 * subdominio es un origen aislado, sin cookies compartidas). El
 * token real de Root viaja en el FRAGMENTO de la URL (#...), que el
 * navegador nunca envía al servidor (ni en la solicitud de página ni
 * en Referer) -- solo esta página, en el cliente, lo lee y lo
 * reenvía por POST a /api/auth/impersonacion, ya en este origen.
 ******************************************************************/

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldAlert } from "lucide-react";

export default function ImpersonarPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const companyId = params.get("company_id");

    // Limpia el fragmento de la URL de inmediato -- no debe quedar en el
    // historial del navegador ni visible tras la carga.
    window.history.replaceState(null, "", window.location.pathname);

    (async () => {
      try {
        if (!accessToken || !companyId) {
          throw new Error("Enlace de impersonación inválido o incompleto.");
        }
        const response = await fetch("/api/auth/impersonacion", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken, companyId, portal: "root" }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible iniciar la impersonación.");
        router.replace("/");
      } catch (impersonationError) {
        setError(impersonationError.message || "No fue posible iniciar la impersonación.");
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        {error ? (
          <>
            <ShieldAlert className="mx-auto h-10 w-10 text-rose-600" />
            <h1 className="mt-4 text-lg font-bold text-[#041E42]">No fue posible entrar como cliente</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[#3150D8]" />
            <h1 className="mt-4 text-lg font-bold text-[#041E42]">Entrando como cliente…</h1>
            <p className="mt-2 text-sm text-slate-600">Estableciendo la sesión de administración Root.</p>
          </>
        )}
      </div>
    </main>
  );
}
