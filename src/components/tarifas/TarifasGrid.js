import TarifaCard from "@/components/tarifas/TarifaCard";

export default function TarifasGrid({ tarifas }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {tarifas.map((tarifa) => (
        <TarifaCard key={tarifa.id} tarifa={tarifa} />
      ))}
    </div>
  );
}
