import DispositivoCard from "@/components/dispositivos/DispositivoCard";

export default function DispositivosGrid({ dispositivos }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {dispositivos.map((dispositivo) => (
        <DispositivoCard key={dispositivo.id} dispositivo={dispositivo} />
      ))}
    </div>
  );
}
