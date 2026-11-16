# Instrucciones para Claude Code

Claude Code y Codex comparten las mismas reglas del proyecto. La fuente única es `AGENTS.md`
(incluida a continuación); este archivo no la reemplaza ni la contradice.

@AGENTS.md

## Regla permanente de trazabilidad — aplicación por Claude Code

- Registro único compartido con Codex: `docs/solicitudes/INDICE.md` y
  `docs/solicitudes/SOL-AAAA-MM-DD-NNN/README.md` en `C:\proyectos\parkfacil-2027`.
  Se usa también para el trabajo hecho en otros repositorios del proyecto (por ejemplo
  `C:\proyectos\parkfacil-v2` o worktrees como `C:\proyectos\parkfacil-2027-pago-liberado`),
  indicando repositorio, rama y rutas.
- Antes de trabajar: leer el índice y la solicitud correspondiente. Si ya existe, continuar en su
  carpeta; si es nueva, asignar el siguiente correlativo libre del día y crear su carpeta.
- Registrar en cada intervención el agente (**Claude Code** o **Codex**), la fecha y el repositorio.
- No crear historiales paralelos ni sobrescribir lo escrito por el otro agente: agregar una sección
  `### Intervención <agente> — <fecha>` al final del registro.
- No modificar simultáneamente los mismos archivos que el otro agente: revisar `git status` y la fecha
  de modificación antes de editar archivos compartidos.
- Antes de cerrar: actualizar registro e índice e informar identificador, ruta, estado y evidencia,
  distinguiendo **Implementado**, **Probado localmente**, **Validado en hardware** y **Publicado**.
- Reconstruir solo antecedentes verificables; lo que no pueda comprobarse se marca **No documentado**.
  No inventar resultados.
- Esta regla no autoriza commit, push, deploy, migraciones ni envíos reales.
