export function shiftDisplay({ parking, assignment, sector, street, operatorName }) {
  const offStreet = parking.type === "OFF_STREET";
  const missing = !assignment || !sector || !street;
  return {
    operatorName: operatorName?.trim() || "Operador sin nombre registrado",
    areaLabel: offStreet ? "Operación general Off Street" : missing ? "Asignación incompleta: falta una relación de área o calle" : `${sector.name} / ${street.name}`,
    assignmentExplanation: offStreet ? "La asignación operativa base no representa la capacidad física del estacionamiento." : missing ? "Revisa las relaciones del turno con su asignación, sector y calle." : null,
    spacesLabel: offStreet ? "No corresponde: asignación operativa base" : assignment ? `${assignment.max_vehicles} ${Number(assignment.max_vehicles) === 1 ? "plaza asignada" : "plazas asignadas"}` : "No disponible",
  };
}
