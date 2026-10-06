# POS Entry/Exit — vehículos en la pantalla inicial

## Alcance aprobado

Aprovechar el espacio debajo de los cuatro botones para mostrar vehículos del estacionamiento activo, ordenados por fecha y hora de entrada (más antiguos primero). Columnas: patente, hora de ingreso y minutos. Paginación siempre dentro del panel; tantas filas como quepan, conservando una altura táctil de 44 px. Tocar una patente abre el detalle existente; VOLVER devuelve al inicio.

## Implementación

- Reutiliza `activeStays` de `/api/pos/stays`, sin nuevos endpoints ni cambios en registro, cobro o impresión.
- El orden considera la fecha completa, incluyendo vehículos de días anteriores; no modifica el listado original.
- Los minutos son informativos: referencia del reloj del servidor y avance local cada 15 segundos. La cotización y el cobro siguen calculándose en el servidor al abrir el detalle.
- Datos actualizados al cargar, registrar ingresos/salidas y pulsar Actualizar. El contador de minutos no consulta la base cada 15 segundos.
- Capacidad: suma de cupos positivos en zonas ACTIVE del estacionamiento operativo ya autorizado. Si no existe configuración o falla esta consulta auxiliar, se omite la barra sin bloquear el listado. El ejemplo comercial de 40 cupos no se introduce como dato real.
- ResizeObserver adapta filas y páginas al cambiar el espacio. La página efectiva se acota cuando disminuye la cantidad de vehículos.
- En pantallas bajas y con avisos de turno, se conserva desplazamiento vertical para mantener texto y controles utilizables. No hay desplazamiento horizontal.
- Altura explícita del contenedor inicial para distribuir el espacio también en WebView antiguo.

## Validación

Pruebas de orden por fecha, minutos, páginas, reducción de resultados y capacidad no configurada. Regresión de flujo POS y aislamiento de estacionamientos: 155 pruebas aprobadas. ESLint sin errores; advertencia previa de imagen de evidencia. Compilación Next.js webpack aprobada con valores ficticios de configuración únicamente para construir; no se accede a Supabase real durante el QA.

Navegador sobre la página realmente compilada, con APIs simuladas y sin escritura: 360×800, 480×960, 320×568 y 640×360. Verifica filas que caben, paginación, orden, actualización de minutos, ausencia de desbordamiento horizontal, apertura de detalle, retorno al inicio y vacío sin capacidad.

## Publicación y comprobación física

Destino autorizado: `release/qr-onstreet-1.0` / Preview. No requiere nueva APK. No se modifica main ni producción. Después de Vercel Ready, cerrar y abrir ParkFacil en el POS y verificar el ajuste físico, filas, páginas y detalle con las operaciones de QA del usuario. No se declara aprobación física de esta tabla antes de esa comprobación.
