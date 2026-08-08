"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const emptyForm = {
  assignmentId: "",
  date: new Date().toISOString().slice(0, 10),
  scheduledStart: "",
  scheduledEnd: "",
  status: "PROGRAMMED",
  supervisorId: "",
  notes: "",
};

const statusLabel = {
  PROGRAMMED: "Programado",
  OPEN: "Abierto",
  CLOSING: "En cierre",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

const statusTone = {
  PROGRAMMED: "bg-blue-50 text-blue-800",
  OPEN: "bg-emerald-50 text-emerald-800",
  CLOSING: "bg-amber-50 text-amber-800",
  CLOSED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-rose-50 text-rose-800",
};

export default function ParkingShiftsManager({ parking, structure }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingShiftId, setEditingShiftId] = useState("");

  const assignmentOptions = useMemo(() => (structure?.assignments || []).map((assignment) => {
    const sectors = structure?.sectors || [];
    const sector = sectors.find((item) => item.id === assignment.sector_id);
    const street = sector?.streets?.find((item) => item.id === assignment.street_id);
    const operator = users.find((item) => item.id === assignment.operator_id);
    return {
      id: assignment.id,
      operatorId: assignment.operator_id,
      supervisorId: assignment.supervisor_id || "",
      sectorName: sector?.name || "Sin área",
      streetName: street?.name || "Sin calle",
      label: `${operator?.nombreCompleto || assignment.operator_id} · ${sector?.name || "Sin área"} / ${street?.name || "Sin calle"} · ${assignment.number_from}-${assignment.number_to}`,
      assignment,
    };
  }), [structure, users]);

  const selectedAssignment = assignmentOptions.find((item) => item.id === form.assignmentId) || null;

  useEffect(() => {
    let active = true;
    Promise.all([
      authenticatedFetch(`/api/estacionamientos/${parking.code}/turnos`),
      authenticatedFetch("/api/usuarios").catch(() => null),
    ])
      .then(async ([shiftResponse, usersResponse]) => {
        const shiftBody = await shiftResponse.json().catch(() => ({}));
        if (!shiftResponse.ok) throw new Error(shiftBody.error || "No fue posible cargar los turnos.");
        const usersBody = usersResponse ? await usersResponse.json().catch(() => ({})) : {};
        if (!active) return;
        setShifts(shiftBody.data || []);
        setUsers(Array.isArray(usersBody.data) ? usersBody.data : []);
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [parking.code]);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditingShiftId("");
    setForm(emptyForm);
    setFormError("");
  }

  function startEdit(shift) {
    setEditingShiftId(shift.id);
    setForm({
      assignmentId: shift.assignment_id || "",
      date: shift.shift_date || emptyForm.date,
      scheduledStart: shift.scheduled_start || "",
      scheduledEnd: shift.scheduled_end || "",
      status: ["PROGRAMMED", "OPEN", "CANCELLED"].includes(shift.status) ? shift.status : "PROGRAMMED",
      supervisorId: shift.supervisor_id || "",
      notes: shift.notes || "",
    });
    setFormError("");
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    if (!selectedAssignment) {
      setFormError("Selecciona una asignación para crear el turno.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        assignmentId: selectedAssignment.id,
        operatorId: selectedAssignment.operatorId,
        supervisorId: form.supervisorId || selectedAssignment.supervisorId || undefined,
        date: form.date,
        scheduledStart: form.scheduledStart || undefined,
        scheduledEnd: form.scheduledEnd || undefined,
        status: form.status,
        notes: form.notes,
      };
      const response = await authenticatedFetch(editingShiftId ? `/api/estacionamientos/${parking.code}/turnos/${editingShiftId}` : `/api/estacionamientos/${parking.code}/turnos`, {
        method: editingShiftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `No fue posible ${editingShiftId ? "actualizar" : "crear"} el turno.`);
      setShifts((current) => editingShiftId ? current.map((item) => item.id === body.data.id ? body.data : item) : [body.data, ...current]);
      resetForm();
    } catch (cause) {
      setFormError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  if (parking.type !== "ON_STREET") {
    return <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">La gestión de turnos solo aplica a estacionamientos On Street.</section>;
  }

  return <div className="space-y-5">
    {structure?.source === "demo" ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La estructura cargó en modo demostrativo. Para crear turnos se requieren asignaciones persistidas del estacionamiento.</p> : null}
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#041E42]">Turnos del estacionamiento</h2>
          <p className="mt-1 text-sm text-slate-600">Desde aquí puedes programar un turno o abrirlo directamente si la operación ya inició. El cierre sigue utilizando el flujo existente.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{shifts.length} registrados</span>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-slate-500">Cargando turnos…</p> : shifts.length ? <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Operador</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Área / calle</th>
              <th className="px-4 py-3 font-semibold">Horario</th>
              <th className="px-4 py-3 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {shifts.map((shift) => {
              const assignment = assignmentOptions.find((item) => item.id === shift.assignment_id);
              return <tr key={shift.id}>
                <td className="px-4 py-3 font-medium text-[#041E42]">{shift.shift_date || "-"}</td>
                <td className="px-4 py-3">{users.find((item) => item.id === shift.operator_id)?.nombreCompleto || shift.operator_id}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[shift.status] || "bg-slate-100 text-slate-700"}`}>{statusLabel[shift.status] || shift.status}</span></td>
                <td className="px-4 py-3">{assignment ? `${assignment.sectorName} / ${assignment.streetName}` : "Asignación no resuelta"}</td>
                <td className="px-4 py-3">{[shift.scheduled_start, shift.scheduled_end].filter(Boolean).join(" - ") || "Sin horario programado"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    {!["CLOSED", "CLOSING"].includes(shift.status) ? <button type="button" onClick={() => startEdit(shift)} className="font-semibold text-[#3150D8] hover:underline">Editar</button> : null}
                    {["OPEN", "CLOSING"].includes(shift.status) ? <Link href={`/turnos/${shift.id}/cerrar`} className="font-semibold text-[#3150D8] hover:underline">Cerrar turno</Link> : null}
                    {["CLOSED", "CANCELLED"].includes(shift.status) ? <span className="text-slate-400">Sin acción directa</span> : null}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">Aún no existen turnos para este estacionamiento.</p>}
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#041E42]">{editingShiftId ? "Editar turno" : "Crear turno"}</h2>
          <p className="mt-1 text-sm text-slate-600">{editingShiftId ? "Actualiza la programación o activa el turno desde esta misma pantalla." : "La creación reutiliza las asignaciones operativas ya configuradas en el estacionamiento."}</p>
        </div>
        {editingShiftId ? <button type="button" onClick={resetForm} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar edición</button> : null}
      </div>
      {!assignmentOptions.length ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No hay asignaciones activas disponibles para crear turnos. Configura primero los operadores y sus asignaciones desde la estructura operativa.</div> : <form onSubmit={submit} className="mt-4 space-y-4">
        {formError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{formError}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Asignación"><select value={form.assignmentId} onChange={(event) => set("assignmentId", event.target.value)} className={inputClass}><option value="">Seleccionar asignación</option>{assignmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="Estado inicial"><select value={form.status} onChange={(event) => set("status", event.target.value)} className={inputClass}><option value="PROGRAMMED">Programado</option><option value="OPEN">Abierto</option></select></Field>
          <Field label="Fecha"><input type="date" value={form.date} onChange={(event) => set("date", event.target.value)} className={inputClass} /></Field>
          <Field label="Supervisor (opcional)"><select value={form.supervisorId} onChange={(event) => set("supervisorId", event.target.value)} className={inputClass}><option value="">Sin supervisor</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nombreCompleto}</option>)}</select></Field>
          <Field label="Hora programada de inicio"><input type="time" value={form.scheduledStart} onChange={(event) => set("scheduledStart", event.target.value)} className={inputClass} /></Field>
          <Field label="Hora programada de término"><input type="time" value={form.scheduledEnd} onChange={(event) => set("scheduledEnd", event.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Observaciones"><textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} className={inputClass} /></Field>
        <p className="text-xs text-slate-500">Los turnos cerrados o en proceso de cierre siguen protegidos y no se modifican desde esta pantalla.</p>
        <div className="flex justify-end"><button type="submit" disabled={saving} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Guardando…" : editingShiftId ? "Actualizar turno" : "Crear turno"}</button></div>
      </form>}
    </section>
  </div>;
}

function Field({ label, children }) {
  return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]";