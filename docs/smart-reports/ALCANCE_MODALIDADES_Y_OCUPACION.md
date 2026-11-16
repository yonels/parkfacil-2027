# Smart Reports — alcance unificado y contrato de ocupación

**Actualización:** 2026-10-28. **Solicitud:** SOL-2026-10-28-001. Ampliación documental autorizada; sin aprobación definitiva del catálogo ni integración. Conserva el plan original y los19 indicadores Off Street/V2.1; añade contratos On Street, no implementación funcional de esa modalidad.

## 1. Plataforma única

- Selector superior **Off Street / On Street** como contexto obligatorio del tablero y sus consultas futuras.
- Biblioteca drag & drop común: mismos componentes/acciones y registro de métricas; las opciones se filtran por modalidad, permisos, fuente y capacidad de cálculo.
- Plantillas independientes por modalidad: Off Street ejecutivo/operación/finanzas/inteligencia; On Street territorial/recaudación/fiscalización/productividad. Son diseños propuestos, no tableros integrados.
- Configuración común de título, métrica, dimensiones, filtros, ancho/alto admitido, gráfico, orden y guardado del diseño. No permitir toda combinación métrica×gráfico indiscriminadamente.
- Un layout declara `modality`, versión y referencias a IDs canónicos; cambiar modalidad no convierte métricas ni mezcla el tablero anterior. Proponer confirmar y conservar layouts independientes.
- Tableros consolidados **futuros**: cada bloque conserva modalidad/fuente/corte y unidad. Solo sumar métricas aditivas compatibles con deduplicación financiera y mismos scopes; no sumar ocupaciones/medias ni sesiones como vehículos.
- Aprobación de esta ampliación documental no autoriza desarrollo funcional On Street, nuevos conectores ni modificar rutas actuales.

## 2. Reutilización sin duplicar KPIs

Registro conceptual común (no código implementado): recaudación, pagos confirmados, ticket promedio, ocupación media/máxima, plazas, peak, heatmap y pronóstico. Cada familia declara adaptadores y soportes por modalidad. Los19 IDs originales permanecen y se documenta su correspondencia; no se eliminan ni se suman aliases entre sí.

Un KPI de recaudación tiene dimensiones zona/calle/tramo/operador, no cuatro copias del total que deban sumarse. La biblioteca común no fuerza disponibilidad de una métrica cuando no existe fuente. Plantillas On Street no reutilizan curvas sintéticas Off Street como datos de calle.

## 3. Tres conceptos separados

| Clase | Qué acredita | Fuente mínima | Qué no permite afirmar |
|---|---|---|---|
| **Ocupación comprobada** | Presencia/ausencia observadas con trazabilidad y cobertura | Sensor/LPR/inspección temporal o fuente equivalente confiable, reconciliada y ligada a plaza/ubicación | Una inspección puntual no prueba permanencia entre dos visitas; intervalos sin cobertura no se rellenan por suposición. |
| **Ocupación inferida registral** | Reconstrucción de visitas a partir de entradas/salidas confiables | Eventos/intervalos válidos, estado/correcciones auditables y capacidad por vigencias | No equivale a medición física; una entrada abierta antigua puede ser censura o dato desactualizado. Rotular «inferida de registros». |
| **Sesiones pagadas / cobertura comercial** | Derecho/tiempo comprado o pago confirmado | Sesión, extensión y transacción confirmada | ACTIVE, minutos pagados o pago no prueban que el vehículo siga físicamente en una plaza ni cuántas plazas estén libres. |

La clase de evidencia viaja con la métrica y se muestra en el bloque. Para porcentajes históricos también se exige capacidad válida a cada instante y cobertura del período/ubicación. No degradar de «comprobada» a «inferida» silenciosamente; debe ser otra selección/etiqueta.

## 4. Método y condiciones de cálculo

Para modalidad/ubicación `p`, visitas validadas `[entrada_i,salida_i)` y capacidad temporal `C_p(t)`:

`O_p(t) = Σ 1(entrada_i ≤ t < salida_i)`; numerador solo de visitas de la clase seleccionada. El intervalo de consulta debe traer visitas iniciadas antes del rango que todavía lo solapan. La capacidad no se obtiene del número de sesiones vendidas.

- Promedio de vehículos: `Σ∫O_p(t)dt / duración observada` según ámbito definido; no usar ese denominador si se mezclan parkings sin especificar suma/promedio.
- Porcentaje medio: `100 × Σ∫O_p(t)dt / Σ∫C_p(t)dt`, ponderado por plazas-tiempo, con cobertura suficiente comprobada para ese alcance.
- Máximo: `max O_p(t)` o `max (ΣO_p(t)/ΣC_p(t))` en el mismo instante; no dividir máximos de momentos diferentes.
- Día/hora: buckets reales UTC etiquetados en America/Santiago con offset; día puede tener23/24/25h. Heatmap agrega por duración/plazas-tiempo y no pierde horas repetidas.
- Disponibles por ubicación: `max(C_p(t)−O_p(t),0)`, solo con C y O calculables y misma clase/corte. Sobreocupación se muestra con alerta, no se limita a100% para ocultarla.
- Una fracción de capacidad histórica válida no habilita porcentaje completo. Resultados parciales, si luego se autorizan, deben mostrar cobertura y exclusiones; nunca sustituir el total faltante por una estimación.

### Contrato visible de insuficiencia

**Texto obligatorio: «No calculable».** Valor numérico nulo; nunca0%,100%, ocupación aleatoria ni capacidad actual imputada retrospectivamente. Motivos legibles: capacidad histórica desconocida, presencia no observada, cobertura incompleta, reglas de estado no resueltas, dato contradictorio o fuente no disponible. Si puede calcularse otra métrica (por ejemplo sesiones pagadas), mostrarla separada con su nombre correcto.

`UNAVAILABLE`/`INSUFFICIENT_EVIDENCE` → «No calculable». `DENIED` → «Sin autorización» y sin datos. `ERROR` → error/reintento; no disfrazarlo como insuficiencia. Cero solo si se ha demostrado el conjunto/cobertura completos y el resultado legítimo es0. «Sin datos» no prueba cero ni habilita porcentajes.

## 5. Reglas conceptuales por operación

| Caso | Registro/comercio | Tratamiento de ocupación / límite |
|---|---|---|
| Off Street PAID | Pago confirmado según fuente; salida registrada | Intervalo hasta exit_at válida. El monto o pago no sustituye entrada/salida comprobadas. |
| Off Street OPEN / UNPAID_PENDING | Cobro no resuelto; puede haber visita sin salida | Inferencia hasta asOf con censura y alerta de antigüedad; no considerarlo comprobado. UNPAID_PENDING no se omite por tener deuda si la visita sigue abierta. |
| Off Street UNPAID_EXIT | Salida registrada sin pago | Finalizar intervalo en exit_at válida. Contar salida en métrica versionada, no recaudación; deuda pendiente separada. |
| Cancelación | Anulación comercial o registral debe distinguirse | Cancelar un pago no prueba salida física. Sin tipo/fecha de cancelación y auditoría, excluir del histórico validado e informar impacto; «No calculable» si impide garantizar cobertura. No borrar/reparar registros aquí. |
| Extensión On Street | Tiempo adicional de la misma sesión, con pago confirmado cuando corresponda | Aumenta derecho comercial, no crea nuevo vehículo/plaza ni nueva visita. No duplicar monto inicial ni contar extensión como rotación física. |
| Sesión vencida | Se agotó derecho comprado al corte | No significa automáticamente que salió o que sigue presente. Para presencia, exigir observación; infracción no se infiere solo del vencimiento. |
| Retiro anticipado | Cierre de sesión/ended_at comercial | Puede terminar cobertura comercial; no prueba salida física sin evento confiable. No inferir devolución de dinero ni generar pago negativo sin registro financiero. |
| Impago On Street | Ausencia/fallo de pago o deuda | No implica plaza vacía ni sanción. Presencia, derecho de estacionar, deuda y fiscalización se reportan por separado. |
| Reembolso/anulación financiera | Evento financiero con referencia original | Ingresos brutos, reversos y netos requieren IDs/fecha propios; no mutar histórico de visitas por el cambio de dinero. Fuentes/contrato pendientes. |

Las reglas son propuestas para aprobación, no correcciones realizadas al sistema actual. La aprobación definitiva de19 KPIs originales y del anexo On Street sigue pendiente.

## 6. Datos disponibles y faltantes

Se conserva el [diagnóstico QA solo lectura](QA_HISTORICOS_SOLO_LECTURA.md):87 estadías,3 parkings Off Street,8 cierres con **capacidad nula**,7OPEN antiguos, sin vigencias continuas de capacidad identificadas,0sesiones QR y0payment_transactions en la muestra leída. Son resultados fechados de la revisión anterior; esta actualización no vuelve a consultar remotos.

Esto permite diseñar/ensayar casos con intervalos registrados, no asegurar porcentajes completos ni transferir esa evidencia a On Street. Faltan:

- Capacidad por ubicación y vigencia, sin doble contabilizar calles/tramos/lados; historial de cierres/bajas/cambios físicos.
- Presencia física o eventos de visita con cobertura, trazabilidad y vínculo a plaza/ubicación; distinguir sesiones comerciales.
- Auditoría de correcciones, cancelaciones y retiros, horarios operativos y calidad/frescura de captura.
- On Street: datos representativos por zona/calle/tramo y canal, pagos/extensiones, atribución de operador y horas efectivas trabajadas verificables.
- Para predicción: historia suficiente/representativa, cobertura y capacidad verificadas, separación temporal de entrenamiento y evaluación. No hay modelo validado en esta etapa.

## 7. Vigencia de hallazgos y control de alcance

Siguen abiertos SR-01(límite400), SR-02(fechas), SR-03(DST), SR-04/05/06(filtros/caja), SR-07(volumen), SR-08(anulaciones), SR-09(capacidad) y SR-10(corte financiero); se añade el riesgo de presentar sesiones pagadas como ocupación física. Se conservan todos los tests y documentos anteriores. [Soluciones propuestas](SOLUCIONES_PROPUESTAS_M1.md) no equivalen a correcciones implementadas.

M2 solo se prepara en [carpeta aislada](../../prototipos/smart-reports/etapa-2-preparacion/README.md), con fixtures ficticios Off Street y contratos de prueba. No se implementa selector On Street funcional, consultas, cálculo On Street, guardado remoto ni rutas reales. La integración requiere aprobación posterior explícita.
