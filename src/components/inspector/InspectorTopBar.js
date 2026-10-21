import ConnectivityIndicator from "./ConnectivityIndicator";

// Barra superior compartida por todas las vistas: en móvil vive dentro del
// flujo normal (la navegación está abajo); en desktop el sidebar ya cubre
// la marca, así que aquí solo queda el indicador de conectividad alineado a
// la derecha del contenido central.
export default function InspectorTopBar({ inspector }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-[#041E42] px-4 py-3 text-white md:pl-6" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <div className="md:hidden">
        <p className="text-xs font-black leading-tight text-[#8FA8E8]">ParkFacil</p>
        <p className="text-base font-black leading-tight">Inspectores</p>
      </div>
      <p className="hidden truncate text-sm font-bold text-white/80 md:block">{inspector?.email}</p>
      <ConnectivityIndicator />
    </header>
  );
}
