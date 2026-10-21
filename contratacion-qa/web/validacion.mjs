export const ESTADOS_LEAD = Object.freeze([
  "Nuevo",
  "Contactado",
  "Seguimiento",
  "Cotizado",
  "Pendiente",
  "Contratado",
  "Descartado",
]);

export const CAMPOS_EDITABLES_LEAD = Object.freeze([
  "empresa",
  "rut",
  "contacto",
  "correo",
  "telefono",
  "plazas",
  "mensaje",
  "estado",
  "responsable_id",
  "observaciones",
  "proximo_seguimiento",
  "proxima_accion",
]);

export function normalizarTexto(valor, { requerido = false } = {}) {
  if (valor === null && !requerido) return null;
  if (typeof valor !== "string") return { error: "debe ser texto" };
  const texto = valor.trim();
  if (requerido && !texto) return { error: "es obligatorio" };
  return texto || null;
}

export function limpiarRut(valor) {
  return String(valor || "").replace(/\./g, "").replace(/-/g, "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatearRut(valor) {
  const limpio = limpiarRut(valor);
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${limpio.slice(-1)}`;
}

export function validarRut(valor) {
  const limpio = limpiarRut(valor);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  if (!/^\d+$/.test(cuerpo) || Number(cuerpo) <= 0) return false;
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resultado = 11 - (suma % 11);
  const dv = resultado === 11 ? "0" : resultado === 10 ? "K" : String(resultado);
  return dv === limpio.slice(-1);
}

export function validarCorreo(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || ""));
}

export function validarTelefono(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  return digitos.length >= 7 && digitos.length <= 15;
}

export function camposNoAutorizados(payload, permitidos = CAMPOS_EDITABLES_LEAD) {
  return Object.keys(payload || {}).filter((campo) => !permitidos.includes(campo));
}

export function prepararCambiosLead(payload, actual) {
  const errores = {};
  const candidato = { ...actual };
  const textosRequeridos = ["empresa", "rut", "contacto", "correo", "telefono"];
  const textosOpcionales = ["mensaje", "observaciones", "proxima_accion"];

  for (const campo of textosRequeridos) {
    if (payload[campo] === undefined) continue;
    const valor = normalizarTexto(payload[campo], { requerido: true });
    if (valor?.error) errores[campo] = valor.error;
    else candidato[campo] = campo === "correo" ? valor.toLowerCase() : valor;
  }
  for (const campo of textosOpcionales) {
    if (payload[campo] === undefined) continue;
    const valor = normalizarTexto(payload[campo]);
    if (valor?.error) errores[campo] = valor.error;
    else candidato[campo] = valor;
  }

  if (!validarRut(candidato.rut)) errores.rut = "no es válido";
  else candidato.rut = formatearRut(candidato.rut);
  if (!validarCorreo(candidato.correo)) errores.correo = "no es válido";
  if (!validarTelefono(candidato.telefono)) errores.telefono = "no es válido";

  if (payload.plazas !== undefined) {
    const plazas = payload.plazas === null || payload.plazas === "" ? null : Number(payload.plazas);
    if (plazas !== null && (!Number.isInteger(plazas) || plazas < 1)) errores.plazas = "debe ser un entero mayor que cero";
    else candidato.plazas = plazas;
  }
  if (payload.estado !== undefined) {
    if (!ESTADOS_LEAD.includes(payload.estado)) errores.estado = "no es válido";
    else candidato.estado = payload.estado;
  }
  if (payload.responsable_id !== undefined) {
    if (payload.responsable_id !== null && typeof payload.responsable_id !== "string") errores.responsable_id = "no es válido";
    else candidato.responsable_id = payload.responsable_id || null;
  }
  if (payload.proximo_seguimiento !== undefined) {
    if (!payload.proximo_seguimiento) candidato.proximo_seguimiento = null;
    else {
      const fecha = new Date(payload.proximo_seguimiento);
      if (Number.isNaN(fecha.getTime())) errores.proximo_seguimiento = "no es válida";
      else candidato.proximo_seguimiento = fecha.toISOString();
    }
  }

  if (Object.keys(errores).length) return { ok: false, errores };
  const cambios = {};
  for (const campo of CAMPOS_EDITABLES_LEAD) {
    if (payload[campo] !== undefined && String(actual[campo] ?? "") !== String(candidato[campo] ?? "")) cambios[campo] = candidato[campo];
  }
  return { ok: true, cambios, candidato };
}

export function describirCambiosLead(cambios, actual) {
  return Object.entries(cambios).map(([campo, nuevo]) => ({
    campo,
    anterior: actual[campo] ?? null,
    nuevo: nuevo ?? null,
  }));
}

