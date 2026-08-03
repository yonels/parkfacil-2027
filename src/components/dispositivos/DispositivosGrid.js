import DispositivoCard from "@/components/dispositivos/DispositivoCard";

export default function DispositivosGrid({ dispositivos }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {dispositivos.map((dispositivo) => (
        <DispositivoCard key={dispositivo.id} dispositivo={dispositivo} />
      ))}
    </div>
  );
}
