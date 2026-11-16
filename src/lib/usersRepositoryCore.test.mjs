import test from "node:test";
import assert from "node:assert/strict";
import { mapAuthorizedUsers } from "./usersRepositoryCore.mjs";

const now = new Date("2026-09-10T12:00:00Z");

const company = { id: "emp-1", business_name: "Cliente Uno SpA", trade_name: "Cliente Uno", rut_number: "1", rut_dv: "9" };
const rootActor = { id: "root-1", email: "root@parkfacil.cl" };

function baseMember(overrides) {
  return {
    user_id: "user-1",
    company_id: "emp-1",
    full_name: "Ana Pérez",
    role: "operator",
    status: "active",
    must_change_password: false,
    ...overrides,
  };
}

test("funcion: Operador Off Street / Inspector On Street / Administrador según role+product_scope", () => {
  const members = [
    baseMember({ user_id: "u1", role: "operator", product_scope: "OFF_STREET" }),
    baseMember({ user_id: "u2", role: "operator", product_scope: "ON_STREET" }),
    baseMember({ user_id: "u3", role: "company_admin", product_scope: "BOTH" }),
  ];
  const authUsers = [
    { id: "u1", email: "op1@cliente.cl" },
    { id: "u2", email: "op2@cliente.cl" },
    { id: "u3", email: "admin@cliente.cl" },
  ];
  const result = mapAuthorizedUsers({ members, authUsers, companies: [company], parkings: [], access: [], now });
  assert.equal(result.find((u) => u.id === "u1").funcion, "Operador Off Street");
  assert.equal(result.find((u) => u.id === "u2").funcion, "Inspector On Street");
  assert.equal(result.find((u) => u.id === "u3").funcion, "Administrador");
});

test("estadoDetallado calcula 'expired' para un usuario active cuyo access_expires_at ya pasó, sin cambiar 'estado'", () => {
  const members = [baseMember({ user_id: "u1", status: "active", access_expires_at: "2026-09-01T00:00:00Z" })];
  const authUsers = [{ id: "u1", email: "op1@cliente.cl" }];
  const result = mapAuthorizedUsers({ members, authUsers, companies: [company], parkings: [], access: [], now });
  const user = result[0];
  assert.equal(user.estado, "active"); // en BD sigue "active", nunca "expired"
  assert.equal(user.estadoDetallado, "expired");
  assert.equal(user.estadoDetalladoLabel, "Vencido");
});

test("activatedBy resuelve al platform_admin real que activó, con email visible", () => {
  const members = [baseMember({ user_id: "u1", status: "active", activated_at: "2026-09-10T10:00:00Z", activated_by: "root-1" })];
  const authUsers = [{ id: "u1", email: "op1@cliente.cl" }, rootActor];
  const result = mapAuthorizedUsers({ members, authUsers, companies: [company], parkings: [], access: [], now });
  assert.deepEqual(result[0].activatedBy, { id: "root-1", email: "root@parkfacil.cl" });
  assert.equal(result[0].activatedAt, "2026-09-10T10:00:00Z");
});

test("suspendedBy resuelve al platform_admin real que suspendió, y activatedBy queda null mientras está suspendido", () => {
  const members = [baseMember({
    user_id: "u1", status: "suspended",
    activated_at: "2026-09-01T00:00:00Z", activated_by: "root-1",
    suspended_at: "2026-09-05T00:00:00Z", suspended_by: "root-1",
  })];
  const authUsers = [{ id: "u1", email: "op1@cliente.cl" }, rootActor];
  const result = mapAuthorizedUsers({ members, authUsers, companies: [company], parkings: [], access: [], now });
  assert.deepEqual(result[0].suspendedBy, { id: "root-1", email: "root@parkfacil.cl" });
  assert.equal(result[0].activatedBy, null);
});

test("sin activador conocido en el alcance de datos disponible, no rompe (activatedBy queda null en vez de lanzar)", () => {
  const members = [baseMember({ user_id: "u1", status: "active", activated_at: "2026-09-10T10:00:00Z", activated_by: "root-desconocido" })];
  const authUsers = [{ id: "u1", email: "op1@cliente.cl" }]; // root-desconocido no está en la lista (vista scoped a la empresa)
  const result = mapAuthorizedUsers({ members, authUsers, companies: [company], parkings: [], access: [], now });
  assert.equal(result[0].activatedBy, null);
  assert.equal(result[0].activatedAt, "2026-09-10T10:00:00Z");
});

test("accessExpiresAt y productoAlcance viajan tal cual al objeto mapeado", () => {
  const members = [baseMember({ user_id: "u1", product_scope: "OFF_STREET", access_expires_at: "2026-09-10T18:00:00Z" })];
  const authUsers = [{ id: "u1", email: "op1@cliente.cl" }];
  const result = mapAuthorizedUsers({ members, authUsers, companies: [company], parkings: [], access: [], now });
  assert.equal(result[0].productoAlcance, "OFF_STREET");
  assert.equal(result[0].accessExpiresAt, "2026-09-10T18:00:00Z");
});
