import { LogOut } from "lucide-react";
import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";

export default function InspectorAjustes({ inspector, onLogout }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Ajustes</h1>

      <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Inspector</p>
        <p className="mt-1 break-all text-lg font-black text-[#041E42]">{inspector?.email}</p>
        <p className="text-sm text-slate-500">Rol: Inspector</p>
      </div>

      <div className="mt-3 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Versión</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">ParkFacil Inspectores · Etapa 2 · build {POS_FRONTEND_VERSION}</p>
      </div>

      <button onClick={onLogout} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-600 font-black text-rose-600">
        <LogOut className="h-5 w-5" aria-hidden="true" />
        CERRAR SESIÓN
      </button>
    </div>
  );
}
