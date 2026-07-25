import Link from "next/link";

export default function SectionHeader({ title, actionLabel, onActionClick, actionHref }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-[#041E42]">{title}</h2>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="text-xs font-semibold text-[#1E5EFF] transition hover:text-[#0B3D91]">
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && !actionHref ? (
        <button
          type="button"
          onClick={onActionClick}
          className="text-xs font-semibold text-[#1E5EFF] transition hover:text-[#0B3D91]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
