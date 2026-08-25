const CHILEAN_MOBILE = /^\+569\d{8}$/;

export async function isEligibleOnStreetSmsNotification(db, notification, nowIso) {
  if (notification.type !== "EXPIRING_SOON" || !CHILEAN_MOBILE.test(notification.phone_normalized || "") || !notification.target_expires_at) return false;
  const now = new Date(nowIso).getTime(), target = new Date(notification.target_expires_at).getTime();
  if (!Number.isFinite(target) || target <= now || target - now > 15 * 60 * 1000) return false;
  const sessionResult = await db.from("on_street_pilot_sessions").select("id,status,phone_normalized,expires_at,payment_transaction_id").eq("id", notification.session_id).maybeSingle();
  if (sessionResult.error) throw sessionResult.error;
  const session = sessionResult.data;
  if (!session || session.status !== "ACTIVE" || session.phone_normalized !== notification.phone_normalized || new Date(session.expires_at).getTime() !== target) return false;
  const extensionResult = await db.from("on_street_pilot_extensions").select("payment_transaction_id").eq("session_id", session.id).eq("new_expires_at", notification.target_expires_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (extensionResult.error) throw extensionResult.error;
  const paymentId = extensionResult.data?.payment_transaction_id || session.payment_transaction_id;
  if (!paymentId) return false;
  const paymentResult = await db.from("payment_transactions").select("status").eq("id", paymentId).maybeSingle();
  if (paymentResult.error) throw paymentResult.error;
  return paymentResult.data?.status === "COMMITTED";
}
