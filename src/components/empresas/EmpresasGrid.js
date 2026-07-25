import EmpresaCard from "@/components/empresas/EmpresaCard";

export default function EmpresasGrid({ empresas }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {empresas.map((empresa) => (
        <EmpresaCard key={empresa.id} empresa={empresa} />
      ))}
    </div>
  );
}
