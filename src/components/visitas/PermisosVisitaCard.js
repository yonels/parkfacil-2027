export default function PermisosVisitaCard({ visita, estacionamientos, accesos }) {
  const permisos = visita.permisos || {};

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <p><span className="font-semibold text-[#041E42]">Estacionamientos autorizados:</span> {estacionamientos.length ? estacionamientos.map((item) => item.nombre).join(", ") : "No disponible"}</p>
      <p className="mt-2"><span className="font-semibold text-[#041E42]">Accesos autorizados:</span> {accesos.length ? accesos.map((item) => item.codigo).join(", ") : "No disponible"}</p>
      <p className="mt-2"><span className="font-semibold text-[#041E42]">Zonas:</span> {permisos.zonasAutorizadas?.length ? permisos.zonasAutorizadas.join(", ") : "No disponible"}</p>
      <p className="mt-2"><span className="font-semibold text-[#041E42]">Restricciones:</span> {permisos.restricciones?.length ? permisos.restricciones.join(" · ") : "No disponible"}</p>
      <p className="mt-2"><span className="font-semibold text-[#041E42]">Modalidad:</span> {visita.multipleEntry ? "Multiples ingresos" : "Ingreso unico"}</p>
      <p className="mt-2"><span className="font-semibold text-[#041E42]">Horario especifico:</span> {permisos.horarioEspecifico || "No disponible"}</p>
    </div>
  );
}
