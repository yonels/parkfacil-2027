# Stage 10 - Abonados y Credenciales

## Objetivo

Implementar la base visual y estructural del módulo Abonados y Credenciales de ParkFacil 2027, manteniendo un enfoque demostrativo y visual sin integrar procesos operativos reales ni autenticaciones físicas.

## Alcance

- Crear la ruta principal /abonados con resumen, búsqueda y filtros.
- Crear la ruta dinámica /abonados/[id] con detalle visual del abonado.
- Representar abonados, vehículos, credenciales, permisos y vigencia mediante datos demostrativos.
- Reutilizar la arquitectura visual base del proyecto, incluyendo shell compartido, componentes de UI y navegación.

## Modelo demostrativo

Se crearon abonados de ejemplo con:

- Tipos de abonado como particular, colaborador de empresa, residente, temporal y otros.
- Estados como activo, suspendido, pendiente y bloqueado.
- Vehículos con patentes ficticias y estados de autorización.
- Credenciales con tipos como RFID, patente, QR, móvil y manual.
- Permisos de acceso con horarios, accesos específicos y vigencia de referencia.

## Archivos creados

- src/app/abonados/page.js
- src/app/abonados/[id]/page.js
- src/components/abonados/AbonadoCard.js
- src/components/abonados/AbonadosGrid.js
- src/components/abonados/AbonadoResumen.js
- src/components/abonados/EstadoAbonadoBadge.js
- src/components/abonados/TipoAbonadoBadge.js
- src/components/abonados/CredencialBadge.js
- src/components/abonados/VigenciaAbonadoBadge.js
- src/data/abonados.mjs
- src/data/abonados.test.mjs

## Archivos modificados

- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md

## Pruebas

- node --test src/data/abonados.test.mjs

## Limitaciones

- No se conectó a una base de datos ni a recursos operativos reales.
- No se implementaron acciones de apertura de barreras ni validación de credenciales.
- No se incorporó lógica de negocio real para permisos ni accesos.

## Pendientes futuros

- Integrar vistas operativas de control de acceso.
- Conectar a servicios de credenciales y hardware.
- Añadir flujos de activación, suspensión y auditoría.
