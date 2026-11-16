# ParkFacil Smart Reports

**Actualización:** 2026-10-28. **Estado:** actualización M1 / preparación M2 local autorizada; catálogo pendiente y sin integración nueva.  
**Solicitud:** [SOL-2026-10-28-001](solicitudes/SOL-2026-10-28-001/README.md).  
**Plan base:** [Plan original v1.0, 2026-10-27](solicitudes/SOL-2026-10-28-001/PLAN_ORIGINAL.md), copia íntegra del archivo entregado por el usuario. SHA-256 `4e8b90a4d1dcbfb2b6aba5550d0cb85f4c4db16b806e2f5fa76bd0990d4769d7`.

## Objetivo y alcance

Editor de reportes personalizados con biblioteca de módulos, arrastrar/soltar, reordenamiento, tamaño y configuración de bloques, filtros globales, tableros persistentes y exportación. Conexión posterior a fuentes autorizadas Off Street y On Street; histórico de ocupación y pronósticos requieren validación específica. No reemplazar dashboards/reportes operativos sin aprobación.

**Ampliación acordada:** plataforma única **Off Street + On Street**, con selector superior de modalidad, biblioteca común con KPIs específicos y plantillas independientes. Configuración, filtros, tamaños/gráficos y diseños compartirán contratos. Consolidación entre modalidades es futura y exige compatibilidad/deduplicación, no sumar ratios ni sesiones como vehículos. Se autoriza ahora solo documentación y preparación M2 local con ficticios; **On Street funcional requiere autorización posterior**.

Smart Reports es un proyecto distinto de Smart Parking Finder y de reportes de Mesa de ayuda del CRM. Los porcentajes de esos proyectos no se trasladan a este plan. La línea base del nuevo trabajo es **0 %**; la infraestructura existente es fuente potencial, no integración terminada del nuevo editor.

## Entregables de Etapa 1

- [Auditoría técnica, inventario, diccionario de indicadores, reglas de calidad y backlog](smart-reports/ETAPA_1_AUDITORIA_KPI.md).
- [Wireframe local estático, sin conexión ni DnD](../prototipos/smart-reports/etapa-1/mockup.html).
- [Diagnósticos ejecutables aislados](../prototipos/smart-reports/etapa-1/auditoria.test.mjs): caracterizan limitaciones actuales; no las corrigen.
- [Informe de avance n.º 01](smart-reports/INFORME_01.md).
- [Referencia V2.1 recibida y comparación UX](smart-reports/REFERENCIA_V21.md).
- [Catálogo completo de19 KPIs para aprobación](smart-reports/CATALOGO_KPI_APROBACION.md).
- [Suficiencia de históricos en QA, solo lectura](smart-reports/QA_HISTORICOS_SOLO_LECTURA.md).
- [Soluciones propuestas para400 días, DST y filtros](smart-reports/SOLUCIONES_PROPUESTAS_M1.md).
- [Alcance unificado y clases/reglas de ocupación](smart-reports/ALCANCE_MODALIDADES_Y_OCUPACION.md).
- [Anexo de KPIs On Street: fórmulas, fuentes, permisos y límites](smart-reports/CATALOGO_ON_STREET_PROPUESTO.md).
- [Preparación M2 aislada y fixtures ficticios](../prototipos/smart-reports/etapa-2-preparacion/README.md).

En la revisión inicial10:27 no estaba disponible el HTML V2.1. En la continuación de M1 el usuario aportó `ParkFacil_V21.zip`: se archivó y extrajo sin cambios como referencia autónoma con datos ficticios,19 métricas,18 elementos de biblioteca y guardado local. El wireframe anterior se conserva como artefacto histórico. La comparación y cinco pruebas de referencia no implementan la Etapa2 del nuevo editor ni validan datos reales.

## Etapas y puertas de control

| Etapa | Módulo | Resultado esperado | Puerta |
|---|---|---|---|
| 1 | M1 | Fuentes, KPIs, criterios y propuesta UX revisables | Aprobar definiciones y diseño antes de integrar. |
| 2 | M2 | Editor local desacoplado con DnD accesible, edición/reorder/resize | Revisión práctica de UX. |
| 3 | M3 | Filtros Mes/Año/Total/rango y comparaciones con TZ Chile | Rangos correctos, incompletitud explícita. |
| 4 | M4 | Catálogo allowlist y consultas autorizadas, acotadas y reconciliables | Revisión de seguridad y paridad financiera. |
| 5 | M5 | Histórico reconstruido, peak y heatmap con calidad | Validar intervalos, capacidad histórica y DST. |
| 6 | M6 | Layouts versionados/persistencia y exportaciones protegidas | Control de acceso y trazabilidad. Envíos solo diseñados hasta autorización. |
| 7 | M7 | Baseline predictivo y backtesting temporal | Umbrales, errores e incertidumbre; opción sin pronóstico. |
| 8 | M8 | QA integral, accesibilidad, rendimiento, piloto y reversión | Autorización final expresa para publicar. |

El detalle completo y restricciones se conservan en el plan original; esta tabla no los reemplaza.

## Medición de avance

`global = Σ(peso × avance del módulo / 100)`; aporte en puntos porcentuales. No se concede avance de M2–M8 por prototipos visuales o pruebas de infraestructura anterior.

Para M1 se fijan cinco entregables verificables de 20 % cada uno:

1. Inventario local de fuentes, permisos y brechas: preparado.
2. Diccionario de KPIs y casos de validación: preparado.
3. Propuesta UX y wireframe revisable: preparado; referencia V2.1 incorporada y comparada, aprobación pendiente.
4. Backlog/criterios y evidencia de auditoría offline: preparado.
5. Inventario/definiciones/UX aprobados y dudas cerradas: **pendiente**.

Este desglose es la regla de seguimiento propuesta para M1; el usuario aún no la ha aprobado. El 80 % acredita los cuatro paquetes locales disponibles, no una aprobación del diseño ni inspección del esquema remoto.

En la continuación se leyeron catálogos/agregados QA autorizados y se amplían estos paquetes a ambas modalidades; insuficiencia de datos forma parte del diagnóstico, no se convierte en preparación operativa. El avance por modalidad de M1 mide documentos de auditoría/diseño disponibles; **no** confianza del histórico ni porcentaje de implementación On Street. No sumar aportes Off/On como si fueran dos proyectos ni subir M2 por crear fixtures.

| Módulo | Peso | Avance módulo | Off Street | On Street | Aporte global |
|---|---:|---:|---:|---:|---:|
| M1 Auditoría y UX | 10 % | 80 % | 80 % documental | 80 % documental | 8.0 pp |
| M2 Constructor drag & drop | 20 % | 0 % | 0 % | 0 % no autorizado funcional | 0.0 pp |
| M3 Filtros y calendario | 10 % | 0 % | 0 % | 0 % | 0.0 pp |
| M4 Métricas y consultas seguras | 20 % | 0 % | 0 % | 0 % | 0.0 pp |
| M5 Ocupación / Peak / Heatmap | 15 % | 0 % | 0 % | 0 % | 0.0 pp |
| M6 Guardado y exportaciones | 10 % | 0 % | 0 % | 0 % | 0.0 pp |
| M7 Predicción y validación | 5 % | 0 % | 0 % | 0 % | 0.0 pp |
| M8 QA / seguridad / piloto | 10 % | 0 % | 0 % | 0 % | 0.0 pp |
| **Total** | **100 %** | — | Desglose, no sumable | Desglose, no sumable | **8.0 %** |

## Restricciones de trabajo

Solo documentos y prototipos locales separados. Sin cambios en `src/`, dashboards actuales, configuración de despliegue o migraciones. Sin commit, push, PR, merge, publicación ni cobros/SMS reales. La continuación de M1 autoriza **lecturas de QA**: se examinó exclusivamente `parkfacil_2027_qa`; no cambios de bases remotas ni consultas a datos productivos. No se activan cron ni emails. Cualquier futura integración requiere diff y autorización explícita.

## Próxima decisión

Revisar/aprobar definitivamente los19 KPIs conservados y el anexo On Street, junto al alcance unificado. QA tiene87 estadías y8 cierres con capacidad nula, sin vigencias continuas de capacidad identificadas y0sesionesQR: no sustenta porcentajes históricos completos ni predicción. Cuando falte evidencia: **«No calculable»**, valor nulo y motivo. Preparación M2 local está autorizada y documentada; implementación adicional e integración requieren revisión/autorización específicas. On Street funcional permanece diferido. No hay aprobación de cambios al sistema actual.

## Historial

| Fecha | Agente | Cambio |
|---|---|---|
| 2026-10-28 | Codex | Alta del proyecto, copia del plan, Etapa 1 local, pruebas y primer informe. Sin cambios productivos ni operaciones remotas. |
| 2026-10-28 | Codex | Continuación autorizada: referencia V2.1 íntegra, catálogo19 KPI, diagnóstico QA solo lectura y soluciones propuestas.13 tests locales correctos. M1=80% y global8.0% sin incremento; aprobación pendiente. Sin código productivo ni escrituras remotas. |
| 2026-10-28 | Codex | Ampliación documental Off Street+On Street, catálogo territorial y reglas de ocupación comprobada/inferida/sesiones. Preparación M2 local con fixtures solo ficticios, sin implementación On Street. Desglose por modalidad, global8.0% sin incremento; aprobación definitiva pendiente. |
