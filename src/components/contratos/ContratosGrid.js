import ContratoCard from "@/components/contratos/ContratoCard";

export default function ContratosGrid({ contratos }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {contratos.map((contrato) => (
        <ContratoCard key={contrato.id} contrato={contrato} />
      ))}
    </div>
  );
}
