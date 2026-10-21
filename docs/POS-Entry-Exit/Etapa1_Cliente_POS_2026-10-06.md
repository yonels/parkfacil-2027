# ParkFacil — POS Entry/Exit — Etapa 1 Cliente Off Street y ajuste POS

Fecha: 6 de octubre de 2026 (America/Santiago).

## Alcance web

- Administrador Cliente con un único producto OFF_STREET: inicio directo en /dashboard-off-street después de autenticar; se conservan destinos explícitos y los demás productos/roles.
- Tablero: tarjetas enlazan reportes conservando empresa, estacionamiento, período y criterio. Ocupación actual incluye ingresos abiertos anteriores al período; actividad cuenta fecha de ingreso/salida según tarjeta. Ingresos anulados significa ingresados en el período y actualmente anulados.
- Períodos: hoy, ayer, 7 días, mes, personalizado.
- Reportes: tabla con búsqueda y filtros en el conjunto completo autorizado; ordenar, mover/ocultar columnas, ajustar ancho, agrupar, subtotales, total, paginar, Excel/CSV e impresión (guardar PDF desde navegador). Preferencias de columnas por usuario y reporte; no se persisten filas en el navegador. Tope de consulta existente: 20.000; si se supera, se solicita reducir el rango.
- Tarjeta se mantiene como categoría única: el modelo actual no guarda débito/crédito por separado.
- Turnos actuales incluye OPEN y CLOSING. Cambiar pestaña limpia los criterios específicos de la tarjeta.
- POS: login compacto, contexto operativo compacto y botones adaptados a altura real del WebView (compatibilidad Chrome 83), sin alterar pagos ni impresión.
- Credenciales: UI solo se habilita si existe el canal nativo ParkFacilCredentials. Guarda después de autenticar y autorizar scope pos_operator; leer/guardar/olvidar; sin guardado de contraseña en almacenamiento web. El canal no existe en la APK antigua, por lo que esta publicación por sí sola no habilita el recordatorio.

## Android: base recibida y bloqueo

El ZIP recibido contiene la APK azul 0.3.1-azul-webviewdiag, versionCode 4. Su Gradle genera preview 0.3.2 y su scanQr() devuelve not_implemented. El equipo reporta 0.3.11-azul preview83, con flujo efectivo e impresión aprobados. No se debe compilar esta base antigua y distribuirla como reemplazo de la APK aprobada.

Se preparan cambios nativos para integrar en el código actualizado: PosCredentialStore (AES/GCM, AndroidKeyStore), PosCredentialChannel (WebMessageListener, origen HTTPS exacto de POS_URL y solo marco principal /pos/login), ocultación del diagnóstico por defecto, viewport de WebView y ajuste de insets/teclado.

Antes de actualizar el POS: recuperar fuentes 0.3.11, aplicar el cambio nativo conservando impresión/QR, compilar con la misma identidad y firma y versionCode superior al instalado; verificar en el hardware.

## Validación

147 pruebas automáticas pasan: reportes/recaudación/tablero, filtros y totales, fechas, aislamiento/permisos, destino post-login y protocolo de credenciales. ESLint sin errores; aviso preexistente por imagen de evidencia en PosTerminal. Build web webpack verificado.

Prueba visual con el código compilado y sesiones/datos simulados: login y pantalla inicial operativa caben sin desplazamiento horizontal y con botones dentro de la altura disponible en 320×568, 360×640 y 480×800. Autocompletado y olvido comprobados mediante canal nativo simulado; esto no valida el Keystore Android ni el POS físico.

La compilación Android y el uso del Keystore no se consideran aprobados hasta validar la base actual y completar el build. No se ha instalado ni probado una nueva APK en hardware. No se han realizado pagos TUU reales ni modificado datos o credenciales de usuarios.

Publicación autorizada: rama QA release/qr-onstreet-1.0. Producción main fuera de este cierre de pruebas.
