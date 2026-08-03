import EmpresaCard from "@/components/empresas/EmpresaCard";

export default function EmpresasGrid({ empresas }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {empresas.map((empresa) => (
        <EmpresaCard key={empresa.id} empresa={empresa} />
      ))}
    </div>
  );
}
