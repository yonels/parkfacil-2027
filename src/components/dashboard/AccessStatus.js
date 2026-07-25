import { Dot } from "lucide-react";

const stateStyles = {
  Abierta: "text-[#16A34A]",
  Cerrada: "text-[#DC2626]",
  Revision: "text-[#F59E0B]",
};

export default function AccessStatus({ items = [] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">{item.name}</p>
          <div className={`inline-flex items-center text-xs font-semibold ${stateStyles[item.state] || "text-[#64748B]"}`}>
            <Dot className="h-4 w-4" />
            <span>{item.state}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
