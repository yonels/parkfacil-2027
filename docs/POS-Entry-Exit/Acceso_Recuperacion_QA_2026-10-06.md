# POS / Clientes Off Street: control de acceso y recuperación

Incidencia confirmada en QA: PASSWORD_RECOVERY_DELIVERY_MISSING produjo 500 antes de llamar a servicios externos. Además, el autoservicio no reconocía el host Vercel Preview, por lo que podía mostrar respuesta genérica sin enviar correo. No confundir Ready con QA funcional.

## Controles implementados

- npm prebuild valida configuración en Vercel; next.config valida también el build directo de Next. Sin canal Microsoft o variables de Supabase/Graph necesarias, falla el build. No imprime valores.
- npm run check:access sirve para validar explícitamente el entorno local.
- Recuperación en Preview acepta únicamente VERCEL_URL/VERCEL_BRANCH_URL exactos del entorno preview; retorna al mismo host. Los dominios de producción conservan su portal. No acepta un host arbitrario ni una selección de portal en producción.
- Login transmite el portal al formulario de recuperación. Para recuperar Root en QA usar /recuperar-contrasena?portal=root; para cliente ?portal=cliente. La elegibilidad se sigue validando por rol y membresía. Esto no crea usuarios ni cambia sus permisos.
- GET /api/admin/access-readiness requiere sesión Root y verifica configuración, con no-store. No prueba entrega ni expone claves.
- Errores de recuperación generan logs con códigos y estados, sin usuario, correo, contraseña o token. La configuración de alertas externas sigue pendiente; los logs por sí solos NO envían avisos.
- scripts/verify-access-release.mjs bloquea aprobación sin evidencia completa vigente del mismo commit/entorno. El registro lo completa quien ejecuta la prueba real, no es prueba automática de entrega. Debe incorporarse al procedimiento de promoción; no sustituye el control de variables del build.

## Preparación QA en Vercel y Supabase

Preview release/qr-onstreet-1.0 debe tener PASSWORD_RECOVERY_DELIVERY=microsoft, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_SENDER_EMAIL. Nunca copiar secretos en documentos o chats. El control comprueba presencia/formato básico, no vigencia de claves, permisos de Graph ni entrega.

En Supabase QA ohzksqazcgtdeuowqagy, revisar Authentication → URL Configuration: permitir el retorno al Preview QA /nueva-contrasena. El permiso debe corresponder al host del despliegue autorizado; no incorporar dominios ajenos. La allowlist no fue modificada desde este entorno.

## Prueba real obligatoria antes de aprobar

Con una cuenta de QA identificada y autorizada, solicitar recuperación del portal correcto, recibir correo, comprobar host QA, cambiar contraseña e ingresar con la nueva. Probar enlace expirado y respuesta genérica para cuenta inexistente. No registrar claves o tokens; guardar commit, ambiente, hora, responsable y resultado. No generar recuperaciones repetidas ni cambiar cuentas reales para simular QA.

Registro JSON: {"commit":"COMMIT_COMPLETO","environment":"preview","reviewedBy":"RESPONSABLE","reviewedAt":"FECHA_ISO","checks":{"configuration":true,"recoveryEmailReceived":true,"qaRedirect":true,"newPasswordLogin":true,"expiredLinkRejected":true,"unknownUserGenericResponse":true}}.
Verificar con ACCESS_EXPECTED_COMMIT y ACCESS_EXPECTED_ENVIRONMENT y node scripts/verify-access-release.mjs RUTA_REGISTRO. Todos los true necesitan evidencia real; no rellenarlos por suposición.

## Incidente y soporte asistido

Buscar logs [RECUPERAR CONTRASEÑA] y [access:recovery:failed], identificar configuración/delivery sin divulgar errores crudos al cliente. Configurar alertas 5xx de esa ruta en el servicio de monitoreo habilitado y probar recepción de alerta. Esto requiere acceso al proveedor; no está activado aquí.
Root dispone de recuperación administrativa en Usuarios, limitada por permisos y empresa; utiliza el mismo correo Graph, por lo que NO es contingencia independiente si Graph falla. Si el correo falla: identificar/verificar al titular por procedimiento interno, reparar canal y reenviar; no mostrar contraseña antigua ni generar claves compartidas. No aprobar recuperación hasta validar entrega real.

## QA local

52 pruebas de lógica/seguridad/readiness y 9 de portales/destinos aprobadas; ESLint sin errores y build webpack con datos ficticios aprobados. Formulario compilado probado en Chromium: portal Root transmitido al POST simulado, sin envío de correo. E2E contra Supabase local no ejecutado: no existe .env.local ni instancia local disponible. No hubo correo real, cambio de contraseña, modificación de variables remotas ni alerta enviada.
