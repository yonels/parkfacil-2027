# Smart Reports — catálogo de KPIs para aprobación

**Actualización:** 2026-10-28. **Estado:** propuesta, no aprobada ni integrada.  
Referencia: [V2.1 suministrada](../../prototipos/smart-reports/referencia-v2.1/ParkFacil_V21.html), 19 identificadores de demostración. Esta propuesta separa métricas y visualizaciones; una curva, torta o heatmap no crea por sí misma un indicador financiero nuevo.

**Ampliación acordada:** plataforma única Off Street + On Street. Los19 indicadores originales se conservan íntegros y quedan pendientes de aprobación definitiva; [anexo On Street](CATALOGO_ON_STREET_PROPUESTO.md) y [contrato de ocupación](ALCANCE_MODALIDADES_Y_OCUPACION.md) amplían fuentes y limitaciones sin duplicar familias comunes. No hay aprobación ni desarrollo funcional On Street.

## Convenciones comunes

**F:** empresa/estacionamientos resueltos por el servidor a partir de identidad y `REPORTS_READ`, dominio Off Street/QR On Street explícito y período civil Chile convertido a intervalo UTC `[desde, hasta)`. Operador y medio de pago solo cuando existan en la fuente. La granularidad no modifica el total ni amplía permisos. No promediar promedios sin ponderación.

**ACTUAL:** independiente del calendario histórico, con `asOf`. **HISTÓRICO:** rango observado y cobertura. **PRONÓSTICO:** horizonte futuro explícito, no hechos. Todos devuelven fuente, filtros efectivos, fórmula versionada, unidad, cobertura y estado; cero real no equivale a capacidad desconocida, fallo o permiso denegado.

Los nombres `off.*.v1` de esta propuesta son contratos candidatos, no endpoints existentes. Preservar las fórmulas legadas en sus rutas actuales; cualquier cambio requiere diff/aprobación. La consulta QA encontró estados `UNPAID_PENDING` y `UNPAID_EXIT`, además de OPEN/PAID/CANCELLED: no puede mantenerse sin revisión la suposición de tres estados únicos.

**Permiso de cada una de las19 filas:** todas heredan `REPORTS_READ` + identidad/scope autenticado de empresa y estacionamientos Off Street; dimensiones de operador requieren además política de acceso a datos personales correspondiente. Permiso insuficiente→«Sin autorización», sin datos. Estos permisos son parte de cada contrato aunque no se repitan en todas las celdas. No se amplían roles actuales.

**Insuficiencia en cada indicador:** `UNAVAILABLE`/`INSUFFICIENT_EVIDENCE` se presenta exactamente como **«No calculable»**, con valor nulo y motivo. La ocupación actual/histórica de esta tabla es **inferida registral** salvo evidencia física comprobada explícita; sesiones pagadas son otra categoría. No convertir falta de capacidad/presencia a0 ni usar el prototipo para suplirla. Los ejemplos de vehículos/porcentajes de la definición matemática son casos ficticios de aceptación, no datos reales.

## Matriz de los 19 indicadores de V2.1

| ID V2.1 → ID propuesto | Nombre / definición | Fórmula propuesta | Fuente de datos identificada | Filtros | Granularidad temporal | Limitaciones y decisión pendiente |
|---|---|---|---|---|---|---|
| `revenue` → `off.revenue.v1` | Recaudación bruta Off Street de estadías pagadas | Σ`total_amount` de IDs PAID; incluir pagos válidos de monto0 | `parking_stays`, `offStreetRevenueService/Core`; fecha `exit_at` según convención vigente | F; medio CASH/CARD y operador de salida | Día/mes/año/rango; evento de salida como proxy actual | No es necesariamente hora de autorización bancaria; no sumar cierres ni On Street encima. CLP para fuentes confirmadas; no mezclar monedas. |
| `entries` → `off.entries.v1` | Ingresos vehiculares registrados, no dinero | COUNT DISTINCT `id` por `entry_at` | `parking_stays`, `buildDailyMovementsSeries` | F; origen/operador entrada si se habilita | Evento, hora, día, mes | Registro después CANCELLED sigue contando como en serie actual; no prueba presencia física. Exponer anulaciones. |
| `exits` → `off.recorded_exits.v1` | Salidas registradas independientemente del cobro | COUNT DISTINCT IDs con `exit_at` y estado PAID o UNPAID_EXIT; otros casos a calidad | `parking_stays.exit_at,status`; QA valida UNPAID_EXIT con salida | F; operador/salida/origen si soportado | Evento/hora/día/mes | **Difiere del resumen legado que cuenta PAID.** Aprobar semántica y no sustituir silenciosamente. CANCELLED con salida no es salida validada. |
| `occupancy` → `off.occupancy_now_pct.v1` | Porcentaje actual de vehículos registrados sin salida | `100 × ΣO_p(asOf)/ΣC_p(asOf)`; proponer O con OPEN y UNPAID_PENDING sin salida | `parking_stays`; niveles/zonas activos según prioridad vigente | F sin calendario; agregación solo con capacidad conocida de todos | Instantánea asOf | Fuente legada cuenta solo OPEN; nuevo estado requiere decisión. Capacidad desconocida→UNAVAILABLE; >100% se conserva con alerta; no es medición por sensor. |
| `payments` → `off.payment_mix.v1` | Distribución de recaudación por medio | Σimporte por CASH / CARD-CREDIT / CARD-DEBIT / CARD-UNKNOWN; porcentaje = importe grupo/total | `parking_stays.payment_method,payment_card_type,total_amount` | F más grupos de medio | Día/mes/rango | QA tiene subtipo para8 pagos CARD, pero no prueba cobertura global. Nunca inferir subtipo de texto, selección del operador ni PAN; total0→sin base porcentual. |
| `ticket` → `off.avg_ticket.v1` | Ticket promedio por estadía pagada | Σimporte PAID / COUNT IDs PAID, redondear al presentar | Mismo conjunto de `off.revenue` | Exactamente F y filtros financieros del numerador | Día/mes/año/rango | Incluir monto0: QA tiene4 casos. Si count0, etiqueta «Sin pagos»; canónico actual devuelve0. No media de medias. |
| `shifts` → `off.open_shifts_now.v1` | Cantidad de turnos abiertos actualmente | COUNT IDs con OPEN o CLOSING | `operator_shifts` y `countOpenShifts` | F actual; operador opcional | Instantánea asOf | Independiente del período, no cantidad de cierres. Un turno cruzando medianoche sigue siendo uno. |
| `difference` → `off.cash_difference.v1` | Diferencia declarada de caja de cierres del período | Σ`cash_difference` de cierres únicos confirmados; respetar signo del origen | `shift_closures`, fecha `actual_close_at` | F; operador de cierre cuando exista | Cierre/día/mes/rango | SR-05/06 pendientes: selección y fechas no uniformes. NULL desconocido no0. No recalcular cierre ni sumar ingresos otra vez. |
| `closures` → `off.closure_count.v1` | Cierres de caja confirmados | COUNT DISTINCT `shift_closures.id` confirmados por `actual_close_at` | `shift_closures.closure_status,actual_close_at`, `searchRevenueClosures` | F y operador cierre | Evento/día/mes/rango | No inferir cierre por falta de turno abierto. Confirmar política si hay cierres anulados/corregidos/versionados. |
| `transactions` → `off.paid_stay_count.v1` | Estadías con pago confirmado | COUNT DISTINCT `parking_stays.id` PAID por `exit_at` | Fuente canónica de recaudación | F y mismos filtros de `off.revenue` | Evento/día/mes/rango | No equivale a todos los intentos bancarios ni a ingresos vehiculares; texto UI debe indicarlo. |
| `capacity` → `off.available_spaces_now.v1` | Plazas registralmente disponibles actuales | `max(C_p − O_p,0)` por parking; sumar solo cobertura completa | Capacidad actual de niveles/zonas; conteo actual validado | F actual, sin calendario | Instantánea asOf | El ID demo se llama capacity pero su etiqueta es «Plazas disponibles». Capacidad total debe ser dimensión/indicador separado; no inventar disponibles si un parking carece de capacidad. |
| `cash` → `off.cash_revenue.v1` | Recaudación en efectivo | Σ`total_amount` PAID y CASH | `parking_stays` | F; operador financiero | Día/mes/rango por exit_at | Parte del total, no sumar total+efectivo. No equivale a efectivo declarado en cierre. |
| `credit` → `off.credit_revenue.v1` | Recaudación con subtipo crédito comprobado | Σ`total_amount` PAID, CARD, `payment_card_type='CREDIT'` | `parking_stays` (campo confirmado en QA) | F; operador financiero | Día/mes/rango por exit_at | El agregado actual CASH/CARD no expone subtipo; requiere adaptador aprobado. Faltantes→CARD-UNKNOWN, no crédito por defecto. |
| `debit` → `off.debit_revenue.v1` | Recaudación con subtipo débito comprobado | Igual anterior con DEBIT | `parking_stays` | F; operador financiero | Día/mes/rango por exit_at | Igual limitación de cobertura; nunca usar `card_type_selected` como prueba de tipo autorizado sin validar contrato. |
| `hourly` → `off.occupancy_hour_avg.v1` | Ocupación histórica media por franja horaria | `100 × Σ∫O_p(t)dt / Σ∫C_p(t)dt` sobre buckets completos | Intervalos entry/exit y **capacidad temporal válida**, aún no disponible | F histórico; no medio de pago para «ocupación total» | Bucket real UTC con etiqueta hora local+offset; agrupación hora del día ponderada por duración | No ingresos/capacidad; no rellenar C histórico con C actual. QA permite ensayo de intervalos, no porcentajes confiables. |
| `daily` → `off.occupancy_day_avg.v1` | Ocupación diaria o por día de semana | Misma razón de integrales agregada por día; día de semana ponderado por plazas-tiempo | Igual `hourly` | F histórico | Día civil de23/24/25h; dimensión lunes–domingo opcional | No dividir siempre entre24 ni media simple de medias horarias. Mostrar ventana/cobertura; no extrapolar ceros de días sin eventos. |
| `peak` → `off.peak_hour.v1` | Hora punta histórica observada, no predictiva | Argmax de ocupación media ponderada por franja entre horas elegibles; empates explícitos | Serie `hourly` validada | F histórico; horario operativo solo si existe fuente confiable | Ranking hora local; top1 principal y top3 opcional | Demo dice «estimada». Propuesta renombrar «observada» si es histórico; cobertura insuficiente→UNAVAILABLE. Umbral de cobertura/horarios a aprobar. |
| `forecast` → `off.forecast_occupancy.v1` | Pronóstico experimental de ocupación futura | Baseline estacional entrenado solo hasta corte; no fórmula sintética de demo; modelo elegido por backtesting temporal | Histórico confiable validado + capacidad, calendario, cambios operativos | F; corte entrenamiento, horizonte, parking/modelo | Hora futura; agregar solo mediante contrato explícito | M7=0. Requiere MAE/intervalos calibrados y suficiencia; QA actual insuficiente. Opción «Sin pronóstico confiable». No usar bandas ilustrativas como confianza real. |
| `heatmap` → `off.occupancy_heatmap.v1` | Matriz histórica día de semana×hora | Agrupar mismas integrales de hourly por celda, sin cambiar denominador | Igual `hourly`; calidad por celda | F histórico | Día de semana×hora, con duración UTC real | V2.1 dibuja06–23h; propuesta permitir00–23h o horario documentado. Vacío≠0; hora DST repetida se pondera, no se pierde. |

## Métricas auxiliares necesarias

- `off.capacity_now`: capacidad total actual conocida, no confundir con disponibles.
- `off.registered_inside_now`: numerador actual de ocupación con política de estados aprobada.
- `off.occupancy_hour_max`: máximo de O(t), y máximo de O(t)/C(t) en el mismo instante, rotulado diferente a media.
- `data.quality`: filas inválidas/abiertas antiguas, cobertura espacial/temporal, sin capacidad, intervalos observados/censurados.
- Recaudación QR On Street debe tener ID separado, basado en COMMITTED/committed_at y moneda, inicial/extensión sin duplicar. No sumar `session.amount_paid` a cada período ni a total Off Street. La muestra QA QR está vacía.

Estos auxiliares no cambian el inventario de19 métricas de referencia; no están implementados en el nuevo editor.

## Decisiones a aprobar

1. Usar porcentaje medio como **razón de integrales**, ponderada por plazas-tiempo; no media simple de porcentajes. Mantener máximo como indicador aparte.
2. Registrar salidas impagas y presencia pendiente de pago con métricas nuevas/versionadas, conservando reportes legados hasta integración aprobada.
3. Conservar evento financiero Off Street por exit_at para paridad inicial; diseñar separado lo que use autorización/registro bancario si difiere.
4. No publicar porcentajes históricos sin capacidad temporal; ofrecer vehículos registrados medios/máximos con advertencias cuando el resto del dato lo permita.
5. Mantener categoría CARD-UNKNOWN y explícitamente «Sin datos/Sin base»; ninguna distribución inventada.
6. Usar hora punta observada, top1/empates, y no pronóstico salvo suficiencia y validación M7.

Ninguna decisión de esta lista se considera aprobada por la autorización para continuar análisis.
