"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { getSafeDestination } from "@/lib/auth/loginDestination.mjs";
import Link from "next/link";

export default function LoginForm({ tipoAcceso }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const destination = getSafeDestination(searchParams.get("next"));

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: data.session?.access_token }),
      });
      if (!sessionResponse.ok) {
        const payload = await sessionResponse.json().catch(() => ({}));
        await supabase.auth.signOut();
        throw new Error(payload.error || `Esta cuenta no puede acceder al Portal ${tipoAcceso === "cliente" ? "Cliente" : "Root"}.`);
      }
      router.replace(destination);
    } catch (authError) {
      setError(
        authError?.message === "Invalid login credentials"
          ? "El correo o la contraseña no son correctos."
          : authError?.message || "No fue posible iniciar sesión. Inténtalo nuevamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form mt-8 space-y-5 text-white">
      <label className="block">
        <span className="text-sm font-semibold text-white">Correo electrónico</span>
        <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/35 bg-white/10 px-4 focus-within:border-white/80 focus-within:ring-4 focus-within:ring-white/20">
          <Mail className="h-5 w-5 shrink-0 text-white/80" />
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@empresa.cl"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white placeholder:text-white/70 outline-none"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-white">Contraseña</span>
        <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/35 bg-white/10 px-4 focus-within:border-white/80 focus-within:ring-4 focus-within:ring-white/20">
          <LockKeyhole className="h-5 w-5 shrink-0 text-white/80" />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Ingresa tu contraseña"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-white placeholder:text-white/70 outline-none"
          />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="rounded-lg p-1 text-white/75 hover:text-white">
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </span>
      </label>

      <div className="-mt-1 flex justify-end">
  <Link
    href="/recuperar-contrasena"
    className="text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 transition hover:text-white/85 hover:decoration-white"
  >
    Recuperar contraseña
  </Link>
</div>

      {error ? <p role="alert" className="rounded-2xl border border-red-200/50 bg-red-500/25 px-4 py-3 text-sm font-medium text-white">{error}</p> : null}

      <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/35 bg-[var(--pf-color-brand-primary-700)] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[var(--pf-color-brand-primary-800)]/35 transition hover:bg-[var(--pf-color-brand-primary-800)] disabled:cursor-wait disabled:opacity-70">
        {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
        {submitting ? "Iniciando sesión..." : "Iniciar sesión"}
      </button>
    </form>
  );
}
