"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound, LoaderCircle, Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { generateSecurePassword } from "@/lib/generateSecurePassword";

// Mismos campos que ya acepta POST /api/empresas (src/app/api/empresas/route.js)
// -- ninguno se inventa aquí. "estado" y "plan" no se incluyen porque el
// endpoint de creación no los recibe (la empresa nace siempre "active", el
// plan queda "Por definir"); ambos se pueden ajustar después con "Modificar
// empresa" (EmpresaEditButton), que sí los expone vía PATCH.
const companyFields = [
  ["businessName", "Razón social", "text", true],
  ["tradeName", "Nombre de fantasía", "text", false],
  ["businessActivity", "Giro", "text", false],
  ["phone", "Teléfono", "text", false],
  ["address", "Dirección", "text", false],
  ["district", "Comuna", "text", false],
  ["city", "Ciudad", "text", false],
  ["region", "Región", "text", false],
  ["country", "País", "text", false],
  ["legalRepresentative", "Representante legal", "text", false],
];

function emptyAccount() {
  return { fullName: "", email: "", password: "" };
}

function emptyForm() {
  return {
    businessName: "", tradeName: "", businessActivity: "", phone: "", address: "",
    district: "", city: "", region: "Metropolitana", country: "Chile", legalRepresentative: "",
    rutNumber: "", rutDv: "", notes: "", products: [],
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
  if (!form.products.length) errors.push("Selecciona al menos un producto habilitado (Off Street y/o On Street).");

  const accounts = [
    ["Administrador", form.administrator],
    ["Operador 1", form.operator1],
    ["Operador 2", form.operator2],
  ];
  for (const [label, account] of accounts) {
    if (!account.fullName.trim()) errors.push(`Falta el nombre del ${label.toLowerCase()}.`);
    if (!validEmail(account.email)) errors.push(`Falta un correo válido para ${label.toLowerCase()}.`);
    if (account.password.length < 12) errors.push(`La clave temporal del ${label.toLowerCase()} debe tener al menos 12 caracteres.`);
  }
  const emails = accounts.map(([, account]) => account.email.trim().toLowerCase()).filter(Boolean);
  if (new Set(emails).size !== emails.length) errors.push("El administrador y los dos operadores deben usar correos distintos entre sí.");

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
  const fillSecurePassword = (key) => changeAccount(key, "password", generateSecurePassword());

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
          rutNumber: form.rutNumber, rutDv: form.rutDv, phone: form.phone, address: form.address,
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
      setCreated(body.data);
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
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cerrar</button>
              <Link href={`/empresas/${created.id}`} onClick={closeModal} className="rounded-xl bg-[#3150D8] px-4 py-2.5 text-sm font-bold text-white">Ver ficha de la empresa</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="max-h-[75vh] overflow-y-auto">
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              {companyFields.map(([key, label, type, required]) => <label key={key} className="text-sm font-semibold text-slate-600">
                <span className="mb-1.5 block">{label}</span>
                <input required={required} type={type} value={form[key]} onChange={(event) => change(key, event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" />
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
                <p className="-mt-2 text-xs font-normal text-slate-500">El backend crea siempre un administrador y dos operadores junto con la empresa (mismo diseño ya existente en POST /api/empresas). Cada uno necesita clave temporal de al menos 12 caracteres.</p>
                {[["administrator", "Administrador de empresa"], ["operator1", "Operador 1"], ["operator2", "Operador 2"]].map(([key, label]) => <div key={key} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3">
                  <p className="sm:col-span-3 text-xs font-bold uppercase tracking-wide text-[#3150D8]">{label}</p>
                  <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">Nombre completo</span><input required type="text" value={form[key].fullName} onChange={(event) => changeAccount(key, "fullName", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>
                  <label className="text-sm font-semibold text-slate-600"><span className="mb-1.5 block">Correo</span><input required type="email" value={form[key].email} onChange={(event) => changeAccount(key, "email", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" /></label>
                  <label className="text-sm font-semibold text-slate-600">
                    <span className="mb-1.5 block">Clave temporal</span>
                    <div className="flex gap-2">
                      <input required type="text" minLength={12} value={form[key].password} onChange={(event) => changeAccount(key, "password", event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#3150D8]" />
                      <button type="button" onClick={() => fillSecurePassword(key)} title="Generar clave segura" className="shrink-0 rounded-xl border border-[#3150D8] px-3 text-[#3150D8]"><KeyRound className="h-4 w-4" /></button>
                    </div>
                  </label>
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
