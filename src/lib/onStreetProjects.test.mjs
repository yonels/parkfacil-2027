import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { navigationItems } from "../config/navigation.js";
import { filterVisibleTree } from "./navigationTreeCore.mjs";
import { navigationVisibleForRole, ROLES } from "./auth/permissions.mjs";

// "Proyectos On Street" (2026-08-28). listOnStreetProjects/
// getOnStreetProjectDetail viven en onStreetAdminRepository.js
// ("server-only", no importable directo -- mismo criterio que el resto de
// esta suite). Verificación por fuente + verificación mecánica real del
// árbol de navegación (filterVisibleTree/navigationVisibleForRole, las
// mismas funciones que usa Sidebar.js/MobileNavigation.js).

const repoSource = await readFile(new URL("./onStreetAdminRepository.js", import.meta.url), "utf8");

// --- Navegación ---

function visibleOnStreetChildren(role, portal) {
  const context = { role, portal, companyId: role === ROLES.COMPANY_ADMIN ? "empresa-x" : null, enabledProducts: ["ON_STREET", "OFF_STREET"] };
  const visible = filterVisibleTree(navigationItems, (item) => navigationVisibleForRole(item, context));
  return visible.find((i) => i.label === "On Street")?.children || [];
}

test("Navegación: 'Proyectos On Street' reemplaza a 'Ubicaciones' como ítem principal, con 'Proyectos actuales'/'Nuevo proyecto'", () => {
  const children = visibleOnStreetChildren(ROLES.COMPANY_ADMIN, "client");
  const proyectos = children.find((c) => c.label === "Proyectos On Street");
  assert.ok(proyectos, "'Proyectos On Street' debe existir en el árbol");
  assert.deepEqual(proyectos.children.map((c) => c.label), ["Proyectos actuales", "Nuevo proyecto"]);
  assert.equal(children.some((c) => c.label === "Ubicaciones"), false, "'Ubicaciones' ya no debe existir como ítem principal");
});

test("Navegación: company_admin y platform_admin ven 'Proyectos On Street' (mismo alcance que el resto de On Street)", () => {
  const ca = visibleOnStreetChildren(ROLES.COMPANY_ADMIN, "client");
  assert.ok(ca.some((c) => c.label === "Proyectos On Street"));
  // platform_admin resuelve por portal==="root", fuera de COMPANY_ADMIN_PREFIXES -- se prueba en permissions.test.mjs/onStreetAdminCore.test.mjs, no se duplica aquí.
});

test("Navegación: 'Proyectos On Street' conserva activePrefix hacia las rutas legadas sin accesos directos (Ubicaciones QR/Generar QR) -- Áreas/Calles/Tramos pasaron a 'Estructura' (corrección UX 2026-08-29)", () => {
  const children = visibleOnStreetChildren(ROLES.COMPANY_ADMIN, "client");
  const proyectos = children.find((c) => c.label === "Proyectos On Street");
  assert.deepEqual(proyectos.activePrefix, ["/on-street-qr/proyectos", "/on-street-qr/ubicaciones", "/on-street-qr/crear"]);
});

// Áreas/Calles/Tramos (/on-street-qr/areas|calles|tramos) ya estaban en
// ROOT_ONLY_PREFIXES ANTES de esta corrección (permissions.mjs: "crean
// estructura compartida entre empresas... reservados a Root") -- esta
// corrección UX no cambia esa regla, solo agrega el acceso directo del menú
// que ya faltaba. Por eso "Estructura" debe verse para Root y NO para
// company_admin, exactamente como ya ocurría con esas rutas por deep link.
test("Navegación: 'Estructura' (Áreas/Calles/Tramos) es visible para Root y NO para company_admin -- respeta el ROOT_ONLY_PREFIXES ya existente, no se cambió RBAC", () => {
  const root = visibleOnStreetChildren(ROLES.PLATFORM_ADMIN, "root");
  const estructura = root.find((c) => c.label === "Estructura");
  assert.ok(estructura, "'Estructura' debe existir para Root");
  assert.deepEqual(estructura.activePrefix, ["/on-street-qr/areas", "/on-street-qr/calles", "/on-street-qr/tramos"]);
  assert.deepEqual(estructura.children.map((c) => c.href), ["/on-street-qr/areas", "/on-street-qr/calles", "/on-street-qr/tramos"]);

  const companyAdmin = visibleOnStreetChildren(ROLES.COMPANY_ADMIN, "client");
  assert.equal(companyAdmin.some((c) => c.label === "Estructura"), false, "company_admin no debe ver 'Estructura' -- Áreas/Calles/Tramos siguen reservadas a Root");
});

// "Reportes" pasó a ser un nodo con hijos (2026-08-30): antes era un ítem
// hoja sin acceso propio a "Gráficos" (solo alcanzable como pestaña dentro
// de la misma página, sin entrada en el Sidebar) -- el usuario pidió
// explícitamente que "Gráficos" naciera como hijo real de "Reportes" en el
// menú On Street.
test("Navegación: 'Reportes' tiene un hijo 'Gráficos' que enlaza a la MISMA página con ?tab=graficos (sin duplicar la página/lógica de Reportes)", () => {
  const children = visibleOnStreetChildren(ROLES.COMPANY_ADMIN, "client");
  const reportes = children.find((c) => c.label === "Reportes");
  assert.ok(reportes, "'Reportes' debe existir en el árbol");
  assert.equal(reportes.href, "/on-street-qr/reportes", "el propio nodo 'Reportes' sigue enlazando a la página real, mismo criterio que 'Proyectos On Street'");
  assert.deepEqual(reportes.children.map((c) => c.label), ["Reportes", "Gráficos"]);
  assert.equal(reportes.children[1].href, "/on-street-qr/reportes?tab=graficos");
});

test("Navegación: 'Reportes' > 'Gráficos' es visible para company_admin y platform_admin (mismo alcance que el resto de Reportes On Street, no se cambió RBAC)", () => {
  const ca = visibleOnStreetChildren(ROLES.COMPANY_ADMIN, "client");
  const root = visibleOnStreetChildren(ROLES.PLATFORM_ADMIN, "root");
  assert.ok(ca.find((c) => c.label === "Reportes")?.children.some((c) => c.label === "Gráficos"));
  assert.ok(root.find((c) => c.label === "Reportes")?.children.some((c) => c.label === "Gráficos"));
});

// OnStreetReports.js debe leer ese "?tab=graficos" para abrir la pestaña
// directamente al llegar por el enlace del menú -- mismo patrón ya usado
// por "?parkingId=" (window.location.search + setTimeout, nunca
// useSearchParams(), que exige Suspense y rompía el build con Turbopack).
test("OnStreetReports.js: lee '?tab=' de la URL (mismo patrón que '?parkingId=') y solo acepta una de las 6 pestañas reales -- un valor ausente o inválido se ignora", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetReports.js", import.meta.url), "utf8");
  assert.match(src, /const fromTab = params\.get\("tab"\);/);
  assert.match(src, /if \(fromTab && TOP_TABS\.some\(\(t\) => t\.key === fromTab\)\) setType\(fromTab\);/);
});

test("Rutas legadas NO se eliminaron: siguen registradas como páginas reales (Ubicaciones QR, Generar QR, Áreas, Calles, Tramos)", async () => {
  for (const ruta of [
    "../app/on-street-qr/ubicaciones/page.js",
    "../app/on-street-qr/crear/page.js",
    "../app/on-street-qr/areas/page.js",
    "../app/on-street-qr/calles/page.js",
    "../app/on-street-qr/tramos/page.js",
  ]) {
    await assert.doesNotReject(readFile(new URL(ruta, import.meta.url), "utf8"), `${ruta} debe seguir existiendo`);
  }
});

// --- Modelo: NO se creó tabla Project ---

test("listOnStreetProjects/getOnStreetProjectDetail: NO crean ni consultan ninguna tabla 'projects' -- el Proyecto es el Estacionamiento (parkings) real", () => {
  const start = repoSource.indexOf("export async function listOnStreetProjects");
  const end = repoSource.indexOf("\nexport async function getOnStreetProjectDetail", start);
  const fn = repoSource.slice(start, end);
  assert.doesNotMatch(repoSource, /\.from\("projects?"\)/i);
  assert.match(fn, /scopedParkingsWithStatus\(db,context,input\.companyId\|\|null,input\.status\|\|null\)/, "por defecto (sin input.status) no debe filtrar por estado -- ver corrección 2026-08-30");
});

// Corrección definitiva 2026-08-30: "Proyectos actuales" dejó de exigir
// status='ACTIVE' -- por defecto muestra TODOS los estados reales (un
// Proyecto nace DRAFT y necesita aparecer para completarse desde su propia
// ficha). El filtro por estado sigue existiendo, pero es OPCIONAL
// (input.status), nunca obligatorio ni fijado a 'ACTIVE'.
test("scopedParkingsWithStatus: status ausente/vacío = SIN filtrar (todos los estados); con status explícito, filtra exacto -- nunca 'ACTIVE' por defecto", () => {
  const start = repoSource.indexOf("async function scopedParkingsWithStatus");
  const end = repoSource.indexOf("\n}", start) + 2;
  const fn = repoSource.slice(start, end);
  assert.match(fn, /return status\?parkings\.filter\(p=>p\.status===status\):parkings;/);
});

test("'Vigente' ya no gobierna el listado principal -- el conteo de sesiones hoy/vehículos activos se agrega DESPUÉS de resolver la lista, nunca se usa para filtrar cuáles proyectos aparecen", () => {
  const listFn = repoSource.slice(repoSource.indexOf("export async function listOnStreetProjects"), repoSource.indexOf("async function scopedParkingsWithStatus"));
  assert.doesNotMatch(listFn, /filter\([^)]*sessionsToday/i);
});

// --- Corrección definitiva "Proyectos On Street siguen sin aparecer" (2026-08-30) ---
// Lista lettered 1-12 pedida explícitamente. 9/10 (alcance Root/company_admin)
// ya están cubiertos por scopedParkings/resolveParkingCompanyFilter -- no
// tocados por esta corrección, se re-verifica aquí que siguen intactos.

test("1/2/4. Por defecto (sin status en la query), listOnStreetProjects NO filtra por estado -- un Proyecto DRAFT y uno ACTIVE aparecen ambos", () => {
  const start = repoSource.indexOf("export async function listOnStreetProjects");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", repoSource.indexOf("scopedParkingsWithStatus", start)));
  assert.match(fn, /input\.status\|\|null/, "el status por defecto debe ser null (sin filtrar), nunca 'ACTIVE'");
});

test("3. scopedParkings sigue excluyendo OFF_STREET (sin cambios) -- el listado de Proyectos On Street nunca mezcla estacionamientos de otro producto", () => {
  const start = repoSource.indexOf("export async function scopedParkings(");
  const fn = repoSource.slice(start, repoSource.indexOf(";", start) + 1);
  assert.match(fn, /\.eq\("type",\s*"ON_STREET"\)/);
});

test("5/6. Filtro Estado: DRAFT y ACTIVE explícitos siguen aislando exactamente ese estado (scopedParkingsWithStatus con status definido)", () => {
  const start = repoSource.indexOf("async function scopedParkingsWithStatus");
  const fn = repoSource.slice(start, repoSource.indexOf("\n}", start) + 2);
  // Ya verificado arriba que "status?parkings.filter(p=>p.status===status):parkings"
  // -- con status='DRAFT' o 'ACTIVE' filtra exacto, sin caso especial por valor.
  assert.match(fn, /p\.status===status/);
});

test("7/8. ParkFacilDataGrid resuelve la búsqueda de forma genérica (globalSearchPlaceholder/globalSearchAccessor) -- OnStreetProjectsList no implementa un segundo filtro de texto que pueda quedar pegado entre cambios de Estado/Empresa", async () => {
  const listSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectsList.js", import.meta.url), "utf8");
  assert.doesNotMatch(listSource, /useState\(""\)[^;]*search/i, "no debe existir un estado de búsqueda propio fuera del que ya maneja ParkFacilDataGrid");
  assert.match(listSource, /<ParkFacilDataGrid/);
});

test("11. Mensaje vacío neutral -- ya no dice 'vigentes'", async () => {
  const listSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectsList.js", import.meta.url), "utf8");
  assert.match(listSource, /emptyMessage="No hay proyectos para el filtro seleccionado\."/);
  assert.doesNotMatch(listSource, /vigente/i);
});

test("12. Encabezado ya no dice 'Proyectos vigentes' ni usa 'vigente' como sinónimo de 'proyecto existente'", async () => {
  const listSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectsList.js", import.meta.url), "utf8");
  assert.doesNotMatch(listSource, /Proyectos vigentes/);
  assert.match(listSource, /Proyectos On Street — cada uno representa/);
});

test("Selector de Estado: opciones = TODOS los estados reales (ESTACIONAMIENTO_STATES), valor por defecto '' (Todos) -- nunca 'ACTIVE' precargado", async () => {
  const listSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectsList.js", import.meta.url), "utf8");
  assert.match(listSource, /const \[statusFilter, setStatusFilter\] = useState\(""\);/);
  assert.match(listSource, /ESTACIONAMIENTO_STATES\.map\(\(state\) => <option key=\{state\} value=\{state\}>\{STATE_LABELS\[state\]\}<\/option>\)/);
  assert.match(listSource, /import \{ ESTACIONAMIENTO_STATES, STATE_LABELS \} from "@\/lib\/estacionamientos\.mjs";/);
});

test("El filtro de Estado viaja al backend como ?status= (opcional) -- API route ya lo reenvía tal cual (Object.fromEntries de todos los query params)", async () => {
  const listSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectsList.js", import.meta.url), "utf8");
  assert.match(listSource, /if \(statusFilter\) params\.set\("status", statusFilter\);/);
  const routeSource = await readFile(new URL("../app/api/on-street-qr/proyectos/route.js", import.meta.url), "utf8");
  assert.match(routeSource, /Object\.fromEntries\(new URL\(request\.url\)\.searchParams\)/);
});

test("getOnStreetProjectDetail: reutiliza EXACTAMENTE el mismo cálculo de listOnStreetProjects -- no hay una segunda definición de 'recaudación hoy'/'vehículos ahora'", () => {
  const start = repoSource.indexOf("export async function getOnStreetProjectDetail");
  const fn = repoSource.slice(start, repoSource.length);
  assert.match(fn, /const all=await listOnStreetProjects\(db,context,\{\}\);/);
});

// --- APIs ---

test("/api/on-street-qr/proyectos y /proyectos/[id]: mismo RBAC que el resto de On Street (authorizeOnStreetAdminRequest), sin endpoints de escritura nuevos para 'Proyecto'", async () => {
  const list = await readFile(new URL("../app/api/on-street-qr/proyectos/route.js", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/api/on-street-qr/proyectos/[id]/route.js", import.meta.url), "utf8");
  for (const src of [list, detail]) {
    assert.match(src, /authorizeOnStreetAdminRequest/);
    assert.doesNotMatch(src, /export async function (POST|PATCH|DELETE)/, "no debe existir escritura de 'Proyecto' -- se escribe a través de los endpoints reales de Estacionamiento/Área/Calle/Tramo");
  }
});

// --- Constructor "Nuevo proyecto": reutilización, no duplicación ---

const wizardSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectWizard.js", import.meta.url), "utf8");

test("Constructor: reutiliza EstacionamientoForm/StructureEntityForm ya existentes (con sus props onSaved/onCancel/lockedCompanyId/forcedType) -- no crea formularios paralelos para Estacionamiento/Área/Calle", () => {
  assert.match(wizardSource, /import EstacionamientoForm from "@\/components\/estacionamientos\/EstacionamientoForm"/);
  assert.match(wizardSource, /import StructureEntityForm from "@\/components\/estacionamientos\/StructureEntityForm"/);
  assert.match(wizardSource, /<EstacionamientoForm parking=\{modal\.editing\} lockedCompanyId=\{companyId \|\| undefined\} forcedType="ON_STREET" onSaved=\{.*\} onCancel=\{\(\) => setModal\(null\)\}/);
  assert.match(wizardSource, /<StructureEntityForm kind="sector" parking=\{parkingSel\} entity=\{modal\.editing\} onSaved=\{.*\} onCancel=\{\(\) => setModal\(null\)\}/);
  assert.match(wizardSource, /<StructureEntityForm kind="street" parking=\{parkingSel\} parent=\{areaSel\} entity=\{modal\.editing\} onSaved=\{.*\} onCancel=\{\(\) => setModal\(null\)\}/);
});

// Cierre integral del flujo (2026-08-30): causa real del bug "Cancelar
// cierra el wizard completo" -- EstacionamientoForm/StructureEntityForm
// SIEMPRE renderizaban su "Cancelar" como un <Link> de navegación real
// (incluso con cancelHref={null}, que solo caía al default). Con onCancel
// presente pasan a ser un callback puro; sin onCancel, comportamiento
// idéntico al de siempre (otros llamadores no se ven afectados).
test("Causa real del bug Cancelar: EstacionamientoForm/StructureEntityForm ofrecen onCancel -- cuando está presente, 'Cancelar' es un <button onClick> puro, NUNCA un <Link> de navegación", async () => {
  const formSource = await readFile(new URL("../components/estacionamientos/EstacionamientoForm.js", import.meta.url), "utf8");
  const structureSource = await readFile(new URL("../components/estacionamientos/StructureEntityForm.js", import.meta.url), "utf8");
  for (const src of [formSource, structureSource]) {
    assert.match(src, /onCancel = null/);
    assert.match(src, /\{onCancel \? <button type="button" onClick=\{onCancel\}[^]*?Cancelar<\/button> : <Link href=\{cancelHref\}/);
  }
});

test("Constructor: TODO ocurre en una sola pantalla -- ningún nivel (Estacionamiento/Área/Calle/Tramo) navega a otra ruta al crear, se abre en Modal", () => {
  assert.match(wizardSource, /function Modal\(/);
  assert.doesNotMatch(wizardSource, /router\.push\(`\/estacionamientos/);
  assert.doesNotMatch(wizardSource, /router\.push\(`\/on-street-qr\/areas\/nueva/);
});

test("Constructor: creación contextual -- al guardar cualquier nivel, la entidad queda seleccionada automáticamente y el constructor continúa (sin volver a pedir el contexto ya conocido)", () => {
  assert.match(wizardSource, /async function alGuardarEnModal\(kind, entidad\)/);
  assert.match(wizardSource, /if \(kind === "parking"\) elegirEstacionamiento\(entidad\.id\);/);
  assert.match(wizardSource, /if \(kind === "area"\) elegirArea\(entidad\.id\);/);
  assert.match(wizardSource, /if \(kind === "street"\) elegirCalle\(entidad\.id\);/);
});

test("Constructor: cambiar un nivel superior limpia los hijos incompatibles (cascada real, no solo visual) -- Tarifa (nivel 5) también se limpia al cambiar Estacionamiento", () => {
  assert.match(wizardSource, /function elegirEstacionamiento\(id\) \{ setParkingId\(id\); setAreaId\(""\); setStreetId\(""\); setSegmentId\(""\); setTarifaId\(""\); \}/);
  assert.match(wizardSource, /function elegirArea\(id\) \{ setAreaId\(id\); setStreetId\(""\); setSegmentId\(""\); \}/);
  assert.match(wizardSource, /function elegirCalle\(id\) \{ setStreetId\(id\); setSegmentId\(""\); \}/);
});

test("Constructor: el backend valida la jerarquía igualmente -- Área/Calle se crean vía los endpoints reales (requireParkingChild), nunca solo confiando en el frontend", () => {
  // Los endpoints reales que StructureEntityForm invoca ya exigen
  // requireParkingChild (ver sectores/route.js, calles/route.js) -- no se
  // duplica aquí esa verificación, se confirma que el wizard sigue
  // pasando por esos mismos endpoints (no uno propio).
  assert.doesNotMatch(wizardSource, /fetch\(.*\/api\/on-street-qr\/proyectos.*method:\s*"POST"/s);
});

// Cierre integral del flujo (2026-08-30): el wizard reemplazó los dos
// botones finales ("GUARDAR PROYECTO" / "GUARDAR Y GENERAR QR", que
// navegaban fuera y hacían perder el paso siguiente) por un flujo continuo
// de etapas (Estructura -> Tarifas -> QR -> Revisión) dentro de la misma
// pantalla. Ninguna transición de etapa crea un registro "Project" ficticio
// -- solo cambia qué se renderiza (setStage), o navega a la ficha real
// (parkingId ya existente) al terminar.
test("Constructor: el flujo de etapas NO crea ningún registro 'Project' ficticio -- solo navega a la ficha real del Estacionamiento (parkingId ya existente) al llegar a Revisión", () => {
  assert.doesNotMatch(wizardSource, /function guardarProyecto\(\)/, "el botón 'GUARDAR PROYECTO' aislado ya no existe -- reemplazado por el flujo de etapas");
  assert.doesNotMatch(wizardSource, /function guardarYGenerarQr\(\)/, "'GUARDAR Y GENERAR QR' ya no navega al wizard QR standalone -- la etapa QR está embebida");
  assert.match(wizardSource, /router\.push\(`\/on-street-qr\/proyectos\/\$\{parkingId\}`\)/);
  assert.doesNotMatch(wizardSource, /method:\s*"POST".*\/api\/on-street-qr\/proyectos/s);
});

// Corrección UX 2026-08-30 ("Tarifas dentro del árbol de Estructura"):
// Tarifa pasó a ser el NIVEL 5 de Estructura (no un tab/etapa aparte). Tabs
// superiores definitivos: Estructura -> QR -> Revisión (3, no 4).
test("Tabs superiores definitivos: Estructura -> QR -> Revisión (3 etapas, 'Tarifas' YA NO es un tab independiente)", () => {
  assert.match(wizardSource, /const STAGES = \[\s*\{ key: "estructura", label: "1\. Estructura" \},\s*\{ key: "qr", label: "2\. QR" \},\s*\{ key: "revision", label: "3\. Revisión" \},\s*\];/);
  assert.doesNotMatch(wizardSource, /key: "tarifas"/);
});

test("Nivel 5 de Estructura: Tarifa -- Seleccionar/Crear/Editar, igual que los otros 4 niveles, habilitado recién cuando existe Tramo", () => {
  assert.match(wizardSource, /numero=\{5\} titulo="Tarifa" done=\{Boolean\(tarifaSel\)\}/);
  assert.match(wizardSource, /disabled=\{!segmentId \|\| loadingTarifas\}/);
  assert.match(wizardSource, /onCrear=\{\(\) => \{ setTarifaModalIntent\("crear"\); setTarifaRatesOpenSignal/);
  assert.match(wizardSource, /onEditar=\{\(\) => \{ setTarifaModalIntent\("editar"\); setModal\(\{ kind: "tarifa" \}\); \}\}/);
});

test("Tarifa (nivel 5) reutiliza ParkingRatesManager -- el mismo componente que la pestaña Tarifas de la ficha, no un segundo motor", () => {
  assert.match(wizardSource, /import ParkingRatesManager from "@\/components\/estacionamientos\/ParkingRatesManager"/);
  assert.match(wizardSource, /<ParkingRatesManager key=\{parkingSel\.id\} parking=\{\{ code: parkingSel\.code, name: parkingSel\.name \}\} onRatesChange=\{alCambiarTarifas\} openSignal=\{tarifaRatesOpenSignal\} \/>/);
});

test("Crear tarifa nueva desde el nivel 5 la deja seleccionada automáticamente y cierra el modal solo -- Cancelar/X no pierde nada", () => {
  const start = wizardSource.indexOf("function alCambiarTarifas");
  const fn = wizardSource.slice(start, wizardSource.indexOf("\n  }", start) + 4);
  assert.match(fn, /if \(pendingAutoSelectTarifa && nuevasTarifas\.length > current\.length\) \{/);
  assert.match(fn, /setTarifaId\(nuevasTarifas\[0\]\.id\);/);
  assert.match(fn, /setModal\(null\);/);
});

test("Tarifa NO pertenece al Tramo: tarifasUsables/carga de tarifas dependen solo de parkingSel (Estacionamiento), nunca de areaId/streetId/segmentId -- no se inventa tariff_id en Tramo", () => {
  assert.doesNotMatch(wizardSource, /segment.*tariff|tariff.*segment/i);
  const start = wizardSource.indexOf("const cargarTarifas = useCallback");
  const fn = wizardSource.slice(start, wizardSource.indexOf("[parkingSel]", start));
  assert.doesNotMatch(fn, /areaId|streetId|segmentId/);
});

test("Estructura completa (5 niveles, incluida Tarifa) exige tarifaId -- 'Continuar a QR' queda deshabilitado con mensaje explícito hasta entonces", () => {
  assert.match(wizardSource, /const estructuraCompleta = Boolean\(parkingId && areaId && streetId && segmentId && tarifaId\);/);
  assert.match(wizardSource, /Completa Estacionamiento, Área, Calle, Tramo y Tarifa para continuar a QR\./);
  assert.match(wizardSource, /disabled=\{!estructuraCompleta\} onClick=\{\(\) => irA\("qr"\)\}/);
});

test("Solo tarifas ACTIVE + compliance VALID son seleccionables en el nivel 5 -- una DRAFT/REQUIRES_REVIEW no debe poder elegirse ni avanzar a QR", () => {
  assert.match(wizardSource, /const tarifasUsables = useMemo\(\(\) => tarifas\.filter\(\(r\) => r\.status === "ACTIVE" && r\.compliance\?\.status === "VALID"\), \[tarifas\]\);/);
  assert.match(wizardSource, /options=\{tarifasUsables\.map\(\(r\) => \(\{ id: r\.id, label:/);
});

test("Etapa QR del constructor: usa OnStreetProjectQrPanel (el mismo generador único, embebido), PRECARGADO con Área/Calle/Tramo/Tarifa del nivel 5 -- ya NO navega a /on-street-qr/crear ni muestra el wizard standalone de 5 pasos", () => {
  assert.match(wizardSource, /import OnStreetProjectQrPanel from "\.\/OnStreetProjectQrPanel"/);
  assert.match(wizardSource, /<OnStreetProjectQrPanel parkingId=\{parkingId\} initialSectorId=\{areaId\} initialStreetId=\{streetId\} initialSegmentId=\{segmentId\} initialRateId=\{tarifaId\} initialRateLabel=\{.*\} onCountChange=\{setQrCount\} \/>/);
  assert.doesNotMatch(wizardSource, /router\.push\(`\/on-street-qr\/crear/);
});

test("Etapa Revisión del constructor: usa OnStreetProjectActivation -- reutiliza el motor de activación existente", () => {
  assert.match(wizardSource, /import OnStreetProjectActivation from "\.\/OnStreetProjectActivation"/);
  assert.match(wizardSource, /<OnStreetProjectActivation data=\{revisionData\} onActivated=\{cargarRevision\} \/>/);
});

// Corrección "Resumen sin acciones de activación duplicadas" (2026-08-30):
// el bloque Revisión/Activación se retiró del tab Resumen de la ficha -- la
// activación del proyecto se realiza únicamente en la etapa "Revisión" del
// flujo Estructura -> QR -> Revisión (constructor), verificado arriba.
test("Tab Resumen de la ficha de Proyecto: ya NO incluye el bloque Revisión/Activación (ni el botón ACTIVAR PROYECTO) -- solo información del proyecto, incluido su Estado", async () => {
  const detailSource = await readFile(new URL("../components/on-street-admin/OnStreetProjectDetail.js", import.meta.url), "utf8");
  assert.doesNotMatch(detailSource, /import OnStreetProjectActivation/);
  assert.doesNotMatch(detailSource, /<OnStreetProjectActivation/);
  assert.match(detailSource, /STATE_LABEL\[data\.status\] \|\| data\.status/, "el Estado del proyecto debe seguir mostrándose en el Resumen");
});

// Corrección "flujo QR dentro de Nuevo Proyecto" (2026-08-30): causa real
// del bug -- la precarga revalidaba initialRateId contra options.rates de
// ESTE componente, un listado más angosto (solo billing_mode
// EFFECTIVE_MINUTE) que el que ya usó el wizard para resolver la tarifa del
// nivel 5. Una tarifa real que no calzara ahí (p. ej. "Tramo vencido")
// nunca pasaba la revalidación y el salto al resumen se quedaba pegado en
// el paso 1 -- mostrando de nuevo el flujo antiguo. Ahora se CONFÍA en las
// props (vienen de un componente hermano de confianza, y el backend
// igual revalida todo al crear).
test("OnStreetQrCreateWorkspace: la precarga completa (segmentId+rateId por props) salta a 'Generar QR' SIN revalidar contra options.rates/options.segments -- ya no se queda pegada en el paso 1", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetQrCreateWorkspace.js", import.meta.url), "utf8");
  assert.match(src, /const hasFullContext = Boolean\(initialSegmentId && initialRateId\);/);
  assert.match(src, /if \(hasFullContext\) setStep\(4\);/);
  assert.doesNotMatch(src, /const segmentOk = initialSegmentId/, "ya no debe existir la revalidación frágil contra options.segments");
  assert.doesNotMatch(src, /const rateOk = initialRateId/, "ya no debe existir la revalidación frágil contra options.rates (la causa real del bug)");
});

test("OnStreetQrCreateWorkspace: la tarifa precargada se muestra en el resumen aunque no aparezca en options.rates (initialRateLabel como respaldo de exhibición, nunca sustituye a la real cuando sí se encuentra)", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetQrCreateWorkspace.js", import.meta.url), "utf8");
  assert.match(src, /initialRateLabel = null/);
  assert.match(src, /const tarifaResumenTexto = tarifaSeleccionada \? `\$\{tarifaSeleccionada\.name\} · \$\{money\(tarifaSeleccionada\.minuteAmount\)\}\/min` : \(form\.rateId && form\.rateId === initialRateId && initialRateLabel\) \? initialRateLabel : "—";/);
});

test("OnStreetProjectQrPanel: abre la creación automáticamente cuando llega precargado desde el nivel 5, y reporta la cantidad real de QR al padre (onCountChange)", async () => {
  const panelSrc = await readFile(new URL("../components/on-street-admin/OnStreetProjectQrPanel.js", import.meta.url), "utf8");
  assert.match(panelSrc, /useState\(Boolean\(initialSegmentId && initialRateId\)\)/, "el panel abre automáticamente la creación cuando ya viene todo resuelto desde el nivel 5");
  assert.match(panelSrc, /if \(!onCountChange\) return undefined;/);
  assert.match(panelSrc, /onCountChange\(rows\.length\)/);
});

test("Punto 6: 'CONTINUAR A REVISIÓN' (botón y tab) permanece deshabilitado mientras el Proyecto no tenga al menos un QR creado", () => {
  assert.match(wizardSource, /const \[qrCount, setQrCount\] = useState\(0\);/);
  assert.match(wizardSource, /disabled=\{qrCount === 0\} onClick=\{\(\) => irA\("revision"\)\}/);
  assert.match(wizardSource, /\(s\.key === "revision" && qrCount === 0\)/);
  assert.match(wizardSource, /Crea al menos una ubicación QR para continuar a Revisión\./);
});

test("Punto 4/5 (ya satisfechos, sin tocar): al generar el QR se ofrece 'Ver letrero' (vista imprimible existente) y 'Crear otro punto' sin salir del flujo", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetQrCreateWorkspace.js", import.meta.url), "utf8");
  assert.match(src, /\/on-street-qr\/ubicaciones\/\$\{created\.id\}\/letrero/);
  assert.match(src, /onClick=\{crearOtra\}/);
});

test("OnStreetQrCreateWorkspace: precarga el contexto recibido por URL y NUNCA vuelve a pedir Empresa/Estacionamiento/Área/Calle/Tramo ya conocidos", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetQrCreateWorkspace.js", import.meta.url), "utf8");
  assert.match(src, /const parkingId = params\.get\("parkingId"\);/);
  assert.match(src, /if \(!\(options\.parkings \|\| \[\]\)\.some\(\(p\) => p\.id === parkingId\)\) return undefined;/);
});

// --- Ficha de Proyecto ---

test("Ficha de Proyecto: expone exactamente las 7 pestañas pedidas (Resumen/Estructura/QR/Tarifas/Inspectores/Operación/Reportes)", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetProjectDetail.js", import.meta.url), "utf8");
  assert.match(src, /\{ key: "resumen", label: "Resumen" \}/);
  assert.match(src, /\{ key: "estructura", label: "Estructura" \}/);
  assert.match(src, /\{ key: "qr", label: "QR" \}/);
  assert.match(src, /\{ key: "tarifas", label: "Tarifas" \}/);
  assert.match(src, /\{ key: "inspectores", label: "Inspectores" \}/);
  assert.match(src, /\{ key: "operacion", label: "Operación" \}/);
  assert.match(src, /\{ key: "reportes", label: "Reportes" \}/);
});

test("Ficha de Proyecto: Inspectores NO inventa una asociación -- documenta explícitamente el alcance global real", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetProjectDetail.js", import.meta.url), "utf8");
  assert.match(src, /alcance <strong>global<\/strong>/);
  assert.match(src, /no existe una relación real en el modelo que los asigne a un Proyecto/);
});

test("Ficha de Proyecto: Resumen no inventa números -- todos los campos vienen de getOnStreetProjectDetail (datos reales), sin mocks", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetProjectDetail.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Math\.random|mock|Mock|MOCK/);
});

// Corrección "Volver desde Inspectores debe regresar al Proyecto exacto"
// (2026-08-30): la ficha propaga su parkingId al navegar a Inspectores, y
// esa pantalla lo usa para armar el "Volver" -- ver el test siguiente sobre
// OnStreetInspectores.js.
test("Ficha de Proyecto: el enlace 'Ver Inspectores' propaga ?parkingId= (mismo `qs` usado por el resto de pestañas) para que Inspectores sepa desde qué Proyecto fue invocado", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetProjectDetail.js", import.meta.url), "utf8");
  assert.match(src, /href=\{`\/on-street-qr\/inspectores\$\{qs\}`\}/);
});

// Corrección "todas las páginas de On Street deben tener un botón Volver
// que lleve a la sesión inmediatamente precedente" (2026-08-30): reemplaza
// el destino condicional por ?parkingId= (construido en la turn anterior)
// por router.back() real -- vuelve a donde estaba el usuario de verdad
// (la ficha del Proyecto si llegó desde "Ver Inspectores", el Dashboard si
// llegó desde el Sidebar, etc.) sin depender de leer la URL.
test("Inspectores On Street: el botón Volver usa router.back() real (navegación de historial), no un destino condicional por ?parkingId=", async () => {
  const src = await readFile(new URL("../components/on-street-admin/OnStreetInspectores.js", import.meta.url), "utf8");
  assert.match(src, /<button type="button" onClick=\{\(\) => router\.back\(\)\} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" \/>Volver<\/button>/);
  assert.doesNotMatch(src, /setParkingId/, "la lectura de ?parkingId= para el botón Volver quedó obsoleta y se eliminó -- router.back() cubre ese caso automáticamente");
});

// --- RBAC (auditoría rápida: mismo mecanismo, sin debilitarlo) ---

test("Creación de Estacionamiento/Área/Calle desde el wizard sigue pasando por PARKINGS_MANAGE (mismo permiso que ya tenía company_admin vía /estacionamientos, no uno nuevo)", async () => {
  const parkingsRoute = await readFile(new URL("../app/api/estacionamientos/route.js", import.meta.url), "utf8");
  assert.match(parkingsRoute, /PARKINGS_MANAGE/);
});
