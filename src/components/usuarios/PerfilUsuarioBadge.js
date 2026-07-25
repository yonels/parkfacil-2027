import { getPerfilLabel } from "@/data/usuarios.mjs";

export default function PerfilUsuarioBadge({ perfil }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
      {getPerfilLabel(perfil)}
    </span>
  );
}
