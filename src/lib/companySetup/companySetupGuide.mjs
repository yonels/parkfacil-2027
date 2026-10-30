// Identidad e instructivo de los 7 pasos de «Configurar empresa»
// (SOL-2026-10-29-014): cada paso es una pregunta con su color propio, y la
// guía tiene siempre los mismos 4 bloques para que se aprenda una sola vez.

export const STEP_COLORS = Object.freeze({
  empresa: "#3150D8",
  estacionamiento: "#0891B2",
  usuarios: "#7C3AED",
  tarifas: "#EA580C",
  zonas: "#DB2777",
  activacion: "#0F766E",
  turnos: "#0284C7",
});

export const STEP_GUIDES = Object.freeze({
  empresa: {
    para: "Registra a la empresa dueña del estacionamiento. Con estos datos se emiten documentos y se identifica al cliente.",
    tener: ["RUT de la empresa con dígito verificador", "Razón social y giro tal como están en el SII", "Correo y teléfono de contacto"],
    cuidado: ["El RUT debe ser el de la empresa, no el de una persona.", "La razón social debe coincidir con el SII (se usa en la boleta electrónica).", "Revisa el correo: ahí llegan los avisos importantes."],
    fin: "La empresa aparece con su RUT y su correo de contacto.",
  },
  estacionamiento: {
    para: "Crea el estacionamiento: su nombre, su dirección y cómo opera.",
    tener: ["Nombre con que lo conocen los clientes", "Dirección y ciudad", "Un código disponible del catálogo"],
    cuidado: ["El código se elige del catálogo: no se escribe ni se cambia después.", "Esta vista es para Off Street (recinto con entrada y salida).", "Un estacionamiento nuevo no aparece en el POS hasta activarlo."],
    fin: "El estacionamiento tiene nombre, dirección y ciudad.",
  },
  usuarios: {
    para: "Define quién administra la empresa y quién opera el POS en este estacionamiento.",
    tener: ["Nombre del administrador", "Nombre de cada operador", "Un usuario simple para cada operador (ej.: juan.perez)"],
    cuidado: ["Cada operador necesita su propio usuario: no se comparten.", "Anota la clave al crearla: después no se vuelve a mostrar.", "El operador debe tener acceso a este estacionamiento."],
    fin: "Hay un administrador activo y al menos un operador con acceso a este estacionamiento.",
  },
  tarifas: {
    para: "Define cuánto se cobra por estacionar.",
    tener: ["Valor por minuto, o el valor de cada franja horaria", "Minutos de gracia (si los hay)", "Desde qué fecha rige"],
    cuidado: ["La tarifa debe quedar Activa y vigente: sin ella no se puede activar el estacionamiento.", "Usa «franja horaria» si el valor cambia entre día y noche.", "Revisa los ceros: $35 no es lo mismo que $350."],
    fin: "Hay una tarifa Activa y vigente.",
  },
  zonas: {
    para: "Indica dónde se estaciona y cuántos vehículos caben.",
    tener: ["Niveles o pisos", "Nombre de cada zona", "Plazas de cada zona"],
    cuidado: ["Cada zona debe tener al menos 1 plaza.", "La suma de plazas es la capacidad del estacionamiento.", "Si es un solo espacio, crea un nivel y una zona «General»."],
    fin: "Hay al menos un nivel, una zona y una capacidad total mayor que 0.",
  },
  activacion: {
    para: "Revisa que no falte nada y activa el estacionamiento para que el POS lo ofrezca.",
    tener: ["Los pasos de estacionamiento, tarifas y zonas completos"],
    cuidado: ["Corrige lo pendiente antes de activar.", "Sin activar, el POS responde que el usuario no tiene un estacionamiento autorizado."],
    fin: "El estacionamiento queda Activo.",
  },
  turnos: {
    para: "Programa los turnos de los operadores.",
    tener: ["Qué operador trabaja", "Fecha, hora de inicio y de término"],
    cuidado: ["El término debe ser posterior al inicio.", "Solo aparecen los operadores con acceso al estacionamiento."],
    fin: "Hay turnos registrados para el estacionamiento.",
  },
});
