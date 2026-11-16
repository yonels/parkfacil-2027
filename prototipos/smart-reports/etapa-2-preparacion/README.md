# M2 — preparación local aislada, no editor implementado

**Fecha:** 2026-10-28. **Solicitud:** SOL-2026-10-28-001.

Autorizado: preparar exclusivamente Etapa2 con datos ficticios y sin integrar rutas productivas. No está aprobado el catálogo definitivo ni el desarrollo funcional On Street. Esta carpeta contiene planificación y fixtures, **no** un nuevo constructor funcional ni una integración.

## Material preparado

- `fixtures-preparacion.json`: escenario Off Street completamente ficticio; bloque sin capacidad con etiqueta «No calculable»; On Street reservado pero bloqueado, sin registros ni funciones.
- El [HTML V2.1 original](../referencia-v2.1/ParkFacil_V21.html) permanece como referencia separada; sus capacidades no se contabilizan como construcción nueva.
- [Arquitectura común y ocupación](../../../docs/smart-reports/ALCANCE_MODALIDADES_Y_OCUPACION.md) y [catálogo On Street documental](../../../docs/smart-reports/CATALOGO_ON_STREET_PROPUESTO.md).

No hay servidor, endpoint, cliente Supabase, credenciales, HTTP, persistencia real, tareas programadas ni acceso a datos del sistema desde esta preparación. No se modifica package.json ni se instala dependencia.

## Diseño de carpetas para implementación posterior, no creadas como funcionalidad

```text
editor/          componentes comunes de lienzo/biblioteca/configuración
contracts/       layout versionado, modalidad, IDs allowlist
fixtures/        datos ficticios rotulados; nunca fallback de un fallo real
tests/           interacción accesible, límites y layouts inválidos
adapters/        mock local Off Street; conectores reales NO autorizados
```

Selector futuro arriba: Off Street / On Street. En la fase de implementación local Off Street, On Street solo podrá mostrarse como «Pendiente de autorización» deshabilitado, sin cargar indicadores/calcularlos. Biblioteca común y templates con `modality` explícita; al cambiar contexto se conserva layout anterior y no se remapean métricas a datos de otra modalidad. No se desarrolla selector funcional On Street con esta autorización.

## Backlog de implementación local M2 pendiente de iniciar

1. Contrato de layout con modalidad, versión, IDs únicos, tamaños y máximo de bloques, sin SQL/HTML libre ni URLs arbitrarias.
2. Biblioteca/lienzo Off Street con fixtures rotulados, inserción vacío/antes/después, reordenar, resize y edición. «Agregar» táctil y controles de teclado como alternativas.
3. Foco accesible, anuncios, modal, mobile/responsive, borrar/duplicar/deshacer y casos de límites.
4. Guardado **solo de ensayo** y recuperación local explícita; no persistencia multiempresa ni permisos reales.
5. Paquete de pruebas/capturas para revisión. Ningún prototipo ficticio se etiqueta como integrado.

## Criterios de prueba que deben acompañar M2

| Caso | Resultado exigido |
|---|---|
| Fuente ficticia | Aviso visible «Datos ficticios», sin contacto con servicios. |
| On Street no autorizado | Opción deshabilitada/reservada; sin ejecución de adaptadores ni fórmulas On Street. |
| Catálogo pendiente | UI de ensayo no afirma aprobación de19 KPIs ni convierte propuestas en contrato productivo. |
| Falta capacidad/presencia | Valor nulo y «No calculable», nunca porcentaje simulado como real. |
| Modalidad incompatible | Rechazo de bloque/layout no compatible, sin ampliación de scope ni migración silenciosa. |
| Layout inválido | No scripts/SQL libre, IDs duplicados, tamaños arbitrarios ni número excesivo de bloques. |
| Interacción | DnD y alternativas por teclado/táctil, reorder/resize/edit/remove/undo con verificación real posterior. |

**Progreso M2 actual:0%.** Preparar carpetas/fixtures/criterios no cumple los hitos funcionales del constructor. No se está solicitando aprobación para integración. Al terminar esta preparación se requiere revisión y autorización antes de implementar o conectar cualquier componente adicional.
