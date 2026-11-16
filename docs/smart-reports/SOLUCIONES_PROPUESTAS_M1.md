# Smart Reports — soluciones propuestas sin cambios productivos

**Actualización:** 2026-10-28. **Estado:** diseño técnico, pendiente de aprobación/implementación. No se preparó ni aplicó patch a `src/` o migraciones. Los ejemplos son contratos/pseudocódigo, no correcciones desplegadas.

**Ampliación Off/On:** conservar todos los hallazgos de esta página y aplicar el [contrato de ocupación común](ALCANCE_MODALIDADES_Y_OCUPACION.md). Sesiones pagadas no acreditan presencia física; insuficiencia de capacidad/evidencia se rotula «No calculable», sin porcentaje inventado. La preparación M2 local está autorizada; On Street funcional y cambios productivos no lo están.

## 1. Series de 400 días, Total y volumen

**Problema confirmado:** las funciones de serie paran en400 iteraciones. La lectura por chunks tiene otro límite de20000 filas; son problemas diferentes. Quitar un guard sin presupuesto no soluciona memoria/tiempo ni cobertura.

### Propuesta

1. Separar extracción y agregación de la representación de períodos. Calcular el total sobre el mismo conjunto autorizado completo que respalda la serie, no la página visible.
2. Motor allowlist con agregación en servidor por intervalo real/día/mes/año y parámetros enlazados. Ningún SQL libre del cliente. No ampliar el permiso REPORTS_READ a otros roles.
3. Contrato `requestedGranularity`, `effectiveGranularity`, `complete`, `coverage`, `range`, `rowCount` y `limits`. Si la granularidad excede presupuesto, rechazar con alternativa explícita; cambiar día→mes solo tras elección visible, sin cambiar el total.
4. «Total» significa historia disponible y validada de ese scope, con primera/última fecha y cobertura; no «todos los años desde siempre». Para días sin eventos, cero solo si captura completa acreditada; de otro modo desconocido.
5. Bins presupuestados y paginación/cursor para detalle. No truncar400 ni1000 silenciosamente. Para extraer eventos usar orden estable `(event_at,id)` y cursor, o snapshot consistente; un ORDER solo por fecha puede cambiar filas entre páginas empatadas.
6. Caché particionada por tenant, permisos, versión de fórmula, conjunto de IDs/rango y corte de datos. Ningún agregado reutilizable entre empresas por coincidencia de fechas.
7. Proponer inicialmente presupuesto de resolución/tiempo a medir en QA, no inventar rendimiento ni afirmar «Total» validado con87 filas. Series anuales extensas pueden requerir resúmenes/materialización futura autorizada; no crear tablas/cron ahora.

### Validación futura requerida

- Rango de730 días, años bisiestos y múltiples años: tamaño esperado o rechazo explícito; suma de bins coincide con total.
- Fixtures999/1000/1001,19999/20000/20001 filas, eventos con misma fecha, concurrencia y cambio de cursor.
- Igualdad por filtros del total/detalle/exportación; sin resultados parciales como completos.
- Benchmark de CPU/memoria/tiempo/costo y cuota por usuario en QA autorizado. **No ejecutado**.

## 2. Fechas reales y DST Chile

**Problema confirmado:** regex acepta fechas inexistentes; On Street construye algunos límites con-04:00 fijo, mientras otros dependen del TZ del proceso.

### Propuesta

- Único contrato de calendario: fechas civiles validadas de verdad y TZ `America/Santiago`. Parseo estricto con round-trip de año/mes/día y reglas bisiestas; rechazar rangos invertidos, inválidos o excesivos.
- Resolver `[inicio del día local inicial, inicio del día posterior al final)` con biblioteca IANA o PostgreSQL timezone. No sumar86400000ms ni usar23:59:59.999 fijo como definición universal.
- Convertir cada evento a un instante UTC; pertenencia a intervalo con `>=start AND <end`. Usar esta condición una sola vez para todos los agregados de ese reporte.
- Bins históricos conservan offset e ID UTC; en hora repetida existen dos bins distintos. Día civil puede tener23/24/25h. Agregación por hora de semana pondera segundos/plazas-tiempo reales.
- Comparación anterior: definir ventana civil equivalente y marcar períodos parciales; comparación interanual con política explícita de29feb. Propuesta28feb cuando el año destino no tenga29, sujeta a aprobación.
- Variación `(actual−anterior)/anterior`: si anterior0, devolver sin base porcentual; no infinito ni incremento0 ficticio. Separar ahora de histórico y de pronóstico.

### Qué se validó realmente

SELECT de constantes en QA validó25h para2026-04-04,23h para2026-09-06 y24h para2026-10-01 al usar inicio local/siguiente inicio local. Véase [evidencia QA](QA_HISTORICOS_SOLO_LECTURA.md). No se implementó helper ni se cambió `resolvePeriodBounds`; su defecto continúa reproducible. Tests de filtros/calendario completo siguen pendientes de M3.

## 3. Unificar scope y filtros

**Problemas confirmados:** un helper devuelve `candidateParkings` amplio y `queryParkingIds` acotado. Algunos consumidores usan candidatos y pierden parkingId; diferencias de caja usan además ventana UTC amplia sin recorte exacto de fecha.

### Contrato propuesto

```text
contexto = autenticarYExigir(REPORTS_READ)
autorizados = resolverParkingsDelContexto(contexto)
seleccion = interseccion(autorizados, empresaSolicitada, parkingsSolicitados, dominio)
si seleccion solicitada no autorizada: rechazar sin revelar existencia
filtros = validarYNormalizar(seleccion, calendario, dimensionesAllowlist)
para cada metrica: ejecutar(filtros.idsExactos, filtros.intervaloUTC, asOf, formulaVersion)
responder filtrosEfectivos + calidad, nunca candidatosAmplios como datos seleccionados
```

- Usar objeto inmutable normalizado de IDs exactos en KPI, numerador/denominador de ocupación, series, cierres, detalle y exportaciones. Las opciones del selector pueden listar candidatos autorizados, pero no alimentan la consulta si el usuario escogió uno.
- Comprobar empresa+parking conjuntamente; no permitir que un filtro ignore al otro. No ampliar un conjunto vacío o inválido a «todos».
- Diferencias de caja requieren `actual_close_at` para recorte exacto si se conserva estrategia de ventana amplia. Mejor filtrar rango UTC correcto en origen una vez.
- Distinguir métricas en vivo: usan la misma selección espacial y `asOf`, pero no el rango histórico. Mostrarlo en UI y metadatos, no simular que el calendario las afecta.
- Adapter financiero reutiliza definiciones canónicas y compara totales con reportes actuales; no adoptar bugs de scope como definición correcta. Cualquier cambio legado requiere patch/revisión autorizados fuera de esta etapa.

### Matriz futura de aceptación

TenantA/parkingA1 yA2; tenantB/parkingB1. SelecciónA1 no incluyeA2 niB1 en ningún bloque. UsuarioA que solicitaB1 recibe rechazo sin datos ni metadatos de existencia. Filtro empresaB conA1 incompatible no devuelve todos. Totales, caja y capacidad tienen mismo scope. Eventos exactamente en borde inicial/final y vecinos UTC se incluyen una vez o se excluyen según intervalo. Pruebas negativas RLS con identidades reales de QA **no ejecutadas** por la inspección administrativa de catálogos.

## 4. Reconstrucción histórica y estados de QA

Contrato candidato de intervalos:

```text
PAID / UNPAID_EXIT con exit_at válido -> [entry_at, exit_at)
OPEN / UNPAID_PENDING sin salida -> [entry_at, asOf), censurado
CANCELLED -> fuera del conjunto validado; informar exclusión y límites
otros / contradicciones -> error de calidad, no cero ni reparación automática
```

La reconstrucción necesita filas con entrada anterior al rango que continúen dentro, no solo eventos del período. Un barrido de eventos calcula vehículos simultáneos; cambios de capacidad son eventos adicionales. Snapshot actual no demuestra estado histórico ni captura de sensores. Faltan vigencias de capacidad y evidencia de captura continua; por defecto porcentaje histórico **UNAVAILABLE**. Los conteos de vehículos registrados pueden mostrarse como ensayo parcial con calidad, nunca como ocupación física real completa.

QA comprobó UNPAID_EXIT con salida y UNPAID_PENDING sin ella. La propuesta agrega estas semánticas a nuevos IDs versionados; no modifica el conteo legado OPEN/PAID. Se requiere decisión del usuario y reconciliación antes de integrar.

## 5. Estado de correcciones y diagnósticos

| Elemento | Diagnóstico | Solución | Validación disponible | Corrección aplicada |
|---|---|---|---|---|
| Límite400 | Reproducido offline | Agregación/granularidad/límites explícitos | Caracterización existente, no benchmark de solución | **No** |
| Fechas/DST | Fecha imposible y offset reproducidos | Calendario IANA y rangos semiabiertos | Tres límites de referencia validados con SELECT en QA | **No** |
| Filtros/caja | Queries con parking extra reproducidas; ventana amplia inspeccionada | IDs exactos normalizados y rango común | Mocks del diagnóstico; prueba de solución aún pendiente | **No** |
| Capacidad histórica | Catálogo/QA insuficientes | Vigencias verificadas o indicador no disponible |87 estadías y8 snapshots examinados por agregados | **No** |
| Estados UNPAID | QA y constraints los confirman | Política explícita y métricas versionadas | Datos/constraint solo lectura | **No** |

No se presenta ninguna propuesta como bug resuelto en producción ni como motor Smart Reports implementado. Preparación documental/fixtures de M2 local ya autorizada, sin editor funcional ni On Street implementado. Próximos pasos: revisar alcance/KPIs y autorizar actividad funcional posterior si corresponde. Integración, reparaciones de servicios y nuevas escrituras QA requieren aprobación posterior.
