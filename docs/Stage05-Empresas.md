# Stage 05 - Empresas

## Objetivo
Implementar la base visual y estructural del módulo Empresas, manteniendo el alcance en una implementación de referencia sin datos productivos, formularios de guardado ni procesos comerciales reales.

## Alcance incluido
- Vista principal de empresas en /empresas.
- Ruta dinámica de detalle en /empresas/[id].
- Búsqueda y filtros visuales por estado, relación, ciudad y estacionamientos asociados.
- Datos demostrativos con RUT estructurado y formateado para presentación.
- Reutilización del catálogo de estacionamientos de la Etapa 03.

## Modelo demostrativo
- Estados permitidos: active, inactive, onboarding.
- Tipos de relación: client, operator, administrator, partner, supplier.
- RUT separado en rutNumero y rutDv con formato visual 4.943.377-8.

## Archivos creados
- src/app/empresas/page.js
- src/app/empresas/[id]/page.js
- src/components/empresas/EmpresaCard.js
- src/components/empresas/EmpresaResumen.js
- src/components/empresas/EmpresasGrid.js
- src/components/empresas/EstadoEmpresaBadge.js
- src/components/empresas/TipoRelacionBadge.js
- src/data/empresas.mjs
- src/data/empresas.test.mjs
- docs/Stage05-Empresas.md

## Archivos modificados
- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas
- node --test src/data/empresas.test.mjs

## Limitaciones
- No se integran procesos reales de contratación, facturación ni administración.
- No se consulta información de clientes real ni se conecta a sistemas externos.
