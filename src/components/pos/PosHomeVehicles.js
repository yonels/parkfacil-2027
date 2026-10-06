"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { configuredParkingCapacity, homeVehicleMinutes, homeVehiclePagination, sortHomeVehicles } from "@/lib/pos/homeVehicles.mjs";

export default function PosHomeVehicles({ stays, capacity, onSelect, formatEntry, formatPlate }) {
  const rowsRef = useRef(null);
  const [height, setHeight] = useState(44);
  const [requestedPage, setRequestedPage] = useState(1);
  const [clock, setClock] = useState(0);
  const rows = useMemo(() => sortHomeVehicles(stays), [stays]);
  const clockAnchor = useRef({ local: 0, server: 0 });

  useEffect(() => {
    const local = Date.now();
    const server = Date.parse(stays?.[0]?.serverNow);
    clockAnchor.current = { local, server: Number.isFinite(server) ? server : local };
    const tick = () => setClock(clockAnchor.current.server + Date.now() - clockAnchor.current.local);
    tick();
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, [stays]);

  useEffect(() => {
    const element = rowsRef.current;
    if (!element) return;
    const measure = () => setHeight(Math.max(44, Math.floor(element.getBoundingClientRect().height)));
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const { pageSize, pageCount, page, start } = homeVehiclePagination(rows.length, height, requestedPage);
  const visible = rows.slice(start, start + pageSize);
  const configuredCapacity = configuredParkingCapacity([{ capacity }]);
  const occupancy = configuredCapacity ? Math.round(rows.length / configuredCapacity * 100) : null;

  return (
    <section className="pos-home-vehicles" aria-label="Vehículos actualmente en el estacionamiento">
      <h2>Vehículos en parking: {rows.length}</h2>
      {configuredCapacity ? (
        <div className="pos-home-occupancy">
          <div className="pos-home-occupancy-track" role="progressbar" aria-label="Ocupación del estacionamiento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, occupancy)} aria-valuetext={`${rows.length} de ${configuredCapacity} cupos, ${occupancy}%`}>
            <span style={{ width: `${Math.min(100, occupancy)}%` }} />
          </div>
          <span>{rows.length} de {configuredCapacity} cupos · {occupancy}%</span>
        </div>
      ) : null}
      <div className="pos-home-vehicle-heading" aria-hidden="true"><span>Patente</span><span>Ingreso ↑</span><span>Minutos</span></div>
      <div ref={rowsRef} className="pos-home-vehicle-rows">
        {rows.length ? (
          <table aria-label="Vehículos ordenados por hora de entrada, más antiguos primero">
            <thead className="sr-only"><tr><th>Patente</th><th>Hora de ingreso</th><th>Minutos transcurridos</th></tr></thead>
            <tbody>{visible.map((stay) => {
              const entry = formatEntry(stay.entry_at);
              const minutes = homeVehicleMinutes(stay.entry_at, clock);
              return (
                <tr key={stay.id} onClick={() => onSelect(stay)}>
                  <td><button type="button" onClick={(event) => { event.stopPropagation(); onSelect(stay); }} aria-label={`Ver detalle de ${formatPlate(stay.license_plate)}`}>{formatPlate(stay.license_plate)}</button></td>
                  <td title={entry.date}>{entry.time}</td><td>{minutes ?? "—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <p className="pos-home-empty">No hay vehículos en el parking.</p>}
      </div>
      <nav className="pos-home-vehicle-pagination" aria-label="Páginas de vehículos">
        <button type="button" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>‹ Anterior</button>
        <span aria-live="polite">Página {page} de {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>Siguiente ›</button>
      </nav>
    </section>
  );
}
