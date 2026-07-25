import AbonadoCard from "@/components/abonados/AbonadoCard";

export default function AbonadosGrid({ abonados }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {abonados.map((abonado) => (
        <AbonadoCard key={abonado.id} abonado={abonado} />
      ))}
    </div>
  );
}
