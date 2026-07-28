import { getPerfilLabel } from "@/data/usuarios.mjs";

export default function PerfilUsuarioBadge({ perfil }) {
  return (
    <span className="inline-flex max-w-full rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-slate-600">
      {getPerfilLabel(perfil)}
    </span>
  );
}
