import Link from "next/link";
import { structureCreateHref, structureCreateLabel, streetZoneCreateHref } from "@/lib/parkingDetailView.mjs";

export { structureCreateHref, structureCreateLabel, streetZoneCreateHref };

export default function ParkingStructureAdmin({ parking, structure }) {
  const onStreet = parking.type === "ON_STREET";
  const entities = onStreet ? structure?.sectors || [] : structure?.levels || [];
  return <section className="space-y-4">
    <div>
      <h2 className="text-xl font-semibold text-[#041E42]">{onStreet ? "Áreas, Calles y Tramos" : "Niveles y Zonas"}</h2>
      <p className="mt-1 text-sm text-slate-600">La capacidad se calcula desde {onStreet ? "los tramos activos" : "las zonas activas"}.</p>
    </div>
    {structure?.source === "demo" ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Datos demostrativos de solo lectura. La estructura persistente todavía no está disponible.</p> : null}
    {!entities.length
      ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No hay {onStreet ? "áreas" : "niveles"} configurados.</div>
      : <StructureSpreadsheet parking={parking} entities={entities} onStreet={onStreet} />}
  </section>;
}

// Off Street: zonas de calle, calles y tramos (SOL-2026-10-23-001). Misma tabla que On Street.
export function ParkingStreetZonesAdmin({ parking, structure }) {
  const entities = structure?.sectors || [];
  return <section className="space-y-4">
    <div>
      <h2 className="text-xl font-semibold text-[#041E42]">Zonas de calle, calles y tramos</h2>
      <p className="mt-1 text-sm text-slate-600">Para operar en la vía pública con tickets de ingreso y salida. Ciudad: {parking.city || "—"}. El cupo de cada tramo se controla al registrar un ingreso.</p>
    </div>
    {!entities.length
      ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No hay zonas de calle configuradas. Usa «Crear zona de calle».</div>
      : <StructureSpreadsheet parking={parking} entities={entities} onStreet />}
  </section>;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Asignaciones de operadores a tramos de calle Off Street (horario, días y vigencia).
function OffStreetAssignmentsPanel({ parking, structure }) {
  const sectors = structure?.sectors || [];
  const streets = new Map(sectors.flatMap((sector) => sector.streets.map((street) => [street.id, { sector, street }])));
  const assignments = structure?.assignments || [];
  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
    <div>
      <h2 className="text-xl font-semibold text-[#041E42]">Operadores asignados a tramos</h2>
      <p className="mt-1 text-sm text-slate-600">Un operador puede tener varios tramos y un tramo varios operadores. Para asignar, entra a la calle en «Zonas de calle» y usa «Asignar operador». El operador puede registrar ingresos fuera de su rango: quedan marcados.</p>
    </div>
    {!assignments.length ? <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">Sin asignaciones a tramos de calle.</p> : <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{["Operador", "Zona", "Calle", "Rango", "Horario", "Días", "Vigencia", "Estado", ""].map((h) => <th key={h || "acciones"} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{assignments.map((item) => {
          const place = streets.get(item.street_id);
          const href = place ? `/estacionamientos/${parking.code}/sectores/${place.sector.id}/calles/${place.street.id}/operadores` : null;
          return <tr key={item.id}>
            <td className="px-3 py-2 font-semibold text-[#041E42]">{item.operator_name || item.operator_id}</td>
            <td className="px-3 py-2">{place?.sector.name || "—"}</td>
            <td className="px-3 py-2">{place?.street.name || "—"}</td>
            <td className="px-3 py-2 tabular-nums">{item.number_from}–{item.number_to}</td>
            <td className="px-3 py-2 tabular-nums">{String(item.start_time).slice(0, 5)}–{String(item.end_time).slice(0, 5)}</td>
            <td className="px-3 py-2">{(item.days_of_week || []).map((day) => DAY_LABELS[day] || day).join(", ")}</td>
            <td className="px-3 py-2">{item.valid_from}{item.valid_until ? ` → ${item.valid_until}` : " → sin término"}</td>
            <td className="px-3 py-2">{item.status === "ACTIVE" ? "Activa" : "Inactiva"}</td>
            <td className="px-3 py-2">{href ? <Link href={href} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold">Ver calle</Link> : null}</td>
          </tr>;
        })}</tbody></table></div>}
  </section>;
}

export function ParkingOperatorsPanel({ parking, structure }) {
  const onStreet = parking.type === "ON_STREET";
  if (!onStreet) return <div className="space-y-4"><OffStreetAssignmentsPanel parking={parking} structure={structure} /><div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">En el recinto Off Street, los turnos pueden crearse directamente desde el módulo Turnos seleccionando operador.</div></div>;
  return <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold text-[#041E42]">Operadores</h2><p className="mt-1 text-sm text-slate-600">Las asignaciones se administran desde cada calle y separan rango territorial, capacidad física y máximo operacional.</p></section>;
}

function StructureSpreadsheet({ parking, entities, onStreet }) {
  const headers = onStreet
    ? ["Código", parking.type === "OFF_STREET" ? "Zona" : "Área operacional", "Estado", "Descripción", "Calles", "Tramos", "Capacidad", "Acciones"]
    : ["Código", "Nivel", "Estado", "Cantidad de Plazas", "Descripción", "Zonas", "Capacidad en zonas", "Acciones"];

  return <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
    <table className="w-full min-w-[1150px] border-collapse text-left text-sm">
      <thead className="bg-[#E2F0D9] text-[#041E42]">
        <tr>{headers.map((header) => <th key={header} className="border-b border-r border-slate-300 px-3 py-3 font-semibold last:border-r-0">{header}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {entities.map((entity) => {
          const children = onStreet ? entity.streets || [] : entity.zones || [];
          const segmentCount = onStreet ? children.reduce((sum, street) => sum + (street.segments?.length || 0), 0) : 0;
          const capacity = onStreet
            ? children.reduce((sum, street) => sum + Number(street.metrics?.capacity || 0), 0)
            : children.reduce((sum, zone) => sum + Number(zone.capacity || 0), 0);
          const base = `/estacionamientos/${parking.code}/${onStreet ? "sectores" : "niveles"}/${entity.id}`;
          return <tr key={entity.id} className="align-top transition hover:bg-[#FFF2CC]">
            <td className="border-r border-slate-200 px-3 py-3 font-semibold text-[#3150D8]">{entity.code}</td>
            <td className="border-r border-slate-200 px-3 py-3 font-semibold text-[#041E42]">{entity.name}</td>
            <td className="border-r border-slate-200 px-3 py-3">{stateLabel(entity.status)}</td>
            {!onStreet ? <td className="border-r border-slate-200 px-3 py-3 font-semibold tabular-nums">{entity.capacity ?? 0}</td> : null}
            <td className="max-w-72 border-r border-slate-200 px-3 py-3 text-slate-600">{entity.description || "—"}</td>
            <td className="border-r border-slate-200 px-3 py-3 tabular-nums">{children.length}</td>
            {onStreet ? <td className="border-r border-slate-200 px-3 py-3 tabular-nums">{segmentCount}</td> : null}
            <td className="border-r border-slate-200 px-3 py-3 font-semibold tabular-nums">{capacity}</td>
            <td className="px-3 py-3">
              <div className="flex gap-2">
                <Link href={base} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold">Ver</Link>
                <Link href={`${base}/editar`} className="rounded-full border border-[#3150D8] px-3 py-1.5 text-xs font-semibold text-[#3150D8]">Modificar</Link>
              </div>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function stateLabel(status) {
  return { ACTIVE: "Activo", INACTIVE: "Inactivo", MAINTENANCE: "En mantenimiento" }[status] || status;
}
