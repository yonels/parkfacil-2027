"use client";

import { useRef, useState } from "react";

/** Separate focus targets let Android choose a new keyboard without an IME restart. */
export default function PosPlateInput({ value, onChange, disabled, invalid }) {
  const [letterCount, setLetterCount] = useState(4);
  const lettersRef = useRef(null);
  const numbersRef = useRef(null);
  const raw = String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const letters = raw.match(/^[A-Z]*/)?.[0] || "";
  const numbers = raw.slice(letters.length).replace(/\D/g, "");
  const count = numbers && letters.length === 2 ? 2 : letterCount;
  const numberCount = count === 4 ? 2 : 4;
  function paste(event) {
    const candidate = event.clipboardData.getData("text").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const match = candidate.match(/^([A-Z]{4})(\d{2})$|^([A-Z]{2})(\d{4})$/);
    if (!match) return;
    event.preventDefault();
    setLetterCount(match[1] ? 4 : 2);
    onChange(candidate);
    numbersRef.current?.focus();
  }
  const style = "min-w-0 w-full rounded-2xl border border-slate-300 bg-white px-3 py-4 text-2xl font-black tracking-widest text-slate-900 focus:border-emerald-500 disabled:opacity-60";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-700">Patente</span>
        <select aria-label="Formato de patente" value={count} disabled={disabled} className="rounded-lg border border-slate-300 bg-white p-2 text-xs" onChange={(event) => {
          const next = Number(event.target.value);
          setLetterCount(next);
          onChange("");
          lettersRef.current?.focus();
        }}>
          <option value={4}>4 letras + 2 números</option>
          <option value={2}>2 letras + 4 números</option>
        </select>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input ref={lettersRef} aria-label="Letras de patente" value={letters} onChange={(event) => {
          const next = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, count);
          onChange(next + numbers);
          if (next.length === count) numbersRef.current?.focus();
        }} onPaste={paste} inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} autoFocus maxLength={count} placeholder={count === 4 ? "AAAA" : "AB"} disabled={disabled} aria-invalid={invalid} className={style} />
        <span aria-hidden="true" className="text-2xl font-bold">−</span>
        <input ref={numbersRef} aria-label="Números de patente" value={numbers} onChange={(event) => onChange(letters + event.target.value.replace(/\D/g, "").slice(0, numberCount))} onPaste={paste} onKeyDown={(event) => {
          if (event.key === "Backspace" && !numbers) { event.preventDefault(); lettersRef.current?.focus(); }
        }} inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={numberCount} placeholder={count === 4 ? "91" : "1234"} disabled={disabled} aria-invalid={invalid} className={style} />
      </div>
    </div>
  );
}
