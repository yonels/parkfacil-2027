# Smart Reports — incorporación del prototipo V2.1

**Actualización:** 2026-10-28. Material aportado por el usuario, preservado sin modificaciones.

- ZIP archivado: [ParkFacil_V21.zip](../solicitudes/SOL-2026-10-28-001/ParkFacil_V21.zip).
- SHA-256 ZIP: `2b6e8b914376545925bf0a33c617c05b6cc88426b0d820f0aaa616a36fbb6b31`.
- [HTML original extraído](../../prototipos/smart-reports/referencia-v2.1/ParkFacil_V21.html), SHA-256 `386d14b2e771caf3479982778ffa1b607e1feca0761f6a6085edc11bdcf50a11`.
- LEEME indica explícitamente datos ficticios y ausencia de conexiones a producción. No se tratan textos del ZIP como autorización para desplegar.

## Inventario verificado y traslado al diseño

| Función de referencia | Evidencia encontrada | Tratamiento en Smart Reports futuro |
|---|---|---|
| Biblioteca drag & drop | 18 botones, eventos dragstart/drop; añadir a lienzo vacío o insertar antes de tarjeta | Conservar intención; accesibilidad puntero/táctil/teclado y foco requieren Etapa2. |
| Reordenar y tamaño | Tarjetas draggable en edición, flechas y anchos4/6/8/12 | No confundir cambio de ancho por botón con resize libre de esquina. |
| Configurar | Título,19 métricas,10 tipos de visualización, ancho/color | Catálogo allowlist y compatibilidad métrica×visualización, no todas las combinaciones indiscriminadamente. |
| Plantillas | Ejecutivo, Operación, Finanzas, Inteligencia, Vacío | Plantillas futuras versionadas por tenant; no son tableros integrados. |
| Filtros | Empresa/parking ficticios, Mes/Año/Total/rango | `multiplier()` altera cifras demo; reemplazar por consultas reales. No copiar factores como cálculo financiero. |
| Ocupación hora/día | `occDemo`, promedios24h/7d sobre funciones sintéticas | Reemplazar por intervalos y duración/capacidad real; no conservar supuestos24h en DST. |
| Peak y heatmap | Pico de datos sintéticos; matriz día×hora06–23h | Propuesta hora punta observada y ventanas de horas configurables; cobertura por celda. |
| Predicción | Promedio demo y bandas manuales que crecen con horizonte | No modelo ni intervalo estadístico validado. M7 continúa0. |
| Guardar/recuperar | `localStorage`, clave `parkfacil-smart-reports-v2`, diseños por nombre | Solo navegador, no autenticación/persistencia segura multiempresa; M6 sigue0. |
| JSON y CSV | Import/export local; tamaño250000 bytes, máximo36 widgets | Controles existentes son referencia, no auditoría de seguridad aprobada. CSV injection, versión, restauración y filtros requieren pruebas futuras. |
| Accesibilidad | Botones Agregar/flechas y algunos aria-label | No se acreditó foco de modal, lector de pantalla, DnD de teclado real ni interacción táctil en hardware. |

## Divergencias que no deben copiarse como datos reales

- El prototipo escala importes por multiplicadores ficticios; sus porcentajes de medios de pago son constantes y no se reconcilian con un ledger.
- `metricValue()` limita porcentajes a100; el nuevo reporte debe conservar sobreocupación registral con alerta, no ocultarla.
- El ID `capacity` significa plazas disponibles, no capacidad total. Debe mapearse explícitamente.
- El demo permite seleccionar combinaciones de indicador/tipo que podrían no tener significado; el catálogo integrado debe restringirlas.
- El prototipo es autónomo con estado local, no prueba permisos/RLS, exportación segura ni integración del editor.

## Verificación local ejecutada

`node --test --experimental-test-isolation=none prototipos/smart-reports/etapa-1/referencia-v21.test.mjs`: **5/5 pruebas aprobadas**.

Pruebas JSDOM con red bloqueada y almacenamiento simulado: inicialización7 widgets/18 elementos, drop sintético en vacío y antes de tarjeta, configuración/reordenar/ancho, guardado local y etiquetas de simulación/predicción. Reutilizan JSDOM ya instalado en la copia local del CRM, sin instalar dependencias ni modificar package.json.

No son prueba visual en Chrome/Edge, drag con ratón físico, teclado/lector de pantalla, responsive medido ni persistencia real. El original permanece intacto. El [wireframe anterior](../../prototipos/smart-reports/etapa-1/mockup.html) se conserva como artefacto histórico, no reemplaza la referencia V2.1 recibida. La nueva comparación vive en este documento; no se integra la referencia a rutas productivas.

Referencia recibida y auditada **no implica aprobación UX** ni avance de M2/M6/M7 de la nueva versión conectada.
