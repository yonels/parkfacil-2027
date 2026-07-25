# Stage 04 - Dispositivos

## Objetivo
Implementar la base visual y estructural del módulo Dispositivos, manteniendo el alcance en una implementación de referencia sin base de datos, APIs ni lógica operacional real.

## Alcance incluido
- Vista principal de inventario tecnológico en /dispositivos.
- Ruta dinámica de detalle para cada dispositivo en /dispositivos/[id].
- Búsqueda y filtros visuales por tipo, estado, conexión y estacionamiento.
- Datos demostrativos separados de la interfaz y reutilización del catálogo de estacionamientos de la Etapa 03.
- Navegación principal habilitada para el módulo.

## Tipos de dispositivos incluidos
- Cámara LPR
- Barrera
- Terminal POS
- Impresora
- Lector QR
- Sensor
- Controlador de acceso
- Cajero automático
- Computador
- Dispositivo Android

## Estados soportados
- active
- inactive
- maintenance
- retired

## Estados de conexión soportados
- online
- offline
- warning
- unknown

## Archivos creados
- src/app/dispositivos/page.js
- src/app/dispositivos/[id]/page.js
- src/components/dispositivos/DispositivoCard.js
- src/components/dispositivos/DispositivoResumen.js
- src/components/dispositivos/DispositivosGrid.js
- src/components/dispositivos/EstadoConexionBadge.js
- src/data/dispositivos.mjs
- src/data/dispositivos.test.mjs
- docs/Stage04-Dispositivos.md

## Archivos modificados
- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas
- node --test src/data/dispositivos.test.mjs

## Pendientes
- Integrar datos operativos reales.
- Conectar a sistemas de monitoreo y gestión.
