# Piloto On Street QR

## Estado

**Piloto Prepago Simulado — APROBADO**

Se congela el flujo definitivo: `QR → seleccionar 15 / 30 / 60 / 120 / Otro → teléfono → iniciar → ACTIVE → extender estadía → finalizar → CLOSED`, sin cobro real. La sesión mantiene visibles el valor por minuto, total simulado, tiempo restante, vencimiento y contacto del operador. No requiere usuario, contraseña ni aplicación.

## Arquitectura

La ubicación reutiliza `parkings → parking_sectors → parking_streets → parking_street_segments`. `on_street_qr_locations` vincula un código público opaco a un único tramo y `on_street_pilot_sessions` conserva sesión, teléfono normalizado, horas del servidor y token público distinto del ID administrativo. `parking_stays` no se modifica. La migración no crea ubicaciones automáticamente.

Las tablas tienen RLS y no conceden acceso directo a `anon` ni `authenticated`; el servidor usa `service_role`. Las APIs públicas exponen datos mínimos, no incluyen teléfono ni token en la URL y usan `Cache-Control: no-store`. La API administrativa reutiliza `PARKINGS_READ` y el aislamiento multiempresa existente.

## Rutas

- `/estacionar/[qrCode]`: ingreso público móvil.
- `/estacionar/sesion/[token]`: consulta, extensión y cierre.
- `/estacionamientos/[id]`: pestaña contextual **Sesiones QR**, solo para On Street.
- APIs públicas bajo `/api/public/on-street` y consulta administrativa en `/api/estacionamientos/[id]/sesiones-qr`.

## Prepago simulado y trazabilidad

La sesión guarda minutos contratados, `rate_id`, valor por minuto, monto simulado y `expires_at`. La tarifa se resuelve nuevamente en PostgreSQL al crear la sesión. Cada ampliación queda individualmente en `on_street_pilot_extensions` con sesión, minutos, tarifa, monto, vencimiento anterior/nuevo, hora del servidor y origen `PILOT`.

El panel `Estacionamiento → On Street → Sesiones QR` presenta estado, sector, calle, tramo, teléfono enmascarado, inicio, minutos iniciales, minutos totales, vencimiento, tarifa, monto total y cantidad de extensiones. Despliega cada extensión con su trazabilidad completa. Los valores iniciales se reconstruyen descontando extensiones persistidas; por ejemplo, `30 min + 120 min = 150 min` y `$900 + $3.600 = $4.500`.

La lectura pública y administrativa actualiza a `EXPIRED` una sesión activa vencida según la hora del servidor. El cierre anticipado no modifica montos ni genera devolución. No hay Webpay, pagos reales, SMS, geolocalización obligatoria ni fiscalización en esta etapa.

## Preparación para Webpay

Una futura operación debe guardarse en una tabla separada e inmutable, con clave idempotente propia y referencias a `parking_id`, `qr_location_id`, `session_id`, tipo `INITIAL` o `EXTENSION`, minutos, tarifa, monto y hora del servidor. Para conciliación histórica conviene guardar además una instantánea de sector, calle y tramo, sin sustituir las claves foráneas. La confirmación Webpay debe ocurrir en el servidor antes de crear o extender mediante las funciones atómicas existentes; así la UX aprobada no necesita cambiar.

## Validación de cierre

Antes de cerrar la etapa se ejecutan `npm test`, `npm run lint`, `npm run build` y `git diff --check`, además del ciclo real `30 min / $900 → ACTIVE → +120 min / $3.600 → 150 min / $4.500 → CLOSED` y la comprobación de `EXPIRED`.

## Avisos SMS simulados

Cada sesión activa programa dos registros trazables en `on_street_pilot_notifications`: `EXPIRING_SOON` diez minutos antes de `expires_at` y `EXPIRED` al vencer. El mensaje conserva solamente la ruta segura `/estacionar/sesion/[token]`; nunca incluye teléfono ni IDs administrativos. Una extensión cancela lógicamente los avisos pendientes del vencimiento anterior y programa otros según el nuevo `expires_at`. El cierre anticipado cancela todos los avisos pendientes.

El envío está separado en `onStreetSmsService` y un adaptador `simulatedSmsProvider`. El adaptador simulado devuelve éxito sin contactar servicios externos y permite registrar `PENDING → SENT`; los errores quedan como `FAILED`. El endpoint `POST /api/internal/on-street-sms/process` exige `Authorization: Bearer $CRON_SECRET`, procesa solamente avisos vencidos y puede ser invocado manualmente para la demostración.

No se configuró Vercel Cron ni un proveedor real. Cuando se autorice producción, un cron puede invocar el endpoint protegido con una frecuencia de un minuto y el adaptador puede reemplazarse por uno real que encapsule credenciales, endpoint del proveedor, envío, identificador de respuesta y clasificación de errores, sin modificar sesiones ni la UX pública.
