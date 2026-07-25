import ControlAccesoCard from "@/components/control-accesos/ControlAccesoCard";

export default function ControlAccesosGrid({ accesos }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {accesos.map((acceso) => (
        <ControlAccesoCard key={acceso.id} acceso={acceso} />
      ))}
    </div>
  );
}
