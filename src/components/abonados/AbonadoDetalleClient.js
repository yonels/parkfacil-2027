"use client";

import Link from "next/link";
import { ArrowLeft, Building2, CalendarClock, CarFront, KeyRound, Mail, Pencil, Phone, ShieldCheck, UserRound } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import EstadoAbonadoBadge from "@/components/abonados/EstadoAbonadoBadge";
import TipoAbonadoBadge from "@/components/abonados/TipoAbonadoBadge";
import CredencialBadge from "@/components/abonados/CredencialBadge";
import CredentialQrPreview from "@/components/abonados/CredentialQrPreview";
import VigenciaAbonadoBadge from "@/components/abonados/VigenciaAbonadoBadge";
import { resolveEmpresa, resolveEstacionamientos, resolveContrato, getVehiculos, getCredenciales, getPermisos, getPatentePrincipal, getTextoVigencia, getDiasRestantes, formatDate, getTipoVehiculoLabel, getEstadoVehiculoLabel, getEstadoCredencialLabel } from "@/data/abonados.mjs";
import { resolveResponsableName, useAbonadosStore } from "@/components/abonados/abonadosStore";

const qrCredentialTypes = new Set(["qr_code", "qr_plate"]);

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "No registrado";
  }

  return value;
}

function DetailItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {Icon ? <Icon className="h-4 w-4 text-[#3150D8]" /> : null}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{formatValue(value)}</p>
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-[#041E42]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AbonadoDetalleClient({ abonadoId }) {
  const { hydrated, error, findById } = useAbonadosStore();
  const abonado = findById(abonadoId);

  if (!hydrated) {
    return (
      <AppShell title="Abonados" description="Detalle individual del abonado">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
          Cargando abonado...
        </div>
      </AppShell>
    );
  }

  if (!abonado) {
    return (
      <AppShell title="Detalle de abonado" description="Abonado no encontrado">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Abonado no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">El identificador solicitado no existe en la base de datos.</p>
          <Link href="/abonados" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
            <ArrowLeft className="h-4 w-4" />
            Volver a abonados
          </Link>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Detalle de abonado" description="Error de carga">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700 shadow-sm">
          No fue posible cargar el abonado desde la API. {error.message}
        </div>
      </AppShell>
    );
  }

  const empresa = resolveEmpresa(abonado);
  const estacionamientos = resolveEstacionamientos(abonado);
  const responsable = resolveResponsableName(abonado);
  const contrato = resolveContrato(abonado);
  const vehiculos = getVehiculos(abonado);
  const credenciales = getCredenciales(abonado);
  const permisos = getPermisos(abonado);
  const vigencia = getTextoVigencia(abonado, "2026-08-01");
  const diasRestantes = getDiasRestantes(abonado, "2026-08-01");
  const iniciales = abonado.nombre.split(" ").filter(Boolean).slice(0, 2).map((chunk) => chunk[0]).join("").toUpperCase();
  const historial = Array.isArray(abonado.historial) ? abonado.historial : [];
  const observaciones = abonado.observaciones || "Sin observaciones registradas.";


  return (
    <AppShell title="Abonados" description="Detalle individual del abonado">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/abonados" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" />
            Volver a abonados
          </Link>
          <Link href={`/abonados/${abonado.id}/editar`} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
            <Pencil className="h-4 w-4" />
            Editar abonado
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#EEF4FF] text-xl font-semibold text-[#3150D8]">{iniciales || "AB"}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de abonado</p>
                <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{abonado.nombre}</h1>
                <p className="mt-2 text-sm text-slate-600">{abonado.rut || "No registrado"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <EstadoAbonadoBadge estado={abonado.estado} />
                  <TipoAbonadoBadge tipo={abonado.tipo} />
                  <VigenciaAbonadoBadge texto={vigencia} />
                </div>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[320px]">
              <DetailItem icon={Building2} label="Empresa" value={empresa?.nombreFantasia} />
              <DetailItem icon={CarFront} label="Patente principal" value={getPatentePrincipal(abonado)} />
              <DetailItem icon={ShieldCheck} label="Identificador" value={abonado.identificador} />
              <DetailItem icon={KeyRound} label="Contrato asociado" value={contrato?.numeroContrato} />
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title="Información personal" description="Datos base disponibles del abonado.">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem icon={UserRound} label="Nombre" value={abonado.nombre} />
              <DetailItem icon={ShieldCheck} label="RUT" value={abonado.rut} />
              <DetailItem icon={Mail} label="Correo" value={abonado.correo} />
              <DetailItem icon={Phone} label="Teléfono" value={abonado.telefono} />
              <DetailItem icon={UserRound} label="Responsable" value={responsable} />
            </div>
          </SectionCard>

          <SectionCard title="Información administrativa" description="Vinculación comercial y operativa actual del abonado.">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem icon={Building2} label="Empresa" value={empresa?.nombreFantasia} />
              <DetailItem icon={KeyRound} label="Contrato" value={contrato?.numeroContrato} />
              <DetailItem icon={ShieldCheck} label="Tipo de abonado" value={abonado.tipo ? abonado.tipo.replaceAll("_", " ") : null} />
              <DetailItem icon={CalendarClock} label="Alta / inicio" value={formatDate(abonado.fechaInicio)} />
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Vigencia" description="Estado temporal y cobertura vigente del abonado.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem icon={CalendarClock} label="Fecha de inicio" value={formatDate(abonado.fechaInicio)} />
            <DetailItem icon={CalendarClock} label="Fecha de vencimiento" value={formatDate(abonado.fechaTermino)} />
            <DetailItem icon={ShieldCheck} label="Estado de vigencia" value={vigencia} />
            <DetailItem icon={KeyRound} label="Días restantes" value={Number.isFinite(diasRestantes) ? diasRestantes : "No registrado"} />
          </div>
        </SectionCard>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title="Vehículos y patentes" description="Vehículos asociados actualmente al abonado.">
            <div className="mt-4 space-y-3">
              {vehiculos.length > 0 ? vehiculos.map((vehiculo) => (
                <div key={vehiculo.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#041E42]">{vehiculo.licensePlate || "No registrado"}</p>
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{getEstadoVehiculoLabel(vehiculo.status)}</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <DetailItem label="Marca" value={vehiculo.brand} />
                    <DetailItem label="Modelo" value={vehiculo.model} />
                    <DetailItem label="Color" value={vehiculo.color} />
                    <DetailItem label="Tipo" value={getTipoVehiculoLabel(vehiculo.vehicleType)} />
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Este abonado no tiene vehículos registrados.</div>}
            </div>
          </SectionCard>

          <SectionCard title="Credenciales" description="Credenciales y medios de acceso asociados al abonado.">
            <div className="space-y-3">
              {credenciales.length > 0 ? credenciales.map((credencial) => (
                <div key={credencial.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#041E42]">{credencial.numero}</span>
                    <CredencialBadge tipo={credencial.tipo} estado={credencial.estado} />
                  </div>
                  <p className="mt-2">Estado: {getEstadoCredencialLabel(credencial.estado)}</p>
                  <p className="mt-1">Vigencia: {formatDate(credencial.fechaInicio)} - {formatDate(credencial.fechaTermino)}</p>
                  <p className="mt-2">{formatValue(credencial.observaciones)}</p>
                  {qrCredentialTypes.has(credencial.tipo) ? <CredentialQrPreview identifier={credencial.numero} title={credencial.tipo === "qr_plate" ? "QR + Patente" : "Código QR"} className="mt-4 bg-white" emailConfig={{ endpoint: `/api/abonados/${abonado.id}/credenciales/${credencial.id}/enviar`, destinatario: abonado.correo || "", asunto: "Credencial de acceso ParkFacil", mensaje: "Adjuntamos su credencial de acceso ParkFacil." }} /> : null}
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Este abonado no tiene credenciales registradas.</div>}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Permisos de acceso" description="Configuración actual de accesos y cobertura horaria.">
          <div className="grid gap-4 md:grid-cols-2">
            {permisos.length > 0 ? permisos.map((permiso) => (
              <div key={permiso.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-[#041E42]">{permiso.id}</p>
                <p className="mt-2">{formatValue(permiso.reglas)}</p>
                <p className="mt-2">Accesos: {permiso.accesos.length ? permiso.accesos.join(", ") : "Sin accesos específicos"}</p>
                <p className="mt-2">Horario: {permiso.horarioDesde || "Sin horario"} - {permiso.horarioHasta || "Sin horario"}</p>
                <p className="mt-2">Estacionamientos: {permiso.estacionamientos.length ? permiso.estacionamientos.join(", ") : "No registrado"}</p>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Este abonado no tiene permisos registrados.</div>}
          </div>
        </SectionCard>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard title="Observaciones" description="Notas administrativas disponibles para el abonado.">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{observaciones}</div>
          </SectionCard>

          <SectionCard title="Historial" description="Eventos disponibles dentro de los datos actuales del catálogo.">
            {historial.length > 0 ? <ul className="space-y-3 text-sm text-slate-600">{historial.map((item) => <li key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">{item}</li>)}</ul> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Sin historial registrado.</div>}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
