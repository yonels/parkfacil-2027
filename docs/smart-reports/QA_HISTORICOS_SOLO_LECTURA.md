# Smart Reports — suficiencia de datos históricos en QA

**Fecha:** 2026-10-28. **Estado:** diagnóstico realizado, datos insuficientes para histórico confiable completo.  
**Destino autorizado:** `parkfacil_2027_qa`, ref `ohzksqazcgtdeuowqagy`, identificado mediante listado de proyectos y corroborado con registros QA previos. No se consultaron los proyectos de producción. Se usó el conector Supabase ya autorizado; no se crearon credenciales ni se leyeron secretos.

## Método y alcance

- Consultas únicamente SELECT sobre `information_schema`, catálogo de constraints y agregados de tablas relevantes. No RPC de aplicación, DDL/DML, migración, función que escriba ni cambios de configuración.
- Sin patentes, teléfonos, nombres, tokens, referencias de cobro ni IDs de clientes en resultados guardados. La agrupación por parking usa ordinales anónimos.
- Evidencia de corte principal: **2026-10-28T13:41:45Z** (10:41:45 America/Santiago). Son lecturas sucesivas, no un snapshot transaccional único; no asumir congelamiento si otros usuarios escriben en QA.
- Los SQL agregados y JSON están en [la solicitud](../solicitudes/SOL-2026-10-28-001/README.md): `qa-columnas.json`, `qa-resumen.json`, `qa-calidad.json`, `qa-snapshots.json`, `qa-dst.json`, `qa-consultas.sql`.
- La conexión técnica permite lectura administrativa; **no** equivale a probar las políticas RLS con usuarios de distintos roles. Esas pruebas negativas siguen pendientes para M4/M8.

## Resultados comprobados

| Observación | Resultado QA | Interpretación limitada |
|---|---:|---|
| Estadías | 87 en3 estacionamientos Off Street | Muestra útil de casos, no evidencia de cobertura operacional continua. |
| Estados | PAID60, OPEN11, CANCELLED14, UNPAID_PENDING1, UNPAID_EXIT1 | El catálogo local de tres estados está incompleto frente a QA. |
| Entradas / salidas | Primera entrada2026-08-11; última2026-10-24 UTC. Salidas2026-09-28 a2026-10-21 UTC | Fechas extremas no demuestran captura completa del intervalo. |
| Días civiles Chile con eventos | 17 días con entradas;14 con salidas | No son porcentaje de completitud. Días sin eventos pueden ser inactividad o ausencia de captura. |
| Filas con salida | 61 | PAID60 + UNPAID_EXIT1; no equiparar todo egreso a dinero. |
| Calidad temporal básica | 0 entradas nulas;0 salidas previas a entrada;0 PAID sin salida;0 OPEN con salida;0 entradas futuras | Consistencia de esos campos en la muestra, no certificación física. |
| OPEN antiguos | 7 con más de7 días | Censura/sospecha a investigar, no7 errores probados. No cerrarlos automáticamente. |
| Solapamientos por misma patente/parking | 0 pares bajo criterio de intervalos no CANCELLED y abiertas hasta now | No prueba ausencia de duplicados fuera de la muestra/canal. No se extrajeron patentes. |
| Estadías con duración cerrada mayor a24h | 9 | Deben probarse arrastre, estadías largas y límites diarios. |
| Pagos PAID | 60;4 de importe0;0 importes nulos;1 sin payment_shift_id | Ticket promedio debe incluir cero; agregación por turno requiere tratar vínculo faltante. |
| Pagos CARD | 8;0 sin payment_card_type | Subtipos disponibles en esta muestra. No prueba disponibilidad universal en producción ni en todos los canales. |
| Capacidad configurada | 6 niveles y6 zonas activos, sin capacidad positiva faltante en esos objetos | Es configuración actual, no vigencia histórica. |
| Capacidad actual en parkings con estadías | ordinal1:320; ordinal2:180; ordinal3:0 | El tercero carece de capacidad resoluble; no se le asigna valor estimado. |
| Cierres / snapshots | 8 cierres,2 parkings, fechas2026-09-28 a2026-10-18; los8 tienen capacity_snapshot NULL y ninguno0 | No reconstruyen capacidad histórica. La consulta adicional distingue nulo de cero; no convertir falta de capacidad a0. |
| Historial de capacidad | No se identificó tabla/campos de vigencias o auditoría específicos en catálogo examinado | Actualizar `updated_at` no permite recuperar valores anteriores. No descarta otra fuente externa que aún no se haya aportado. |
| QR On Street / transacciones Webpay | 0 sesiones QR y0 payment_transactions | No se puede validar histórico financiero QR ni comparación cruzada con esta muestra. |

### Distribución anónima relevante

| Parking QA (ordinal, no ID) | Estadías | Días con entradas | OPEN >7d | Capacidad actual |
|---|---:|---:|---:|---:|
| 1 | 68 | 10 | 0 | 320 |
| 2 | 18 | 8 | 6 | 180 |
| 3 | 1 | 1 | 1 | Desconocida |

No aplicar320/180 retroactivamente: no sabemos desde qué fecha esas capacidades eran válidas.

## Conclusión por objetivo

| Objetivo | ¿La muestra basta? | Falta antes de considerarlo confiable |
|---|---|---|
| Ensayar entradas/salidas, estados y cruces de hora | Sí, con alcance QA y fixtures adicionales | Acordar semántica UNPAID y anulaciones; confirmar cobertura de captura. |
| Reconstruir intervalos registrales de las filas disponibles | Parcial | Tratar censura/abiertas antiguas, anulaciones, estado mutado y trazabilidad de correcciones. No afirmar ocupación física. |
| Porcentajes históricos por hora/día | **No** | Capacidad por vigencias verificadas y cobertura temporal/espacial válida. Snapshots actuales no la sustituyen. |
| Ocupación actual | Parcial | Política de presencia OPEN/UNPAID_PENDING; parking sin capacidad; actualidad de estados. |
| Recaudación y ticket PAID Off Street | Ensayo parcial posible | Paridad por filtro/rango, vínculo de turno faltante y corte financiero. |
| Consolidación On Street / todos los años | **No** | Datos por canales, historia suficiente y motor sin límites silenciosos. |
| Peak/heatmap fiables de producción | **No** | Histórico validado antes de clasificar patrones; no usar demo. |
| Predicción validada | **No** | Más historia, representatividad, completitud y backtesting; no hay modelo entrenado en esta etapa. |

La falta de capacidad temporal y de evidencia de cobertura **no se resuelve estimándolas y presentándolas como hechos**. Los gráficos que se construyan como ensayo deberán decir «Muestra QA / datos de prueba», con cobertura y limitaciones.

## Validación puntual de la solución de calendario

Un SELECT de constantes usando PostgreSQL `AT TIME ZONE 'America/Santiago'` confirmó los límites `[inicio del día, inicio del siguiente día)`:

| Día civil | Inicio UTC | Fin exclusivo UTC | Duración real |
|---|---|---|---:|
| 2026-04-04 | 2026-04-04 03:00Z | 2026-04-05 04:00Z | 25h |
| 2026-09-06 | 2026-09-06 04:00Z | 2026-09-07 03:00Z | 23h |
| 2026-10-01 | 2026-10-01 03:00Z | 2026-10-02 03:00Z | 24h |

Esto valida la conversión de **esos casos de referencia** en el motor QA. No corrige `resolvePeriodBounds`, no certifica un helper nuevo ni los filtros actuales. Sus pruebas de caracterización siguen mostrando el desplazamiento fijo incorrecto.

## Pendientes sin ejecutar

Solicitar fuente histórica de capacidad y políticas de estados; acordar ventanas/parkings con captura continua demostrable; preparar fixtures locales/QA solo con autorización adicional de escritura si fueran necesarios; validar RLS por roles, consultas y volumen en M4/M8. No generar datos, cerrar OPEN ni reparar QA durante esta revisión.
