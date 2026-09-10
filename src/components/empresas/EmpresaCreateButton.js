"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, Mail, Plus, TriangleAlert, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import EmpresaEnrolamientoResendButton from "./EmpresaEnrolamientoResendButton";

// Mismos campos que ya acepta POST /api/empresas (src/app/api/empresas/route.js)
// -- ninguno se inventa aquí. "estado" y "plan" no se incluyen porque el
// endpoint de creación no los recibe (la empresa nace siempre "active", el
// plan queda "Por definir"); ambos se pueden ajustar después con "Modificar
// empresa" (EmpresaEditButton), que sí los expone vía PATCH.
//
// Encargo "ajustar flujo de creación de empresas" (2026-09-10): las cuentas
// iniciales ya no piden correo/clave -- solo nombre completo. Usuario de
// acceso y clave inicial se generan en el servidor y se envían por correo
// al contacto de la empresa (ver companyEnrollmentEmailCore.mjs).
const companyFields = [
  ["businessName", "Razón social", "text", true],
  ["tradeName", "Nombre de fantasía", "text", false],
  ["businessActivity", "Giro", "text", false],
  ["contactEmail", "Correo de contacto", "email", true],
  ["phone", "Teléfono fijo", "text", false],
  ["mobilePhone", "Teléfono móvil", "text", false],
  ["website", "URL / sitio web", "text", false],
  ["address", "Dirección", "text", false],
  ["district", "Comuna", "text", false],
  ["city", "Ciudad", "text", false],
  ["region", "Región", "text", false],
  ["country", "País", "text", false],
  ["legalRepresentative", "Representante legal", "text", false],
];

function emptyAccount() {
  return { fullName: "" };
}

function emptyForm() {
  return {
    businessName: "", tradeName: "", businessActivity: "", contactEmail: "", phone: "",
    mobilePhone: "", website: "", address: "", district: "", city: "", region: "Metropolitana",
    country: "Chile", legalRepresentative: "", rutNumber: "", rutDv: "", notes: "", products: [],
    administrator: emptyAccount(), operator1: emptyAccount(), operator2: emptyAccount(),
  };
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

// Duplicados: POST /api/empresas no valida RUT ni razón social repetidos (no
// existe restricción única en companies para eso) -- se revisa aquí contra el
// listado ya cargado para no dejar que Root cree una empresa duplicada.
function findDuplicate(form, existingEmpresas) {
  const rut = `${form.rutNumber}-${form.rutDv}`.toUpperCase();
  const name = form.businessName.trim().toLowerCase();
  return (existingEmpresas || []).find((empresa) => {
    const empresaRut = `${empresa.rutNumero}-${empresa.rutDv}`.toUpperCase();
    return empresaRut === rut || (empresa.razonSocial || "").trim().toLowerCase() === name;
  });
}

function validateForm(form, existingEmpresas) {
  const errors = [];
  if (!form.businessName.trim()) errors.push("La razón social es obligatoria.");
  if (!/^\d{7,8}$/.test(form.rutNumber.trim())) errors.push("El RUT debe contener 7 u 8 dígitos, sin puntos ni guion.");
  if (!/^[0-9Kk]$/.test(form.rutDv.trim())) errors.push("El dígito verificador debe ser un número o K.");
  if (!validEmail(form.contactEmail)) errors.push("El correo de contacto de la empresa es obligatorio y debe ser válido.");
  if (!form.products.length) errors.push("Selecciona al menos un producto habilitado (Off Street y/o On Street).");

  const accounts = [
    ["Administrador", form.administrator],
    ["Operador 1", form.operator1],
    ["Operador 2", form.operator2],
  ];
  for (const [label, account] of accounts) {
    if (!account.fullName.trim()) errors.push(`Falta el nombre del ${label.toLowerCase()}.`);
  }

  if (form.businessName.trim() && /^\d{7,8}$/.test(form.rutNumber.trim()) && /^[0-9Kk]$/.test(form.rutDv.trim())) {
    const duplicate = findDuplicate(form, existingEmpresas);
    if (duplicate) errors.push(`Ya existe una empresa con ese RUT o razón social: ${duplicate.razonSocial} (${duplicate.rutNumero}-${duplicate.rutDv}).`);
  }
  return errors;
}

export default function EmpresaCreateButton({ existingEmpresas = [], onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ saving: false, error: "", errors: [] });
  const [created, setCreated] = useState(null);

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeAccount = (key, field, value) => setForm((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  const toggleProduct = (product) => setForm((current) => ({
    ...current,
    products: current.products.includes(product) ? current.products.filter((item) => item !== product) : [...current.products, product],
  }));

  const openModal = () => {
    setForm(emptyForm());
    setStatus({ saving: false, error: "", errors: [] });
    setCreated(null);
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    setCreated(null);
  };

  async function submit(event) {
    event.preventDefault();
    const errors = validateForm(form, existingEmpresas);
    if (errors.length) {
      setStatus({ saving: false, error: "", errors });
      return;
    }
    setStatus({ saving: true, error: "", errors: [] });
    try {
      const response = await authenticatedFetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName, tradeName: form.tradeName, businessActivity: form.businessActivity,
          rutNumber: form.rutNumber, rutDv: form.rutDv, contactEmail: form.contactEmail, phone: form.phone,
          mobilePhone: form.mobilePhone, website: form.website, address: form.address,
          district: form.district, city: form.city, region: form.region, country: form.country,
          legalRepresentative: form.legalRepresentative, notes: form.notes, products: form.products,
          administrator: form.administrator, operators: [form.operator1, form.operator2],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ saving: false, error: body.error || "No fue posible crear la empresa.", errors: Array.isArray(body.details) ? body.details : [] });
        return;
      }
      setStatus({ saving: false, error: "", errors: [] });
      setCreated({ ...body.data, _accounts: body.accounts, _enrollment: body.enrollment });
      if (onCreated) onCreated(body.data);
    } catch (error) {
      // authenticatedFetch lanza aquí mismo si no hay sesión vigente (token
      // vencido) -- se muestra igual que cualquier otro error, sin bloquear
      // el formulario para que Root pueda reintentar tras reautenticarse.
      setStatus({ saving: false, error: error.message, errors: [] });
    }
  }

  return <>
    <button key="nueva" type="button" onClick={openModal} className="inline-flex items-center gap-2 rounded-full !bg-[#3150D8] px-4 py-2 text-sm font-semibold !text-white transition hover:!bg-[#1E5EFF]">
      <Plus className="h-4 w-4" />
      Crear empresa
    </button>
    {open ? <div className="fixed inset-0 z-50 overflow-y-auto bg-[#041E42]/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <div className="mx-auto my-6 w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#3150D8] px-6 py-5 text-white">
          <div><p className="text-xs font-bold uppercase tracking-wider text-cyan-200">Administración Root</p><h2 className="mt-1 text-xl font-bold">Crear empresa</h2></div>
          <button type="button" onClick={closeModal} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </header>

        {created ? (
          <div className="p-6">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-bold">Empresa creada correctamente</p>
                <p className="text-sm">{created.razonSocial} ({created.rutNumero}-{created.rutDv}) ya aparece en el listado.</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5 text-left">Cuenta</th><th className="px-4 py-2.5 text-left">Nombre</th><th className="px-4 py-2.5 text-left">Usuario de acceso</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(created._accounts || []).map((account) => <tr key={account.username}>
                    <td className="px-4 py-2.5 font-semibold text-[#041E42]">{account.label}</td>
                    <td className="px-4 py-2.5 text-slate-600">{account.fullName}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{account.username}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>

            {created._enrollment?.emailSent ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-800">
                <Mail className="h-5 w-5 shrink-0" />
                <p className="text-sm">Las claves iniciales se enviaron por correo a <strong>{form.contactEmail}</strong>. Nadie, ni siquiera Root, puede volver a verlas aquí.</p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-center gap-3">
                  <TriangleAlert className="h-5 w-5 shrink-0" />
                  <p className="text-sm">La empresa y las cuentas se crearon correctamente, pero el correo de enrolamiento no pudo enviarse{created._enrollment?.error ? `: ${created._enrollment.error}` : "."} Puedes generar credenciales nuevas y reenviar el acceso.</p>
                </div>
                <div className="mt-3">
                  <EmpresaEnrolamientoResendButton companyId={created.id} onResult={(body) => setCreated((current) => ({ ...current, _accounts: body.accounts, _enrollment: body.enrollment }))} />
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cerrar</button>
              <Link href={`/empresas/${created.id}`} onClick={closeModal} className="rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white">Ver ficha de la empresa</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="max-h-[75vh] overflow-y-auto">
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <p className="sm:col-span-2 text-xs font-bold uppercase tracking-wide text-[#3150D8]">Datos de empresa</p>
              {companyFields.map(([key, label, type, required]) => <label key={key} className="text-sm font-semibold text-slate-600">
                <span className="mb-1.5 block">{label}</span>
                <input required={required} type={type} value={form[key]} onChange={(event) => change(key, event.target.value)} placeholder={key === "mobilePhone" ? "+56 9 1234 5678" : key === "website" ? "https://empresa.cl" : undefined} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" />
              </label>)}
              <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">RUT (número)</span><input required type="text" inputMode="numeric" placeholder="76345890" value={form.rutNumber} onChange={(event) => change("rutNumber", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>
              <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">RUT (dígito verificador)</span><input required type="text" maxLength={1} placeholder="K" value={form.rutDv} onChange={(event) => change("rutDv", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>

              <fieldset className="text-sm font-semibold text-slate-600 sm:col-span-2">
                <span className="mb-1.5 block">Productos habilitados</span>
                <p className="mb-2 text-xs font-normal text-slate-500">Determina si esta empresa verá Off Street, On Street o ambos al iniciar sesión en el Portal Cliente.</p>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><input type="checkbox" checked={form.products.includes("OFF_STREET")} onChange={() => toggleProduct("OFF_STREET")} /> Off Street</label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><input type="checkbox" checked={form.products.includes("ON_STREET")} onChange={() => toggleProduct("ON_STREET")} /> On Street</label>
                </div>
              </fieldset>

              <label className="text-sm font-semibold text-slate-600 sm:col-span-2"><span className="mb-1.5 block">Observaciones</span><textarea rows="2" value={form.notes} onChange={(event) => change("notes", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>

              <fieldset className="grid gap-4 border-t border-slate-200 pt-5 sm:col-span-2">
                <legend className="px-2 font-bold text-[#041E42]">Cuentas iniciales</legend>
                <p className="-mt-2 text-xs font-normal text-slate-500">El backend crea siempre un administrador y dos operadores junto con la empresa. El usuario de acceso y la clave inicial se generan automáticamente y se envían por correo al contacto de la empresa al finalizar.</p>
                {[["administrator", "Administrador de empresa"], ["operator1", "Operador 1"], ["operator2", "Operador 2"]].map(([key, label]) => <div key={key} className="grid gap-3 rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#3150D8]">{label}</p>
                  <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">Nombre completo</span><input required type="text" value={form[key].fullName} onChange={(event) => changeAccount(key, "fullName", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>
                </div>)}
              </fieldset>

              {status.error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{status.error}</p> : null}
              {status.errors.length ? <ul role="alert" className="list-disc space-y-1 rounded-xl bg-red-50 p-3 pl-8 text-sm font-semibold text-red-700 sm:col-span-2">{status.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </div>
            <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={status.saving} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{status.saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {status.saving ? "Creando empresa…" : "Crear empresa"}</button></footer>
          </form>
        )}
      </div>
    </div> : null}
  </>;
}
