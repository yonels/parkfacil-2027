"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save, ShieldCheck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

export default function MiCuentaPage() {
  const [profile, setProfile] = useState(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    authenticatedFetch("/api/auth/platform-profile", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No fue posible cargar Mi cuenta.");
        if (!mounted) return;
        setProfile(body.data);
        setRecoveryEmail(body.data.recoveryEmail || "");
      })
      .catch((cause) => mounted && setError(cause.message))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await authenticatedFetch("/api/auth/platform-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryEmail: recoveryEmail.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible guardar el correo de recuperación.");
      setRecoveryEmail(body.data.recoveryEmail || "");
      setMessage("Correo de recuperación actualizado correctamente.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Mi cuenta" description="Seguridad de la cuenta Root">
      <PageHeader title="Mi cuenta" description="Administra el destinatario de recuperación sin cambiar tu identidad de acceso." />
      <section className="max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3 text-[#3150D8]">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EEF4FF]"><ShieldCheck className="h-6 w-6" /></span>
          <div><h2 className="text-xl font-semibold text-[#041E42]">Seguridad Root</h2><p className="text-sm text-slate-500">Perfil exclusivo del administrador de plataforma autenticado.</p></div>
        </div>

        {loading ? <p className="mt-8 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando perfil…</p> : null}
        {!loading && profile ? (
          <form onSubmit={save} className="mt-8 space-y-6">
            <label className="block space-y-2 text-sm text-slate-700">
              <span className="font-semibold text-[#041E42]">Usuario de acceso</span>
              <input value={profile.loginIdentifier || ""} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600" />
              <span className="block text-xs text-slate-500">Esta es tu identidad de autenticación y no se modifica desde esta pantalla.</span>
            </label>
            <label className="block space-y-2 text-sm text-slate-700">
              <span className="font-semibold text-[#041E42]">Correo de recuperación</span>
              <input type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="Sin configurar" className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#3150D8]" />
              <span className="block text-xs leading-5 text-slate-500">Se utilizará exclusivamente para recuperación de contraseña y comunicaciones de seguridad. Debe ser una dirección de correo válida a la que el usuario tenga acceso.</span>
            </label>
            {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
            {message ? <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        ) : null}
      </section>
    </AppShell>
  );
}
