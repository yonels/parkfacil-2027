import StatusBadge from "@/components/ui/StatusBadge";
import { getStatusLabel } from "@/lib/notifications/normalizers";

export default function NotificationStatusBadge({ status }) {
  const variant = status === "failed" ? "error" : ["pending", "processing"].includes(status) ? "warning" : ["sent", "delivered"].includes(status) ? "positive" : "neutral";
  return <StatusBadge variant={variant}>{getStatusLabel(status)}</StatusBadge>;
}
