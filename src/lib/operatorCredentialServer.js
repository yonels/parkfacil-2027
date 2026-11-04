import "server-only";

import { decryptOperatorPassword, encryptOperatorPassword } from "@/lib/operatorCredentialCore.mjs";

// Guarda la copia cifrada de la clave de un operador (SOL-2026-11-04-004). La clave ya cambió en
// Supabase Auth cuando se llama: una falla aquí no la revierte, se informa como aviso para que el
// reporte no muestre un dato que no se pudo actualizar.
export async function saveOperatorCredential(db, { userId, companyId, password, actorId }) {
  try {
    const ciphertext = encryptOperatorPassword(password);
    const saved = await db.from("operator_credentials").upsert({
      user_id: userId,
      company_id: companyId,
      password_ciphertext: ciphertext,
      updated_by: actorId || null,
      updated_at: new Date().toISOString(),
    });
    if (saved.error) throw saved.error;
    const event = await db.from("operator_credential_events").insert({ user_id: userId, company_id: companyId, actor_id: actorId || null, action: "SAVED" });
    if (event.error) console.error("[users:credential:audit]", event.error.code);
    return { ok: true };
  } catch (error) {
    // Nunca se registra la clave ni el contenido cifrado.
    console.error("[users:credential:save]", error?.code || error?.name || "ERROR");
    // La copia anterior ya no corresponde a la clave vigente.
    await db.from("operator_credentials").delete().eq("user_id", userId).then(() => null, () => null);
    return { ok: false, warning: "La clave cambió, pero no quedó registrada en el reporte de claves." };
  }
}

// Lee la clave solo después de auditar la lectura: sin auditoría no se muestra.
export async function readOperatorCredential(db, { userId, companyId, actorId }) {
  const stored = await db.from("operator_credentials").select("password_ciphertext").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  if (stored.error) throw stored.error;
  if (!stored.data) return null;
  const password = decryptOperatorPassword(stored.data.password_ciphertext);
  const event = await db.from("operator_credential_events").insert({ user_id: userId, company_id: companyId, actor_id: actorId || null, action: "VIEWED" });
  if (event.error) throw event.error;
  return password;
}
