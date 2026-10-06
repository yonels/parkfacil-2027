# Clientes Off Street: Crédito y Débito

Implementación: tarjetas separadas en dashboard, recaudación, filtros y tablas/exportaciones del reporte. El método base CASH/CARD se conserva; payment_card_type añade CREDIT/DEBIT para los nuevos pagos aprobados. Los históricos sin tipo figuran como Tarjeta sin clasificar; no se infieren ni se modifican montos o cierres existentes.

El POS comprueba disponibilidad del campo antes de iniciar TUU. El pago se registra junto con su tipo en la actualización de salida existente, tras aprobación. Sin migración, las consultas mantienen compatibilidad de lectura, el efectivo funciona y el POS nuevo bloquea el inicio de cobros con tarjeta. Clientes antiguos pueden seguir registrando CARD sin clasificación.

## Despliegue QA

Aplicar primero supabase/migrations/20261006220000_offstreet_payment_card_type.sql al proyecto Supabase usado por el Preview. Confirmar proyecto antes de ejecutar (referencia QA comunicada: ohzksqazcgtdeuowqagy). Luego publicar exclusivamente release/qr-onstreet-1.0 y esperar Vercel Ready. No publicar main. No requiere una nueva APK para este cambio web.

## Revisión y pruebas

238 pruebas Node aprobadas, ESLint sin errores (una advertencia preexistente img), compilación Next webpack aprobada con configuración ficticia. Migración ejecutada dos veces en PGlite: idempotencia, restricciones, montos intactos, históricos intactos, scope parking/turno y On Street intacto. Interfaz compilada revisada en Chromium con datos simulados: cards Crédito, Débito e históricos, enlaces al filtro correspondiente. No se usaron datos o sesiones reales ni se realizaron cobros.

Pendiente de ambiente real: aplicar migración QA, publicación remota, acceso cliente autenticado y pago físico Crédito/Débito con APK TUU DEV de Haulmer. El cierre canónico conserva el tipo en nuevos snapshots para reportes del cliente; no se modifica la APK ni la impresión nativa de cierres.
