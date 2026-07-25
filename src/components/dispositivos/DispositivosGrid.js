import DispositivoCard from "@/components/dispositivos/DispositivoCard";

export default function DispositivosGrid({ dispositivos }) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 min-[1366px]:grid-cols-3 min-[1600px]:grid-cols-4">
      {dispositivos.map((dispositivo) => (
        <DispositivoCard key={dispositivo.id} dispositivo={dispositivo} />
      ))}
    </div>
  );
}
