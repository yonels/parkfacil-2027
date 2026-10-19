// Fase TUU-02 — recepción del resultado de TUU.
//
// El bridge nativo entrega el resultado del pago llamando a
// window.ParkFacilTuuResult(json) cuando la app de pago se cierra (ver
// MainActivity.deliverTuuResultToWeb en parkfacil-pos-android). Antes, esa
// función solo existía mientras se esperaba el pago: al agotarse el tiempo de
// espera se retiraba y una respuesta posterior ("tardía") se perdía.
//
// Este enrutador deja UN receptor instalado de forma permanente:
// - si hay un pago esperando, el resultado resuelve esa espera;
// - si no (llegó tarde, o después de recargar la app), se entrega a
//   onLateResult para que el pago aprobado se guarde igualmente.
//
// Sin dependencias de React ni del DOM: `target` es el objeto donde vive la
// función global (window) y los temporizadores se inyectan para las pruebas.

import { parseTuuResult } from "./tuuPayment.mjs";
import { correlationOfTuuResult, isTuuAttemptId } from "./tuuNativeBridge.mjs";

export function createTuuResultRouter({ onLateResult, isDuplicate, onDuplicate, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let waiting = null;
  let lateHandler = typeof onLateResult === "function" ? onLateResult : null;

  function receive(resultJson) {
    // Correlación entregada por la APK 0.4.0+ (attemptId). La APK 0.3.13 no la
    // informa: `declared` queda en false y se conserva el comportamiento anterior.
    const correlation = correlationOfTuuResult(resultJson);
    const result = { ...parseTuuResult(resultJson), attemptId: correlation.attemptId, uncorrelated: correlation.uncorrelated, late: correlation.late };
    // Resultado que la APK no pudo asociar a ningún intento: NUNCA resuelve la
    // espera de un pago ni se asigna a un ticket. Solo se deja constancia.
    if (correlation.uncorrelated) {
      if (lateHandler) lateHandler(result);
      return;
    }
    // Una aprobación ya procesada (misma referencia TUU) que se entrega otra
    // vez se ignora: nunca resuelve la espera de un pago distinto ni genera
    // un segundo registro.
    if (result?.success === true && typeof isDuplicate === "function" && isDuplicate(result)) {
      if (typeof onDuplicate === "function") onDuplicate(result);
      return;
    }
    // Un resultado con attemptId solo resuelve la espera de ESE intento. Si es
    // de otro intento (resultado guardado de un pago anterior) va al receptor
    // de resultados tardíos, que lo informa con su propio identificador.
    const matchesWaiting = waiting && (!waiting.attemptId || !correlation.declared || correlation.attemptId === waiting.attemptId);
    if (matchesWaiting) {
      const current = waiting;
      waiting = null;
      if (current.timer) clearTimer(current.timer);
      current.resolve({ delivered: true, result });
      return;
    }
    if (lateHandler) lateHandler(result);
  }

  return {
    // Instala el receptor permanente. Idempotente.
    install(target) {
      if (target) target.ParkFacilTuuResult = receive;
    },
    setLateResultHandler(handler) {
      lateHandler = typeof handler === "function" ? handler : null;
    },
    isWaiting() {
      return Boolean(waiting);
    },
    receive,
    // Lanza el pago y espera su resultado. Nunca rechaza. Al agotarse el
    // tiempo resuelve NO_RESPONSE, pero el receptor sigue instalado: si TUU
    // responde después, el resultado llega a onLateResult.
    start(bridge, payloadJson, timeoutMs, { attemptId = null } = {}) {
      if (!bridge || typeof bridge.payWithTuu !== "function") {
        return Promise.resolve({ delivered: false, code: "TUU_BRIDGE_UNAVAILABLE", message: "Este dispositivo no tiene el bridge de pago TUU disponible." });
      }
      if (waiting) {
        return Promise.resolve({ delivered: false, code: "TUU_PAYMENT_IN_PROGRESS", message: "Ya hay un pago TUU en curso." });
      }
      return new Promise((resolve) => {
        const entry = { resolve, timer: null, attemptId: isTuuAttemptId(attemptId) ? attemptId.toLowerCase() : null };
        waiting = entry;
        const settle = (outcome) => {
          if (waiting !== entry) return;
          waiting = null;
          if (entry.timer) clearTimer(entry.timer);
          resolve(outcome);
        };
        entry.timer = setTimer(() => settle({ delivered: false, code: "NO_RESPONSE", message: "TUU no respondió dentro del tiempo esperado." }), timeoutMs);

        let ack;
        try {
          const raw = bridge.payWithTuu(payloadJson);
          ack = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch (error) {
          settle({ delivered: false, code: "TUU_BRIDGE_EXCEPTION", message: error instanceof Error ? error.message : String(error ?? "Error desconocido") });
          return;
        }
        if (!ack?.ok) {
          settle({ delivered: false, code: ack?.code || "TUU_LAUNCH_FAILED", message: ack?.message || "No fue posible iniciar el pago TUU." });
        }
        // ack.ok === true: se espera receive(...) o el temporizador.
      });
    },
  };
}
