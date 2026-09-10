"use client";

import { useRef, useState } from "react";
import { LoaderCircle, RotateCw } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const CONFIRM_MESSAGE = "Se generarán nuevas claves temporales para las cuentas iniciales. Los nombres de usuario no cambiarán y las claves anteriores dejarán de ser válidas.";

// Botón compartido de "reenvío de enrolamiento" (DECISIÓN APROBADA
// 2026-09-10): mismo componente para la pantalla de éxito de "Crear
// empresa" y para la ficha de la empresa, para no duplicar el diálogo de
// confirmación ni la protección contra doble clic en dos lugares.
//
// §7 doble clic: `busyRef` bloquea de forma SÍNCRONA un segundo click que
// llegue antes de que `sending` (estado, asíncrono) se repinte -- el
// `disabled` del botón cubre el caso normal, `busyRef` cubre la ventana
// entre el click y el primer render.
export default function EmpresaEnrolamientoResendButton({ companyId, onResult, className }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  async function handleClick() {
    if (busyRef.current) return;
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    busyRef.current = true;
    setSending(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/empresas/${companyId}/enrolamiento/reenviar`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible reenviar el correo de enrolamiento.");
      if (onResult) onResult(body);
    } catch (cause) {
      setError(cause.message);
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  }

  return <>
    {error ? <p role="alert" className="mb-2 text-sm font-semibold text-red-700">{error}</p> : null}
    <button type="button" onClick={handleClick} disabled={sending} className={className || "inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 disabled:opacity-60"}>
      {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} {sending ? "Generando nuevas claves…" : "Generar nuevas claves y reenviar acceso"}
    </button>
  </>;
}
