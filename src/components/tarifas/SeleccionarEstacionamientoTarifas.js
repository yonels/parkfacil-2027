"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstadoEstacionamientoBadge from "@/components/estacionamientos/EstadoEstacionamientoBadge";
import TipoEstacionamientoBadge from "@/components/estacionamientos/TipoEstacionamientoBadge";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { STATE_LABELS, TYPE_LABELS } from "@/lib/estacionamientos.mjs";
import { selectActiveRate } from "@/lib/parkingRates.mjs";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function billingModeLabel(mode) {
  if (mode === "EFFECTIVE_MINUTE") return "Minuto efectivo";
  if (mode === "EXPIRED_BLOCKS") return "Tramo vencido";
  return "Sin modalidad";
}

function activeRateValue(rate) {
  if (!rate) return null;
  if (rate.billingMode === "EFFECTIVE_MINUTE") return Number(rate.minuteAmount || 0);
  const firstBlock = [...(rate.blocks || [])].sort((a, b) => a.sequence - b.sequence)[0];
  return firstBlock ? Number(firstBlock.amount || 0) : 0;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value));
}

// Paso "Seleccionar estacionamiento" de la Administración de tarifas de estacionamiento:
// cada tarjeta lleva directo a /estacionamientos/{code}/tarifas, la página ya operativa
// que administra minuto efectivo / tramo vencido (ParkingRatesManager + motor legal).
export default function SeleccionarEstacionamientoTarifas({ parkings = [] }) {
  const router = useRouter();
  const [rateResultsByParkingCode, setRateResultsByParkingCode] = useState({});
  const [loadingRates, setLoadingRates] = useState(false);

  useEffect(() => {
    let active = true;
    if (!parkings.length) {
      const timer = window.setTimeout(() => {
        if (active) setRateResultsByParkingCode({});
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    async function loadRates() {
      setLoadingRates(true);
      const entries = await Promise.all(parkings.map(async (parking) => {
        try {
          const response = await authenticatedFetch(`/api/estacionamientos/${parking.code}/tarifas`);
          const body = await response.json().catch(() => ({}));
          if (!response.ok) return [parking.code, { state: "ERROR", rate: null }];
          const activeRate = selectActiveRate(body.data || []);
          return [parking.code, { state: activeRate ? "ACTIVE" : "EMPTY", rate: activeRate || null }];
        } catch {
          return [parking.code, { state: "ERROR", rate: null }];
        }
      }));
      if (!active) return;
      setRateResultsByParkingCode(Object.fromEntries(entries));
      setLoadingRates(false);
    }

    loadRates();
    return () => {
      active = false;
    };
  }, [parkings]);

  const rows = useMemo(() => {
    return parkings.map((parking) => {
      const result = rateResultsByParkingCode[parking.code];
      const rate = result?.rate || null;
      const tariffStatus = !result ? "LOADING" : result.state === "ERROR" ? "ERROR" : rate ? "ACTIVA" : "SIN_TARIFA";
      return {
        ...parking,
        tariffStatus,
        tariffMode: rate ? billingModeLabel(rate.billingMode) : tariffStatus === "LOADING" ? "Cargando" : tariffStatus === "ERROR" ? "Error al consultar" : "Sin tarifa activa",
        tariffValue: activeRateValue(rate),
        validFrom: rate?.validFrom || null,
        validUntil: rate?.validUntil || null,
        lastUpdated: rate?.updatedAt || rate?.validFrom || null,
      };
    });
  }, [parkings, rateResultsByParkingCode]);

  const filterOptions = useMemo(() => ({
    state: Object.entries(STATE_LABELS).map(([value, label]) => ({ value, label })),
    type: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
  }), []);

  const columns = useMemo(() => ([
    { key: "_selection", label: "", width: 52, minWidth: 52, pinned: true, sortable: false, required: true },
    {
      key: "code",
      label: "Codigo",
      width: 120,
      minWidth: 100,
      pinned: true,
      required: true,
      filterType: "text",
      render: (value) => <span className="font-semibold text-[#041E42]">{value}</span>,
    },
    {
      key: "name",
      label: "Estacionamiento",
      width: 280,
      minWidth: 220,
      pinned: true,
      required: true,
      filterType: "text",
      render: (value, row) => (
        <div>
          <p className="font-semibold text-[#041E42]">{value}</p>
          <p className="text-xs text-slate-500">{row.address || "Sin direccion"}</p>
        </div>
      ),
    },
    {
      key: "companyName",
      label: "Empresa",
      width: 220,
      minWidth: 180,
      filterType: "text",
    },
    {
      key: "city",
      label: "Ciudad",
      width: 140,
      minWidth: 120,
      filterType: "text",
    },
    {
      key: "type",
      label: "Modelo",
      width: 150,
      minWidth: 130,
      filterType: "select",
      filterOptions: filterOptions.type,
      exportValue: (row) => TYPE_LABELS[row.type] || row.type,
      render: (value) => <TipoEstacionamientoBadge type={value} />,
    },
    {
      key: "status",
      label: "Estado",
      width: 140,
      minWidth: 130,
      filterType: "select",
      filterOptions: filterOptions.state,
      exportValue: (row) => STATE_LABELS[row.status] || row.status,
      render: (value) => <EstadoEstacionamientoBadge status={value} />,
    },
    {
      key: "tariffStatus",
      label: "Tarifa vigente",
      width: 150,
      minWidth: 140,
      filterType: "select",
      filterOptions: [
        { value: "ACTIVA", label: "Activa" },
        { value: "SIN_TARIFA", label: "Sin tarifa" },
        { value: "LOADING", label: "Cargando" },
        { value: "ERROR", label: "Error al consultar" },
      ],
      render: (value) => {
        if (value === "ACTIVA") return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Activa</span>;
        if (value === "LOADING") return <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Cargando</span>;
        if (value === "ERROR") return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Error al consultar</span>;
        return <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Sin tarifa</span>;
      },
    },
    {
      key: "tariffMode",
      label: "Modalidad",
      width: 170,
      minWidth: 150,
      filterType: "select",
      filterOptions: [
        { value: "Minuto efectivo", label: "Minuto efectivo" },
        { value: "Tramo vencido", label: "Tramo vencido" },
        { value: "Sin tarifa activa", label: "Sin tarifa activa" },
        { value: "Cargando", label: "Cargando" },
        { value: "Error al consultar", label: "Error al consultar" },
      ],
    },
    {
      key: "tariffValue",
      label: "Valor",
      width: 140,
      minWidth: 120,
      filterType: "text",
      comparator: (a, b) => Number(a || 0) - Number(b || 0),
      exportValue: (row) => row.tariffValue == null ? "-" : Number(row.tariffValue),
      render: (value) => value == null ? "-" : <span className="tabular-nums">{money.format(value)}</span>,
    },
    {
      key: "validFrom",
      label: "Vigente desde",
      width: 150,
      minWidth: 130,
      filterType: "text",
      exportValue: (row) => row.validFrom || "",
      render: (value) => <span className="text-xs">{formatDate(value)}</span>,
    },
    {
      key: "validUntil",
      label: "Vigente hasta",
      width: 150,
      minWidth: 130,
      filterType: "text",
      exportValue: (row) => row.validUntil || "",
      render: (value) => <span className="text-xs">{formatDate(value)}</span>,
    },
    {
      key: "lastUpdated",
      label: "Ultima modificacion",
      width: 170,
      minWidth: 150,
      filterType: "text",
      exportValue: (row) => row.lastUpdated || "",
      render: (value) => <span className="text-xs">{formatDate(value)}</span>,
    },
  ]), [filterOptions]);

  return (
    <AppShell title="Administración de tarifas de estacionamiento" description="Selecciona un estacionamiento para configurar su tarifa">
      <div className="space-y-6">
        <PageHeader
          title="Administración de tarifas de estacionamiento"
          description="Selecciona el estacionamiento cuya tarifa legal (minuto efectivo o tramo vencido) quieres revisar o configurar."
        />

        <div className="rounded-3xl border border-[#DCE8FF] bg-[#F5F9FF] px-4 py-3 text-sm text-[#041E42]">
          <div className="flex items-center gap-2 font-semibold">
            <BadgeDollarSign className="h-4 w-4 text-[#3150D8]" />
            Doble click en una fila para abrir la configuracion de tarifas del estacionamiento.
          </div>
          {loadingRates ? <p className="mt-1 text-xs text-slate-600">Cargando tarifa vigente por estacionamiento...</p> : null}
        </div>

        <ParkFacilDataGrid
          storageKey="tarifas-admin-estacionamientos-v1"
          columns={columns}
          rows={rows}
          rowIdKey="id"
          globalSearchPlaceholder="Buscar por codigo, estacionamiento, empresa o ciudad"
          globalSearchAccessor={(row) => [row.code, row.name, row.companyName, row.city, row.address].join(" ")}
          onRowDoubleClick={(row) => router.push(`/estacionamientos/${row.code}/tarifas`)}
          emptyMessage={parkings.length ? "No hay estacionamientos que coincidan con los filtros." : "No hay estacionamientos disponibles para administrar tarifas."}
        />
      </div>
    </AppShell>
  );
}
