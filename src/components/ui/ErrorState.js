export default function ErrorState({ title = "No se pudo cargar", description = "Inténtalo de nuevo en unos instantes.", action }) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
      <h3 className="text-lg font-semibold text-rose-700">{title}</h3>
      <p className="mt-2 text-sm text-rose-600">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
