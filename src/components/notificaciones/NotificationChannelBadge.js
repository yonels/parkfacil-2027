import StatusBadge from "@/components/ui/StatusBadge";
import { getChannelLabel } from "@/lib/notifications/normalizers";

export default function NotificationChannelBadge({ channel, upcoming = false }) {
  const variant = channel === "email" ? "positive" : channel === "whatsapp" ? "warning" : "neutral";
  return <StatusBadge variant={variant}>{upcoming ? "WhatsApp - Próximamente" : getChannelLabel(channel)}</StatusBadge>;
}
