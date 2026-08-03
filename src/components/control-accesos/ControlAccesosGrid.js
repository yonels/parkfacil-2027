import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import EstadoControlAccesoBadge from "./EstadoControlAccesoBadge";
import TipoControlAccesoBadge from "./TipoControlAccesoBadge";
import ModoControlAccesoBadge from "./ModoControlAccesoBadge";
import { resolveEstacionamiento, resolveDispositivo, resolveOperador, formatHorario, formatCapacidad } from "@/data/controlAccesos.mjs";

export default function ControlAccesosGrid({ accesos }) {
  const rows = accesos.map((item) => ({ ...item, estacionamiento: resolveEstacionamiento(item)?.nombre, dispositivo: resolveDispositivo(item)?.nombre, operador: resolveOperador(item)?.nombreCompleto }));
  const columns = [
    { key: "codigo", label: "Código" }, { key: "nombre", label: "Control de acceso", className: "font-semibold text-[#041E42]" },
    { key: "estacionamiento", label: "Estacionamiento" }, { key: "tipoAcceso", label: "Tipo", render: (r) => <TipoControlAccesoBadge tipoAcceso={r.tipoAcceso} /> },
    { key: "dispositivo", label: "Dispositivo" }, { key: "operador", label: "Operador" },
    { key: "horario", label: "Horario", render: (r) => formatHorario(r.horario) },
    { key: "capacidad", label: "Capacidad", render: (r) => formatCapacidad(r.capacidad) },
    { key: "modoOperacion", label: "Modo", render: (r) => <ModoControlAccesoBadge modoOperacion={r.modoOperacion} /> },
    { key: "estado", label: "Estado", render: (r) => <EstadoControlAccesoBadge estado={r.estado} /> },
  ];
  return <SpreadsheetTable columns={columns} rows={rows} rowHref={(r) => `/control-accesos/${r.id}`} minWidth={1450} />;
}
