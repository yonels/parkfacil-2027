# Deuda única al primer cierre

Regla opcional para planes de minuto efectivo: minutos completos desde ingreso hasta
primer cierre, descontando gratuidad configurada, más una sola tarifa nocturna.
El importe permanece fijo hasta el pago; no agrega días ni nuevas noches.

Configurar en Tarifas: activar cierre de deuda, apertura, cierre y monto nocturno.
La zona operacional es America/Santiago. Admite jornadas que cruzan medianoche.
Cada ticket nuevo conserva el plan del ingreso aunque posteriormente sea reemplazado.
Tickets históricos sin plan inequívoco requieren revisión; no se reasignan automáticamente.

La política se publica desactivada en los planes existentes. No se establecieron
horarios ni precios de producción. La prueba en QA utiliza datos ficticios.

## Validación

125 pruebas de dominio/servicios y regresión aprobadas, más 6 pruebas SQL en PGlite
(esquema mínimo, pgcrypto y datos ficticios). En Supabase QA se comprobó asignación
del plan y protección de importe/ticket. Con datos extraídos de QA, el motor confirmó
igual importe al cierre, al día siguiente, a 70 días y al año.

No se realizó pago real ni prueba visual de extremo a extremo. QA carece de firma
Webpay configurada; no se modificaron credenciales. Las firmas técnicas de pago
siguen expirando para evitar reutilización; la deuda no expira y puede recalcularse
con el mismo plan y monto.

## Base de datos

Se requiere parking_rate_schedules_and_overnight antes de closing_debt_once.
Ambas se aplicaron a producción con autorización el 21-10-2026; closing_debt_once
ya estaba aplicada a QA. El conector registra timestamps de ejecución propios;
verificar por nombre y contenido antes de reaplicar migraciones desde CLI.

## Reversión

Si fuera necesario revertir código, suspender la creación de planes con esta política
antes de hacerlo: la versión anterior no puede cobrar esas deudas. No borrar planes,
tickets ni columnas. Conservar el cálculo nuevo para liquidar tickets ya asignados.
