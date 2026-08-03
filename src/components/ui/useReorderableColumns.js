"use client";

import { useEffect, useMemo, useState } from "react";

function normalizeOrder(columns, storedOrder) {
  const available = new Set(columns.map((column) => column.key));
  const validStored = Array.isArray(storedOrder) ? storedOrder.filter((key) => available.has(key)) : [];
  const missing = columns.map((column) => column.key).filter((key) => !validStored.includes(key));
  return [...validStored, ...missing];
}

export default function useReorderableColumns(columns, storageKey) {
  const columnSignature = JSON.stringify(columns.map((column) => column.key));
  const [order, setOrder] = useState(() => columns.map((column) => column.key));
  const [draggedKey, setDraggedKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  useEffect(() => {
    const currentColumns = JSON.parse(columnSignature).map((key) => ({ key }));
    let storedOrder = [];
    try {
      storedOrder = JSON.parse(window.localStorage.getItem(`parkfacil:columns:${storageKey}`) || "[]");
    } catch {
      storedOrder = [];
    }
    const nextOrder = normalizeOrder(currentColumns, storedOrder);
    const timer = window.setTimeout(() => setOrder(nextOrder), 0);
    return () => window.clearTimeout(timer);
  }, [columnSignature, storageKey]);

  const orderedColumns = useMemo(() => {
    const normalized = normalizeOrder(columns, order);
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return normalized.map((key) => byKey.get(key)).filter(Boolean);
  }, [columns, order]);

  const moveColumn = (targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    setOrder((current) => {
      const normalized = normalizeOrder(columns, current);
      const from = normalized.indexOf(draggedKey);
      const to = normalized.indexOf(targetKey);
      if (from < 0 || to < 0) return normalized;
      const next = [...normalized];
      next.splice(from, 1);
      next.splice(to, 0, draggedKey);
      window.localStorage.setItem(`parkfacil:columns:${storageKey}`, JSON.stringify(next));
      return next;
    });
  };

  const getHeaderProps = (key) => ({
    draggable: true,
    onDragStart: (event) => {
      setDraggedKey(key);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", key);
    },
    onDragEnter: () => setOverKey(key),
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    onDrop: (event) => {
      event.preventDefault();
      moveColumn(key);
      setDraggedKey(null);
      setOverKey(null);
    },
    onDragEnd: () => {
      setDraggedKey(null);
      setOverKey(null);
    },
    title: "Arrastra para reubicar esta columna",
    "aria-label": "Columna reubicable",
    className: `${draggedKey === key ? "opacity-50" : ""} ${overKey === key && draggedKey !== key ? "ring-2 ring-inset ring-[#3150D8]" : ""}`,
  });

  return { orderedColumns, getHeaderProps };
}
