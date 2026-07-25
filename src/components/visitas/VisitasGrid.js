import VisitaCard from "@/components/visitas/VisitaCard";

export default function VisitasGrid({ visitas, referenceDate }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visitas.map((visita) => (
        <VisitaCard key={visita.id} visita={visita} referenceDate={referenceDate} />
      ))}
    </div>
  );
}
