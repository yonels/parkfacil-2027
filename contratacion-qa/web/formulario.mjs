export const DOCUMENTOS_CONTRATACION = [
  {
    "id": "condiciones-del-servicio",
    "titulo": "Condiciones del Servicio",
    "version": "0.2",
    "url": "/documentos/condiciones-del-servicio-v0.2.pdf",
    "sha256": "54f9649f364b17c1de4bddf9efb6c7ad8de8a4206ff6ef11aa45b2ef988f8df5"
  },
  {
    "id": "declaracion-confidencialidad-datos-personales",
    "titulo": "Declaración de Confidencialidad y Protección de Datos Personales",
    "version": "0.4",
    "url": "/documentos/declaracion-confidencialidad-datos-personales-v0.4.pdf",
    "sha256": "32b45cd2eae971ed1035cf2b3d1f5f2588565f9d4a0b555f6868b5bddbcfeb2a"
  }
];
export const PLANES_CONTRATACION = {
  "start": {
    "nombre": "ParkFacil Start",
    "plazas": "Hasta 50 plazas",
    "maxPlazas": 50,
    "precio": "1,50 UF + IVA / mes"
  },
  "business": {
    "nombre": "ParkFacil Business",
    "plazas": "Hasta 100 plazas",
    "maxPlazas": 100,
    "precio": "2,50 UF + IVA / mes"
  },
  "enterprise": {
    "nombre": "ParkFacil Enterprise",
    "plazas": "Hasta 300 plazas",
    "maxPlazas": 300,
    "precio": "4,50 UF + IVA / mes"
  }
};
export const CAMPOS_CONTRATACION = [["empresa", "Empresa (Razón Social)"], ["rut", "RUT Empresa"], ["giro", "Giro comercial"], ["direccion", "Dirección"], ["region", "Región"], ["ciudad", "Ciudad"], ["comuna", "Comuna"], ["telefono", "Teléfono móvil"], ["correo", "Correo"], ["estacionamientoNombre", "Nombre del estacionamiento"], ["estacionamientoDireccion", "Dirección del estacionamiento"], ["estacionamientoRegion", "Región del estacionamiento"], ["estacionamientoCiudad", "Ciudad del estacionamiento"], ["estacionamientoComuna", "Comuna del estacionamiento"], ["representanteNombres", "Nombres"], ["representanteApellidos", "Apellidos"], ["representanteRut", "RUT del representante"], ["representanteDireccion", "Dirección del representante"], ["representanteRegion", "Región del representante"], ["representanteCiudad", "Ciudad del representante"], ["representanteComuna", "Comuna del representante"], ["representanteTelefono", "Teléfono móvil del representante"], ["representanteCorreo", "Correo del representante"]];

export const OPCIONES_PLAZAS_CONTRATACION = [50, 100, 150, 200, 250, 300, 400, 500];

export function prepararContratacion(body, { validarRut, validarCorreo, fecha = new Date() }) {
  const plan = Object.hasOwn(PLANES_CONTRATACION, body.planId) ? PLANES_CONTRATACION[body.planId] : null;
  if (!plan) return { error: "Seleccione un plan válido." };
  const datos = {};
  for (const [campo, etiqueta] of CAMPOS_CONTRATACION) {
    const valor = typeof body[campo] === "string" ? body[campo].trim() : "";
    if (!valor || valor.length > 300) return { error: `${etiqueta} es obligatorio y debe tener hasta 300 caracteres.` };
    datos[campo] = valor;
  }
  if (!validarRut(datos.rut) || !validarRut(datos.representanteRut)) return { error: "Revise el RUT de la empresa y del representante." };
  if (!validarCorreo(datos.correo) || !validarCorreo(datos.representanteCorreo)) return { error: "Revise los correos de la empresa y del representante." };
  const plazas = Number(body.plazas);
  if (!Number.isSafeInteger(plazas) || plazas < 50) return { error: "Indique una cantidad entera de al menos 50 plazas." };
  if (body.aceptaCondiciones !== true || body.lecturaPrivacidad !== true) return { error: "Debe aceptar las Condiciones del Servicio y declarar la lectura de la declaración de privacidad." };
  if (!Array.isArray(body.documentos) || body.documentos.length !== DOCUMENTOS_CONTRATACION.length || DOCUMENTOS_CONTRATACION.some(doc => !body.documentos.some(item => item?.id === doc.id && item?.version === doc.version && item?.sha256 === doc.sha256))) return { error: "Los documentos han cambiado. Recargue el formulario y revise sus versiones vigentes." };
  const comentarios = typeof body.comentarios === "string" ? body.comentarios.trim() : "";
  if (comentarios.length > 2000) return { error: "Los comentarios deben tener hasta 2000 caracteres." };
  const registro = {
    tipo: "Solicitud de contratación", ...datos, plazas,
    planId: body.planId, plan: plan.nombre, valorPlan: plan.precio,
    comentarios,
    aceptacion: {
      fechaHora: fecha.toISOString(),
      solicitante: `${datos.representanteNombres} ${datos.representanteApellidos}`,
      rut: datos.representanteRut, correo: datos.representanteCorreo,
      condicionesAceptadas: true, privacidadLeida: true,
      documentos: DOCUMENTOS_CONTRATACION,
    },
  };
  // Se conserva en el campo existente mensaje del lead, junto a su ID.
  // No requiere migraciones ni descarta los antecedentes del formulario.
  return { registro, mensaje: JSON.stringify(registro, null, 2) };
}
