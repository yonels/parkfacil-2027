"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";
import { validarRutEstructural } from "@/data/empresas.mjs";
import { getEstadoAbonadoLabel, getTipoAbonadoLabel, getTipoCredencialLabel, getTipoVehiculoLabel } from "@/data/abonados.mjs";
import { generateCredentialIdentifier, normalizeLicensePlate, normalizeTelefonoNumero } from "@/lib/abonados";
import SelectorTelefonoInternacional from "@/components/abonados/SelectorTelefonoInternacional";
import CredentialQrPreview from "@/components/abonados/CredentialQrPreview";

const empresas = getEmpresasDemo();
const estacionamientos = getEstacionamientosDemo();
const estados = ["active", "inactive", "suspended", "pending", "blocked"];
const tipos = ["individual", "company_employee", "resident", "tenant", "supplier", "courtesy", "temporary", "other"];
const credenciales = ["rfid_card", "qr_code", "qr_plate", "barcode", "pin", "mobile", "other"];
const tiposVehiculo = ["car", "motorcycle", "van", "truck", "bicycle", "other"];
const estadosCredencial = ["active", "inactive", "revoked"];
const qrCredentialTypes = new Set(["qr_code", "qr_plate"]);

function FieldError({ errors, field }) {
  return errors[field] ? <p className="mt-1 text-xs text-rose-600">{errors[field]}</p> : null;
}

function TextInput({ label, value, onChange, errors, field, ...props }) {
  return (
    <label className="text-sm text-slate-600">
      <span className="font-medium">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100" {...props} />
      <FieldError errors={errors} field={field} />
    </label>
  );
}

function RutInput({ values, errors, onChange }) {
  return (
    <label className="text-sm text-slate-600">
      <span className="font-medium">RUT</span>
      <div className="mt-2 flex items-center gap-2">
        <input aria-label="Número del RUT" value={values.rutNumero} onChange={(event) => onChange("rutNumero", event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100" />
        <span className="font-semibold text-slate-500">-</span>
        <input aria-label="Dígito verificador" value={values.rutDv} onChange={(event) => onChange("rutDv", event.target.value.replace(/[^0-9kK]/g, "").slice(0, 1).toUpperCase())} maxLength={1} className="w-14 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center uppercase outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100" />
      </div>
      <FieldError errors={errors} field="rutNumero" />
      <FieldError errors={errors} field="rutDv" />
    </label>
  );
}

export default function AbonadoForm({ mode, initialValues, onSubmit, submitLabel, cancelHref, heading, description, abonados = [] }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [submitErrorMessage, setSubmitErrorMessage] = useState("");
  const [creatingResponsable, setCreatingResponsable] = useState(Boolean(initialValues.responsableNuevo));
  const isEdit = mode === "edit";

  const responsables = useMemo(() => {
    const map = new Map();
    abonados.forEach((abonado) => {
      if (abonado.responsable?.id) map.set(abonado.responsable.id, abonado.responsable);
    });
    return Array.from(map.values());
  }, [abonados]);

  const selectedResponsable = responsables.find((responsable) => responsable.id === values.responsableId) || null;
  const vehiculoOptions = useMemo(() => {
    const base = [];
    if (values.patente) base.push({ id: values.vehiculoId || "principal", label: normalizeLicensePlate(values.patente) });
    return base;
  }, [values.patente, values.vehiculoId]);

  const formIsValid = useMemo(() => values.nombres.trim() && values.apellidoPaterno.trim() && values.rutNumero.trim() && values.rutDv.trim() && values.tipo && values.estado && values.fechaInicio && values.fechaTermino, [values]);

  const handleChange = (key, nextValue) => {
    setValues((current) => ({ ...current, [key]: nextValue }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveMessage("");
    setSubmitErrorMessage("");
  };

  const handleResponsableChange = (key, nextValue) => {
    setValues((current) => ({ ...current, responsableNuevo: { ...(current.responsableNuevo || {}), [key]: nextValue } }));
  };

  const startResponsableEdit = () => {
    if (!selectedResponsable) return;
    setCreatingResponsable(true);
    handleChange("responsableNuevo", {
      id: selectedResponsable.id,
      nombres: selectedResponsable.nombres || "",
      apellidoPaterno: selectedResponsable.apellidoPaterno || "",
      apellidoMaterno: selectedResponsable.apellidoMaterno || "",
      correo: selectedResponsable.correo || "",
      telefonoPais: selectedResponsable.telefonoPais || "CL",
      telefonoCodigo: selectedResponsable.telefonoCodigo || "+56",
      telefonoNumero: selectedResponsable.telefonoNumero || "",
      estado: selectedResponsable.estado || "active",
    });
  };

  const handleGenerateCredential = () => {
    if (isEdit) {
      const confirmed = window.confirm("Regenerar el identificador hará que el QR anterior deje de ser válido cuando guardes los cambios. ¿Deseas continuar?");
      if (!confirmed) return;
    }

    handleChange("credencialNumero", generateCredentialIdentifier(values.credencialTipo));
  };

  const runValidation = () => {
    const nextErrors = {};
    if (!values.nombres.trim()) nextErrors.nombres = "Ingrese los nombres del abonado.";
    if (!values.apellidoPaterno.trim()) nextErrors.apellidoPaterno = "Ingrese el apellido paterno.";
    if (!values.rutNumero.trim()) nextErrors.rutNumero = "Ingrese el número del RUT.";
    if (!values.rutDv.trim()) nextErrors.rutDv = "Ingrese el dígito verificador.";
    if (values.rutNumero && values.rutDv && !validarRutEstructural(values.rutNumero, values.rutDv)) {
      nextErrors.rutNumero = "El RUT ingresado no es válido.";
      nextErrors.rutDv = "El RUT ingresado no es válido.";
    }
    if (!values.fechaInicio) nextErrors.fechaInicio = "Debes ingresar la fecha de inicio.";
    if (!values.fechaTermino) nextErrors.fechaTermino = "Debes ingresar la fecha de vencimiento.";
    if (values.fechaInicio && values.fechaTermino && values.fechaTermino < values.fechaInicio) nextErrors.fechaTermino = "La fecha de vencimiento debe ser igual o posterior a la fecha de inicio.";
    if (!values.patente.trim() && !values.credencialNumero.trim()) {
      nextErrors.patente = "Debes registrar al menos una patente o una credencial.";
      nextErrors.credencialNumero = "Debes registrar al menos una patente o una credencial.";
    }
    if (values.credencialTipo === "qr_plate" && !values.patente.trim()) nextErrors.vehiculoId = "QR + Patente requiere un vehículo del abonado.";
    if (creatingResponsable) {
      const responsable = values.responsableNuevo || {};
      if (!String(responsable.nombres || "").trim()) nextErrors.responsableNombres = "Ingrese los nombres del responsable.";
      if (!String(responsable.apellidoPaterno || "").trim()) nextErrors.responsableApellidoPaterno = "Ingrese el apellido paterno del responsable.";
    }
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = runValidation();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSaving(true);
    setSaveMessage("");
    setSubmitErrorMessage("");

    const payload = {
      ...values,
      nombres: values.nombres.trim(),
      apellidoPaterno: values.apellidoPaterno.trim(),
      apellidoMaterno: values.apellidoMaterno.trim(),
      rutNumero: values.rutNumero.replace(/\D/g, ""),
      rutDv: values.rutDv.replace(/[^0-9kK]/g, "").slice(0, 1).toUpperCase(),
      correo: values.correo.trim(),
      telefonoNumero: normalizeTelefonoNumero(values.telefonoNumero),
      patente: normalizeLicensePlate(values.patente),
      marca: values.marca.trim(),
      modelo: values.modelo.trim(),
      color: values.color.trim(),
      vehiculoId: values.credencialTipo === "qr_plate" ? values.vehiculoId || "principal" : values.vehiculoId || null,
      credencialNumero: values.credencialNumero.trim(),
      responsableId: creatingResponsable ? values.responsableNuevo?.id || null : values.responsableId,
      responsableNuevo: creatingResponsable ? values.responsableNuevo : null,
      observaciones: values.observaciones.trim(),
    };

    try {
      await onSubmit(payload);
      setSaveMessage(isEdit ? "Cambios guardados correctamente." : "Abonado creado correctamente.");
      setErrors({});
    } catch (submitError) {
      if (submitError?.details && typeof submitError.details === "object") setErrors((current) => ({ ...current, ...submitError.details }));
      setSubmitErrorMessage(submitError?.message || "No fue posible guardar el abonado.");
      setSaveMessage("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href={cancelHref} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]"><ArrowLeft className="h-4 w-4" />Volver a Abonados</Link>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold text-[#041E42]">{heading}</h1><p className="mt-2 text-sm text-slate-600">{description}</p></div>{saveMessage ? <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">{saveMessage}</p> : null}{submitErrorMessage ? <p className="rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">{submitErrorMessage}</p> : null}</div>
        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-3"><TextInput label="Nombres" value={values.nombres} onChange={(value) => handleChange("nombres", value)} errors={errors} field="nombres" /><TextInput label="Apellido paterno" value={values.apellidoPaterno} onChange={(value) => handleChange("apellidoPaterno", value)} errors={errors} field="apellidoPaterno" /><TextInput label="Apellido materno" value={values.apellidoMaterno} onChange={(value) => handleChange("apellidoMaterno", value)} errors={errors} field="apellidoMaterno" /></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(220px,0.8fr)_minmax(360px,1.4fr)]"><RutInput values={values} errors={errors} onChange={handleChange} /><TextInput label="Correo" type="email" value={values.correo} onChange={(value) => handleChange("correo", value)} errors={errors} field="correo" /><SelectorTelefonoInternacional label="Teléfono" pais={values.telefonoPais} codigo={values.telefonoCodigo} numero={values.telefonoNumero} errors={errors} onChange={({ pais, codigo, numero }) => { handleChange("telefonoPais", pais); handleChange("telefonoCodigo", codigo); handleChange("telefonoNumero", numero); }} /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm text-slate-600"><span className="font-medium">Empresa</span><select value={values.empresaId} onChange={(event) => handleChange("empresaId", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100"><option value="">Sin empresa</option>{empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}</select></label><label className="text-sm text-slate-600"><span className="font-medium">Responsable</span><select value={creatingResponsable ? "__editing" : values.responsableId} onChange={(event) => { const creating = event.target.value === "__new"; setCreatingResponsable(creating); handleChange("responsableId", creating ? "" : event.target.value); if (creating) handleChange("responsableNuevo", { nombres: "", apellidoPaterno: "", apellidoMaterno: "", correo: "", telefonoPais: "CL", telefonoCodigo: "+56", telefonoNumero: "", estado: "active" }); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100"><option value="">Sin responsable</option>{responsables.map((item) => <option key={item.id} value={item.id}>{item.nombreCompleto}{item.estado === "inactive" ? " (inactivo)" : ""}</option>)}<option value="__new">Crear nuevo responsable</option>{creatingResponsable ? <option value="__editing">Editando responsable</option> : null}</select></label><label className="text-sm text-slate-600"><span className="font-medium">Tipo de abonado</span><select value={values.tipo} onChange={(event) => handleChange("tipo", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100">{tipos.map((item) => <option key={item} value={item}>{getTipoAbonadoLabel(item)}</option>)}</select></label><label className="text-sm text-slate-600"><span className="font-medium">Estado</span><select value={values.estado} onChange={(event) => handleChange("estado", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0B5FFF] focus:ring-2 focus:ring-blue-100">{estados.map((item) => <option key={item} value={item}>{getEstadoAbonadoLabel(item)}</option>)}</select></label></div>
          {selectedResponsable && !creatingResponsable ? <button type="button" onClick={startResponsableEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#3150D8]">Modificar responsable</button> : null}
          {creatingResponsable ? <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3"><TextInput label="Nombres del responsable" value={values.responsableNuevo?.nombres || ""} onChange={(value) => handleResponsableChange("nombres", value)} errors={errors} field="responsableNombres" /><TextInput label="Apellido paterno del responsable" value={values.responsableNuevo?.apellidoPaterno || ""} onChange={(value) => handleResponsableChange("apellidoPaterno", value)} errors={errors} field="responsableApellidoPaterno" /><TextInput label="Apellido materno del responsable" value={values.responsableNuevo?.apellidoMaterno || ""} onChange={(value) => handleResponsableChange("apellidoMaterno", value)} errors={errors} field="responsableApellidoMaterno" /><TextInput label="Correo del responsable" type="email" value={values.responsableNuevo?.correo || ""} onChange={(value) => handleResponsableChange("correo", value)} errors={errors} field="responsableCorreo" /><SelectorTelefonoInternacional label="Teléfono del responsable" pais={values.responsableNuevo?.telefonoPais || "CL"} codigo={values.responsableNuevo?.telefonoCodigo || "+56"} numero={values.responsableNuevo?.telefonoNumero || ""} errors={errors} field="responsableTelefonoNumero" onChange={({ pais, codigo, numero }) => { handleResponsableChange("telefonoPais", pais); handleResponsableChange("telefonoCodigo", codigo); handleResponsableChange("telefonoNumero", numero); }} /><label className="text-sm text-slate-600"><span className="font-medium">Estado del responsable</span><select value={values.responsableNuevo?.estado || "active"} onChange={(event) => handleResponsableChange("estado", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label></div> : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm text-slate-600"><span className="font-medium">Estacionamiento principal</span><select value={values.estacionamientoId} onChange={(event) => handleChange("estacionamientoId", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"><option value="">Sin asignación</option>{estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><TextInput label="Fecha de inicio" type="date" value={values.fechaInicio} onChange={(value) => handleChange("fechaInicio", value)} errors={errors} field="fechaInicio" /><TextInput label="Fecha de vencimiento" type="date" value={values.fechaTermino} onChange={(value) => handleChange("fechaTermino", value)} errors={errors} field="fechaTermino" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><TextInput label="Patente principal" value={values.patente} onChange={(value) => handleChange("patente", normalizeLicensePlate(value))} errors={errors} field="patente" /><TextInput label="Marca" value={values.marca} onChange={(value) => handleChange("marca", value)} errors={errors} field="marca" /><TextInput label="Modelo" value={values.modelo} onChange={(value) => handleChange("modelo", value)} errors={errors} field="modelo" /><TextInput label="Color" value={values.color} onChange={(value) => handleChange("color", value)} errors={errors} field="color" /><label className="text-sm text-slate-600"><span className="font-medium">Tipo de vehículo</span><select value={values.tipoVehiculo} onChange={(event) => handleChange("tipoVehiculo", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none">{tiposVehiculo.map((item) => <option key={item} value={item}>{getTipoVehiculoLabel(item)}</option>)}</select></label><label className="text-sm text-slate-600"><span className="font-medium">Estado del vehículo</span><select value={values.estadoVehiculo} onChange={(event) => handleChange("estadoVehiculo", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"><option value="authorized">Autorizado</option><option value="pending">Pendiente</option><option value="blocked">Bloqueado</option><option value="inactive">Inactivo</option></select></label></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm text-slate-600 xl:col-span-2"><span className="font-medium">Identificador de credencial</span><div className="mt-2 flex gap-2"><input value={values.credencialNumero} onChange={(event) => handleChange("credencialNumero", event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none" /><button type="button" onClick={handleGenerateCredential} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#3150D8]">Generar identificador</button></div><p className="mt-2 text-xs text-slate-500">Código interno único utilizado para identificar esta credencial. No corresponde al RUT del abonado.</p><FieldError errors={errors} field="credencialNumero" /></label><label className="text-sm text-slate-600"><span className="font-medium">Tipo de credencial</span><select value={values.credencialTipo} onChange={(event) => handleChange("credencialTipo", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none">{credenciales.map((item) => <option key={item} value={item}>{getTipoCredencialLabel(item)}</option>)}</select></label><label className="text-sm text-slate-600"><span className="font-medium">Estado de credencial</span><select value={values.credencialEstado} onChange={(event) => handleChange("credencialEstado", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none">{estadosCredencial.map((item) => <option key={item} value={item}>{item === "active" ? "Activa" : item === "inactive" ? "Inactiva" : "Revocada"}</option>)}</select></label>{values.credencialTipo === "qr_plate" ? <label className="text-sm text-slate-600"><span className="font-medium">Patente asociada</span><select value={values.vehiculoId || "principal"} onChange={(event) => handleChange("vehiculoId", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none"><option value="">Selecciona patente</option>{vehiculoOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><FieldError errors={errors} field="vehiculoId" /></label> : null}<label className="mt-8 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={values.accesoBloqueado} onChange={(event) => handleChange("accesoBloqueado", event.target.checked)} />Acceso bloqueado</label></div>
          {qrCredentialTypes.has(values.credencialTipo) && values.credencialNumero.trim() ? <CredentialQrPreview identifier={values.credencialNumero} title={values.credencialTipo === "qr_plate" ? "QR + Patente" : "Código QR"} /> : null}
          <label className="block text-sm text-slate-600"><span className="font-medium">Observaciones</span><textarea value={values.observaciones} onChange={(event) => handleChange("observaciones", event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none" /></label>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4"><button type="submit" disabled={saving || !formIsValid} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1E5EFF] disabled:cursor-not-allowed disabled:bg-slate-300"><Save className="h-4 w-4" />{saving ? "Guardando..." : submitLabel}</button><Link href={cancelHref} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]">Cancelar</Link></div>
        </form>
      </section>
    </div>
  );
}
