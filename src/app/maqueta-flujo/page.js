"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  KeyRound,
  MapPin,
  MonitorSmartphone,
  ParkingSquare,
  Plus,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

const empresasIniciales = [
  {
    id: "empresa-1",
    razonSocial: "Inmobiliaria Centro SpA",
    nombreFantasia: "Grupo Centro",
    rut: "76.123.456-7",
    estado: "Activa",
    estacionamientos: [
      {
        id: "parking-1",
        nombre: "Parking Centro",
        codigo: "EST-001",
        direccion: "Bandera 150, Santiago",
        tipo: "Off Street",
        estado: "Activo",
        plazas: 250,
      },
      {
        id: "parking-2",
        nombre: "Parking Norte",
        codigo: "EST-002",
        direccion: "Recoleta 850, Santiago",
        tipo: "Off Street",
        estado: "Activo",
        plazas: 120,
      },
    ],
  },
  {
    id: "empresa-2",
    razonSocial: "Servicios Urbanos del Sur SpA",
    nombreFantasia: "Parking Sur",
    rut: "77.654.321-0",
    estado: "Activa",
    estacionamientos: [
      {
        id: "parking-3",
        nombre: "Estacionamiento Municipal Sur",
        codigo: "EST-003",
        direccion: "Centro de Concepción",
        tipo: "On Street",
        estado: "Activo",
        plazas: 480,
      },
    ],
  },
];

const opcionesEstacionamiento = [
  {
    id: "administradores",
    titulo: "Administradores",
    descripcion: "Usuarios responsables de la administración.",
    icono: UserCog,
  },
  {
    id: "operadores",
    titulo: "Operadores",
    descripcion: "Personal que registra ingresos, cobros y salidas.",
    icono: Users,
  },
  {
    id: "tarifas",
    titulo: "Tarifas y planes",
    descripcion: "Reglas de cobro aplicables al estacionamiento.",
    icono: CircleDollarSign,
  },
  {
    id: "dispositivos",
    titulo: "Dispositivos",
    descripcion: "POS, cámaras, barreras, lectores y sensores.",
    icono: MonitorSmartphone,
  },
  {
    id: "abonados",
    titulo: "Abonados y credenciales",
    descripcion: "Clientes frecuentes, vehículos y accesos.",
    icono: KeyRound,
  },
  {
    id: "seguridad",
    titulo: "Seguridad y accesos",
    descripcion: "Roles, permisos y restricciones operacionales.",
    icono: ShieldCheck,
  },
  {
    id: "operacion",
    titulo: "Operación",
    descripcion: "Ingresos, salidas, vehículos pendientes y caja.",
    icono: ParkingSquare,
  },
  {
    id: "recaudacion",
    titulo: "Recaudación",
    descripcion: "Pagos, transacciones y conciliación.",
    icono: CircleDollarSign,
  },
  {
    id: "reportes",
    titulo: "Reportes",
    descripcion: "Información operacional y financiera.",
    icono: FileText,
  },
  {
    id: "configuracion",
    titulo: "Configuración",
    descripcion: "Parámetros generales del estacionamiento.",
    icono: Settings,
  },
];

function Encabezado({ titulo, descripcion, volver }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-6">
        {volver && (
          <button
            type="button"
            onClick={volver}
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-[#3150D8]"
          >
            <ArrowLeft size={17} />
            Volver
          </button>
        )}

        <h1 className="text-2xl font-bold text-[#041E42]">{titulo}</h1>

        <p className="mt-1 text-sm text-slate-500">{descripcion}</p>
      </div>
    </div>
  );
}

function Estado({ children }) {
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
      {children}
    </span>
  );
}

function VistaEmpresas({ empresas, seleccionarEmpresa }) {
  return (
    <>
      <Encabezado
        titulo="Empresas"
        descripcion="Seleccione una empresa para administrar sus estacionamientos."
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[#041E42]">
              Empresas registradas
            </h2>
            <p className="text-sm text-slate-500">
              Todo el proceso comienza seleccionando una empresa.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus size={17} />
            Crear empresa
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {empresas.map((empresa) => (
            <button
              key={empresa.id}
              type="button"
              onClick={() => seleccionarEmpresa(empresa)}
              className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#3150D8] hover:shadow-md"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#3150D8]">
                <Building2 size={24} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-[#041E42]">
                      {empresa.razonSocial}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {empresa.rut}
                    </p>
                  </div>

                  <Estado>{empresa.estado}</Estado>
                </div>

                <p className="mt-3 text-sm text-slate-600">
                  {empresa.estacionamientos.length} estacionamiento
                  {empresa.estacionamientos.length !== 1 ? "s" : ""}
                </p>
              </div>

              <ChevronRight className="text-slate-400" size={20} />
            </button>
          ))}
        </div>
      </main>
    </>
  );
}

function VistaEmpresa({
  empresa,
  volver,
  seleccionarEstacionamiento,
}) {
  return (
    <>
      <Encabezado
        titulo={empresa.razonSocial}
        descripcion={`${empresa.rut} · ${empresa.nombreFantasia}`}
        volver={volver}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Empresa seleccionada
              </p>

              <h2 className="mt-1 text-xl font-bold text-[#041E42]">
                {empresa.razonSocial}
              </h2>

              <p className="mt-1 text-sm text-slate-500">{empresa.rut}</p>
            </div>

            <Estado>{empresa.estado}</Estado>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[#041E42]">Estacionamientos</h2>
            <p className="text-sm text-slate-500">
              Seleccione un estacionamiento para continuar.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus size={17} />
            Crear estacionamiento
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {empresa.estacionamientos.map((estacionamiento) => (
            <button
              key={estacionamiento.id}
              type="button"
              onClick={() => seleccionarEstacionamiento(estacionamiento)}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#3150D8] hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#3150D8]">
                  <ParkingSquare size={24} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-[#041E42]">
                        {estacionamiento.nombre}
                      </h3>

                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {estacionamiento.codigo}
                      </p>
                    </div>

                    <Estado>{estacionamiento.estado}</Estado>
                  </div>

                  <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
                    <MapPin size={16} className="mt-0.5 shrink-0" />
                    <span>{estacionamiento.direccion}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {estacionamiento.tipo}
                    </span>

                    <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {estacionamiento.plazas} plazas
                    </span>
                  </div>
                </div>

                <ChevronRight className="text-slate-400" size={20} />
              </div>
            </button>
          ))}
        </div>
      </main>
    </>
  );
}

function VistaEstacionamiento({
  empresa,
  estacionamiento,
  volver,
  seleccionarOpcion,
}) {
  return (
    <>
      <Encabezado
        titulo={estacionamiento.nombre}
        descripcion={`${empresa.razonSocial} · ${estacionamiento.codigo}`}
        volver={volver}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-500">Empresas</span>
          <ChevronRight size={15} className="text-slate-300" />
          <span className="font-semibold text-slate-500">
            {empresa.nombreFantasia}
          </span>
          <ChevronRight size={15} className="text-slate-300" />
          <span className="font-bold text-[#3150D8]">
            {estacionamiento.nombre}
          </span>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-5 md:grid-cols-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Tipo
              </p>
              <p className="mt-1 font-bold text-[#041E42]">
                {estacionamiento.tipo}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Plazas
              </p>
              <p className="mt-1 font-bold text-[#041E42]">
                {estacionamiento.plazas}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Dirección
              </p>
              <p className="mt-1 font-bold text-[#041E42]">
                {estacionamiento.direccion}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Estado
              </p>
              <div className="mt-1">
                <Estado>{estacionamiento.estado}</Estado>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-5">
          <h2 className="font-bold text-[#041E42]">
            Administración del estacionamiento
          </h2>
          <p className="text-sm text-slate-500">
            Todos los elementos creados desde aquí quedarán relacionados con
            esta empresa y este estacionamiento.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {opcionesEstacionamiento.map((opcion) => {
            const Icono = opcion.icono;

            return (
              <button
                key={opcion.id}
                type="button"
                onClick={() => seleccionarOpcion(opcion)}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#3150D8] hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#3150D8]">
                  <Icono size={21} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[#041E42]">
                    {opcion.titulo}
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    {opcion.descripcion}
                  </p>
                </div>

                <ChevronRight className="mt-1 text-slate-400" size={18} />
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}

function VistaOpcion({
  empresa,
  estacionamiento,
  opcion,
  volver,
}) {
  const Icono = opcion.icono;

  return (
    <>
      <Encabezado
        titulo={opcion.titulo}
        descripcion={`${empresa.nombreFantasia} · ${estacionamiento.nombre}`}
        volver={volver}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">{empresa.nombreFantasia}</span>
          <ChevronRight size={15} className="text-slate-300" />
          <span className="text-slate-500">{estacionamiento.nombre}</span>
          <ChevronRight size={15} className="text-slate-300" />
          <span className="font-bold text-[#3150D8]">{opcion.titulo}</span>
        </div>

        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#3150D8]">
            <Icono size={27} />
          </div>

          <h2 className="mt-4 text-xl font-bold text-[#041E42]">
            {opcion.titulo}
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Esta pantalla representa el módulo existente, pero abierto dentro
            del contexto de la empresa y el estacionamiento seleccionados.
          </p>

          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left text-sm">
            <p>
              <strong>Empresa:</strong> {empresa.razonSocial}
            </p>
            <p className="mt-2">
              <strong>Estacionamiento:</strong> {estacionamiento.nombre}
            </p>
            <p className="mt-2">
              <strong>Módulo:</strong> {opcion.titulo}
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

export default function MaquetaFlujoPage() {
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState(null);
  const [estacionamientoSeleccionado, setEstacionamientoSeleccionado] =
    useState(null);
  const [opcionSeleccionada, setOpcionSeleccionada] = useState(null);

  if (!empresaSeleccionada) {
    return (
      <div className="min-h-screen bg-slate-50">
        <VistaEmpresas
          empresas={empresasIniciales}
          seleccionarEmpresa={setEmpresaSeleccionada}
        />
      </div>
    );
  }

  if (!estacionamientoSeleccionado) {
    return (
      <div className="min-h-screen bg-slate-50">
        <VistaEmpresa
          empresa={empresaSeleccionada}
          volver={() => setEmpresaSeleccionada(null)}
          seleccionarEstacionamiento={setEstacionamientoSeleccionado}
        />
      </div>
    );
  }

  if (!opcionSeleccionada) {
    return (
      <div className="min-h-screen bg-slate-50">
        <VistaEstacionamiento
          empresa={empresaSeleccionada}
          estacionamiento={estacionamientoSeleccionado}
          volver={() => setEstacionamientoSeleccionado(null)}
          seleccionarOpcion={setOpcionSeleccionada}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <VistaOpcion
        empresa={empresaSeleccionada}
        estacionamiento={estacionamientoSeleccionado}
        opcion={opcionSeleccionada}
        volver={() => setOpcionSeleccionada(null)}
      />
    </div>
  );
}
