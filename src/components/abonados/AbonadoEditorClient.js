"use client";

import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import AbonadoForm from "@/components/abonados/AbonadoForm";
import { getAbonadoFormInitialValues, useAbonadosStore } from "@/components/abonados/abonadosStore";

export default function AbonadoEditorClient({ mode, abonadoId = null }) {
  const router = useRouter();
  const { abonados, hydrated, error, findById, createAbonado, updateAbonado } = useAbonadosStore();
  const abonado = mode === "edit" && abonadoId ? findById(abonadoId) : null;

  if (!hydrated) {
    return (
      <AppShell title="Abonados" description="Gestion visual de personas, vehiculos y credenciales">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">Cargando formulario...</div>
      </AppShell>
    );
  }

  if (error && mode === "create") {
    return (
      <AppShell title="Abonados" description="Nuevo abonado">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700 shadow-sm">No fue posible cargar el formulario desde la API. {error.message}</div>
      </AppShell>
    );
  }

  if (mode === "edit" && !abonado) {
    return (
      <AppShell title="Abonados" description="Edicion de abonado">
        <EmptyState title="Abonado no encontrado" description="No existe un abonado con el identificador solicitado." action={null} />
      </AppShell>
    );
  }

  const handleSubmit = async (values) => {
    if (mode === "edit" && abonadoId) {
      const updated = await updateAbonado(abonadoId, values);
      if (!updated) throw new Error("No fue posible actualizar el abonado.");
      router.push(`/abonados/${abonadoId}`);
      router.refresh();
      return;
    }

    const created = await createAbonado(values);
    if (!created?.id) throw new Error("No fue posible crear el abonado.");
    router.push(`/abonados/${created.id}`);
    router.refresh();
  };

  return (
    <AppShell title="Abonados" description={mode === "edit" ? "Editar abonado" : "Nuevo abonado"}>
      <AbonadoForm
        mode={mode}
        initialValues={getAbonadoFormInitialValues(abonado)}
        onSubmit={handleSubmit}
        submitLabel={mode === "edit" ? "Guardar cambios" : "Guardar abonado"}
        cancelHref={mode === "edit" && abonadoId ? `/abonados/${abonadoId}` : "/abonados"}
        heading={mode === "edit" ? "Editar abonado" : "Nuevo abonado"}
        description={mode === "edit" ? "Actualiza los datos del abonado y guarda los cambios en Supabase." : "Crea un nuevo abonado con persistencia real en Supabase."}
        abonados={abonados}
      />
    </AppShell>
  );
}
