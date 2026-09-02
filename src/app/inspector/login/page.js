import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import LoginForm from "@/components/auth/LoginForm";
import { getAuthenticatedContext } from "@/lib/auth/authenticatedContext";
import { ROLES } from "@/lib/auth/permissions.mjs";

export const metadata = { title: "ParkFacil Inspector - Acceso", robots: { index: false, follow: false } };

// Login real de Inspector (Etapa 2, §4; identidad propia corregida 2026-08-31):
// reutiliza el mismo LoginForm y el mismo /api/auth/session que el resto de
// portales (Terminal/Cliente/Root) -- ver src/app/pos/login para el mismo
// patrón -- pero con textos e identidad exclusivos de este portal (nunca la
// identidad del portal Terminal, igual que ese otro login nunca debe mostrar
// la de Inspector). LoginForm no lleva ningún texto de identidad de portal
// -- eso vive enteramente en cada page.js -- así que no hace falta tocarlo
// ni duplicar el sistema de autenticación para lograrlo: tipoAcceso=
// "inspector" ya basta para que el propio LoginForm scopee la sesión al
// portal correcto (ver /api/auth/session).

// "PWA start URL corregido" (2026-09-02): el manifest de Inspector ahora usa
// start_url="/inspector/login" (antes "/inspector") para anclar el launch de
// la app instalada inequívocamente a esta pantalla -- ver
// manifest.webmanifest/route.js para la causa raíz completa. Efecto
// colateral a evitar: un Inspector YA autenticado que reabre el ícono
// instalado vería el formulario de login en cada apertura, en vez de entrar
// directo a la app (regresión de uso diario). Se resuelve reutilizando la
// MISMA función de resolución de sesión que ya usa proxy.js (nunca
// lógica de autorización duplicada): si ya existe una sesión Inspector
// válida, se redirige server-side a /inspector antes de renderizar nada;
// si no hay sesión (o pertenece a otro portal), se muestra el formulario
// normalmente -- comportamiento idéntico al de antes para cualquier otro
// caso.
async function getExistingInspectorContext() {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    // proxy.js resuelve el portal leyendo el pathname de request.url -- se
    // construye aquí con la ruta real de esta página para obtener
    // exactamente la misma resolución (portal "inspector").
    const fakeRequest = {
      url: "http://localhost/inspector/login",
      cookies: { get: (name) => cookieStore.get(name) },
      headers: { get: (name) => headerStore.get(name) },
    };
    return await getAuthenticatedContext(fakeRequest);
  } catch {
    // Sin sesión, sesión inválida, o cuenta de otro portal -- se muestra el
    // login normalmente, igual que siempre.
    return null;
  }
}

export default async function InspectorLoginPage() {
  const existing = await getExistingInspectorContext();
  if (existing?.role === ROLES.INSPECTOR) redirect("/inspector");

  return (
    // "flex" en vez de "grid place-items-center" (2026-09-02, "login mobile
    // optimizado" -- corrección de overflow horizontal real encontrado en
    // 320px): un hijo width:100% dentro de un grid NO estirado
    // (justify-items:center por place-items-center) resuelve su ancho de
    // forma ambigua -- Chrome terminaba fijando la pista del grid a un
    // ancho de contenido (~323px) que no se achicaba más allá de cierto
    // punto, desbordando en viewports angostos (320px). flex + justify-
    // center resuelve width:100% de forma predecible contra el ancho real
    // del contenedor en cualquier tamaño. Visualmente idéntico en 390/360/
    // desktop (ya probado); solo corrige el caso límite.
    <main className="flex min-h-dvh items-center justify-center bg-[#EEF4FF] p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <section
        className="w-full max-w-sm rounded-3xl border p-5 text-white shadow-2xl md:p-7"
        style={{ backgroundImage: "linear-gradient(to bottom right, #17308D, #0B2559, #041E42)", borderColor: "#3150D8" }}
      >
        {/* Cabecera compacta en móvil (2026-09-02, "login mobile optimizado"):
           en <md se colapsan 4 líneas de texto (eyebrow + H1 + subtítulo
           redundante + aviso de exclusividad) a solo 2 (H1 + un subtítulo
           corto) -- el subtítulo "ParkFacil Inspector - Acceso" repetía
           literalmente el H1 de arriba, y el aviso de exclusividad no aporta
           valor operativo en el uso diario ya instalado como PWA. En >=md
           (desktop) las 4 líneas originales siguen intactas, sin cambios. */}
        <div className="flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white md:h-16 md:w-16">
            <ShieldCheck className="h-6 w-6 md:h-8 md:w-8" aria-hidden="true" />
          </span>
          <p className="mt-4 hidden text-xs font-black uppercase tracking-[0.25em] text-white/70 md:block">ACCESO INSPECTOR</p>
          <h1 className="mt-2 text-xl font-black text-white md:text-2xl">ParkFacil Inspector</h1>
          <p className="mt-1 hidden text-sm font-semibold text-white/80 md:block">ParkFacil Inspector - Acceso</p>
          <p className="mt-3 hidden text-xs leading-5 text-white/60 md:block">Esta pantalla es exclusiva para inspectores autorizados.</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/70 md:hidden">Acceso Inspector</p>
        </div>
        <Suspense fallback={<div className="mt-5 h-64 animate-pulse rounded-2xl bg-white/10 md:mt-8 md:h-72" />}>
          <LoginForm tipoAcceso="inspector" defaultDestination="/inspector" forceInspectorDestination compactMobile />
        </Suspense>
      </section>
    </main>
  );
}
