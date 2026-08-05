"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const LONGITUD_MINIMA = 8;

function obtenerMensajeError(error) {
  const mensaje = String(error?.message || "").toLowerCase();

  if (
    mensaje.includes("session") ||
    mensaje.includes("token") ||
    mensaje.includes("expired")
  ) {
    return "El enlace de recuperación es inválido o ya expiró.";
  }

  return "No fue posible actualizar la contraseña. Inténtalo nuevamente.";
}

function CampoContrasena({
  etiqueta,
  valor,
  onChange,
  visible,
  onToggle,
  autoComplete,
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-white">
        {etiqueta}
      </span>

      <div className="mt-2 flex items-center rounded-2xl border border-white/30 bg-white/10 px-4">
        <LockKeyhole className="mr-3 h-5 w-5 text-white/70" />

        <input
          type={visible ? "text" : "password"}
          required
          minLength={LONGITUD_MINIMA}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Mínimo ${LONGITUD_MINIMA} caracteres`}
          className="w-full bg-transparent py-4 outline-none placeholder:text-white/60"
        />

        <button
          type="button"
          onClick={onToggle}
          className="ml-3"
        >
          {visible ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>
    </label>
  );
}

export default function NuevaContrasenaPage() {
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const [mostrarPassword, setMostrarPassword] =
    useState(false);

  const [
    mostrarConfirmacion,
    setMostrarConfirmacion,
  ] = useState(false);

  const [verificando, setVerificando] =
    useState(true);

  const [
    sesionDisponible,
    setSesionDisponible,
  ] = useState(false);

  const [guardando, setGuardando] =
    useState(false);

  const [actualizada, setActualizada] =
    useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const supabase =
      getSupabaseBrowserClient();

    async function verificarSesion() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        setSesionDisponible(Boolean(session));
      } catch {
        if (mounted) {
          setSesionDisponible(false);
        }
      } finally {
        if (mounted) {
          setVerificando(false);
        }
      }
    }

    verificarSesion();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (evento, session) => {
          if (!mounted) return;

          if (
            evento === "PASSWORD_RECOVERY" ||
            evento === "SIGNED_IN" ||
            evento === "TOKEN_REFRESHED"
          ) {
            setSesionDisponible(
              Boolean(session)
            );

            setVerificando(false);
          }
        }
      );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
    async function actualizarContrasena(event) {
    event.preventDefault();

    setError("");

    if (password.length < LONGITUD_MINIMA) {
      setError(
        `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`
      );
      return;
    }

    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);

    try {
      const supabase =
        getSupabaseBrowserClient();

      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut();

      setActualizada(true);
      setPassword("");
      setConfirmacion("");
    } catch (updateError) {
      console.error(
        "Error al actualizar la contraseña:",
        updateError
      );

      setError(
        obtenerMensajeError(updateError)
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <section
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[var(--pf-color-brand-border)] p-7 text-white shadow-2xl sm:p-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, var(--pf-color-brand-500), var(--pf-color-brand-600), var(--pf-color-brand-700))",
          boxShadow:
            "0 25px 50px -12px var(--pf-color-brand-shadow)",
        }}
      >
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

        <span className="pointer-events-none absolute -bottom-12 left-10 h-32 w-32 rounded-full bg-[var(--pf-color-brand-primary-800)]/35 blur-2xl" />

        <div className="relative z-10">
          {verificando ? (
            <div className="py-16 text-center">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin" />

              <h1 className="mt-6 text-2xl font-bold">
                Validando enlace
              </h1>

              <p className="mt-3 text-sm text-white/80">
                Estamos verificando tu solicitud de recuperación.
              </p>
            </div>
          ) : actualizada ? (
            <div className="py-8 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/15">
                <CheckCircle2 className="h-9 w-9" />
              </span>

              <h1 className="mt-6 text-3xl font-bold">
                Contraseña actualizada
              </h1>

              <p className="mt-4 text-sm leading-6 text-white/80">
                Tu contraseña fue actualizada correctamente.
                Ya puedes volver a iniciar sesión.
              </p>

              <Link
                href="/login"
                className="mt-8 flex w-full items-center justify-center rounded-2xl border border-white/35 bg-[var(--pf-color-brand-primary-700)] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[var(--pf-color-brand-primary-800)]"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          ) : !sesionDisponible ? (
            <div className="py-8 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/15">
                <LockKeyhole className="h-8 w-8" />
              </span>

              <h1 className="mt-6 text-3xl font-bold">
                Enlace no válido
              </h1>

              <p className="mt-4 text-sm leading-6 text-white/80">
                El enlace de recuperación es inválido,
                ya fue utilizado o expiró.
              </p>

              <Link
                href="/recuperar-contrasena"
                className="mt-8 flex w-full items-center justify-center rounded-2xl border border-white/35 bg-[var(--pf-color-brand-primary-700)] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[var(--pf-color-brand-primary-800)]"
              >
                Solicitar un nuevo enlace
              </Link>
            </div>
          ) : (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
                <LockKeyhole className="h-6 w-6" />
              </span>

              <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-white/80">
                Acceso seguro
              </p>

              <h1 className="mt-3 text-3xl font-bold">
                Crear nueva contraseña
              </h1>

              <p className="mt-3 text-sm leading-6 text-white/80">
                Ingresa una nueva contraseña y confírmala
                para completar la recuperación de tu cuenta.
              </p>

              <form
                onSubmit={actualizarContrasena}
                className="mt-8 space-y-5"
              >
                <CampoContrasena
                  etiqueta="Nueva contraseña"
                  valor={password}
                  onChange={setPassword}
                  visible={mostrarPassword}
                  onToggle={() =>
                    setMostrarPassword(
                      (value) => !value
                    )
                  }
                  autoComplete="new-password"
                />

                <CampoContrasena
                  etiqueta="Confirmar contraseña"
                  valor={confirmacion}
                  onChange={setConfirmacion}
                  visible={mostrarConfirmacion}
                  onToggle={() =>
                    setMostrarConfirmacion(
                      (value) => !value
                    )
                  }
                  autoComplete="new-password"
                />

                <p className="text-xs leading-5 text-white/70">
                  La contraseña debe tener al menos{" "}
                  {LONGITUD_MINIMA} caracteres.
                </p>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-2xl border border-red-200/50 bg-red-500/25 px-4 py-3 text-sm font-medium text-white"
                  >
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={guardando}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/35 bg-[var(--pf-color-brand-primary-700)] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[var(--pf-color-brand-primary-800)]/35 transition hover:bg-[var(--pf-color-brand-primary-800)] disabled:cursor-wait disabled:opacity-70"
                >
                  {guardando ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <LockKeyhole className="h-5 w-5" />
                  )}

                  {guardando
                    ? "Actualizando contraseña..."
                    : "Actualizar contraseña"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}