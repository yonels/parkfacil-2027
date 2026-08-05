"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  Mail,
  Send,
} from "lucide-react";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  async function enviarEnlace(e) {
    e.preventDefault();

    setError("");
    setEnviando(true);

    try {
      const respuesta = await fetch(
        "/api/auth/recuperar-contrasena",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

            // SOLO PARA PRUEBAS EN LOCALHOST
            // Simula una petición proveniente de root.parkfacilapp.cl
            "x-parkfacil-portal": "root",
          },
          body: JSON.stringify({
            email: email.trim(),
          }),
        }
      );

      if (!respuesta.ok) {
        throw new Error(
          "No fue posible procesar la solicitud."
        );
      }

      setEnviado(true);
    } catch (errorEnvio) {
      console.error(
        "Error al solicitar recuperación:",
        errorEnvio
      );

      setError(
        "No fue posible procesar la solicitud. Inténtalo nuevamente."
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section
        className="w-full max-w-md rounded-3xl p-8 text-white shadow-2xl"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right,var(--pf-color-brand-500),var(--pf-color-brand-600),var(--pf-color-brand-700))",
        }}
      >
        {!enviado ? (
          <>
            <Mail className="h-10 w-10" />

            <h1 className="mt-6 text-3xl font-bold">
              Recuperar contraseña
            </h1>

            <p className="mt-3 text-white/80">
              Ingrese el correo electrónico asociado a su cuenta.
              Si existe, recibirá un enlace para restablecer su
              contraseña.
            </p>

            <form
              onSubmit={enviarEnlace}
              className="mt-8 space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Correo electrónico
                </label>

                <div className="flex items-center rounded-2xl border border-white/30 bg-white/10 px-4">
                  <Mail className="mr-3 h-5 w-5 text-white/70" />

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    placeholder="nombre@empresa.cl"
                    className="w-full bg-transparent py-4 outline-none placeholder:text-white/60"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/25 p-3 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--pf-color-brand-primary-700)] py-4 font-bold transition hover:bg-[var(--pf-color-brand-primary-800)] disabled:opacity-70"
              >
                {enviando ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}

                {enviando
                  ? "Enviando..."
                  : "Enviar enlace de recuperación"}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <Mail className="mx-auto h-12 w-12" />

            <h1 className="mt-6 text-3xl font-bold">
              Revisa tu correo
            </h1>

            <p className="mt-4 text-white/80">
              Si el correo existe en nuestros registros,
              recibirás un enlace para recuperar tu contraseña.
            </p>
          </div>
        )}

        <Link
          href="/login"
          className="mt-10 flex items-center justify-center gap-2 text-sm font-semibold underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio de sesión
        </Link>
      </section>
    </main>
  );
}