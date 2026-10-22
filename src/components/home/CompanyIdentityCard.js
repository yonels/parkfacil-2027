import { Building2 } from "lucide-react";

// Recuadro «Tu empresa» del Portal Cliente (Inicio y Dashboard Off Street).
// identity: resultado de shapeCompanyIdentity (companyIdentityCore.mjs).
export default function CompanyIdentityCard({ identity }) {
  if (!identity) return null;
  return (
    <section aria-label="Empresa de la cuenta" className="flex flex-wrap items-start gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EEF4FF] text-[#3150D8]"><Building2 className="h-6 w-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">Tu empresa</p>
        <h2 className="mt-1 text-xl font-bold text-[#041E42]">{identity.businessName}</h2>
        {identity.tradeName ? <p className="mt-0.5 text-sm text-slate-600">{identity.tradeName}</p> : null}
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">RUT</dt><dd className="text-slate-800">{identity.rut || "No informado"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{identity.admins.length > 1 ? "Administradores" : "Administrador"}</dt><dd className="text-slate-800">{identity.admins.length ? identity.admins.join(", ") : "No informado"}</dd></div>
        </dl>
      </div>
    </section>
  );
}
