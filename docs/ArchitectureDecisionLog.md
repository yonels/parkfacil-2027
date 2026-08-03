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
