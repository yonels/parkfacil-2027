# Architecture Decision Log

## Arquitectura general

- ParkFacil 2027 administra estacionamientos.
- Cada empresa tiene un RUT propio y único.
- Una empresa puede administrar varios estacionamientos y cada estacionamiento tiene una empresa administradora.
- Un estacionamiento es `ON_STREET` u `OFF_STREET`; sus pantallas de configuración cambian según el tipo.
- On Street utiliza sectores, calles, tramos, plazas, operadores y turnos.
- Off Street utiliza niveles, zonas, plazas, accesos, barreras y cámaras.
- Operadores, dispositivos y tarifas deben asignarse con flexibilidad cuando el negocio lo requiera.
- No crear relaciones rígidas sin necesidad y mantener historial en las relaciones importantes.
- El servidor es la fuente de verdad. Los datos demo no son persistencia real.
- El sistema debe mantenerse simple para el usuario y aplicar siempre KISS.

## Regla de desarrollo

Antes de modificar un módulo, revisar su documentación existente. Aplicar KISS y realizar el cambio mínimo necesario.

## ADL-00-01: Fundación del Proyecto
- Fecha: 2026-07-24
- Decisión: Utilizar Next.js 16 con App Router, JavaScript, Tailwind CSS, ESLint y alias `@/*`.
- Estado: Aprobado
- Justificación: Permite una base moderna y estándar para el proyecto sin requerir TypeScript en esta etapa.

## ADL-00-02: Biblioteca Documental local
- Fecha: 2026-07-24
- Decisión: Implementar una Biblioteca Documental basada en contenido local, sin Supabase ni carga/edición de archivos.
- Estado: Aprobado
- Justificación: La primera fase debe entregar documentación y no operativa de datos.

## ADL-02-01: Autenticación, contexto y separación de portales

- Fecha: 2026-08-06
- Estado: Aprobado
- Decisión: Supabase Auth continúa siendo el único responsable de autenticar la identidad y validar la sesión del usuario. ParkFacil no sustituye, replica ni implementa un sistema de autenticación propio; consume la identidad validada por Supabase Auth para construir el contexto de autorización y aplicar permisos.
- Justificación: Separar autenticación y autorización evita confiar en datos enviados por el navegador y permite centralizar las reglas de acceso sin duplicar la gestión de credenciales, contraseñas, tokens o recuperación de cuenta de Supabase Auth.

### Requisitos obligatorios

1. El portal se determina en el servidor desde `x-forwarded-host` o `host`: `cliente.parkfacilapp.cl` corresponde al Portal Cliente y `root.parkfacilapp.cl` al Portal Root. En desarrollo, `cliente.localhost` representa Cliente y `localhost` representa Root.
2. La identidad y la sesión se validan mediante Supabase Auth usando `supabase.auth.getUser(accessToken)`. El token de acceso se transporta en una cookie HttpOnly, `Secure` en producción y `SameSite=Lax`, y nunca debe escribirse en logs.
3. `platform_admin` solo puede acceder desde el Portal Root, conserva alcance global y nunca queda limitado por un `companyId`.
4. Para `company_admin` y `operator`, el rol y el `companyId` autorizados se obtienen exclusivamente desde una membresía persistida en `company_members`, consultada mediante el UUID autenticado por Supabase Auth.
5. Una cuenta Cliente solo queda autorizada cuando la membresía está `active`, el rol es `company_admin` u `operator`, y la empresa relacionada está `active` con `relationship_type = 'client'`.
6. Ningún `company_id` recibido desde body, query string, headers, localStorage, metadatos del navegador u otro dato controlado por el cliente puede participar en la decisión de autorización.

### Límites de la decisión

- Supabase Auth autentica; el contexto central de ParkFacil autoriza.
- La navegación por rol es una medida visual y no reemplaza la protección del servidor, de las APIs ni de RLS.
- La protección completa de las APIs y las políticas RLS multiempresa se implementan en etapas posteriores.
