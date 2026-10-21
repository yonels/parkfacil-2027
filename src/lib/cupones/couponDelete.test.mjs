import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUPON_PAGE_MODES, couponDeletable, couponDeleteErrorMessage, removeDeletedCoupon } from "./couponDelete.mjs";

// Fin de línea normalizado: las pruebas no dependen de CRLF (Windows) o LF.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("solo los cupones sin utilizar ofrecen la acción Eliminar", () => {
  assert.equal(couponDeletable({ status: "ACTIVE", redeemedAt: null }), true);
  assert.equal(couponDeletable({ status: "DRAFT", redeemedAt: null }), true);
  assert.equal(couponDeletable({ status: "EXPIRED", redeemedAt: null }), true);
  assert.equal(couponDeletable({ status: "REDEEMED", redeemedAt: "2026-10-20T12:00:00Z" }), false);
  assert.equal(couponDeletable({ status: "ACTIVE", redeemedAt: "2026-10-20T12:00:00Z" }), false);
  assert.equal(couponDeletable(null), false);
});

test("mensajes de error: los del servidor y uno propio, en español, sin red", () => {
  assert.equal(couponDeleteErrorMessage({ error: "El cupón ya fue utilizado." }), "El cupón ya fue utilizado.");
  assert.match(couponDeleteErrorMessage({}), /No fue posible eliminar el cupón/);
  assert.match(couponDeleteErrorMessage(null, { network: true }), /No hay conexión.*no se eliminó/);
});

test("tras eliminar, el cupón sale del listado, del lote, de la vista previa y del correo", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const next = removeDeletedCoupon({ coupons: [a, b], selectedBatch: [a, b], selected: a, emailCoupon: a }, "a");
  assert.deepEqual(next, { coupons: [b], selectedBatch: [b], selected: null, emailCoupon: null });
  const untouched = removeDeletedCoupon({ coupons: [a, b], selectedBatch: [b], selected: b, emailCoupon: b }, "a");
  assert.deepEqual([untouched.selected, untouched.emailCoupon], [b, b]);
});

test("DELETE /api/cupones: permiso, empresa de la sesión, JSON e ID validados y decisión en la base", () => {
  const source = read("../../app/api/cupones/route.js");
  const del = source.slice(source.indexOf("export async function DELETE"));
  assert.ok(del.indexOf("couponsEnabled()") < del.indexOf("authorizeRemainingRequest"));
  assert.match(del, /authorizeRemainingRequest\(request, PERMISSIONS\.COUPONS_MANAGE\)/);
  assert.match(del, /if \(!actor\.isPlatformAdmin && !actor\.companyId\) return responseError\("Tu cuenta no tiene una empresa asociada\.", 403\);/);
  assert.match(del, /await request\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(del, /if \(!COUPON_UUID_PATTERN\.test\(id\)\) return responseError/);
  // La empresa sale de la sesión, nunca del cuerpo.
  assert.match(del, /rpc\("delete_unused_coupon", \{ p_coupon_id: id, p_company_id: actor\.isPlatformAdmin \? null : actor\.companyId \}\)/);
  assert.doesNotMatch(del, /input\.companyId|input\.role/);
  assert.doesNotMatch(del, /\.from\("coupons"\)\.delete\(\)/);
  for (const code of ["COUPON_NOT_DELETABLE", "COUPON_MODULE_INACTIVE", "COUPON_USED", "COUPON_LINKED", "COUPON_PAYMENT_IN_PROGRESS"]) assert.match(source, new RegExp(`${code}: \\[`));
  assert.match(source, /canManage: actor\.isAdmin/);
});

test("migración 20261020170000: función con bloqueo, protecciones y permisos mínimos; reserva con tarjeta bloquea el cupón", () => {
  const sql = read("../../../supabase/migrations/20261020170000_coupon_safe_delete.sql");
  assert.match(sql, /select \* into v_coupon from public\.coupons where id = p_coupon_id for update;/);
  assert.match(sql, /p_company_id is not null and v_coupon\.company_id is distinct from p_company_id/);
  assert.match(sql, /public\.coupon_module_active\(v_coupon\.company_id\)/);
  assert.match(sql, /v_coupon\.status = 'REDEEMED' or v_coupon\.redeemed_at is not null or v_coupon\.redeemed_stay_id is not null/);
  assert.match(sql, /from public\.parking_stays where coupon_id = p_coupon_id/);
  assert.match(sql, /charge_snapshot->>'couponId' = p_coupon_id::text\s+and status in \('RESERVED', 'SENT_TO_TUU', 'APPROVED_PENDING_REGISTRATION', 'UNCERTAIN', 'PAID'\)/);
  assert.match(sql, /revoke all on function public\.delete_unused_coupon\(uuid, text\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.delete_unused_coupon\(uuid, text\) to service_role;/);
  assert.doesNotMatch(sql, /grant delete on public\.coupons/i, "sin DELETE directo sobre la tabla");
  assert.match(sql, /for share;\s+if not found then\s+raise exception 'CARD_ATTEMPT_COUPON_UNAVAILABLE'/);
  assert.match(sql, /before insert on public\.pos_card_payment_attempts/);
  assert.match(read("../pos/cardPaymentAttempts.mjs"), /CARD_ATTEMPT_COUPON_UNAVAILABLE: \[409,/);
});

test("pantalla: Eliminar solo en /cupones/eliminar, con diálogo propio y candado contra doble toque; sin edición", () => {
  const client = read("../../components/cupones/CouponsClient.js");
  assert.deepEqual(COUPON_PAGE_MODES, { LIST: "listado", CREATE: "crear", DELETE: "eliminar" });
  assert.match(client, /\{deleteMode \? <DeleteCell /);
  assert.match(client, /if \(!coupon \|\| deleteLockRef\.current\) return;\s+deleteLockRef\.current = true;/);
  assert.match(client, /finally \{ deleteLockRef\.current = false;/);
  assert.match(client, /Eliminar definitivamente/);
  assert.doesNotMatch(client, /window\.confirm/);
  assert.doesNotMatch(client, /Editar/);
  // Crear: el formulario se abre una sola vez.
  assert.match(client, /if \(mode !== COUPON_PAGE_MODES\.CREATE \|\| !loaded \|\| !canManage \|\| createOpenedRef\.current\) return;/);
  assert.match(read("../../app/cupones/crear/page.js"), /<CouponsClient mode="crear" \/>/);
  assert.match(read("../../app/cupones/eliminar/page.js"), /<CouponsClient mode="eliminar" \/>/);
});
