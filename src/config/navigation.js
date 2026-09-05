import { LayoutGrid, BarChart3, ParkingSquare, ShieldCheck, KeyRound, Wallet, WalletCards, BadgeDollarSign, Layers, Users, Handshake, RadioTower, Monitor, FileChartColumnIncreasing, Settings2, Plug2, BookOpen, Calculator, SlidersHorizontal, ScanLine, TicketPercent, Clock3, ReceiptText, MapPinned, UserCircle, Hash } from "lucide-react";

// Reorganización 2026-08-28 (auditoría "arquitectura administrativa"):
// separa la navegación en 4 pilares claramente distintos, en vez de mezclar
// Plataforma/Off Street/On Street/administración transversal en una sola
// lista plana como antes:
//   PLATAFORMA     -- accesos globales de uso diario (Inicio, Dashboard
//                      general, Data Entry). Deliberadamente NO agrupados
//                      bajo una carpeta colapsable: son los únicos ítems que
//                      conviene tener siempre a un clic, sin expandir nada.
//   OFF STREET     -- todo lo operacional de estacionamientos cerrados.
//   ON STREET      -- todo lo operacional de estacionamiento regulado en
//                      vía pública (antes vivía anidado bajo "Estacionamientos
//                      > On Street"; ahora es su propio árbol de primer nivel,
//                      paralelo a Off Street, no un hijo de este).
//   ADMINISTRACIÓN -- funciones transversales de la plataforma (empresas,
//                      usuarios/administradores/operadores, seguridad,
//                      facturación, cuenta, etc.) que NO son operación de
//                      ningún producto específico y por lo tanto no deben
//                      vivir duplicadas dentro de Off Street ni On Street.
//
// Ningún href ni ruta existente cambió en esta reorganización -- es
// exclusivamente una reagrupación de los mismos ítems (mismos componentes,
// mismas páginas, mismo RBAC vía canAccessPath/ROOT_ONLY_PREFIXES/
// COMPANY_ADMIN_PREFIXES/PRODUCT_PREFIXES en permissions.mjs, que son
// prefix-based y no dependen de la profundidad de anidación del árbol). Ver
// navigationTreeCore.mjs: filterVisibleTree/activeTreeKeys y el render de
// Sidebar.js/MobileNavigation.js ya son recursivos a cualquier profundidad,
// así que anidar un nivel más (p. ej. On Street > Ubicaciones > Áreas) no
// requirió tocar ninguno de los dos.
//
// No se inventó ningún módulo Off Street que no existiera ya como ruta real
// (p. ej. "Ingresos"/"Salidas"/"Vehículos en Parking" no son rutas propias
// hoy -- viven dentro de /operacion -- así que no se fabricaron enlaces
// falsos para ellas; "Cierres de caja"/"Medios de pago" como ruta propia
// tampoco existen aparte de /recaudacion#medios-de-pago, que sí se preserva
// tal cual ya existía).
export const navigationItems = [
  { href: "/", label: "Inicio", icon: LayoutGrid, active: true },
  { href: "/modelo-dashboard", label: "Dashboard General", icon: BarChart3 },
  // Para platform_admin (Root), este ítem nunca abre /data-entry con la
  // sesión Root: Sidebar/MobileNavigation lo interceptan y llevan al login
  // real de operador en el origen del Portal Cliente. Root nunca opera el
  // terminal directamente (PORTAL_FORBIDDEN se mantiene intacto). Ver
  // src/lib/auth/operatorAccessUrl.mjs y src/app/acceso-operador/page.js.
  { href: "/data-entry", label: "Data Entry", icon: ScanLine, platformAdminGateway: true },

  // ============================================================
  // OFF STREET -- árbol propio, en paralelo a On Street (ya no hay un nodo
  // "Estacionamientos" que contenga a ambos). "Off Street" sigue siendo la
  // app tradicional (/estacionamientos?tipo=OFF_STREET), sin cambios de
  // lógica -- ver §35 del brief ("no alterar lógica operacional Off Street").
  // No existe hoy un Dashboard específico de Off Street distinto del
  // Dashboard general de Plataforma (/modelo-dashboard) -- no se fabricó uno
  // para no duplicar ni inventar una ruta inexistente.
  // ============================================================
  {
    label: "Off Street",
    icon: ParkingSquare,
    // Fase 3: agrega el Dashboard Off Street real (/dashboard-off-street) --
    // primer ítem del árbol, mismo lugar que ocupa "Dashboard" en On Street
    // (/on-street-qr). No reemplaza /modelo-dashboard (Dashboard General de
    // Plataforma, fuera de este alcance) ni mezcla datos On Street.
    activePrefix: ["/dashboard-off-street", "/estacionamientos", "/operacion", "/turnos", "/control-accesos", "/recaudacion", "/abonados", "/tarifas", "/administracion-tarifas", "/simulador-tarifas", "/dispositivos", "/monitoreo"],
    children: [
      { href: "/dashboard-off-street", label: "Dashboard", icon: BarChart3 },
      {
        label: "Operación",
        children: [
          { href: "/operacion", label: "Operación", icon: ParkingSquare },
          { href: "/turnos", label: "Turnos", icon: Clock3 },
        ],
      },
      {
        label: "Estacionamientos",
        children: [
          { href: "/estacionamientos?tipo=OFF_STREET", label: "Estacionamientos", icon: ParkingSquare, activePrefix: "/estacionamientos" },
          {
            href: "/dispositivos",
            label: "Dispositivos",
            icon: RadioTower,
            children: [
              { href: "/dispositivos", label: "Todos los dispositivos" },
              { href: "/dispositivos?tipo=C%C3%A1mara%20LPR", label: "Cámaras LPR" },
              { href: "/dispositivos?tipo=Barrera", label: "Barreras" },
              { href: "/dispositivos?tipo=Terminal%20POS", label: "Terminales POS" },
              { href: "/dispositivos?tipo=Impresora", label: "Impresoras" },
              { href: "/dispositivos?tipo=Lector%20QR", label: "Lectores QR" },
              { href: "/dispositivos?tipo=Sensor", label: "Sensores" },
              { href: "/dispositivos?tipo=Controlador%20de%20acceso", label: "Controladores de acceso" },
              { href: "/dispositivos?tipo=Cajero%20autom%C3%A1tico", label: "Cajeros automáticos" },
              { href: "/dispositivos?tipo=Computador", label: "Computadores" },
              { href: "/dispositivos?tipo=Dispositivo%20Android", label: "Dispositivos Android" },
            ],
          },
          { href: "/control-accesos", label: "Accesos", icon: ShieldCheck },
        ],
      },
      {
        label: "Recaudación",
        icon: Wallet,
        children: [
          { href: "/recaudacion", label: "Pagos", icon: Wallet },
          { href: "/recaudacion#medios-de-pago", label: "Medios de Pago", icon: WalletCards },
        ],
      },
      { href: "/abonados", label: "Abonados y Credenciales", icon: KeyRound },
      {
        label: "Tarifas",
        icon: BadgeDollarSign,
        children: [
          { href: "/administracion-tarifas", label: "Tarifas", icon: BadgeDollarSign },
          { href: "/tarifas", label: "Planes", icon: Layers },
          { href: "/simulador-tarifas", label: "Simulador de tarifas", icon: Calculator },
        ],
      },
      { href: "/monitoreo", label: "Monitoreo", icon: Monitor },
      // Placeholder ya existente ("próximamente"), reubicado aquí -- no es
      // una ruta real, se preserva deshabilitado tal como estaba.
      { href: null, label: "Reportes", icon: FileChartColumnIncreasing, future: true },
    ],
  },

  // ============================================================
  // ON STREET -- árbol propio (promovido: ya no anidado bajo
  // "Estacionamientos > On Street"). Mismo label EXACTO "On Street" que
  // antes -- Sidebar.js lo detecta por texto literal (isOnStreetLabel) para
  // aplicar su identidad visual cobriza mientras la rama está activa; si el
  // label cambiara, ese theming se perdería silenciosamente.
  // Administradores/Operadores se sacaron de este árbol (ver §7 del brief):
  // se administran desde Administración > Usuarios. Inspectores permanece
  // aquí (operación de terreno, no administración general). "Generar QR"
  // permanece visible como ítem propio dentro de Ubicaciones (§6 del brief)
  // -- NO se convirtió en una acción oculta solo alcanzable por botón.
  // "Áreas"/"Calles"/"Tramos" son listados nuevos (antes solo existían los
  // atajos de creación /areas/nueva, /calles/nueva, /tramos/nuevo) -- ver
  // src/app/on-street-qr/{areas,calles,tramos}/page.js.
  // ============================================================
  {
    href: "/on-street-qr",
    label: "On Street",
    icon: MapPinned,
    activePrefix: "/on-street-qr",
    children: [
      { href: "/on-street-qr", label: "Dashboard" },
      // "Proyectos On Street" (§ UX "Proyectos On Street" 2026-08-28)
      // reemplaza "Ubicaciones" como experiencia PRINCIPAL de creación y
      // administración territorial: un Proyecto = un Estacionamiento On
      // Street (ver listOnStreetProjects), con Áreas/Calles/Tramos/QR
      // administrados dentro de su ficha o del constructor "Nuevo
      // proyecto" en vez de como módulos sueltos de primer nivel.
      // Ubicaciones QR/Generar QR/Áreas/Calles/Tramos NO se eliminaron
      // (rutas y APIs intactas, para deep links y uso interno de las
      // fichas de Proyecto) -- solo dejaron de ser accesos directos del
      // menú principal.
      {
        href: "/on-street-qr/proyectos",
        label: "Proyectos On Street",
        // "Áreas"/"Calles"/"Tramos" ya no viven en este activePrefix: pasan a
        // ser responsabilidad propia del nodo "Estructura" (ver más abajo),
        // que las enlaza directamente. "Ubicaciones"/"Crear" (rutas legado,
        // ver §6 del brief "Proyectos On Street") siguen aquí porque no
        // tienen acceso propio en el menú -- solo se alcanzan por deep link.
        activePrefix: ["/on-street-qr/proyectos", "/on-street-qr/ubicaciones", "/on-street-qr/crear"],
        children: [
          { href: "/on-street-qr/proyectos", label: "Proyectos actuales" },
          { href: "/on-street-qr/proyectos/nuevo", label: "Nuevo proyecto" },
        ],
      },
      // "Estructura" (corrección UX 2026-08-29): al reemplazar "Ubicaciones"
      // por "Proyectos On Street" como experiencia principal (ver arriba), se
      // perdió el acceso directo del menú a Áreas/Calles/Tramos -- solo
      // quedaban alcanzables creando un Proyecto nuevo. Estas rutas YA
      // existían (src/app/on-street-qr/{areas,calles,tramos}/page.js) y no
      // se duplican aquí: son enlaces directos a las mismas páginas/RBAC/
      // contexto de empresa de siempre.
      {
        label: "Estructura",
        activePrefix: ["/on-street-qr/areas", "/on-street-qr/calles", "/on-street-qr/tramos"],
        children: [
          { href: "/on-street-qr/areas", label: "Áreas", activePrefix: "/on-street-qr/areas" },
          { href: "/on-street-qr/calles", label: "Calles", activePrefix: "/on-street-qr/calles" },
          { href: "/on-street-qr/tramos", label: "Tramos", activePrefix: "/on-street-qr/tramos" },
        ],
      },
      {
        label: "Operación",
        children: [
          { href: "/on-street-qr/sesiones", label: "Sesiones" },
          { href: "/on-street-qr/pagos", label: "Pagos" },
        ],
      },
      {
        label: "Fiscalización",
        children: [
          { href: "/on-street-qr/inspectores", label: "Inspectores" },
          { href: "/on-street-qr/fiscalizaciones", label: "Fiscalizaciones" },
        ],
      },
      {
        label: "Configuración",
        children: [
          { href: "/on-street-qr/tarifas", label: "Tarifas" },
        ],
      },
      // "Reportes" pasó a ser un nodo con hijos (2026-08-30): "Reportes On
      // Street" es una sola página (src/components/on-street-admin/
      // OnStreetReports.js) con 6 pestañas internas (Resumen/Sesiones/
      // Pagos/Extensiones/Rendimiento por ubicación/Gráficos) -- no se
      // duplica esa página ni su lógica aquí. "Gráficos" enlaza a la MISMA
      // ruta con ?tab=graficos (que OnStreetReports.js ya lee para abrir
      // esa pestaña directamente, mismo patrón que ?parkingId= usado por
      // la ficha de Proyecto), dándole un acceso propio y directo desde el
      // menú -- mismo criterio ya usado por "Proyectos On Street" arriba
      // (hijo con el mismo href que el padre + hijo(s) adicionales).
      {
        href: "/on-street-qr/reportes",
        label: "Reportes",
        activePrefix: "/on-street-qr/reportes",
        children: [
          { href: "/on-street-qr/reportes", label: "Reportes" },
          { href: "/on-street-qr/reportes?tab=graficos", label: "Gráficos" },
        ],
      },
    ],
  },

  // ============================================================
  // ADMINISTRACIÓN -- funciones transversales de la plataforma, no
  // operación de un producto específico. Administradores/Operadores viven
  // aquí exclusivamente (única fuente de verdad, ver §7/§29 del brief);
  // On Street y Off Street ya no mantienen una administración paralela de
  // estos perfiles. El resto de ítems que antes vivían sueltos a nivel
  // superior (Facturación, Contratos, Cupones, Convenios, Gestión de
  // módulos, Documentación) se agruparon aquí por ser igualmente
  // transversales -- ninguno es específico de Off Street ni On Street.
  // ============================================================
  {
    label: "Administración",
    icon: Settings2,
    activePrefix: ["/empresas", "/usuarios", "/seguridad", "/facturacion", "/contratos", "/cupones", "/convenios", "/modelo-gestion-modulos", "/documentos", "/mi-cuenta", "/administracion"],
    children: [
      { href: "/empresas", label: "Empresas", icon: Users },
      {
        href: "/usuarios",
        label: "Usuarios",
        icon: Users,
        // Fuerza el árbol expandido y el resaltado del padre en cualquier
        // ruta bajo /usuarios (listado, administradores, operadores y
        // fichas individuales /usuarios/[id]), sin depender de que el
        // usuario haya hecho clic para expandirlo. Ver Sidebar.js /
        // MobileNavigation.js.
        activePrefix: "/usuarios",
        children: [
          { href: "/usuarios/administradores", label: "Administradores" },
          { href: "/usuarios/operadores", label: "Operadores" },
        ],
      },
      { href: "/seguridad", label: "Seguridad", icon: KeyRound, requiresModule: "seguridad" },
      { href: "/mi-cuenta", label: "Mi Cuenta", icon: UserCircle },
      {
        href: "/facturacion",
        label: "Facturación",
        icon: ReceiptText,
        children: [
          { href: "/facturacion#prefacturacion", label: "Prefacturación" },
          { href: "/facturacion#facturas", label: "Facturas" },
          { href: "/facturacion#notas-credito", label: "Notas de Crédito" },
          { href: "/facturacion#notas-debito", label: "Notas de Débito" },
          { href: "/facturacion#cuenta-corriente", label: "Cuenta Corriente" },
          { href: "/facturacion#pagos", label: "Pagos" },
          { href: "/facturacion#cobranza", label: "Cobranza" },
          { href: "/facturacion#conciliacion", label: "Conciliación" },
          { href: "/facturacion#reportes", label: "Reportes" },
          { href: "/facturacion#configuracion", label: "Configuración" },
        ],
      },
      { href: "/modelo-gestion-modulos", label: "Gestión de módulos", icon: SlidersHorizontal },
      // Catálogo de códigos de Estacionamiento/Proyecto (corrección
      // funcional 2026-08-29): exclusivo de Root a nivel de API
      // (requirePlatformAdmin) -- se agrega aquí, no dentro de On Street ni
      // Off Street, porque el catálogo es transversal a ambos productos.
      { href: "/administracion/codigos-estacionamiento", label: "Códigos de Estacionamiento", icon: Hash },
      { href: "/contratos", label: "Contratos", icon: Handshake },
      { href: "/cupones", label: "Cupones y descuentos", icon: TicketPercent },
      { href: "/convenios", label: "Convenios", icon: Handshake },
      // Placeholder ya existente ("próximamente"), reubicado aquí -- no es
      // una ruta real, se preserva deshabilitado tal como estaba. El
      // placeholder "Administración" original se retiró: quedaba redundante
      // ahora que esta sección real ya existe.
      { href: null, label: "Integraciones", icon: Plug2, future: true },
      { href: "/documentos", label: "Documentación", icon: BookOpen },
    ],
  },
];
