import { headers } from "next/headers";
import { Suspense } from "react";
import { Building2, ParkingSquare, ScanLine, ShieldCheck } from "lucide-react";

import LoginForm from "@/components/auth/LoginForm";
import { PORTALS, getPortalFromHost } from "@/lib/auth/portal.mjs";
import { getSafeDestination } from "@/lib/auth/loginDestination.mjs";

export const metadata = {
  title: "Iniciar sesión | ParkFacil 2027",
};

// Rutas internas que corresponden al Terminal operativo. El destino ya pasó por
// getSafeDestination(), por lo que un `next` externo o inválido nunca llega hasta aquí.
const TERMINAL_ROUTES = new Set(["/data-entry", "/data-entry/pos"]);

const CONFIGURACION_ACCESO = {
  root: {
    tipo: "root",
    etiqueta: "Administración central",
    tituloPrincipal: "Control total de la plataforma ParkFacil.",
    descripcionPrincipal:
      "Administra empresas, estacionamientos, usuarios, operaciones, dispositivos, tarifas y configuraciones globales.",
    tituloFormulario: "Acceso Administrador Root",
    descripcionFormulario:
      "Ingresa con las credenciales asignadas al administrador de la plataforma.",
    Icono: ShieldCheck,
  },

  cliente: {
    tipo: "cliente",
    etiqueta: "Portal Cliente",
    tituloPrincipal: "Gestiona tus estacionamientos desde un solo lugar.",
    descripcionPrincipal:
      "Consulta operaciones, recaudación, abonados, dispositivos, reportes y configuración de tus estacionamientos.",
    tituloFormulario: "Acceso Cliente",
    descripcionFormulario:
      "Ingresa con las credenciales asignadas por el administrador de tu empresa.",
    Icono: Building2,
  },

  terminal: {
    tipo: "terminal",
    etiqueta: "ParkFacil Terminal",
    tituloPrincipal: "Inicio de operación.",
    descripcionPrincipal:
      "Registra ingresos, salidas, pagos y vehículos del estacionamiento desde un solo lugar.",
    tituloFormulario: "Inicio de Operación",
    descripcionFormulario:
      "Ingresa con tus credenciales de operador para comenzar a operar el estacionamiento.",
    Icono: ScanLine,
  },
};

// Estilos por identidad: Root y Cliente conservan la marca corporativa (variables
// globales); Terminal usa la paleta gris acerado propia, sin tocar esas variables.
const ESTILO_ACCESO = {
  root: {
    panel: "linear-gradient(140deg, var(--pf-color-brand-primary) 0%, var(--pf-color-brand-primary-600) 56%, var(--pf-color-brand-primary-700) 100%)",
    tarjeta: "linear-gradient(to bottom right, var(--pf-color-brand-500), var(--pf-color-brand-600), var(--pf-color-brand-700))",
    borde: "var(--pf-color-brand-border)",
    sombra: "0 25px 50px -12px var(--pf-color-brand-shadow)",
    mancha: "var(--pf-color-brand-primary-800)",
  },
  cliente: {
    panel: "linear-gradient(140deg, var(--pf-color-brand-primary) 0%, var(--pf-color-brand-primary-600) 56%, var(--pf-color-brand-primary-700) 100%)",
    tarjeta: "linear-gradient(to bottom right, var(--pf-color-brand-500), var(--pf-color-brand-600), var(--pf-color-brand-700))",
    borde: "var(--pf-color-brand-border)",
    sombra: "0 25px 50px -12px var(--pf-color-brand-shadow)",
    mancha: "var(--pf-color-brand-primary-800)",
  },
  terminal: {
    panel: "linear-gradient(140deg, #455A64 0%, #37474F 56%, #263238 100%)",
    tarjeta: "linear-gradient(to bottom right, #607D8B, #455A64, #37474F)",
    borde: "#78909C",
    sombra: "0 25px 50px -12px rgba(38,50,56,0.35)",
    mancha: "#263238",
  },
};

export default async function LoginPage({ searchParams }) {
  const encabezados = await headers();
  const host = encabezados.get("x-forwarded-host") || encabezados.get("host");
  const parametros = await searchParams;
  const destino = getSafeDestination(parametros?.next);
  const esTerminal = TERMINAL_ROUTES.has(destino);

  const tipoAcceso = esTerminal ? "terminal" : (getPortalFromHost(host) === PORTALS.CLIENT ? "cliente" : "root");
  const configuracion = CONFIGURACION_ACCESO[tipoAcceso];
  const estilo = ESTILO_ACCESO[tipoAcceso];
  const IconoAcceso = configuracion.Icono;

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.1fr_0.9fr]">
      <section
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{
          backgroundImage: estilo.panel,
        }}
      >
        <span className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <span className="pointer-events-none absolute -bottom-28 left-40 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: estilo.mancha, opacity: 0.45 }} />

        <span
          className="pointer-events-none absolute bottom-20 right-20 h-28 w-44 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.28) 1px, transparent 1.5px)",
            backgroundSize: "12px 12px",
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
            <ParkingSquare className="h-6 w-6" />
          </span>

          <div>
            <p className="text-lg font-bold text-white">
              ParkFacil
            </p>

            <p className="text-sm text-white/85">
              Plataforma de operaciones
            </p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-white/85">
            {configuracion.etiqueta}
          </p>

          <h1 className="mt-5 text-4xl font-bold leading-tight text-white">
            {configuracion.tituloPrincipal}
          </h1>

          <p className="mt-5 text-lg leading-8 text-white/80">
            {configuracion.descripcionPrincipal}
          </p>
        </div>

        <p className="relative z-10 text-sm text-white/65">
          ParkFacil 2027 · Acceso seguro
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div
          className="relative w-full max-w-md overflow-hidden rounded-3xl border p-7 shadow-2xl sm:p-10"
          style={{
            backgroundImage: estilo.tarjeta,
            boxShadow: estilo.sombra,
            borderColor: estilo.borde,
          }}
        >
          <span className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />

          <span className="pointer-events-none absolute -bottom-12 left-10 h-32 w-32 rounded-full blur-2xl" style={{ backgroundColor: estilo.mancha, opacity: 0.35 }} />

          <div className="relative z-10">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
                <ParkingSquare className="h-5 w-5" />
              </span>

              <p className="font-bold text-white">
                ParkFacil
              </p>
            </div>

            <div className="mt-8 flex items-center gap-3 lg:mt-0">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
                <IconoAcceso className="h-5 w-5" />
              </span>

              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/85">
                {configuracion.etiqueta}
              </p>
            </div>

            <h2 className="mt-4 text-3xl font-bold text-white">
              {configuracion.tituloFormulario}
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/80">
              {configuracion.descripcionFormulario}
            </p>

            <Suspense
              fallback={
                <div className="mt-8 h-72 animate-pulse rounded-2xl bg-white/10" />
              }
            >
              <LoginForm tipoAcceso={configuracion.tipo} />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
