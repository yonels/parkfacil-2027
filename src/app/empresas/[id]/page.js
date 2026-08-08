import Link from "next/link";
import { ArrowLeft, Building2, Mail, Phone, MapPin, Briefcase, Users, FileText, History, AlertTriangle } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EstadoEmpresaBadge from "@/components/empresas/EstadoEmpresaBadge";
import TipoRelacionBadge from "@/components/empresas/TipoRelacionBadge";
import { formatearRut } from "@/data/empresas.mjs";
import { getCompanyPageData } from "@/lib/companiesServer";
import EmpresaEditButton from "@/components/empresas/EmpresaEditButton";

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

function getContractDisplay(contract) {
  if (typeof contract === "string") return contract;
  if (!contract || typeof contract !== "object") return "Contrato sin información";

  const number = contract.numero || contract.numeroContrato || "Contrato sin número";
  return contract.estado ? `${number} · ${contract.estado}` : number;
}

function contactRoleLabel(role) {
  if (role === "company_admin") return "Administrador";
  if (role === "operator") return "Operador";
  return "Contacto";
}

function contactStatusLabel(status) {
  if (status === "active") return "Activo";
  if (status === "invited") return "Pendiente";
  if (status === "suspended") return "Suspendido";
  if (status === "inactive") return "Inactivo";
  return status || "Sin estado";
}

export default async function EmpresaDetallePage({ params }) {
  const { id } = await params;
  const empresa = await getCompanyPageData(id);

  if (!empresa) {
    return (
      <AppShell title="Detalle de empresa" description="Empresa no encontrada">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">No se encontró la empresa solicitada.</p>
          <Link href="/empresas" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" /> Volver al catálogo
          </Link>
        </div>
      </AppShell>
    );
  }

  const estacionamientos = empresa.estacionamientos;
  const contactos = Array.isArray(empresa.contactos) && empresa.contactos.length > 0
    ? empresa.contactos
    : [{
      id: "contacto-principal",
      nombreCompleto: empresa.contactoPrincipal,
      rol: "contact",
      estado: empresa.estado,
      correo: empresa.correo,
      telefono: empresa.telefono,
      ultimoAcceso: null,
    }];

  return (
    <AppShell title={empresa.razonSocial} description="Detalle visual de la empresa">
      <div className="space-y-6">
        <PageHeader
          title={empresa.razonSocial}
          description={`${empresa.nombreFantasia} · ${formatearRut(`${empresa.rutNumero}-${empresa.rutDv}`)}`}
          showBack={false}
          actions={[
            <EmpresaEditButton key="editar" empresa={empresa} />,
            <Link key="volver" href="/empresas" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <EstadoEmpresaBadge estado={empresa.estado} />
              <TipoRelacionBadge tipo={empresa.tipoRelacion} />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Información general</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{empresa.observaciones}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Razón social" value={empresa.razonSocial} />
              <DetailItem label="Nombre de fantasía" value={empresa.nombreFantasia} />
              <DetailItem label="RUT" value={formatearRut(`${empresa.rutNumero}-${empresa.rutDv}`)} />
              <DetailItem label="Giro" value={empresa.giro} />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><Building2 className="h-5 w-5" /><h3 className="text-lg font-semibold">Datos de contacto</h3></div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Contacto</span><strong>{empresa.contactoPrincipal}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Correo</span><strong>{empresa.correo}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Teléfono</span><strong>{empresa.telefono}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Representante</span><strong>{empresa.representanteLegal}</strong></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Ubicación y relación</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Dirección" value={empresa.direccion} />
            <DetailItem label="Comuna" value={empresa.comuna} />
            <DetailItem label="Ciudad" value={empresa.ciudad} />
            <DetailItem label="Región" value={empresa.region} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Estacionamientos y usuarios</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><MapPin className="h-5 w-5" /><h4 className="font-semibold">Estacionamientos asociados</h4></div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {estacionamientos.length > 0 ? estacionamientos.map((item) => (
                  <Link key={item.id} href={`/estacionamientos/${item.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-[#3150D8] transition hover:border-[#3150D8]">
                    <span>{item.nombre} · {item.codigo}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )) : <p>Sin estacionamientos asociados</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Users className="h-5 w-5" /><h4 className="font-semibold">Usuarios asociados</h4></div>
              <p className="mt-3 text-sm text-slate-600">{empresa.usuarios} usuarios de referencia.</p>
              <div className="mt-4 space-y-2">
                {contactos.map((contacto) => (
                  <div key={contacto.id || `${contacto.nombreCompleto}-${contacto.correo}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="font-semibold text-[#041E42]">{contacto.nombreCompleto || "Sin nombre informado"}</p>
                    <p className="mt-1 text-xs text-slate-500">{contactRoleLabel(contacto.rol)} · {contactStatusLabel(contacto.estado)}</p>
                    <p className="mt-2 text-sm text-slate-600">{contacto.correo || "Sin correo informado"}</p>
                    <p className="text-sm text-slate-600">{contacto.telefono || "Sin telefono informado"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Documentos y seguimiento</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><FileText className="h-5 w-5" /><h4 className="font-semibold">Contratos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {empresa.contratos.length > 0
                  ? empresa.contratos.map((item, index) => (
                    <li key={typeof item === "object" && item?.id ? item.id : `${getContractDisplay(item)}-${index}`}>
                      • {getContractDisplay(item)}
                    </li>
                  ))
                  : <li>• Sin contratos asociados</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><History className="h-5 w-5" /><h4 className="font-semibold">Historial</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {empresa.historial.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-[#041E42]">Etapa futura</p>
            <p className="mt-2">Las funciones de contratación, facturación y administración operativa se incorporarán en futuras etapas sin ejecutar procesos reales.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
