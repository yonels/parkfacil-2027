import ConvenioCard from "@/components/convenios/ConvenioCard";

export default function ConveniosGrid({ convenios, referenceDate }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {convenios.map((convenio) => (
        <ConvenioCard key={convenio.id} convenio={convenio} referenceDate={referenceDate} />
      ))}
    </div>
  );
}
