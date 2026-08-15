import { Suspense } from "react";
import { ParkingSquare, ScanLine } from "lucide-react";

import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "ParkFacil POS - Acceso Operador",
};

export default function PosLoginPage() {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.1fr_0.9fr]">
      <section
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{
          backgroundImage: "linear-gradient(140deg, #455A64 0%, #37474F 56%, #263238 100%)",
        }}
      >
        <span className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <span
          className="pointer-events-none absolute -bottom-28 left-40 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: "#263238", opacity: 0.45 }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
            <ParkingSquare className="h-6 w-6" />
          </span>

          <div>
            <p className="text-lg font-bold text-white">ParkFacil POS</p>
            <p className="text-sm text-white/85">Terminal operativo</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-white/85">ParkFacil POS</p>

          <h1 className="mt-5 text-4xl font-bold leading-tight text-white">
            Acceso Operador
          </h1>

          <p className="mt-5 text-lg leading-8 text-white/80">
            Inicia sesion con tu cuenta de operador para trabajar solo en estacionamientos autorizados.
          </p>
        </div>

        <p className="relative z-10 text-sm text-white/65">ParkFacil 2027 · POS seguro</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div
          className="relative w-full max-w-md overflow-hidden rounded-3xl border p-7 shadow-2xl sm:p-10"
          style={{
            backgroundImage: "linear-gradient(to bottom right, #607D8B, #455A64, #37474F)",
            boxShadow: "0 25px 50px -12px rgba(38,50,56,0.35)",
            borderColor: "#78909C",
          }}
        >
          <span className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />

          <span
            className="pointer-events-none absolute -bottom-12 left-10 h-32 w-32 rounded-full blur-2xl"
            style={{ backgroundColor: "#263238", opacity: 0.35 }}
          />

          <div className="relative z-10">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
                <ParkingSquare className="h-5 w-5" />
              </span>

              <p className="font-bold text-white">ParkFacil POS</p>
            </div>

            <div className="mt-8 flex items-center gap-3 lg:mt-0">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
                <ScanLine className="h-5 w-5" />
              </span>

              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/85">Acceso Operador</p>
            </div>

            <h2 className="mt-4 text-3xl font-bold text-white">ParkFacil POS - Acceso Operador</h2>

            <p className="mt-2 text-sm leading-6 text-white/80">
              Esta pantalla es exclusiva para operadores POS.
            </p>

            <Suspense
              fallback={<div className="mt-8 h-72 animate-pulse rounded-2xl bg-white/10" />}
            >
              <LoginForm
                tipoAcceso="terminal"
                loginScope="pos_operator"
                defaultDestination="/pos"
                forcePosDestination
              />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
