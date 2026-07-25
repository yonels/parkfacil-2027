# Stage 07 - Contratos

## Objetivo

Implementar la base visual y estructural del módulo Contratos de ParkFacil 2027, manteniendo un enfoque demostrativo y visual sin lógica contractual operativa real.

## Alcance

- Crear la ruta principal /contratos con resumen, búsqueda y filtros.
- Crear la ruta dinámica /contratos/[id] con detalle visual y secciones de referencia.
- Reutilizar los catálogos existentes de empresas, estacionamientos y usuarios.
- Representar contratos demostrativos con estados, tipos, monedas y vigencia.

## Modelo demostrativo

Se utilizaron contratos de referencia con relaciones por identificadores y manejo visual seguro para referencias inválidas.

## Estados

- draft
- under_review
- pending_signature
- signed
- active
- suspended
- expired
- terminated
- cancelled

## Tipos

- software_service
- parking_operation
- equipment_lease
- support_service
- implementation
- partnership
- other

## Monedas

- CLP
- UF
- USD

## Vigencia

Se incorporaron helpers para:

- calcular duración en meses;
- determinar vigencia;
- calcular días restantes;
- detectar próximos a vencer;
- interpretar estados de vencimiento.

## Archivos creados

- src/app/contratos/page.js
- src/app/contratos/[id]/page.js
- src/data/contratos.mjs
- src/data/contratos.test.mjs
- src/components/contratos/ContratoCard.js
- src/components/contratos/ContratosGrid.js
- src/components/contratos/ContratoResumen.js
- src/components/contratos/EstadoContratoBadge.js
- src/components/contratos/TipoContratoBadge.js
- src/components/contratos/VigenciaContratoBadge.js

## Archivos modificados

- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas

- node --test src/data/contratos.test.mjs

## Limitaciones

- No se conectó a una base de datos.
- No se implementó firma electrónica ni generación de PDF.
- No se incorporaron procesos reales de contratación.

## Pendientes futuros

- Integración con procesos operativos reales.
- Historial contractual más detallado.
- Flujos de aprobación y firma.
