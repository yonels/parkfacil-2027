import EmpresaCard from "@/components/empresas/EmpresaCard";

export default function EmpresasGrid({ empresas }) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 min-[1366px]:grid-cols-3 min-[1600px]:grid-cols-4">
      {empresas.map((empresa) => (
        <EmpresaCard key={empresa.id} empresa={empresa} />
      ))}
    </div>
  );
}
