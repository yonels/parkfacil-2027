# ParkFacil POS Entry/Exit — Clientes Off Street

Base de producción: 62353da254917ac14daec3d8fd5fd5f9d76cc580.

## Comportamiento

El administrador de empresa que ingresa al portal Cliente llega al Dashboard Off Street. La raíz del portal también redirige al dashboard para sesiones existentes. Root conserva su inicio.

El dashboard muestra razón social, nombre de fantasía y RUT consultados por el companyId de la sesión. Un RUT ausente se identifica como No informado. Los indicadores y reportes usan estacionamientos Off Street autorizados; no contienen cifras demostrativas.

Las tarjetas abren tablas de recaudación (efectivo, crédito, débito y tarjetas históricas sin clasificar), movimientos, vehículos estacionados, ocupación, turnos y cierres. La navegación de Cliente dirige a esas rutas. Se oculta el banner promocional al cliente.

El portal Cliente exige company_admin sin pos_only; el operador mantiene el acceso Terminal. No se modifica Kotlin, APK, integración TUU, lógica de cobro POS ni credenciales existentes.

## Validación local

- 151 pruebas de dominio, reportes, separación de tarjetas, filtros y aislamiento: PASS.
- 44 pruebas de autorización: PASS (incluyen seis también ejecutadas en el grupo anterior).
- ESLint de archivos involucrados: PASS.
- Build Next.js de producción con configuración ficticia de Supabase: PASS. Esto valida compilación y páginas, no conectividad de producción.

No se requiere nueva migración. La lectura de payment_card_type es compatible con bases sin la columna: los pagos históricos permanecen sin clasificar, sin adivinar crédito/débito.

## Validación pendiente en producción

Después del push a main y Vercel Ready Production: ingresar con cliente.test@parkfacil.cl, confirmar empresa Inmobiliaria 5Q, RUT real o No informado, indicador sin movimientos como cero y detalle de cada tarjeta. Verificar /api/auth/session como company_admin de emp-5q. Nunca copiar contraseña o tokens a capturas/documentos.

El despliegue y el comportamiento de la cuenta real no se consideran aprobados solo por los resultados locales.
