// MODELO EN MEMORIA de las funciones de la migración
// 20261011110000_pos_card_payment_attempts.sql, solo para pruebas unitarias.
//
// Reproduce las REGLAS (estados, idempotencia, alcance por empresa, guarda del
// ticket) para probar el código que las usa. NO es evidencia de atomicidad ni
// de concurrencia real: en JavaScript cada llamada corre completa antes de la
// siguiente. La garantía real (bloqueo de fila + índice único parcial) solo
// puede comprobarse contra PostgreSQL con la migración aplicada.

import { ACTIVE_CARD_ATTEMPT_STATUSES } from "./cardPaymentAttempts.mjs";

const fail = (message) => ({ data: null, error: { code: "P0001", message } });
const ok = (data) => ({ data, error: null });

export function createCardAttemptsModelDb({ stays = [], parkings = [], shifts = [], now = () => new Date("2026-10-11T15:00:00.000Z") } = {}) {
  const state = {
    stays: stays.map((stay) => ({ status: "OPEN", card_payment_attempt_id: null, ...stay })),
    parkings: [...parkings],
    shifts: [...shifts],
    attempts: [],
    sequence: 0,
  };
  const uuid = () => `00000000-0000-4000-8000-${String(++state.sequence).padStart(12, "0")}`;
  const isActive = (attempt, at) => ACTIVE_CARD_ATTEMPT_STATUSES.includes(attempt.status)
    && (attempt.status !== "RESERVED" || new Date(attempt.reservation_expires_at) > at);

  const rpc = {
    reserve_pos_card_payment(p) {
      const at = now();
      const stay = state.stays.find((item) => item.id === p.p_stay_id);
      if (!stay) return fail("CARD_ATTEMPT_STAY_NOT_FOUND");
      const parking = state.parkings.find((item) => item.id === stay.parking_id);
      if (!parking || stay.parking_id !== p.p_parking_id || parking.company_id !== p.p_company_id) return fail("CARD_ATTEMPT_SCOPE_MISMATCH");
      const existing = state.attempts.find((item) => item.company_id === p.p_company_id && item.idempotency_key === p.p_idempotency_key);
      if (existing) {
        const same = existing.stay_id === p.p_stay_id && Number(existing.amount) === Number(p.p_amount) && existing.card_type === p.p_card_type
          && existing.operator_id === p.p_operator_id && existing.device_id === p.p_device_id && existing.environment === p.p_environment;
        return same ? ok({ ...existing }) : fail("CARD_ATTEMPT_IDEMPOTENCY_CONFLICT");
      }
      if (stay.status !== "OPEN") return fail("CARD_ATTEMPT_STAY_NOT_OPEN");
      if (!(Number(p.p_amount) > 0)) return fail("CARD_ATTEMPT_AMOUNT_INVALID");
      const shift = state.shifts.find((item) => item.id === p.p_shift_id);
      if (!shift || shift.status !== "OPEN" || shift.operator_id !== p.p_operator_id || shift.parking_id !== stay.parking_id) return fail("CARD_ATTEMPT_SHIFT_INVALID");
      for (const attempt of state.attempts) {
        if (attempt.stay_id === stay.id && attempt.status === "RESERVED" && new Date(attempt.reservation_expires_at) <= at) {
          Object.assign(attempt, { status: "NOT_SENT", resolution_source: "NOT_SENT", provider_error_code: "RESERVATION_EXPIRED", result_at: at.toISOString() });
        }
      }
      if (state.attempts.some((attempt) => attempt.stay_id === stay.id && ACTIVE_CARD_ATTEMPT_STATUSES.includes(attempt.status))) return fail("CARD_ATTEMPT_ACTIVE");
      const attempt = {
        id: uuid(), idempotency_key: p.p_idempotency_key, company_id: p.p_company_id, parking_id: stay.parking_id, stay_id: stay.id,
        ticket_code: stay.code, license_plate: stay.license_plate, operator_id: p.p_operator_id, operator_name: p.p_operator_name || "",
        shift_id: p.p_shift_id, device_id: p.p_device_id, provider: "TUU", environment: p.p_environment, card_type: p.p_card_type,
        amount: p.p_amount, charge_snapshot: p.p_charge_snapshot, status: "RESERVED", provider_reference: null, provider_error_code: null,
        provider_error_message: null, resolution_source: null, reserved_at: at.toISOString(),
        reservation_expires_at: new Date(at.getTime() + Math.max(30, Math.min(p.p_ttl_seconds ?? 180, 900)) * 1000).toISOString(),
        sent_at: null, result_at: null, approved_at: null, paid_at: null, payment_code: null,
        regularized_by: null, regularized_by_name: null, regularized_at: null, regularization_reason: null, regularization_evidence: null, regularization_previous_status: null,
      };
      state.attempts.push(attempt);
      return ok({ ...attempt });
    },

    mark_pos_card_payment_sent(p) {
      const at = now();
      const attempt = state.attempts.find((item) => item.id === p.p_attempt_id && item.company_id === p.p_company_id);
      if (!attempt) return fail("CARD_ATTEMPT_NOT_FOUND");
      if (attempt.operator_id !== p.p_operator_id || attempt.device_id !== p.p_device_id) return fail("CARD_ATTEMPT_FORBIDDEN");
      if (attempt.status === "SENT_TO_TUU") return ok({ ...attempt });
      if (attempt.status !== "RESERVED") return fail("CARD_ATTEMPT_INVALID_STATE");
      if (new Date(attempt.reservation_expires_at) <= at) {
        Object.assign(attempt, { status: "NOT_SENT", resolution_source: "NOT_SENT", provider_error_code: "RESERVATION_EXPIRED", result_at: at.toISOString() });
        return ok({ ...attempt });
      }
      Object.assign(attempt, { status: "SENT_TO_TUU", sent_at: at.toISOString() });
      return ok({ ...attempt });
    },

    report_pos_card_payment_result(p) {
      const at = now();
      if (!["APPROVED", "DECLINED", "CANCELLED", "NOT_STARTED", "UNCERTAIN"].includes(p.p_outcome)) return fail("CARD_ATTEMPT_OUTCOME_INVALID");
      const reference = p.p_reference || null;
      if (reference && !/^\d{12}$/.test(reference)) return fail("CARD_ATTEMPT_REFERENCE_INVALID");
      const attempt = state.attempts.find((item) => item.id === p.p_attempt_id && item.company_id === p.p_company_id);
      if (!attempt) return fail("CARD_ATTEMPT_NOT_FOUND");
      if (attempt.device_id !== p.p_device_id) return fail("CARD_ATTEMPT_FORBIDDEN");
      const target = { APPROVED: "APPROVED_PENDING_REGISTRATION", DECLINED: "DECLINED", CANCELLED: "CANCELLED", NOT_STARTED: "NOT_SENT", UNCERTAIN: "UNCERTAIN" }[p.p_outcome];
      if (attempt.status === target && (target !== "APPROVED_PENDING_REGISTRATION" || attempt.provider_reference === reference)) return ok({ ...attempt });
      if (attempt.status === "PAID" && p.p_outcome === "APPROVED" && attempt.provider_reference === reference) return ok({ ...attempt });
      if (attempt.status === "RESERVED") {
        if (p.p_outcome !== "NOT_STARTED") return fail("CARD_ATTEMPT_INVALID_STATE");
      } else if (attempt.status === "UNCERTAIN") {
        if (p.p_outcome === "NOT_STARTED") return fail("CARD_ATTEMPT_INVALID_STATE");
      } else if (attempt.status !== "SENT_TO_TUU") {
        return fail("CARD_ATTEMPT_RESULT_CONFLICT");
      }
      if (target === "APPROVED_PENDING_REGISTRATION" && reference && state.attempts.some((other) => other.id !== attempt.id
        && other.company_id === attempt.company_id && other.environment === attempt.environment && other.provider_reference === reference
        && ["APPROVED_PENDING_REGISTRATION", "PAID"].includes(other.status))) {
        Object.assign(attempt, { status: "UNCERTAIN", provider_reference: reference, provider_error_code: "REFERENCE_REUSED", provider_error_message: "La referencia informada por TUU ya está asociada a otro intento.", resolution_source: null, result_at: at.toISOString() });
        return ok({ ...attempt });
      }
      Object.assign(attempt, {
        status: target,
        provider_reference: target === "APPROVED_PENDING_REGISTRATION" ? reference : attempt.provider_reference,
        provider_error_code: target === "APPROVED_PENDING_REGISTRATION" ? null : p.p_error_code || null,
        provider_error_message: target === "APPROVED_PENDING_REGISTRATION" ? null : p.p_error_message || null,
        resolution_source: target === "UNCERTAIN" ? null : target === "NOT_SENT" ? "NOT_SENT" : "TUU_RESULT",
        approved_at: target === "APPROVED_PENDING_REGISTRATION" ? at.toISOString() : attempt.approved_at,
        result_at: at.toISOString(),
      });
      return ok({ ...attempt });
    },

    register_pos_card_payment(p) {
      const at = now();
      const attempt = state.attempts.find((item) => item.id === p.p_attempt_id && item.company_id === p.p_company_id);
      if (!attempt) return fail("CARD_ATTEMPT_NOT_FOUND");
      const stay = state.stays.find((item) => item.id === attempt.stay_id);
      if (!stay) return fail("CARD_ATTEMPT_STAY_NOT_FOUND");
      if (attempt.status === "PAID") return stay.card_payment_attempt_id === attempt.id ? ok({ ...stay }) : fail("CARD_ATTEMPT_INCONSISTENT");
      if (attempt.status !== "APPROVED_PENDING_REGISTRATION") return fail("CARD_ATTEMPT_NOT_APPROVED");
      if (stay.status !== "OPEN") return fail("CARD_ATTEMPT_STAY_NOT_OPEN");
      if (Math.round(Number(p.p_payment.total_amount)) !== Math.round(Number(attempt.amount))) return fail("CARD_ATTEMPT_AMOUNT_MISMATCH");
      Object.assign(stay, {
        status: "PAID", exit_at: attempt.approved_at || at.toISOString(), exit_operator_id: p.p_operator_id, exit_operator_name: p.p_operator_name,
        payment_shift_id: p.p_shift_id, total_amount: Math.round(Number(p.p_payment.total_amount)), payment_method: "CARD", payment_card_type: attempt.card_type,
        payment_code: p.p_payment.payment_code, card_payment_provider: attempt.provider_reference ? "TUU" : null, card_payment_reference: attempt.provider_reference,
        card_payment_attempt_id: attempt.id, card_payment_registration: attempt.regularized_at ? "REGULARIZED" : "IMMEDIATE",
      });
      Object.assign(attempt, { status: "PAID", paid_at: at.toISOString(), payment_code: stay.payment_code });
      return ok({ ...stay });
    },

    regularize_pos_card_payment(p) {
      const at = now();
      if (!["APPROVED", "NOT_CHARGED"].includes(p.p_resolution)) return fail("CARD_ATTEMPT_RESOLUTION_INVALID");
      if (String(p.p_reason || "").trim().length < 10) return fail("CARD_ATTEMPT_REASON_REQUIRED");
      const attempt = state.attempts.find((item) => item.id === p.p_attempt_id && item.company_id === p.p_company_id);
      if (!attempt) return fail("CARD_ATTEMPT_NOT_FOUND");
      if (!["UNCERTAIN", "SENT_TO_TUU"].includes(attempt.status)) return fail("CARD_ATTEMPT_INVALID_STATE");
      if (p.p_resolution === "APPROVED" && p.p_reference && state.attempts.some((other) => other.id !== attempt.id
        && other.company_id === attempt.company_id && other.environment === attempt.environment && other.provider_reference === p.p_reference
        && ["APPROVED_PENDING_REGISTRATION", "PAID"].includes(other.status))) return fail("CARD_ATTEMPT_REFERENCE_REUSED");
      const previous = attempt.status;
      Object.assign(attempt, {
        status: p.p_resolution === "APPROVED" ? "APPROVED_PENDING_REGISTRATION" : "RELEASED_BY_REGULARIZATION",
        provider_reference: p.p_resolution === "APPROVED" ? p.p_reference || attempt.provider_reference : attempt.provider_reference,
        approved_at: p.p_resolution === "APPROVED" ? attempt.approved_at || attempt.sent_at || at.toISOString() : attempt.approved_at,
        resolution_source: "MANUAL_REGULARIZATION", regularized_by: p.p_actor_id, regularized_by_name: p.p_actor_name || "", regularized_at: at.toISOString(),
        regularization_reason: String(p.p_reason).trim(), regularization_evidence: p.p_evidence || null, regularization_previous_status: previous, result_at: at.toISOString(),
      });
      return ok({ ...attempt });
    },
  };

  // Consulta mínima estilo Supabase sobre pos_card_payment_attempts.
  function from(table) {
    if (table !== "pos_card_payment_attempts") throw new Error(`tabla no modelada: ${table}`);
    const filters = [];
    let max = null;
    let single = false;
    const run = () => {
      let rows = state.attempts.filter((row) => filters.every((filter) => filter(row))).map((row) => ({ ...row }));
      rows.sort((a, b) => String(b.reserved_at).localeCompare(String(a.reserved_at)));
      if (max !== null) rows = rows.slice(0, max);
      return ok(single ? rows[0] || null : rows);
    };
    const query = {
      select: () => query,
      eq: (column, value) => { filters.push((row) => row[column] === value); return query; },
      in: (column, values) => { filters.push((row) => values.includes(row[column])); return query; },
      gte: (column, value) => { filters.push((row) => new Date(row[column]) >= new Date(value)); return query; },
      lte: (column, value) => { filters.push((row) => new Date(row[column]) <= new Date(value)); return query; },
      ilike: (column, pattern) => { const needle = String(pattern).replace(/%/g, "").toLowerCase(); filters.push((row) => String(row[column] || "").toLowerCase().includes(needle)); return query; },
      order: () => query,
      limit: (value) => { max = value; return query; },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return query;
  }

  // Guarda del ticket (trigger parking_stays_guard_card_attempt): cualquier
  // otro cambio de estado del ticket con un intento activo se rechaza.
  function changeStayStatus(stayId, status, { attemptId = null } = {}) {
    const stay = state.stays.find((item) => item.id === stayId);
    const active = state.attempts.find((attempt) => attempt.stay_id === stayId && isActive(attempt, now()));
    if (active && !(status === "PAID" && attemptId === active.id)) return fail("CARD_PAYMENT_ATTEMPT_ACTIVE");
    stay.status = status;
    return ok({ ...stay });
  }

  return {
    state,
    changeStayStatus,
    from,
    rpc: (name, params) => Promise.resolve(rpc[name] ? rpc[name](params) : { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } }),
  };
}
