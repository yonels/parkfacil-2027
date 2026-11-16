# PARKFACIL SMART REPORTS — INFORME DE AVANCE N.º 01

Actualización: 2026-10-28 11:25 America/Santiago
Etapa actual: actualización M1 / preparación M2 local aislada
Estado: documentos y preparación listos para revisión; catálogo NO aprobado definitivamente; integración y On Street funcional NO autorizados.

**AVANCE GLOBAL VERIFICADO: 8.0 %** (anterior8.0%; variación **+0.0 pp**).

| Módulo | Peso | Avance módulo | Off Street | On Street | Aporte global |
|---|---:|---:|---:|---:|---:|
| M1 Auditoría y UX | 10% | 80% | 80% documental | 80% documental | 8.0 pp |
| M2 Constructor drag & drop | 20% | 0% | 0% (solo preparación) | 0% (funcional diferido) | 0.0 pp |
| M3 Filtros y calendario | 10% | 0% | 0% | 0% | 0.0 pp |
| M4 Métricas y consultas seguras | 20% | 0% | 0% | 0% | 0.0 pp |
| M5 Ocupación / Peak / Heatmap | 15% | 0% | 0% | 0% | 0.0 pp |
| M6 Guardado y exportaciones | 10% | 0% | 0% | 0% | 0.0 pp |
| M7 Predicción y validación | 5% | 0% | 0% | 0% | 0.0 pp |
| M8 QA / seguridad / piloto | 10% | 0% | 0% | 0% | 0.0 pp |
| **Total** | **100%** | — | Desglose, no sumable | Desglose, no sumable | **8.0%** |

El global usa únicamente pesos M1–M8, sin sumar por segunda vez las columnas Off/On. M1=80% describe cuatro paquetes documentales disponibles para ambas modalidades, NO datos listos, indicadores aprobados ni funcionalidad On Street. M2 sigue0: preparar carpeta/fixtures/criterios no entrega un constructor. El prototipo V2.1 ficticio no se contabiliza como nueva integración.

## Cinco entregables de M1

| Entregable | Off Street | On Street | Crédito en M1 |
|---|---|---|---:|
| Inventario de fuentes, permisos y brechas | Código y diagnóstico QA previo disponibles; insuficiencia histórica explícita | Fuentes territoriales/comerciales/inspección identificadas localmente; vacíos QA previos y atribución pendiente documentados | 20% |
| Diccionario y criterios |19KPIs originales íntegros y pendientes de aprobación |15contratos propuestos con familias comunes, fórmula/fuente/granularidad/filtros/permisos/limitaciones, sin implementación | 20% |
| UX/diseño | V2.1 preservado y contrastado; propuesta de biblioteca/configuración | Selector/plantillas/contexto y biblioteca común diseñados documentalmente, no selector funcional On Street | 20% |
| Backlog y evidencia | Soluciones400/días/DST/filtros/impagos conservadas; preparación M2 aislada | Contrato de presencia/sesiones/capacidad, rotación/productividad e insuficiencia definido | 20% |
| Aprobación definitiva y cierre de decisiones | Pendiente | Pendiente; desarrollo funcional requiere autorización posterior | 0% |
| **M1** | Documentación disponible, no aprobación | Documentación disponible, no implementación | **80%** |

La ampliación se documenta sin aumentar porcentajes de paquetes que ya tenían crédito. La autorización de preparación M2 no se interpreta como aprobación de M1 ni del sistema actual.

## Entregables de esta actualización

- [Alcance unificado y contrato de ocupación](ALCANCE_MODALIDADES_Y_OCUPACION.md): selector Off/On, biblioteca común, plantillas independientes, consolidación futura y clases comprobada/inferida/sesiones pagadas.
- [Catálogo original conservado](CATALOGO_KPI_APROBACION.md), ahora con herencia explícita de permisos y etiqueta obligatoria «No calculable» ante insuficiencia.
- [Catálogo On Street propuesto](CATALOGO_ON_STREET_PROPUESTO.md): recaudación territorial/operador, ocupación/peak/heatmap, rotación, plazas, sesiones/pagos/extensiones, vencidas/fiscalización/presuntas infracciones, productividad y predicción. No duplica familias comunes ni confunde cortesía con sanción legal.
- [Preparación M2](../../prototipos/smart-reports/etapa-2-preparacion/README.md) y fixtures ficticios Off Street: On Street deshabilitado, sin registros ni cálculos. No editor funcional, servidor ni conexión.
- [Proyecto](../PARKFACIL_SMART_REPORTS.md), [auditoría](ETAPA_1_AUDITORIA_KPI.md) y [soluciones propuestas](SOLUCIONES_PROPUESTAS_M1.md) actualizados sin borrar hallazgos.

## Reglas de ocupación y datos faltantes

Una sesión activa/pagada no prueba plaza físicamente ocupada. Ocupación comprobada requiere observación trazable y cobertura; inferida requiere visitas registradas y límites explícitos. Ambas requieren capacidad por vigencias para porcentajes históricos. Sin datos suficientes: **«No calculable»**, valor nulo y motivo; no imputar capacidad actual ni rellenar vacíos con porcentajes ficticios.

Reglas propuestas para revisión: impago no implica ausencia física; UNPAID_EXIT termina intervalo sin generar recaudación; cancelación financiera no implica salida; extensión de sesión no crea nueva visita; vencimiento no demuestra presencia ni infracción; cierre comercial anticipado no prueba retiro físico ni devolución. No se modificaron registros ni reglas actuales.

Se conserva la evidencia QA anterior:87estadías,8cierres con capacidad **nula**, sin historial continuo de capacidad identificado,7OPEN antiguos,0sesionesQR/0payment_transactions. No se presenta como base suficiente ni como consulta remota nueva. Faltan presencia/captura completa, capacidad por vigencias, atribución histórica/operador y horas efectivas verificadas, además de reglas de corrección/cancelación.

## Pruebas verificadas en esta entrega

- **13/13 pruebas locales**:8diagnósticos existentes +5referenciaV2.1, JSDOM/red bloqueada. Los diagnósticos confirman fallos, no correcciones. Comando sin cambios:

```powershell
node --test --experimental-test-isolation=none prototipos/smart-reports/etapa-1/auditoria.test.mjs prototipos/smart-reports/etapa-1/referencia-v21.test.mjs
```

- **8 comprobaciones estáticas de fixtures**: etiqueta ficticia, sin conexión, On Street bloqueado/sin datos, «No calculable» nulo, registros sintéticos, ausencia de URLs y TZ Chile. No son tests de un editor implementado.
- Verificación de enlaces/documentos,19KPIs originales y15contratos On Street, integridad del HTML de referencia, pesos/global y preservación de hallazgos.
-190tests anteriores y las lecturas QA se conservan como evidencia histórica; no se vuelven a atribuir a esta ejecución. No hubo navegador físico, nuevos tests RLS, nuevo algoritmo histórico, rendimiento ni correcciones productivas.

## Problemas encontrados / pendientes

SR-01 a SR-10 siguen abiertos:400días/volumen, fechas/DST, filtros empresa/parking/caja, capacidad histórica, anulaciones/estados e impagos y atribución financiera. Se añade explícitamente el riesgo de equiparar sesiones con presencia física y de atribuir ventas QR sin operador a una persona.

Soluciones documentadas; **correcciones implementadas en código productivo: ninguna**. La fórmula IANA validada previamente con constantes QA no equivale a helper productivo corregido. Datos insuficientes impiden afirmar ocupación histórica/predicción fiable, especialmente On Street.

## Archivos creados o modificados

Nuevos:
- `docs/smart-reports/ALCANCE_MODALIDADES_Y_OCUPACION.md`
- `docs/smart-reports/CATALOGO_ON_STREET_PROPUESTO.md`
- `prototipos/smart-reports/etapa-2-preparacion/README.md`
- `prototipos/smart-reports/etapa-2-preparacion/fixtures-preparacion.json`

Actualizados:
- `docs/PARKFACIL_SMART_REPORTS.md`
- `docs/smart-reports/CATALOGO_KPI_APROBACION.md`
- `docs/smart-reports/ETAPA_1_AUDITORIA_KPI.md`
- `docs/smart-reports/SOLUCIONES_PROPUESTAS_M1.md`
- `docs/smart-reports/INFORME_01.md`
- Registro/índice SOL-2026-10-28-001 y evidencias de esta revisión.

El informe anterior se conserva en [su copia previa a ampliación](../solicitudes/SOL-2026-10-28-001/INFORME_01_antes_ampliacion_modalidades.md). Los indicadores, tests y hallazgos originales permanecen.

## Próxima actividad y autorizaciones

Revisar definiciones originales y anexo On Street, política de evidencia/capacidad, impagos y productividad; aprobación definitiva todavía pendiente. La preparación local autorizada concluye con estos artefactos. Para implementación adicional del editor local Off Street se presentará el alcance revisable; On Street funcional necesita autorización propia posterior.

**No continuar con una integración:** requiere diff revisable y autorización expresa separada. No se pide aprobar una integración inexistente ni se infiere permiso de una aprobación del prototipo.

**Control: Commit NO | Push NO | Merge NO | PR NO | Deploy NO | Código productivo NO modificado | DB remota NO consultada ni modificada en esta actualización.** Sin publicaciones, integraciones, cobros, SMS, emails o cron. Datos exclusivamente ficticios para preparación M2.

Registro: [SOL-2026-10-28-001](../solicitudes/SOL-2026-10-28-001/README.md).
