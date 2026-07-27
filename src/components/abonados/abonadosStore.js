"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ABONADOS_REFERENCE_DATE,
  getAbonadoFormInitialValues,
  getAbonadosSummary,
  getCredencialesPorVencerIds,
  normalizeLicensePlate,
  resolveEmpresaName,
  resolveResponsableName,
  searchAbonadosInList,
} from "@/lib/abonados";

async function parseJsonResponse(response) {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error || "Error inesperado al procesar la solicitud.";
    const error = new Error(message);
    error.details = body?.details || null;
    throw error;
  }

  return body;
}

export {
  ABONADOS_REFERENCE_DATE,
  getAbonadoFormInitialValues,
  getAbonadosSummary,
  getCredencialesPorVencerIds,
  normalizeLicensePlate,
  resolveEmpresaName,
  resolveResponsableName,
  searchAbonadosInList,
};

export function useAbonadosStore() {
  const [abonados, setAbonados] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/abonados", { method: "GET", cache: "no-store" });
      const body = await parseJsonResponse(response);
      setAbonados(Array.isArray(body?.data) ? body.data : []);
      setError(null);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const findById = useCallback((id) => abonados.find((abonado) => abonado.id === id) || null, [abonados]);

  const createAbonado = useCallback(async (values) => {
    const response = await fetch("/api/abonados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await parseJsonResponse(response);
    const created = body?.data;
    if (created) setAbonados((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    setError(null);
    return created;
  }, []);

  const updateAbonado = useCallback(async (id, values) => {
    const response = await fetch(`/api/abonados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await parseJsonResponse(response);
    const updated = body?.data;
    if (updated) setAbonados((current) => current.map((item) => (item.id === id ? updated : item)));
    setError(null);
    return updated;
  }, []);

  return useMemo(() => ({
    abonados,
    hydrated,
    error,
    refresh,
    findById,
    createAbonado,
    updateAbonado,
  }), [abonados, hydrated, error, refresh, findById, createAbonado, updateAbonado]);
}
