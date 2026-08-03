import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StructureEntityForm from "./StructureEntityForm";
import OperatorAssignmentForm from "./OperatorAssignmentForm";
import CapacityVisualization from "./CapacityVisualization";
import StreetSegmentsManager from "./StreetSegmentsManager";
import { getParkingPageData } from "@/lib/estacionamientosServer";
import { getStructurePageData } from "@/lib/parkingStructureServer";

export async function StructureListRoute({ parkingId, kind }) {
  const parking = await getParkingPageData(parkingId);
  if (!parking) return <NotFound />;
  const structure = await getStructurePageData(parking);
  const expected = kind === "sector" ? "ON_STREET" : "OFF_STREET";
  if (parking.type !== expected) return <WrongType parking={parking} expected={expected} />;
  const entities = kind === "sector" ? structure.sectors || [] : structure.levels || [];
  return <AppShell title={kind === "sector" ? "Áreas y Calles" : "Niveles y Zonas"} description={parking.name}><div className="space-y-6"><PageHeader title={kind === "sector" ? "Áreas y Calles" : "Niveles y Zonas"} description={`${parking.code} · ${parking.name}`} actions={[<BackLink key="back" href={`/estacionamientos/${parking.code}`} />, <Link key="new" href={`/estacionamientos/${parking.code}/${kind === "sector" ? "sectores" : "niveles"}/nuevo`} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">{kind === "sector" ? "Crear área" : "Crear nivel"}</Link>]} />{structure.source === "demo" && <DemoNotice />}{entities.map((entity) => <EntityCard key={entity.id} parking={parking} kind={kind} entity={entity} />)}{!entities.length && <Empty />}</div></AppShell>;
}

export async function StructureFormRoute({ parkingId, kind, entityId = null, parentId = null }) {
  const parking = await getParkingPageData(parkingId);
  if (!parking) return <NotFound />;
  const expected = ["sector", "street"].includes(kind) ? "ON_STREET" : "OFF_STREET";
  if (parking.type !== expected) return <WrongType parking={parking} expected={expected} />;
  const structure = await getStructurePageData(parking);
  const parentList = kind === "street" ? structure.sectors || [] : kind === "zone" ? structure.levels || [] : [];
  const parent = parentId ? parentList.find((item) => item.id === parentId) : null;
  const list = kind === "sector" ? structure.sectors || [] : kind === "level" ? structure.levels || [] : kind === "street" ? parent?.streets || [] : parent?.zones || [];
  const entity = entityId ? list.find((item) => item.id === entityId) : null;
  if ((parentId && !parent) || (entityId && !entity)) return <NotFound />;
  const titles = { sector: "área", level: "nivel", street: "calle", zone: "zona" };
  const title = `${entity ? "Editar" : "Crear"} ${titles[kind]}`;
  const collection = kind === "sector" ? "sectores" : kind === "level" ? "niveles" : null;
  const backHref = kind === "street"
    ? `/estacionamientos/${parking.code}/sectores/${parent.id}${entity ? `/calles/${entity.id}` : ""}`
    : kind === "zone"
      ? `/estacionamientos/${parking.code}/niveles/${parent.id}`
      : `/estacionamientos/${parking.code}/${collection}${entity ? `/${entity.id}` : ""}`;
  return <AppShell title={kind === "level" && !entity ? "Estacionamientos" : title} description={parking.name}><div className="space-y-4"><PageHeader title={title} description={parent ? parent.displayName || parent.name : parking.name} actions={[<BackLink key="back" href={backHref} />]} /><StructureEntityForm kind={kind} parking={parking} parent={parent} entity={entity} /></div></AppShell>;
}

export async function StructureDetailRoute({ parkingId, kind, entityId, parentId = null }) {
  const parking = await getParkingPageData(parkingId);
  if (!parking) return <NotFound />;
  const expected = ["sector", "street"].includes(kind) ? "ON_STREET" : "OFF_STREET";
  if (parking.type !== expected) return <WrongType parking={parking} expected={expected} />;
  const structure = await getStructurePageData(parking);
  const parent = parentId ? (structure.sectors || []).find((item) => item.id === parentId) : null;
  const entity = kind === "sector" ? (structure.sectors || []).find((item) => item.id === entityId) : kind === "level" ? (structure.levels || []).find((item) => item.id === entityId) : parent?.streets?.find((item) => item.id === entityId);
  if (!entity) return <NotFound />;
  const children = kind === "sector" ? entity.streets : kind === "level" ? entity.zones : [];
  const base = `/estacionamientos/${parking.code}/${kind === "sector" ? "sectores" : kind === "level" ? "niveles" : `sectores/${parent.id}/calles`}/${entity.id}`;
  const backHref = kind === "street" ? `/estacionamientos/${parking.code}/sectores/${parent.id}` : `/estacionamientos/${parking.code}/${kind === "sector" ? "sectores" : "niveles"}`;
  return <AppShell title={entity.displayName || entity.name} description={parking.name}><div className="space-y-6"><PageHeader title={entity.displayName || entity.name} description={entity.description || entity.district || parking.name} actions={[<BackLink key="back" href={backHref} />, <Link key="edit" href={`${base}/editar`} className="rounded-full border border-[#3150D8] px-4 py-2 text-sm font-semibold text-[#3150D8]">Modificar</Link>, kind !== "street" && <Link key="new" href={`${base}/${kind === "sector" ? "calles/nueva" : "zonas/nueva"}`} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">{kind === "sector" ? "Crear calle" : "Crear zona"}</Link>, kind === "street" && <Link key="operators" href={`${base}/operadores`} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Operadores</Link>]} />{kind === "street" ? <StreetSegmentsManager parking={parking} area={parent} street={entity} /> : <div className="grid gap-3 md:grid-cols-2">{children.map((child) => <div key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-[#041E42]">{child.name}</h2><CapacityVisualization capacity={child.capacity} occupied={child.occupied} /></div>)}</div>}</div></AppShell>;
}

export async function AssignmentRoute({ parkingId, sectorId, streetId, form = false }) {
  const parking = await getParkingPageData(parkingId); if (!parking) return <NotFound />;
  const structure = await getStructurePageData(parking); const sector = (structure.sectors || []).find((item) => item.id === sectorId); const street = sector?.streets.find((item) => item.id === streetId); if (!street) return <NotFound />;
  const streetBase = `/estacionamientos/${parking.code}/sectores/${sector.id}/calles/${street.id}`;
  if (form) return <AppShell title="Asignar operador" description={street.name}><PageHeader title="Asignar operador" description={`${sector.displayName} · Calle ${street.name}`} actions={[<BackLink key="back" href={`${streetBase}/operadores`} />]} /><div className="mt-6"><OperatorAssignmentForm parking={parking} sector={sector} street={street} /></div></AppShell>;
  const assignments = (structure.assignments || []).filter((item) => (item.streetId || item.street_id) === street.id);
  return <AppShell title="Operadores asignados" description={street.name}><div className="space-y-6"><PageHeader title="Operadores asignados" description={`${sector.displayName} · Calle ${street.name}`} actions={[<BackLink key="back" href={streetBase} />, <Link key="new" href={`${streetBase}/operadores/nuevo`} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Asignar operador</Link>]} />{structure.source === "demo" && <DemoNotice />}{assignments.map((item) => <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5"><p className="font-semibold text-[#041E42]">{item.operatorName || item.operator_id}</p><p className="mt-1 text-sm text-slate-600">Números {item.numberFrom ?? item.number_from} a {item.numberTo ?? item.number_to} · Máximo {item.maxVehicles ?? item.max_vehicles} vehículos</p></div>)}{!assignments.length && <Empty />}</div></AppShell>;
}

function BackLink({ href }) { return <Link href={href} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[#3150D8] hover:text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver</Link>; }
function EntityCard({ parking, kind, entity }) { const href = `/estacionamientos/${parking.code}/${kind === "sector" ? "sectores" : "niveles"}/${entity.id}`; return <article className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[#041E42]">{entity.displayName || entity.name}</h2><p className="text-sm text-slate-500">{entity.code} · {(kind === "sector" ? entity.streets : entity.zones).length} {kind === "sector" ? "calles" : "zonas"}</p></div><Link href={href} className="font-semibold text-[#3150D8]">Administrar</Link></div></article>; }
function DemoNotice() { return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Vista demostrativa de solo lectura. No se simularán escrituras.</p>; }
function Empty() { return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No hay registros configurados.</div>; }
function NotFound() { return <AppShell title="Estructura operacional" description="Dato inexistente"><div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">No se encontró el registro solicitado.</div></AppShell>; }
function WrongType({ parking, expected }) { return <AppShell title="Estructura operacional" description={parking.name}><div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Esta estructura corresponde únicamente a estacionamientos {expected === "ON_STREET" ? "On Street" : "Off Street"}.</div></AppShell>; }
