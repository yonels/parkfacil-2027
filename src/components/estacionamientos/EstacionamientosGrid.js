import EstacionamientoCard from "@/components/estacionamientos/EstacionamientoCard";

export default function EstacionamientosGrid({ estacionamientos }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {estacionamientos.map((estacionamiento) => (
        <EstacionamientoCard key={estacionamiento.id} estacionamiento={estacionamiento} />
      ))}
    </div>
  );
}
