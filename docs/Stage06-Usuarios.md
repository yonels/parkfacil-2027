# Stage 06 - Usuarios y Perfiles

## Objetivo
Implementar la base visual y estructural del módulo Usuarios y Perfiles, manteniendo el alcance en una implementación de referencia sin autenticación real, bases de datos, APIs ni permisos efectivos.

## Alcance incluido
- Vista principal de usuarios en /usuarios.
- Ruta dinámica de detalle en /usuarios/[id].
- Búsqueda y filtros visuales por estado, perfil, empresa, estacionamiento y usuarios con múltiples accesos.
- Datos demostrativos asociados a empresas y estacionamientos de referencia.
- Navegación principal habilitada para el módulo.

## Modelo demostrativo
- Estados permitidos: active, inactive, pending.
- Perfiles de referencia: platform_admin, organization_admin, company_admin, parking_manager, operator, cashier, auditor, support, viewer.
- Los perfiles se muestran con etiquetas legibles en español.

## Archivos creados
- src/app/usuarios/page.js
- src/app/usuarios/[id]/page.js
- src/components/usuarios/UsuarioCard.js
- src/components/usuarios/UsuarioResumen.js
- src/components/usuarios/UsuariosGrid.js
- src/components/usuarios/EstadoUsuarioBadge.js
- src/components/usuarios/PerfilUsuarioBadge.js
- src/data/usuarios.mjs
- src/data/usuarios.test.mjs
- docs/Stage06-Usuarios.md

## Archivos modificados
- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas
- node --test src/data/usuarios.test.mjs

## Limitaciones
- No se implementa autenticación real ni control de permisos efectivo.
- No se conecta a sistemas externos ni se almacenan datos de personas reales.
