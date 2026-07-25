# Stage 08 - Tarifas y Planes Comerciales

## Objetivo

Implementar la base visual y estructural del módulo Tarifas y Planes Comerciales de ParkFacil 2027, manteniendo un enfoque demostrativo y visual sin procesos reales de cotización, facturación o cálculo tributario.

## Alcance

- Crear la ruta principal /tarifas con resumen, búsqueda y filtros.
- Crear la ruta dinámica /tarifas/[id] con detalle visual y secciones de referencia.
- Reutilizar el catálogo existente de contratos para mostrar relaciones demostrativas.
- Representar planes demostrativos con estados, tipos, monedas, modalidades de cobro y valores referenciales.

## Modelo demostrativo

Se crearon planes de ejemplo con cargos mensuales, anuales, de implementación, transaccionales, de dispositivo, de estacionamiento y soporte, además de condiciones comerciales de referencia.

## Estados

- active
- inactive
- draft
- archived

## Tipos

- monthly_subscription
- per_transaction
- per_parking
- equipment_bundle
- implementation_only
- custom

## Monedas

- CLP
- UF
- USD

## Modalidades de cobro

- monthly
- annual
- one_time
- per_transaction
- mixed

## Archivos creados

- src/app/tarifas/page.js
- src/app/tarifas/[id]/page.js
- src/data/tarifas.mjs
- src/data/tarifas.test.mjs
- src/components/tarifas/TarifaCard.js
- src/components/tarifas/TarifasGrid.js
- src/components/tarifas/TarifaResumen.js
- src/components/tarifas/EstadoTarifaBadge.js
- src/components/tarifas/TipoTarifaBadge.js
- src/components/tarifas/ModalidadCobroBadge.js

## Archivos modificados

- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas

- node --test src/data/tarifas.test.mjs

## Limitaciones

- No se conectó a una base de datos.
- No se implementó facturación, cotización, activación comercial ni cálculo tributario.
- No se incorporaron precios reales de ParkFacil.

## Pendientes futuros

- Integración con procesos comerciales reales.
- Flujos de aprobación y contratación.
- Gestión de descuentos y vigencia operativa.
