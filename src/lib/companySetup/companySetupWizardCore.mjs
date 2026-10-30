// Asistente «Nueva empresa» de «Configurar empresa» (SOL-2026-10-29-014, F2).
// Reglas puras del borrador de los pasos 1–3 y del avance correlativo.
//
// Decisiones del usuario (2026-10-30):
// - Pasos 1–3 se guardan como borrador en el navegador y se crean juntos al
//   terminar el paso 3 con la API actual POST /api/empresas (empresa +
//   estacionamiento en Borrador + 1 administrador y 2 operadores + correo de
//   enrolamiento). No se cambia esa API.
// - Pasos 4–7 reutilizan las pantallas actuales; su estado sale del
//   diagnóstico (companySetupCore.mjs).

import { isValidContactEmail, normalizeChileanMobile } from "../companyContactCore.mjs";

const text = (value) => String(value ?? "").trim();

export function emptyWizardDraft() {
  return {
    done: { 1: false, 2: false, 3: false },
    company: { rut: "", businessName: "", tradeName: "", businessActivity: "", contactEmail: "", mobilePhone: "", address: "", district: "", city: "" },
    parking: { name: "", address: "", district: "", city: "" },
    users: { administrator: "", operator1: "", operator2: "" },
    createdCompanyId: null,
    createdAccounts: null,
    enrollment: null,
  };
}

// Acepta «76.543.210-3», «76543210-3» o «765432103».
export function parseRut(value) {
  const clean = text(value).replace(/[.\s]/g, "").toUpperCase();
  const match = clean.match(/^(\d{7,8})-?([\dK])$/);
  if (!match) return null;
  let sum = 0;
  let factor = 2;
  for (let index = match[1].length - 1; index >= 0; index -= 1) {
    sum += Number(match[1][index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return expected === match[2] ? { number: match[1], dv: match[2] } : null;
}

export function formatRut({ number, dv }) {
  return `${String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

// Mismo código que asigna hoy POST /api/empresas al estacionamiento inicial.
export function defaultParkingCode(rut) {
  const parsed = parseRut(rut);
  return parsed ? `EMP-${parsed.number}-01` : "";
}

// existingRuts: RUT ya registrados con formato «76.543.210-3».
export function validateCompanyStep(company, existingRuts = []) {
  const errors = {};
  const rut = parseRut(company?.rut);
  if (!text(company?.rut)) errors.rut = "Escribe el RUT de la empresa.";
  else if (!rut) errors.rut = "Ese RUT no es válido. Revisa el dígito verificador.";
  else if (existingRuts.includes(formatRut(rut))) errors.rut = "Ya existe una empresa con ese RUT. Búscala en «Cuentas existentes».";
  if (!text(company?.businessName)) errors.businessName = "Escribe la razón social, tal como aparece en el SII.";
  if (!text(company?.businessActivity)) errors.businessActivity = "Escribe el giro.";
  if (!isValidContactEmail(company?.contactEmail)) errors.contactEmail = "Escribe un correo válido: ahí llegan los usuarios y claves.";
  if (text(company?.mobilePhone) && !normalizeChileanMobile(company.mobilePhone).ok) errors.mobilePhone = "El móvil debe tener el formato +56 9 XXXX XXXX.";
  return errors;
}

export function validateParkingStep(parking) {
  const errors = {};
  if (!text(parking?.name)) errors.name = "Escribe el nombre del estacionamiento.";
  if (!text(parking?.address)) errors.address = "Escribe la dirección.";
  if (!text(parking?.city)) errors.city = "Escribe la ciudad.";
  return errors;
}

export function validateUsersStep(users) {
  const errors = {};
  if (!text(users?.administrator)) errors.administrator = "Escribe el nombre completo del administrador.";
  if (!text(users?.operator1)) errors.operator1 = "Escribe el nombre completo del operador 1.";
  if (!text(users?.operator2)) errors.operator2 = "Escribe el nombre completo del operador 2.";
  return errors;
}

export function validateDraftStep(step, draft, existingRuts = []) {
  if (step === 1) return validateCompanyStep(draft.company, existingRuts);
  if (step === 2) return validateParkingStep(draft.parking);
  if (step === 3) return validateUsersStep(draft.users);
  return {};
}

// Cuerpo para POST /api/empresas (mismo contrato que «Crear empresa»).
export function buildCompanyCreatePayload(draft) {
  const rut = parseRut(draft.company.rut);
  const mobile = text(draft.company.mobilePhone) ? normalizeChileanMobile(draft.company.mobilePhone) : null;
  return {
    businessName: text(draft.company.businessName),
    tradeName: text(draft.company.tradeName) || text(draft.company.businessName),
    businessActivity: text(draft.company.businessActivity),
    rutNumber: rut?.number || "",
    rutDv: rut?.dv || "",
    contactEmail: text(draft.company.contactEmail).toLowerCase(),
    mobilePhone: mobile?.ok ? mobile.value : "",
    address: text(draft.company.address),
    district: text(draft.company.district),
    city: text(draft.company.city),
    country: "Chile",
    products: ["OFF_STREET"],
    administrator: { fullName: text(draft.users.administrator) },
    operators: [{ fullName: text(draft.users.operator1) }, { fullName: text(draft.users.operator2) }],
    defaultParking: {
      type: "OFF_STREET",
      name: text(draft.parking.name),
      address: text(draft.parking.address),
      district: text(draft.parking.district),
      city: text(draft.parking.city),
    },
  };
}

// Paso actual del asistente: antes de crear la empresa, el primer paso 1–3
// sin terminar; después, el primer paso del estacionamiento que no está
// completo (8 = todo listo).
export function currentWizardStep(draft, parkingSetup = null) {
  if (!draft.createdCompanyId) {
    for (const step of [1, 2, 3]) if (!draft.done[step]) return step;
    return 3;
  }
  if (!parkingSetup) return 4;
  const pending = parkingSetup.steps.find((step) => step.state !== "ok");
  return pending ? pending.n : 8;
}

// Un paso se puede abrir si ya está completo o es el paso actual.
export function canOpenWizardStep(step, draft, parkingSetup = null) {
  const current = currentWizardStep(draft, parkingSetup);
  if (!draft.createdCompanyId) return step <= 3 && step <= current;
  if (step <= 3) return true;
  const state = parkingSetup?.steps.find((item) => item.n === step)?.state;
  return step === current || state === "ok" || (state === "warn" && parkingSetup?.active);
}
