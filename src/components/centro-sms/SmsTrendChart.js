"use client";
// Barras agrupadas por período: Aceptados / Entregados / Fallidos. Paleta
// validada con dataviz/validate_palette.js (claro, todos los pares, CVD ΔE ≥ 13.9).
// Leyenda siempre visible, tooltip por período y vista de tabla alternativa.
import { useState } from "react";
import { formatNumber } from "./smsUi";

const SERIES = [
  { key: "accepted", label: "Aceptados por proveedor", color: "#3150D8" },
  { key: "delivered", label: "Entregados", color: "#14A38B" },
  { key: "failed", label: "Fallidos, rechazados o desconocidos", color: "#C2410C" },
];
const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 40 };

function bucketLabel(bucket, mode) {
  const [y, m, d] = bucket.split("-");
  if (mode === "month") return new Intl.DateTimeFormat("es-CL", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(+y, +m - 1, 1)));
  return `${d}-${m}`;
}

function niceMax(value) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / pow) * pow;
}

export default function SmsTrendChart({ series = [], bucket = "day" }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(0, ...series.flatMap((s) => SERIES.map((x) => Number(s[x.key] || 0)))));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = series.length ? plotW / series.length : plotW;
  const barW = Math.max(2, Math.min(18, (slot - 8) / SERIES.length - 2));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(series.length / 10));
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Leyenda">
          {SERIES.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</li>
          ))}
        </ul>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs font-medium text-[#3150D8] hover:underline">{asTable ? "Ver gráfico" : "Ver tabla"}</button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 pr-4">Período</th><th className="py-2 pr-4">Enviados</th>{SERIES.map((s) => <th key={s.key} className="py-2 pr-4">{s.label}</th>)}</tr></thead>
            <tbody>
              {series.map((row) => (
                <tr key={row.bucket} className="border-t border-slate-100"><td className="py-1.5 pr-4">{bucketLabel(row.bucket, bucket)}</td><td className="py-1.5 pr-4">{formatNumber(row.total)}</td>{SERIES.map((s) => <td key={s.key} className="py-1.5 pr-4">{formatNumber(row[s.key])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="SMS por período: aceptados, entregados y fallidos">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748B">{formatNumber(t)}</text>
              </g>
            ))}
            {series.map((row, i) => {
              const x0 = PAD.left + i * slot + (slot - SERIES.length * (barW + 2)) / 2;
              return (
                <g key={row.bucket}>
                  {SERIES.map((s, j) => {
                    const value = Number(row[s.key] || 0);
                    if (!value) return null;
                    const top = y(value);
                    const h = PAD.top + plotH - top;
                    const r = Math.min(4, barW / 2, h);
                    const x = x0 + j * (barW + 2);
                    return <path key={s.key} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.35}
                      d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`} />;
                  })}
                  {i % labelEvery === 0 ? <text x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748B">{bucketLabel(row.bucket, bucket)}</text> : null}
                  <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                    aria-label={`${bucketLabel(row.bucket, bucket)}: ${SERIES.map((s) => `${s.label} ${row[s.key]}`).join(", ")}`} />
                </g>
              );
            })}
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#CBD5E1" strokeWidth="1" />
          </svg>
          {hover != null && series[hover] ? (
            <div className="pointer-events-none absolute top-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{ left: `${Math.min(70, Math.max(0, ((PAD.left + hover * slot) / W) * 100))}%` }}>
              <p className="mb-1 font-semibold text-[#041E42]">{bucketLabel(series[hover].bucket, bucket)} · {formatNumber(series[hover].total)} enviados</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}: <span className="font-semibold text-slate-800">{formatNumber(series[hover][s.key])}</span></p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
