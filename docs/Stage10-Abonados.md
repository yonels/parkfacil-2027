# Stage 10 - Abonados y Credenciales

## Objetivo

Implementar la base visual y estructural del módulo Abonados y Credenciales de ParkFacil 2027, manteniendo un enfoque demostrativo y visual sin integrar procesos operativos reales ni autenticaciones físicas.

## Alcance

- Crear la ruta principal /abonados con resumen, búsqueda y filtros.
- Crear la ruta dinámica /abonados/[id] con detalle visual del abonado.
- Representar abonados, vehículos, credenciales, permisos y vigencia mediante datos demostrativos.
- Reutilizar la arquitectura visual base del proyecto, incluyendo shell compartido, componentes de UI y navegación.

## Modelo demostrativo

Se crearon abonados de ejemplo con:

- Tipos de abonado como particular, colaborador de empresa, residente, temporal y otros.
- Estados como activo, suspendido, pendiente y bloqueado.
- Vehículos con patentes ficticias y estados de autorización.
- Credenciales con tipos como RFID, patente, QR, móvil y manual.
- Permisos de acceso con horarios, accesos específicos y vigencia de referencia.

## Archivos creados

- src/app/abonados/page.js
- src/app/abonados/[id]/page.js
- src/components/abonados/AbonadoCard.js
- src/components/abonados/AbonadosGrid.js
- src/components/abonados/AbonadoResumen.js
- src/components/abonados/EstadoAbonadoBadge.js
- src/components/abonados/TipoAbonadoBadge.js
- src/components/abonados/CredencialBadge.js
- src/components/abonados/VigenciaAbonadoBadge.js
- src/data/abonados.mjs
- src/data/abonados.test.mjs

## Archivos modificados

- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md

## Pruebas

- node --test src/data/abonados.test.mjs

## Limitaciones

- No se conectó a una base de datos ni a recursos operativos reales.
- No se implementaron acciones de apertura de barreras ni validación de credenciales.
- No se incorporó lógica de negocio real para permisos ni accesos.

## Pendientes futuros

- Integrar vistas operativas de control de acceso.
- Conectar a servicios de credenciales y hardware.
- Añadir flujos de activación, suspensión y auditoría.

## Etapa 18 - Integracion Supabase y Abonados Basicos

### Objetivo

Cerrar la persistencia real del modulo Abonados Basicos con Supabase, manteniendo el diseno visual existente y dejando fuera funcionalidades avanzadas de control de accesos.

### Alcance implementado

- Listado, creacion, detalle y edicion persistidos en Supabase mediante `/api/abonados` y `/api/abonados/[id]`.
- Datos personales separados en `nombres`, `apellido_paterno` y `apellido_materno`, con `nombre` conservado como nombre completo derivado por compatibilidad.
- RUT separado en `rut_numero` y `rut_dv`, validado por modulo 11 y presentado con formato chileno.
- Telefono separado en pais, codigo y numero, con Chile `+56` como valor predeterminado.
- Responsable como entidad basica reutilizable en `abonado_responsables`, seleccionable o creable desde el formulario.
- Patente normalizada en mayusculas con letras, numeros y guion.
- Credencial basica con ayuda visible para evitar confundirla con el RUT y opcion de generar identificador interno.
- Desactivacion logica mediante `estado = inactive`; no se implemento borrado fisico de abonado.

### Migraciones agregadas

- `supabase/migrations/20260725120000_abonados_foundation.sql`: tablas base `abonados`, `abonado_vehiculos`, `abonado_credenciales`, indices, RLS, triggers y funcion de codigo.
- `supabase/migrations/20260727093000_fix_abonados_service_role_permissions.sql`: permisos iniciales para `service_role`.
- `supabase/migrations/20260727094500_fix_abonados_service_role_privileges.sql`: permisos de esquema, secuencias y funcion `next_abonado_codigo()`.
- `supabase/migrations/20260727110000_abonados_basic_profile_fields.sql`: campos personales separados, telefono separado, responsables basicos, constraints actualizados y relacion `responsable_id`.

### Modelo de datos final

- `abonados`: identidad del abonado, nombres separados, RUT separado, telefono separado, empresa, responsable, tipo, estado, vigencia, estacionamientos y observaciones.
- `abonado_responsables`: responsable reutilizable con nombres, apellidos, correo, telefono y estado.
- `abonado_vehiculos`: vehiculo principal con patente normalizada, marca, modelo, color, tipo y `status`.
- `abonado_credenciales`: identificador de acceso, tipo basico, `status`, vigencia y bloqueo.

### Endpoints

- `GET /api/abonados`: lista abonados con vehiculos, credenciales y responsable.
- `POST /api/abonados`: crea abonado, responsable nuevo opcional, vehiculo principal y credencial principal.
- `GET /api/abonados/[id]`: obtiene el detalle por UUID.
- `PATCH /api/abonados/[id]`: actualiza datos aprobados, vehiculo, credencial y estado.
- `PUT /api/abonados/[id]`: alias de PATCH.

No se implemento `DELETE /api/abonados/[id]` para borrado fisico de abonado.

### Validaciones

- Nombres y apellido paterno obligatorios.
- Apellido materno opcional sin espacios dobles en visualizacion.
- RUT numero solo digitos, DV `0-9` o `K`, validacion modulo 11 y unicidad por RUT.
- Telefono normalizado por codigo y numero.
- Patente alfanumerica en mayusculas, con guion permitido.
- Credencial no se inicializa con RUT, telefono, patente ni nombre.
- Responsable nuevo requiere nombres y apellido paterno.

### Pruebas ejecutadas

- `npm run lint`: exitoso.
- `npm run build`: exitoso con advertencia no bloqueante existente en documentos.
- `node --test`: 71 pruebas exitosas.
- `npx supabase db push`: exitoso para la migracion `20260727110000`.
- Smoke test real Supabase: GET 200, POST 201, GET por ID 200, PATCH 200 y recarga GET 200 con datos persistidos.

### Prueba manual Supabase

Registro de prueba: `94b5d25a-395b-41c0-a565-1d8b25e54729`.

Resultado validado:

- Nombre completo persistido como `Prueba Api Etapa Editada`.
- RUT presentado como `22.222.222-2`.
- Telefono persistido como `+56 912345680`.
- Responsable persistido como `Responsable Api Etapa`.
- Patente editada a `API18-03`.
- Credencial editada a estado `revoked`.
- Abonado desactivado logicamente con `estado = inactive`.

### Responsividad

El formulario y vistas mantienen grillas responsivas existentes con columnas que se apilan en pantallas pequenas. En esta ejecucion no se pudo usar el navegador integrado de Codex porque no habia instancia disponible; queda recomendado revisar visualmente 360, 390, 768, 1024 y 1440 px antes de aprobacion funcional final.

### Asuntos postergados

- Control de Accesos transversal.
- Invitaciones HTML.
- QR dinamico.
- Tiempo maximo de permanencia.
- Dependencias y zonas.
- Lectores QR.
- LPR.
- Face ID y WebAuthn.
- Reconocimiento facial.
- Torniquetes.
- Antipassback.
- Aforo.

## Etapa 18 - Vista Excel e importacion controlada

### Dependencia autorizada

Se agrego `exceljs` para generar y leer archivos `.xlsx` reales desde endpoints del servidor. La instalacion modifica `package.json` y `package-lock.json`.

### Vista tabular principal

La ruta `/abonados` usa una tabla compacta como vista predeterminada. Cada fila abre `/abonados/[id]` mediante clic, Enter o Space. Las acciones internas `Ver` y `Editar` detienen la navegacion de fila.

Columnas principales:

- Codigo.
- Nombre completo.
- RUT.
- Telefono.
- Correo.
- Responsable.
- Estado.
- Fecha de inicio.
- Fecha de termino.
- Vehiculos.
- Credenciales.
- Ultima actualizacion.

### Paginacion y filtros

`GET /api/abonados` acepta `page`, `limit`, `search`, `estado`, `responsable`, `sort` y `direction`, y devuelve `data`, `total`, `page`, `limit` y `totalPages`. El limite visible permite 25, 50 o 100 registros por pagina.

### Exportacion Excel

`GET /api/abonados/exportar` genera un `.xlsx` con la hoja `Abonados`, encabezados en espanol, filtros de Excel, primera fila congelada, anchos razonables y valores de RUT/telefono como texto. La exportacion reutiliza los filtros del listado y recorre todas las paginas coincidentes, no solo la pagina visible.

### Plantilla

`GET /api/abonados/plantilla` genera `plantilla_abonados.xlsx` con hojas `Abonados` e `Instrucciones`. Incluye datos ficticios de ejemplo y reglas para crear o actualizar registros sin modificar encabezados.

### Importacion

La importacion se divide en dos pasos:

- `POST /api/abonados/importar/validar`: recibe un `.xlsx`, valida extension, tamano maximo de 10 MB, hoja `Abonados`, columnas obligatorias y maximo de 5.000 filas.
- `POST /api/abonados/importar/confirmar`: procesa solo filas validas confirmadas por el usuario.

La identificacion de registros existentes sigue este orden: ID interno, codigo abonado y RUT normalizado. No se actualiza por nombre y no se eliminan abonados ausentes del archivo.

### Informe de errores

`POST /api/abonados/importar/errores` genera un `.xlsx` con fila, campo, valor y mensaje. La previsualizacion muestra filas validas, errores, creaciones y actualizaciones antes de aplicar cambios.

### Limites y seguridad

- Solo `.xlsx`.
- Maximo 10 MB por archivo.
- Maximo 5.000 filas por importacion.
- No se ejecutan formulas ni macros.
- No se guardan archivos permanentes.
- No se exponen claves ni rutas internas.

### Pendientes

La validacion visual responsiva sigue pendiente hasta contar con navegador disponible o revision manual. No se creo commit.
