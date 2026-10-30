"use client";
// Piezas visuales compartidas del Centro de Control SMS (SOL-2026-10-29-007).
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

export const SMS_CENTER_SECTIONS = [
  { href: "/centro-sms", label: "Resumen general", client: true },
  { href: "/centro-sms/historial", label: "Historial de mensajes", client: true },
  { href: "/centro-sms/recibidos", label: "Mensajes recibidos" },
  { href: "/centro-sms/fallos", label: "Fallos y reintentos" },
  { href: "/centro-sms/consumo", label: "Consumo y costos", clientLabel: "Consumo", client: true },
  { href: "/centro-sms/diagnostico", label: "Diagnóstico y pruebas" },
  { href: "/centro-sms/configuracion", label: "Configuración y permisos" },
];

// Quién mira: "ROOT" (todo) o "COMPANY" (administrador de empresa, solo su
// empresa y sin datos internos). Solo decide qué se muestra; el alcance real
// lo fuerza el servidor. Mientras carga se asume la vista acotada.
export function useSmsViewer() {
  const [viewer, setViewer] = useState(null);
  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (active) setViewer(body?.data?.role === "platform_admin" ? "ROOT" : "COMPANY"); })
      .catch(() => { if (active) setViewer("COMPANY"); });
    return () => { active = false; };
  }, []);
  return viewer;
}

const dateTime = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Santiago" });
export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : "—");
export const formatNumber = (value) => new Intl.NumberFormat("es-CL").format(Number(value || 0));

const BADGE = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-blue-200 bg-blue-50 text-[#3150D8]",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
};

export function SmsStatusBadge({ label, variant = "info" }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BADGE[variant] || BADGE.info}`}>{label}</span>;
}

export function SimulatedBadge() {
  return <span className="inline-flex whitespace-nowrap rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600" title="Envío simulado: no salió por Sentraland">Simulado</span>;
}

export function SmsCenterTabs() {
  const pathname = usePathname();
  const isRoot = useSmsViewer() === "ROOT";
  return (
    <nav aria-label="Secciones del Centro de Control SMS" className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
      {SMS_CENTER_SECTIONS.filter((section) => isRoot || section.client).map((section) => {
        const active = pathname === section.href;
        return (
          <Link key={section.href} href={section.href} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${active ? "border-[#3150D8] bg-[#3150D8] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#3150D8] hover:text-[#3150D8]"}`}>
            {isRoot ? section.label : section.clientLabel || section.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SmsNotice({ tone = "info", title, children }) {
  const tones = { info: "border-blue-200 bg-blue-50 text-[#041E42]", warning: "border-amber-200 bg-amber-50 text-amber-900", error: "border-rose-200 bg-rose-50 text-rose-800" };
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`} role={tone === "error" ? "alert" : "status"}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}
