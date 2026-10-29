"use client";

import { useMemo, useState } from "react";

const PILOT = {
  name: "Hermanos Amunátegui",
  crossStreets: "entre Catedral y Compañía de Jesús",
  city: "Santiago Centro, Chile",
  // Solamente referencia de sector, NO coordenadas de plazas reales.
  referenceUrl: "https://www.google.com/maps/search/?api=1&query=Amunategui%20entre%20Catedral%20y%20Compania%20de%20Jesus%2C%20Santiago%2C%20Chile",
};
const demoSpaces = Array.from({ length: 24 }, (_, i) => ({
  id: `DEMO-${String(i + 1).padStart(2, "0")}`,
  status: ["occupied", "vacant", "expired", "unknown"][i % 4],
  checkedAt: null,
}));
const states = {
  vacant: { label: "Libre observada", color: "#198754", border: "#b1dfc1" },
  occupied: { label: "Ocupada", color: "#cf3e49", border: "#ffbdc4" },
  expired: { label: "Pago vencido / verificar", color: "#b47700", border: "#f5d18b" },
  unknown: { label: "Sin datos confiables", color: "#6b7280", border: "#d1d5db" },
};

export default function PilotoAmunateguiFinder() {
  const [destination, setDestination] = useState("Amunátegui entre Catedral y Compañía de Jesús, Santiago");
  const [radius, setRadius] = useState("400");
  const [mode, setMode] = useState("cliente");
  const [spaces, setSpaces] = useState(demoSpaces);
  const [selectedId, setSelectedId] = useState("DEMO-01");
  const selected = spaces.find((item) => item.id === selectedId);
  const counts = useMemo(() => Object.fromEntries(Object.keys(states).map((key) => [key, spaces.filter((item) => item.status === key).length])), [spaces]);
  function setSpaceStatus(status) {
    setSpaces((list) => list.map((p) => p.id === selectedId ? { ...p, status, checkedAt: new Date().toLocaleTimeString("es-CL") } : p));
  }
  function openMaps() {
    const address = destination.trim() || `${PILOT.name}, ${PILOT.city}`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank", "noopener,noreferrer");
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-[#7c3f22] p-7 text-white shadow">
          <p className="text-sm uppercase tracking-widest text-orange-100">ParkFacil On Street · Piloto controlado</p>
          <h1 className="mt-2 text-3xl font-bold">Smart Parking Finder</h1>
          <p className="mt-2">Amunátegui · entre Catedral y Compañía de Jesús · Santiago Centro</p>
        </header>
        <div className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status">
          DEMOSTRACIÓN. Las 24 plazas, sus estados y cambios son FICTICIOS. No se ha efectuado el levantamiento físico, y esta pantalla no contiene disponibilidad real ni realiza cobros o fiscalizaciones.
        </div>
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">1. ¿A dónde te diriges?</h2>
          <label className="mt-3 block text-sm" htmlFor="destination">Calle, dirección o destino</label>
          <input id="destination" value={destination} onChange={(e) => setDestination(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" placeholder="Escribe una dirección" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="radius" className="text-sm">Distancia a pie</label>
            <select id="radius" value={radius} onChange={(e) => setRadius(e.target.value)} className="rounded-lg border p-2"><option value="200">200 m</option><option value="400">400 m</option><option value="800">800 m</option></select>
            <button type="button" onClick={openMaps} className="rounded-lg bg-[#7c3f22] px-4 py-3 text-white">Buscar destino en Google Maps ↗</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">El radio se aplicará a plazas georreferenciadas cuando exista inventario real. En esta demostración no se filtran las plazas ficticias.</p>
        </section>
        <section className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <h2 className="px-5 pt-5 text-lg font-semibold">2. Referencia de Google Maps</h2>
            <p className="px-5 pb-3 text-xs text-slate-600">Mapa del sector, sin marcadores de plazas reales.</p>
            <iframe title="Referencia cartográfica de Amunátegui en Google Maps" className="h-80 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=Amunategui%20y%20Catedral%2C%20Santiago%20Chile&output=embed" />
            <a className="block p-4 text-sm font-medium text-blue-700 underline" href={PILOT.referenceUrl} target="_blank" rel="noopener noreferrer">Abrir el tramo de referencia en Google Maps</a>
          </div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">3. Vista de plazas (esquema)</h2>
            <div className="my-4 grid grid-cols-4 gap-2">
              {spaces.map((space) => <button key={space.id} type="button" title={states[space.status].label} aria-label={`${space.id}: ${states[space.status].label}`} onClick={() => setSelectedId(space.id)} className="min-h-14 rounded-lg border-2 p-2 text-xs font-bold text-white" style={{ backgroundColor: states[space.status].color, borderColor: selectedId === space.id ? "#0f172a" : states[space.status].border }}>{space.id.slice(5)}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">{Object.entries(states).map(([key,value]) => <p key={key}><span className="mr-2 inline-block h-3 w-3 rounded-sm" style={{background:value.color}} />{value.label}: {counts[key]}</p>)}</div>
            <p className="mt-4 text-xs text-slate-500">La disposición de cuadros NO reproduce el trazado físico de la calle.</p>
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">4. Probar los tres perfiles</h2>
          <div className="mt-3 flex flex-wrap gap-2">{["cliente","operador","inspector"].map((name) => <button type="button" key={name} onClick={() => setMode(name)} className={`rounded-full px-4 py-2 capitalize ${mode === name ? "bg-[#7c3f22] text-white" : "bg-slate-100"}`}>{name}</button>)}</div>
          <p className="mt-4"><strong>{selectedId}</strong> — {states[selected.status].label}{selected.checkedAt ? ` · actualizado en la simulación: ${selected.checkedAt}` : ""}</p>
          {mode === "cliente" && <p className="mt-2 text-sm text-slate-600">El conductor solo consulta el estado de demostración. En la versión real las plazas no verificadas no se anunciarán como disponibles.</p>}
          {mode === "operador" && <p className="mt-2 text-sm text-slate-600">El operador registra la patente y los pagos en el POS existente. El vencimiento cambia el estado de pago, pero no garantiza que la plaza quede libre.</p>}
          {mode === "inspector" && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setSpaceStatus("vacant")} className="rounded-lg bg-green-700 p-3 text-white">Confirmar plaza vacía (simulación)</button><button onClick={() => setSpaceStatus("occupied")} className="rounded-lg bg-red-700 p-3 text-white">Confirmar vehículo presente (simulación)</button><button onClick={() => setSpaceStatus("unknown")} className="rounded-lg bg-slate-600 p-3 text-white">Marcar desconocida</button></div>}
          <p className="mt-4 text-xs text-slate-500">Los cambios se mantienen solo en la memoria de este navegador. No se envían a ninguna base de datos.</p>
        </section>
        <footer className="text-xs text-slate-500">Fase 0: prototipo de interfaz. Pendientes: inventario de plazas autorizado, Google Maps Platform con credenciales, APIs de On Street y validación en terreno.</footer>
      </div>
    </main>
  );
}
