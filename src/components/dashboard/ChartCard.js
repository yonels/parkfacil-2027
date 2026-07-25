import SectionHeader from "@/components/dashboard/SectionHeader";

export default function ChartCard({ title, actionLabel, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <SectionHeader title={title} actionLabel={actionLabel} />
      {children}
    </section>
  );
}
