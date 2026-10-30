// «Configurar empresa» (SOL-2026-10-29-014, fase 1: diagnóstico de solo
// lectura). Ordena la configuración de una cuenta en 7 pasos, uno por
// pregunta, a partir de los datos reales: la empresa, sus usuarios y el
// configurador de cada estacionamiento (parkingConfigurator.mjs). No guarda
// estado propio ni cambia nada; solo informa qué está completo y qué falta.
//
// Estados de cada paso: "ok" (completo), "warn" (falta) y "lock" (no se puede
// hacer todavía). En un estacionamiento Activo nunca hay "lock": lo pendiente
// se informa sin bloquear, porque ya está operando.
//
// Por ahora solo Off Street; los estacionamientos On Street se listan aparte
// porque se configuran con la activación On Street.

import { CONFIGURATION_STATE_LABELS } from "../parkingConfigurator.mjs";

export const SETUP_STEPS = Object.freeze([
  { n: 1, key: "empresa", question: "¿Quién soy?", name: "Empresa" },
  { n: 2, key: "estacionamiento", question: "¿Dónde estoy?", name: "Estacionamiento" },
  { n: 3, key: "usuarios", question: "¿Quién trabaja?", name: "Usuarios" },
  { n: 4, key: "tarifas", question: "¿Cuánto cobro?", name: "Tarifas" },
  { n: 5, key: "zonas", question: "¿Cuántos caben?", name: "Zonas" },
  { n: 6, key: "activacion", question: "¿Está todo listo?", name: "Revisión y activación" },
  { n: 7, key: "turnos", question: "¿Cuándo se trabaja?", name: "Turnos" },
]);

const text = (value) => String(value ?? "").trim();
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function formatRut(number, dv) {
  const digits = text(number).replace(/\D/g, "");
  if (!digits || !text(dv)) return "";
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${text(dv).toUpperCase()}`;
}

// Paso 1: la empresa existe con razón social, RUT y correo de contacto.
export function companyStep(company) {
  const missing = [];
  if (!text(company?.business_name)) missing.push("razón social");
  if (!text(company?.rut_number) || !text(company?.rut_dv)) missing.push("RUT");
  if (!text(company?.email)) missing.push("correo de contacto");
  if (missing.length) return { state: "warn", detail: `Falta ${missing.join(", ")}` };
  return { state: "ok", detail: `RUT ${formatRut(company.rut_number, company.rut_dv)} · ${text(company.email)}` };
}

const activeMembers = (members, companyId, role) => (members || []).filter((member) => member.company_id === companyId && member.role === role && member.status === "active");

// Paso 3: al menos un administrador activo de la empresa y un operador activo
// con acceso a este estacionamiento.
export function usersStep({ companyId, parkingId, members, memberParkings }) {
  const admins = activeMembers(members, companyId, "company_admin");
  const operatorIds = new Set(activeMembers(members, companyId, "operator").map((member) => member.user_id));
  const operators = new Set((memberParkings || []).filter((row) => row.parking_id === parkingId && operatorIds.has(row.user_id)).map((row) => row.user_id));
  const summary = `${plural(admins.length, "administrador", "administradores")} · ${plural(operators.size, "operador", "operadores")}`;
  const missing = [];
  if (!admins.length) missing.push("un administrador");
  if (!operators.size) missing.push("operadores con acceso a este estacionamiento");
  return missing.length ? { state: "warn", detail: `${summary}. Falta ${missing.join(" y ")}` } : { state: "ok", detail: summary };
}

function href(parking, key, configurator) {
  const code = encodeURIComponent(parking.code);
  return {
    empresa: `/empresas/${encodeURIComponent(parking.companyId)}`,
    estacionamiento: `/estacionamientos/${code}/editar`,
    usuarios: "/usuarios/operadores",
    tarifas: `/estacionamientos/${code}/tarifas`,
    zonas: configurator?.structureRoute || `/estacionamientos/${code}/niveles`,
    activacion: configurator?.reviewRoute || `/estacionamientos/${code}/configuracion/revision`,
    turnos: `/estacionamientos/${code}/turnos`,
  }[key];
}

// Candado correlativo: mientras el estacionamiento no está Activo, lo que
// falta después del primer paso pendiente queda "lock". Los pasos ya
// completos se muestran completos aunque se hayan hecho en otro orden.
export function applySequentialLocks(steps, { active }) {
  if (active) return steps;
  const first = steps.findIndex((step) => step.state !== "ok");
  if (first < 0) return steps;
  return steps.map((step, index) => (index > first && step.state !== "ok"
    ? { ...step, state: "lock", detail: `Se habilita al completar el paso ${steps[first].n} · ${steps[first].question}` }
    : step));
}

export function parkingStatusLabel(status) {
  return CONFIGURATION_STATE_LABELS[status] || text(status) || "Sin estado";
}

export function buildParkingSetup({ company, parking, configurator, members, memberParkings }) {
  const summary = configurator?.summary || {};
  const active = parking.status === "ACTIVE";
  const checklist = configurator?.activation?.checklist || [];
  const general = checklist.find((item) => item.key === "general");
  const generalOk = general ? general.status === "COMPLETADO" : Boolean(text(parking.name) && text(parking.address) && text(parking.city));
  const structureOk = summary.levelCount > 0 && summary.zoneCount > 0 && summary.capacity > 0;
  const requirements = configurator?.activation?.requirements || [];

  const raw = {
    empresa: companyStep(company),
    estacionamiento: generalOk
      ? { state: "ok", detail: [text(parking.address), text(parking.city)].filter(Boolean).join(", ") || "Datos obligatorios completos" }
      : { state: "warn", detail: "Faltan datos obligatorios (nombre, dirección o ciudad)" },
    usuarios: usersStep({ companyId: company.id, parkingId: parking.id, members, memberParkings }),
    tarifas: summary.rateCount > 0
      ? { state: "ok", detail: `${plural(summary.rateCount, "tarifa Activa y vigente", "tarifas Activas y vigentes")}` }
      : { state: "warn", detail: "No hay una tarifa Activa y vigente" },
    zonas: structureOk
      ? { state: "ok", detail: `${plural(summary.levelCount, "nivel", "niveles")} · ${plural(summary.zoneCount, "zona", "zonas")} · ${plural(summary.capacity, "plaza", "plazas")}` }
      : { state: "warn", detail: summary.levelCount < 1 ? "Sin niveles" : summary.zoneCount < 1 ? "Sin zonas" : "La capacidad total es 0 plazas" },
    activacion: active
      ? { state: "ok", detail: "Activo: el POS lo ofrece a los operadores" }
      : requirements.length
        ? { state: "warn", detail: `${parkingStatusLabel(parking.status)}. Pendiente: ${requirements.join(" ")}` }
        : { state: "warn", detail: `${parkingStatusLabel(parking.status)}. Cumple los requisitos: falta activarlo` },
    turnos: summary.shiftCount > 0
      ? { state: "ok", detail: `${plural(summary.shiftCount, "turno registrado", "turnos registrados")}` }
      : { state: "warn", detail: "Sin turnos registrados" },
  };

  const steps = applySequentialLocks(
    SETUP_STEPS.map((step) => ({ ...step, ...raw[step.key], href: href(parking, step.key, configurator) })),
    { active },
  );
  return {
    id: parking.id,
    code: parking.code,
    name: parking.name,
    status: parking.status,
    statusLabel: parkingStatusLabel(parking.status),
    active,
    steps,
    doneCount: steps.filter((step) => step.state === "ok").length,
    pendingCount: steps.filter((step) => step.state !== "ok").length,
  };
}

// Empresa sin estacionamiento: solo el paso 1 puede estar completo.
export function buildMissingParkingSetup(company) {
  const steps = applySequentialLocks(SETUP_STEPS.map((step) => {
    if (step.key === "empresa") return { ...step, ...companyStep(company), href: `/empresas/${encodeURIComponent(company.id)}` };
    if (step.key === "estacionamiento") return { ...step, state: "warn", detail: "Todavía no tiene un estacionamiento Off Street", href: "/estacionamientos/nuevo" };
    return { ...step, state: "warn", detail: "", href: null };
  }), { active: false });
  return { id: null, code: null, name: "Sin estacionamiento", status: null, statusLabel: "Sin crear", active: false, steps,
    doneCount: steps.filter((step) => step.state === "ok").length, pendingCount: steps.filter((step) => step.state !== "ok").length };
}

// parkings: [{ parking, configurator }] de la empresa (cualquier tipo).
export function buildCompanySetup({ company, parkings = [], members = [], memberParkings = [] }) {
  const offStreet = parkings.filter((item) => item.parking.type === "OFF_STREET");
  const otherTypes = parkings.filter((item) => item.parking.type !== "OFF_STREET")
    .map(({ parking }) => ({ id: parking.id, code: parking.code, name: parking.name, type: parking.type, statusLabel: parkingStatusLabel(parking.status) }));
  const setups = offStreet.length
    ? offStreet.map(({ parking, configurator }) => buildParkingSetup({ company, parking, configurator, members, memberParkings }))
    : [buildMissingParkingSetup(company)];
  const pendingCount = setups.reduce((sum, item) => sum + item.pendingCount, 0);
  return {
    id: company.id,
    name: text(company.business_name) || text(company.trade_name) || "Empresa sin nombre",
    tradeName: text(company.trade_name),
    rut: formatRut(company.rut_number, company.rut_dv),
    parkings: setups,
    otherParkings: otherTypes,
    pendingCount,
    hasPending: pendingCount > 0,
  };
}

// Las cuentas con pendientes primero; dentro de cada grupo, por nombre.
export function sortCompanySetups(list) {
  return [...list].sort((a, b) => Number(b.hasPending) - Number(a.hasPending) || a.name.localeCompare(b.name, "es"));
}
