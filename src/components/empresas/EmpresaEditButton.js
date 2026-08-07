"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Save, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const companyFields = [
  ["nombreFantasia", "Nombre de fantasía"], ["razonSocial", "Razón social"],
  ["giro", "Giro"], ["contactoPrincipal", "Contacto principal"],
  ["correo", "Correo", "email"], ["telefono", "Teléfono"],
  ["representanteLegal", "Representante legal"], ["direccion", "Dirección"],
  ["comuna", "Comuna"], ["ciudad", "Ciudad"], ["region", "Región"], ["pais", "País"],
];

export default function EmpresaEditButton({ empresa }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({ ...empresa, contrato: empresa.contrato ? { ...empresa.contrato } : null }));
  const [parkingSpaces, setParkingSpaces] = useState(() => Object.fromEntries((empresa.estacionamientos || []).map((parking) => [parking.id, parking.plazasContratadas ?? ""])));
  const [status, setStatus] = useState({ saving: false, error: "" });

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeContract = (key, value) => setForm((current) => ({ ...current, contrato: { ...current.contrato, [key]: value } }));

  async function save(event) {
    event.preventDefault();
    setStatus({ saving: true, error: "" });
    try {
      const contract = form.contrato;
      const response = await authenticatedFetch(`/api/empresas/${empresa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.nombreFantasia, legalName: form.razonSocial, businessActivity: form.giro,
          contact: form.contactoPrincipal, email: form.correo, phone: form.telefono,
          legalRepresentative: form.representanteLegal, address: form.direccion, district: form.comuna,
          city: form.ciudad, region: form.region, country: form.pais, notes: form.observaciones,
          plan: form.plan, status: form.estado,
          contract: contract ? {
            id: contract.id, currency: contract.moneda, taxLabel: contract.impuesto,
            monthlyValue: contract.valorMensual, startsOn: contract.fechaInicio, endsOn: contract.fechaTermino,
            automaticRenewal: contract.renovacionAutomatica,
            nonRenewalNoticeDays: contract.avisoNoRenovacionDias,
            annualDiscountPercent: contract.descuentoAnualPorcentaje,
            paymentDueDays: contract.plazoPagoDias, reactivationValue: contract.valorReactivacion,
            equipmentPenaltyValue: contract.multaEquipo,
          } : null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible guardar la empresa.");

      // Plazas contratadas viven por estacionamiento (contract_parking_spaces), no en
      // company_contracts: se guardan aparte, reutilizando la misma API que consume el
      // detalle del estacionamiento (que solo lee, nunca escribe, este dato).
      if (contract) {
        const entries = Object.entries(parkingSpaces).filter(([, value]) => value !== "" && value != null);
        const results = await Promise.all(entries.map(([parkingId, value]) => {
          const parking = (empresa.estacionamientos || []).find((item) => item.id === parkingId);
          if (!parking) return Promise.resolve({ ok: true });
          return authenticatedFetch(`/api/estacionamientos/${parking.codigo}/plazas-contratadas`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contractedSpaces: Number(value) }),
          }).then(async (res) => ({ ok: res.ok, parking: parking.nombre, body: await res.json().catch(() => ({})) }));
        }));
        const failed = results.filter((result) => result.ok === false);
        if (failed.length) throw new Error(`Empresa guardada, pero no se pudieron guardar las plazas contratadas de: ${failed.map((item) => `${item.parking} (${item.body?.error || "error"})`).join(", ")}`);
      }

      setOpen(false);
      router.refresh();
    } catch (error) {
      setStatus({ saving: false, error: error.message });
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
      <Pencil className="h-4 w-4" /> Modificar empresa
    </button>
    {open ? <div className="fixed inset-0 z-50 overflow-y-auto bg-[#041E42]/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <form onSubmit={save} className="mx-auto my-6 w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#3150D8] px-6 py-5 text-white">
          <div><p className="text-xs font-bold uppercase tracking-wider text-cyan-200">Administración Root</p><h2 className="mt-1 text-xl font-bold">Modificar empresa</h2></div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </header>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {companyFields.map(([key, label, type = "text"]) => <label key={key} className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span><input required={["nombreFantasia", "razonSocial"].includes(key)} type={type} value={form[key] || ""} onChange={(event) => change(key, event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>)}
          <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">Plan</span><select value={form.plan || "Por definir"} onChange={(event) => change("plan", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option>Por definir</option><option>Esencial</option><option>Profesional</option><option>Enterprise</option><option>Personalizado</option></select></label>
          <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">Estado</span><select value={form.estado || "active"} onChange={(event) => change("estado", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="active">Activa</option><option value="onboarding">En implementación</option><option value="inactive">Inactiva</option></select></label>
          <label className="text-sm font-semibold text-slate-600 sm:col-span-2"><span className="mb-1.5 block">Observaciones</span><textarea rows="3" value={form.observaciones || ""} onChange={(event) => change("observaciones", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>
          {form.contrato ? <fieldset className="grid gap-4 border-t border-slate-200 pt-5 sm:col-span-2 sm:grid-cols-3">
            <legend className="px-2 font-bold text-[#041E42]">Contrato {form.contrato.numero}</legend>
            {[ ["valorMensual", "Valor mensual", "number"], ["fechaInicio", "Inicio", "date"], ["fechaTermino", "Término", "date"], ["avisoNoRenovacionDias", "Aviso no renovación (días)", "number"], ["descuentoAnualPorcentaje", "Descuento anual (%)", "number"], ["plazoPagoDias", "Plazo de pago (días)", "number"] ].map(([key, label, type]) => <label key={key} className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={key === "valorMensual" ? "0.01" : undefined} value={form.contrato[key] ?? ""} onChange={(event) => changeContract(key, event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>)}
            <label className="flex items-end text-sm font-semibold text-slate-600"><span className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><input type="checkbox" checked={Boolean(form.contrato.renovacionAutomatica)} onChange={(event) => changeContract("renovacionAutomatica", event.target.checked)} /> Renovación automática</span></label>
          </fieldset> : null}
          {form.contrato && empresa.estacionamientos?.length ? <fieldset className="grid gap-3 border-t border-slate-200 pt-5 sm:col-span-2">
            <legend className="px-2 font-bold text-[#041E42]">Plazas contratadas — Contrato {form.contrato.numero || "vigente"}</legend>
            <p className="text-xs font-normal text-slate-500">Defina la cantidad de plazas contratadas para cada estacionamiento asociado a este contrato.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {empresa.estacionamientos.map((parking) => <label key={parking.id} className="text-sm font-semibold text-slate-600">
                <span className="mb-1.5 block">{parking.nombre} <span className="font-normal text-slate-400">({parking.codigo})</span></span>
                <input type="number" min="1" step="1" value={parkingSpaces[parking.id] ?? ""} onChange={(event) => setParkingSpaces((current) => ({ ...current, [parking.id]: event.target.value }))} placeholder="No definido" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" />
              </label>)}
            </div>
          </fieldset> : null}
          {status.error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{status.error}</p> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={status.saving} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{status.saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {status.saving ? "Modificando empresa…" : "Modificar empresa"}</button></footer>
      </form>
    </div> : null}
  </>;
}
