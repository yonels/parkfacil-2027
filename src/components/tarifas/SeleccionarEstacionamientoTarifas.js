"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstadoEstacionamientoBadge from "@/components/estacionamientos/EstadoEstacionamientoBadge";
import TipoEstacionamientoBadge from "@/components/estacionamientos/TipoEstacionamientoBadge";
import { filterParkings } from "@/lib/estacionamientos.mjs";

// Paso "Seleccionar estacionamiento" de la Administración de tarifas de estacionamiento:
// cada tarjeta lleva directo a /estacionamientos/{code}/tarifas, la página ya operativa
// que administra minuto efectivo / tramo vencido (ParkingRatesManager + motor legal).
export default function SeleccionarEstacionamientoTarifas({ parkings = [] }) {
  const [search, setSearch] = useState("");
  const resultados = useMemo(() => filterParkings(parkings, { search }), [parkings, search]);

  return (
    <AppShell title="Administración de tarifas de estacionamiento" description="Selecciona un estacionamiento para configurar su tarifa">
      <div className="space-y-6">
        <PageHeader
          title="Administración de tarifas de estacionamiento"
          description="Selecciona el estacionamiento cuya tarifa legal (minuto efectivo o tramo vencido) quieres revisar o configurar."
        />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <Search className="h-4 w-4 text-[#3150D8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, código, empresa o ciudad"
              className="w-full bg-transparent outline-none"
            />
          </label>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resultados.map((parking) => (
              <Link
                key={parking.id}
                href={`/estacionamientos/${parking.code}/tarifas`}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-[#3150D8] hover:bg-[#F5F9FF]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <TipoEstacionamientoBadge type={parking.type} />
                    <EstadoEstacionamientoBadge status={parking.status} />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-[#041E42]">{parking.name}</h3>
                  <p className="text-sm text-slate-500">{parking.code} · {parking.companyName}</p>
                  <p className="mt-1 text-xs text-slate-400">{parking.city || "Sin ciudad registrada"}</p>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
                  <BadgeDollarSign className="h-4 w-4" /> Configurar tarifas
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
            {!resultados.length ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                {parkings.length ? "No hay estacionamientos que coincidan con la búsqueda." : "No hay estacionamientos disponibles para administrar tarifas."}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
