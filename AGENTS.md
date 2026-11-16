# Instrucciones del proyecto

## Regla permanente de trazabilidad de solicitudes

Esta regla aplica a toda solicitud trabajada en este repositorio. No concede autorización para crear commits, hacer push, desplegar, aplicar migraciones, enviar comunicaciones ni ejecutar operaciones reales.

1. Antes de comenzar, asignar un identificador único con formato `SOL-AAAA-MM-DD-NNN`. El correlativo `NNN` se obtiene revisando `docs/solicitudes/INDICE.md`; nunca reutilizar un identificador.
2. Crear `docs/solicitudes/<IDENTIFICADOR>/README.md` y mantenerlo durante todo el trabajo.
3. Registrar como mínimo:
   - solicitud original y fecha;
   - alcance y criterios de aceptación;
   - decisiones del usuario y cambios de alcance;
   - archivos modificados;
   - pruebas ejecutadas y resultados reales;
   - pendientes y bloqueos;
   - commits, publicación y migraciones, únicamente cuando estén autorizados y hayan ocurrido.
4. Actualizar `docs/solicitudes/INDICE.md` con identificador, fecha, título, estado y enlace relativo.
5. Antes de cerrar una tarea, comprobar que el registro y el índice reflejen el resultado final. Informar al usuario el identificador y la ruta del registro.
6. Distinguir siempre estos estados de evidencia:
   - **Implementado:** existe código o configuración identificable.
   - **Probado localmente:** existe una ejecución verificable, con fecha y resultado real.
   - **Validado en hardware:** se identifica el equipo y la evidencia física disponible.
   - **Publicado:** se identifica commit, destino y evidencia del despliegue o publicación.
7. No declarar terminado un requisito sólo porque existe código. Cada afirmación debe limitarse al nivel de evidencia comprobado.
8. Al reconstruir solicitudes históricas, usar únicamente conversación, Git y artefactos verificables. Escribir **No documentado** para fechas, solicitudes originales, autorizaciones, pruebas o resultados que no puedan comprobarse. No inferirlos a partir de nombres de archivos o mensajes de commit.
9. Los cambios descartados, ausentes del árbol actual o mencionados sin evidencia no cuentan como funcionalidad terminada.


## Coordinación entre agentes (Codex y Claude Code)

Agregado el 2026-10-04 por Claude Code a pedido del usuario; complementa la regla anterior sin modificarla.

10. Ambos agentes usan el mismo registro (`docs/solicitudes/INDICE.md` y `docs/solicitudes/SOL-AAAA-MM-DD-NNN/`), también para trabajo realizado en otros repositorios del proyecto (indicar repositorio, rama y rutas).
11. Antes de trabajar, leer el índice y la solicitud correspondiente. Si la solicitud ya existe, continuar en su carpeta; si es nueva, asignar el siguiente identificador libre y crear su carpeta.
12. Registrar qué agente realiza cada intervención (Codex o Claude Code), con fecha. Las intervenciones posteriores se agregan como secciones nuevas al final del registro.
13. No crear historiales paralelos ni sobrescribir registros del otro agente. No modificar simultáneamente los mismos archivos.
14. Antes de cerrar, informar identificador, ruta, estado y evidencia.
15. `CLAUDE.md` aplica esta misma regla para Claude Code; ante cualquier diferencia prevalece este archivo.
