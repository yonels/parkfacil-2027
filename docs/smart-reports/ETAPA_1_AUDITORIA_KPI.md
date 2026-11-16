# Smart Reports — Etapa 1: auditoría y definiciones

**Fecha:** 2026-10-28. **Agente:** Codex. **Estado:** propuesta para revisión, no integración.  
Fuente examinada: `yonels/parkfacil-2027`, árbol local sobre `feature/pago-liberado`, HEAD `9b664c0da7e9925841641d77521d497d00e4bb39`. Contiene cambios ajenos; esta auditoría describe el árbol, no el despliegue. No se consultó base remota ni se ejecutaron migraciones. Código, SQL en disco y datos reales disponibles son evidencias distintas.

**Continuación de M1,2026-10-28:** la frase anterior describe la revisión inicial. Después el usuario autorizó lecturas QA y aportó V2.1. Ver [catálogo actualizado para aprobación](CATALOGO_KPI_APROBACION.md), [datos QA](QA_HISTORICOS_SOLO_LECTURA.md), [referencia V2.1](REFERENCIA_V21.md) y [soluciones propuestas](SOLUCIONES_PROPUESTAS_M1.md). Estos anexos prevalecen donde amplían la auditoría inicial: QA confirma estados UNPAID_PENDING/UNPAID_EXIT y subtipos de tarjeta; no deben mantenerse las suposiciones de tres estados ni ausencia absoluta del campo crédito/débito. No se modificaron fuentes productivas ni se aplicaron correcciones.

**Actualización de alcance posterior:** plataforma común Off Street+On Street; [anexo territorial](CATALOGO_ON_STREET_PROPUESTO.md) y [contrato de ocupación](ALCANCE_MODALIDADES_Y_OCUPACION.md) preservan y amplían las definiciones originales. Los KPIs continúan pendientes de aprobación definitiva. Una sesión vigente no prueba plaza ocupada; falta de evidencia/capacidad→«No calculable». Preparación M2 local permitida, On Street funcional no autorizado. No hay nuevas lecturas remotas en esta actualización.

## 1. Inventario de fuentes

| Fuente | Campos/uso identificados | Servicio o ruta vigente | Reutilización y brecha |
|---|---|---|---|
| `parking_stays` | `id, parking_id, status, entry_at, exit_at, total_amount, payment_method, payment_shift_id, entry_shift_id` | `posStaysService.js`, `offStreetOperationsCore.mjs`, `offStreetRevenueService.js` | Off Street. OPEN/PAID/CANCELLED; entrada/salida y pagos. No confundir salida/cobro con dos ingresos financieros. |
| `operator_shifts` | `id, parking_id, operator_id, shift_date, opened_at, closed_at, status` | `offStreetReportsService.js`, `countOpenShifts` | OPEN/CLOSING para abiertos actuales; fecha de turno no es fecha de cada pago. |
| `shift_closures` | `shift_id, parking_id, actual_close_at, collected_amount, cash_amount, card_amount, cash_difference` y campos de cierre | `searchRevenueClosures`, `toRevenueClosureRow` | Usar totales canónicos persistidos. No sumar cierre + pagos como recaudación. Esquema evolucionó mediante migraciones; verificar versión de destino. |
| `parking_levels`, `parking_zones` | Capacidad declarada y estado actual de niveles/zonas | `offStreetDashboardCapacity.js`, `resolveParkingCapacity`, `parkingStructureRepository.js` | Regla actual por nivel: zonas activas con capacidad positiva; sin ellas, capacidad declarada del nivel. No sumar nivel y sus zonas. |
| `parkings` y empresas | Tipo, identidad, empresa, alcance | `listParkings(db, authorization.scope)`, `resolveQueryParkingIds` | Resolver empresas/parkings en servidor. No aceptar lista autorizada desde cliente. |
| `shift_closures` snapshots | `capacity_snapshot, occupied_snapshot, snapshot_at` en migración de estructura | `20260728160000_parking_operational_structure.sql` y posteriores | Son evidencia puntual; no demuestran intervalos continuos de capacidad ni cobertura Off Street completa. |
| `on_street_pilot_sessions`, extensiones | `started_at, expires_at, ended_at, status, amount_paid, purchased_minutes` | `onStreetAdminRepository.js`, `onStreetDashboardCore.mjs` | Sesiones comerciales, no vehículos simultáneos observados. Montos acumulados pueden incluir extensiones de otro período. |
| `payment_transactions` + `on_street_payment_intents` | `status, amount, committed_at, source_id`, ubicación/intención | `revenueBreakdown`, `revenueTimeSeries`, servicios Webpay | Recaudación QR debe anclarse a evento COMMITTED, sin duplicar inicial/extensión. Revisar filtros de extracción antes de reutilizar. |
| Otros movimientos/pagos On Street | Modelo operativo distinto del QR mencionado por servicios existentes | Comentarios y separación de dominio de `offStreetRevenueService.js` | No se ha hecho inventario completo de todos los canales On Street. No prometer consolidación global con solo sesiones QR. |

### Endpoints y permisos inspeccionados

- `/api/dashboard-off-street`: `authorizeOperationRequest(... REPORTS_READ)` + `listParkings(...scope)`; mezcla métricas actuales y series de período.
- `/api/reportes-off-street`: tipos `movements`, `parked`, `shifts`, `occupancy`; recaudación/cierres se reutilizan desde rutas aparte.
- `/api/recaudacion` y `/api/recaudacion/cierres`: pagos/cierres Off Street.
- `/api/on-street-qr/dashboard`, `/api/on-street-qr/reportes`: rutas existentes; validar contrato y límites específicos antes de crear adaptador Smart Reports.
- `operationAuthorization.js` obtiene contexto autenticado y estacionamientos asignados; `permissions.mjs` concede REPORTS_READ a perfiles administrativos, no al operador por conveniencia. `resolveParkingCompanyFilter` en On Street deriva empresa del contexto para usuarios no root.

Estas comprobaciones no certifican RLS del entorno remoto. El acceso privilegiado de servidor exige scope correcto y pruebas negativas incluso si la tabla tiene RLS.

## 2. Contrato común propuesto de métricas

Cada indicador debe declarar `metricId`, versión de fórmula, dominio, unidad, filtros efectivos, zona `America/Santiago`, rango UTC `[inicio, fin)`, fecha de extracción/asOf, fuente, calidad/cobertura y estado `OK | NO_DATA | UNAVAILABLE | PARTIAL | ERROR`. Son definiciones, no API implementada.

- **Cero:** consulta completa, autorizada y válida sin operaciones. **Sin datos/capacidad:** no sustituir por cero. **Error/alcance denegado:** no devolver ceros engañosos.
- Rango seleccionado en fecha civil Chile; convertir límites con TZ IANA, no restar un `-04:00` fijo. El límite final es el inicio del día siguiente, excluido.
- Dimensiones iniciales: empresa, estacionamiento, dominio, fecha/hora, medio CASH/CARD y operador cuando la fuente lo soporte. No inferir débito/crédito desde CASH/CARD.
- Un mismo conjunto autorizado/rango alimenta KPI, serie y tabla. Búsqueda libre en tabla actual puede tener semántica distinta: explicitarla, no reutilizarla como filtro global sin decisión.
- Histórico se corta en `asOf`; datos futuros no deben aumentar hechos observados. Fechas de negocio y límites máximos se validan semánticamente.
- Para varios parkings: sumar numeradores y denominadores compatibles; no promediar porcentajes o tickets medios sin ponderación. No mezclar monedas/dominios por defecto.

## 3. Matriz indicador → fuente → fórmula → validación

| ID / indicador | Fuente / fecha | Fórmula y exclusiones propuestas | Validación requerida |
|---|---|---|---|
| `off.entries` Ingresos vehiculares | `parking_stays.entry_at` | Contar IDs únicos con entrada en rango. No representa dinero. El conteo canónico actual incluye registros luego CANCELLED; mantener paridad y exponer anulaciones/calidad hasta aprobar otra regla. | Entrada antes de rango y salida dentro: 0 ingresos, 1 salida. Evitar multiplicación por joins. |
| `off.exits` Salidas registradas | `parking_stays.exit_at`, PAID según resumen actual | Contar IDs PAID con salida en rango. Salida física independiente no existe como sensor en este modelo. CANCELLED con exit requiere auditoría: SQL base no lo prohíbe inequívocamente. | Mismo ID no se cuenta dos veces por turno/pago. Comparar serie/detalle/resumen. |
| `off.revenue` Recaudación bruta | PAID, `total_amount`, fecha `exit_at` como convención vigente | Sumar montos confirmados del período; conservar regla canónica. No sumar cierres, impuestos nuevamente ni montos simulados. Propuesta unidad CLP, a validar por canal. | Total = suma de filas y de serie del MISMO scope/rango. CASH + CARD = total cuando todos los pagos tienen método válido. |
| `off.paid_count` Pagos/tickets confirmados | Mismas filas PAID | Contar filas únicas, incluidos importes cero si existen y son válidos bajo regla actual. No equivale a todos los ingresos vehiculares. | Fixtures con pago cero y cobro sin ingreso en rango. |
| `off.avg_ticket` Ticket promedio | Recaudación y paid_count idénticos | `round(recaudación / count)` una vez al final. Canónico actual devuelve 0 si count=0; UI debe acompañar «sin pagos». No dividir por ingresos, salidas totales o capacidad. | 100 + 0, dos pagos: promedio50; combinar parkings mediante suma/count, no media de medias. |
| `off.open_now` Vehículos registrados dentro / tickets abiertos | `status=OPEN` al consultar | Conteo actual sin filtro histórico. Ambos nombres representan el mismo dato en el código, no dos observaciones independientes. | Cambiar Mes/Año no debe convertirlo en ocupación pasada; mostrar «Ahora, asOf». |
| `off.capacity_now` Capacidad actual | Niveles/zonas activos | Por nivel: suma zonas activas positivas si existen; si no, capacidad declarada. Sumar niveles activos. Capacidad0/ausente = desconocida. | Nivel100 + zonas100 =100, no200. Niveles100+50 =150. |
| `off.occupancy_now_pct` Ocupación actual registral | OPEN / capacidad actual | `100 × ΣOPEN / Σcapacidad`, solo con capacidad completa conocida. No ocultar sobreocupación: puede superar100%; disponibles se limita a0 con alerta. | Capacidad0→null. 12/10→120%. Si falta capacidad de un parking, no dar agregado completo. |
| `off.occupancy_hour_avg` Promedio horario | Intervalos de estancia + capacidad temporal | Promedio temporal de vehículos simultáneos y razón de vehículo-tiempo/plaza-tiempo; detalle §4. No implementado. | Cruce de hora, arrastre inicial, vacíos, anulaciones, capacidad cambiante y DST. |
| `off.occupancy_hour_max` Máximo horario | Barrido de eventos de intervalos | Máximo de O(t); también máximo de porcentaje con C(t) válido. No dividir max O por capacidad de otro instante. | Dos visitas consecutivas nunca equivalen a dos simultáneos. |
| `off.peak_hours` Horas punta | Serie histórica validada | Propuesta: top3 franjas por ocupación media ponderada en parking/periodo; empates por orden horario, todos visibles. Peak por entradas o dinero debe tener otro nombre. Umbral fijo configurable, pendiente aprobación. | Comparar curvas y empates; no publicar peak sin cobertura/capacidad suficiente. |
| `off.heatmap` Mapa día×hora | Buckets horarios reconstruidos | Agregar vehículo-tiempo/plaza-tiempo por día de semana/hora local; celdas sin cobertura quedan vacías, no0. No implementado. | Día corto/largo no aporta igual número de horas; ponderar duración real. |
| `off.cash_diff` Diferencia de caja | `shift_closures.cash_difference`, `actual_close_at` | Sumar diferencias registradas; no recalcular como ingresos menos gastos arbitrarios. Separar desconocido de0. | Reconciliar cierres, periodo exacto y parking; ver SR-05/06. |
| `off.shifts_open_now` Turnos abiertos actuales | `operator_shifts.status` | OPEN o CLOSING; sin filtro histórico. No confundir con cantidad de cierres del período. | Turno que cruza medianoche conserva identidad. |
| `qr.revenue_committed` Recaudación QR On Street | Transacciones COMMITTED, `committed_at` | Sumar transacciones únicas por ID; separar inicial/extensión. No reutilizar suma acumulada `session.amount_paid` como cobro de cada período. | Extensión fuera del mes inicial no vuelve a cobrar el mes anterior; evitar duplicados por joins. |
| `qr.sessions` Sesiones QR y vigentes | Sesiones por `started_at`; ACTIVE/expiración para vigentes | Conteo comercial, no ingreso/salida física ni ocupación física de la calle. Vigentes actuales separado del periodo. | Una sesión renovada no crea un vehículo adicional simultáneo; aun así no prueba presencia física. |

Recaudación por `exit_at` es convención vigente Off Street, no garantía de instante financiero exacto. Si otro canal acredita un pago antes de la salida, reconciliar `committed_at`/registro financiero y acordar una métrica versionada; no cambiar silenciosamente el reporte existente.

## 4. Ocupación histórica y capacidad temporal

### Definición matemática propuesta

Para estadías válidas `i` de parking `p`, intervalo semiabierto `[entry_i, exit_i)`. Para estadía abierta, extremo observado `min(asOf, finRango)`; marcar censura, no inventar una salida. Consultar también entradas anteriores al inicio que todavía solapan el rango: filtrar solo entradas dentro pierde ocupación de arrastre.

`O_p(t) = Σ 1(entry_i ≤ t < exit_i)`; descontar/añadir eventos con semántica semiabierta en el mismo timestamp. `C_p(t)` es capacidad válida del parking en ese instante, no su configuración actual aplicada retroactivamente.

Para bucket horario real `H=[h0,h1)`:

- Vehículos medios: `∫H O_p(t) dt / duración(H)`.
- Máximo de vehículos: `max_H O_p(t)`.
- Porcentaje medio ponderado por plazas-tiempo: `100 × Σp∫H O_p(t)dt / Σp∫H C_p(t)dt` con cobertura completa y denominador positivo.
- Porcentaje máximo: máximo de la razón simultánea correspondiente; no mezclar máximos/denominadores de instantes diferentes.
- Con capacidad variable esta media no es necesariamente igual a la media temporal de porcentajes. La etiqueta y fórmula versionada deben expresar la opción elegida.

**Sin capacidad histórica completa:** se pueden ofrecer vehículos promedio/máximo si los eventos son confiables; porcentaje por defecto `UNAVAILABLE`. Si se habilita vista parcial, marcar `PARTIAL`, informar cobertura temporal y espacial y no usarla para rankings completos. No imputar capacidad actual ni interpolar snapshots sin evidencia.

### Evidencia disponible y brecha

Las fuentes locales prueban capacidades actuales y snapshots puntuales de cierres. No se identificó una serie de vigencias completa que autorice conocer capacidad por parking en cada instante histórico. Tener `updated_at`, tarifas con vigencias o snapshots no resuelve esa brecha. Diseñar historial de capacidad requiere autorización posterior; esta etapa no crea tablas ni migraciones.

### Reglas de calidad a aprobar

- OPEN sin cierre: observado hasta asOf; alertar edades anómalas, no asumir permanencia física indefinida.
- PAID con salida anterior a entrada, fechas inválidas o IDs repetidos: excluir del cálculo afectado y reportar conteo/motivo; no corregir filas automáticamente.
- CANCELLED: falta evento temporal de anulación utilizable para reconstruir toda su historia. Propuesta excluir del conjunto de intervalos validados y advertir cobertura/impacto; no afirmar precisión física completa. La regla de conteo de ingresos puede seguir siendo distinta.
- Solapamientos de la misma patente: no fusionar automáticamente; reportar conflicto y decidir si son visitas duplicadas. Una patente puede tener visitas legítimas separadas.
- Estado actual no demuestra cuál era el estado en la fecha histórica; borrados/correcciones retroactivas necesitan trazabilidad.
- Cambios de hora Chile: generar buckets en UTC y etiquetar fecha/hora local + offset. Hora repetida conserva dos intervalos distintos; hora inexistente no se rellena con0. Heatmap agregado pondera tiempo real.
- Rangos futuros: hechos hasta asOf; pronóstico ocupa módulo/estilo separado y no rellena silenciosamente el histórico.

### Ejemplos de aceptación de diseño (no algoritmo implementado)

| Caso controlado | Resultado esperado |
|---|---|
| H09–10, visita A08:30–09:30 y B09:15–10:00, C=10 | Vehículo-horas1.25; media1.25; máximo2; porcentaje medio12.5%; máximo20%. |
| A09–09:30 y B09:30–10, C=10 | Media1, máximo1, porcentaje10%; dos ingresos no implican20% de ocupación. |
| O=5 constante; C=10 primera media hora y20 segunda | Razón de integrales33.33%; media temporal de porcentajes37.5%. Elegir y rotular, no confundir ambas. |
| Capacidad conocida solo media hora | Porcentaje completo no disponible; cobertura50% y resultado parcial solo si se habilita explícitamente. |
| Salida exactamente a10:00 | Cuenta en bucket09–10, no permanece en10–11; conteo de salida pertenece al intervalo que contiene10:00. |

## 5. Hallazgos de auditoría y límites de reutilización

Los tests de caracterización afirman el comportamiento observado para detectar cambios; **pasar esos tests no aprueba esos defectos**.

| ID | Evidencia | Impacto / acción propuesta sin ejecutar |
|---|---|---|
| SR-01 | `buildDailyMovementsSeries` y `buildDailyRevenueSeries` paran en400 días; reproducido con rango2024–2025 | Total/multiaño no está resuelto. Definir granularidad/límites explícitos; nunca truncar sin aviso. |
| SR-02 | `validateDashboardFilters` acepta2026-02-30 por regex; reproducido | M3 necesita fechas reales, máximos y rangos futuros validados. |
| SR-03 | `resolvePeriodBounds` On Street usa-04:00; octubre2026 comienza a01:00 Chile; reproducido | Períodos no seguros para DST. TZ IANA y tests de cambios de hora antes de reutilizar. |
| SR-04 | `resolveQueryParkingIds` deja todos los candidatos de empresa aunque selecciona un parking; orquestador pasa candidatos sin parkingId a resúmenes; reproducido por queries capturadas | KPI operativo/financiero puede incluir otros parkings autorizados, mientras serie/capacidad usan otro recorte. Inconsistencia de filtro, no prueba de fuga entre tenants. Corregir solo tras diff/autorización. |
| SR-05 | `getRevenueOverview` usa candidateParkings para diferencias de caja, no IDs seleccionados; reproducido | Resumen puede mezclar cierres de otros parkings del mismo scope. |
| SR-06 | Consulta de diferencias selecciona solo cash_difference en ventana UTC±1 día, sin recorte exacto por actual_close_at; inspección de código | Riesgo de incluir días vecinos; requiere fixture de límites y campo de fecha para recorte. No corregido. |
| SR-07 | `fetchAllMatchingRows`: chunks1000, rechazo al llegar a20000; resumen diario de operaciones y open counts tienen consultas no paginadas | No garantizar Total, todos los años ni altos volúmenes con métodos existentes. Medir PostgREST/config en QA; no asumir límite remoto exacto. |
| SR-08 | SQL base permite CANCELLED sin prohibir inequívocamente exit_at; comentario de serie afirma que CANCELLED nunca tiene salida | Comentario no es constraint. Auditar migraciones posteriores y datos QA; acordar exclusiones canónicas. |
| SR-09 | No se encontró historial continuo de capacidad; solo actual/snapshots | M5 no puede declarar porcentaje histórico fiable por ahora. |
| SR-10 | computeKpis On Street suma amount_paid de sesiones mientras hay funciones financieras por COMMITTED | No considerar ambas definiciones equivalentes; revisar tiempo del pago y extensiones antes de consolidar. |

## 6. UX propuesta, aislada

Wireframe: [mockup estático](../../prototipos/smart-reports/etapa-1/mockup.html). No solicita datos, no calcula cifras ni guarda; botones deshabilitados y avisos explícitos. No tiene DnD real.

- Panel izquierdo con búsqueda y biblioteca: KPI, líneas, barras, tabla, torta, heatmap, ocupación hora/día. Etiquetas «Disponible tras integración» / «Requiere histórico».
- Barra superior con empresa/parkings autorizados, Mes/Año/Total/rango, comparaciones y zona horaria visible.
- Área central de soltar con placeholders y alternativa «Agregar» para táctil/teclado. En Etapa2 habrá foco, flechas/reordenamiento, anuncios accesibles, resize y deshacer.
- Panel de configuración seleccionado: título, métrica allowlist, dimensión, agregación permitida, unidad, estilo y herencia de filtros. No SQL/HTML libre.
- Cada bloque presenta fuente, rango efectivo, asOf, calidad; «Ahora» no cambia con calendario. No mezclar hora punta de ocupación con ingresos vehiculares.
- Guardar/exportar/compartir visibles como futuras capacidades, sin persistencia ficticia. Responsive: paneles apilados y lista accesible en móvil.
- Vacíos diferenciados: sin datos, capacidad desconocida, denegado, rango excesivo y error. Nunca convertir todos a0.

V2.1 no localizado en adjuntos/ubicaciones examinadas: comparación visual exacta pendiente, no bloquea proponer estructura. No se declara UX final aprobada.

## 7. Backlog priorizado y criterios

| Prioridad | Tarea | Módulo / aceptación |
|---|---|---|
| P0 | Aprobar diccionario, anulación, corte financiero, ocupación media/máxima y regla peak | M1: decisiones registradas, no supuestas. |
| P0 | Aportar V2.1 y revisar wireframe | M1: diseño contrastado y aprobado. |
| P0 | Plan de datos QA sin acceso productivo | M1/M4: esquema versionado, fixtures representativos, volumen/cobertura y capacidad histórica; permiso para inspección adicional si se necesita. |
| P0 | Preparar diff de SR-04/05/06 y tests de filtros | Cambios en código existente requieren autorización previa; misma fuente/filtros en KPI/tabla. |
| P1 | Editor desacoplado | M2: DnD puntero/teclado, reorder/resize, editar, deshacer, validación layout. |
| P1 | Contratos de fechas con DST y Total | M3: límites, rango exacto, comparación con anterior/año previo, año bisiesto y división por0. |
| P1 | Allowlist/adapter seguro y presupuestos | M4: permisos/scopes negativos, rangos/filas/tiempo, caché por tenant/rol/formula/filtro y rechazo explícito. |
| P1 | Reconstrucción y capacidad histórica | M5: fixtures §4, series, cobertura y muestreo; no construir porcentajes con denominador inventado. |
| P2 | Persistencia, distribución y exportaciones | M6: versiones, scope, CSV injection, cuotas/auditoría; emails simulados hasta permiso. |
| P2 | Datos suficientes y baseline | M7: backtesting temporal, MAE/incertidumbre y condición Sin pronóstico confiable. |
| P2 | Piloto controlado y rollback | M8: E2E, accesibilidad, rendimiento, paridad y aprobación explícita. |

## 8. Pruebas y evidencia real

Ejecución2026-10-28, solo Node local y dobles de datos:

```powershell
node --test --experimental-test-isolation=none prototipos/smart-reports/etapa-1/auditoria.test.mjs
node --test --experimental-test-isolation=none src/lib/offStreetDashboardCore.test.mjs src/lib/offStreetDashboardService.test.mjs src/lib/offStreetRevenueCore.test.mjs src/lib/offStreetRevenueService.test.mjs src/lib/offStreetReportsCore.test.mjs src/lib/offStreetReportsService.test.mjs src/lib/offStreetOperationsCore.test.mjs src/lib/auth/operationAuthorizationCore.test.mjs src/lib/onStreetDashboardCore.test.mjs src/lib/pos/activityReportCore.test.mjs
```

Resultados: **8/8 diagnósticos** y **190/190 pruebas existentes** correctos. Los intentos de suite con aislamiento por procesos encontraron `spawn EPERM` del entorno antes de ejecutar tests (también al repetir la captura de diagnósticos); el modo sin subprocesos ya usado por el proyecto terminó correctamente en ambos conjuntos. Warning Node por tipos de módulo preexistente; no se modificó package.json.

Evidencia TAP en el [registro de solicitud](../solicitudes/SOL-2026-10-28-001/README.md). No se ejecutó integración remota, E2E del nuevo editor, test de rendimiento ni algoritmo de ocupación histórica. Los ejemplos §4 son criterios de diseño, no resultados de código construido. M2–M8 permanecen0.

## 9. Puerta de revisión

Etapa1 preparada para revisión, **no aprobada ni integrada**. La continuación incorpora V2.1 y comprueba el esquema/datos QA con insuficiencia histórica documentada. Requiere aprobar fórmulas/reglas/diseño y acordar cómo obtener capacidad/cobertura faltante sin estimaciones presentadas como hechos. Solo entonces podrá autorizarse avanzar según plan. Cualquier cambio a fuentes existentes se presentará como diff antes de ejecutar integración.
