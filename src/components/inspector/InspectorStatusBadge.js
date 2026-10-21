import { inspectorStatusStyle } from "./inspectorStatusStyle.mjs";

export default function InspectorStatusBadge({ status, className = "" }) {
  const style = inspectorStatusStyle(status);
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black tracking-wide ${style.chip} ${className}`}>{style.label}</span>;
}
