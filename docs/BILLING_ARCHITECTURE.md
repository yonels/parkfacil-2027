# Arquitectura de Facturación

## Etapa 1 — Prefacturación

**Estado:** auditoría y diseño; sin implementación funcional.
**Fecha de corte:** 2026-08-10.

### 1. Dictamen ejecutivo

ParkFacil aún no puede generar una prefactura automática íntegra y auditable. La fuente contractual productiva es `company_contracts`, complementada por `companies`, `parkings` y `contract_parking_spaces`. Hoy existe un solo contrato real y una sola asignación de plazas contratadas. `module_pricing` contiene precios modulares reales, pero es un catálogo global y no prueba qué contrató cada cliente.

El catálogo `commercial_plans` está definido en una migración local, pero la tabla no existe en el Supabase consultado. `companies.commercial_plan` es solo una etiqueta sin versión ni relación contractual. Los dispositivos son datos demo en código/localStorage; no hay inventario productivo para facturarlos. Las tarifas de `parking_rates` pertenecen a estacionamiento → conductor y quedan expresamente excluidas de ParkFacil → cliente.

### 2. Clasificación del modelo actual

| Elemento | Clasificación | Fuente | Decisión |
|---|---|---|---|
| Empresas | IMPLEMENTADO Y PRODUCTIVO | `companies` | Reutilizar |
| Contratos | IMPLEMENTADO PERO INCOMPLETO | `company_contracts` | Fuente contractual; completar estructura facturable |
| Plan asignado a empresa | IMPLEMENTADO PERO INCOMPLETO | `companies.commercial_plan` | Referencia informativa, no precio contractual |
| Catálogo de planes | NO EXISTE en producción | migración local `commercial_plans` | Regularizar y versionar en etapa posterior |
| Precios por módulo | IMPLEMENTADO Y PRODUCTIVO | `module_pricing`, auditoría asociada | Usar como insumo al contratar; nunca recalcular historia |
| Estacionamientos | IMPLEMENTADO Y PRODUCTIVO | `parkings` | Reutilizar con alcance contractual explícito |
| Plazas por contrato | IMPLEMENTADO Y PRODUCTIVO, cobertura parcial | `contract_parking_spaces` | Reutilizar |
| Dispositivos | DEMO | `src/data/dispositivos.mjs`, localStorage | No facturable; crear inventario productivo |
| Tarifas a conductores | IMPLEMENTADO Y PRODUCTIVO | `parking_rates` y motor tarifario | Excluir del dominio comercial ParkFacil |
| Planes visuales históricos | DEMO/LEGACY | `src/data/tarifas.mjs`, `src/data/contratos.mjs` | No usar para facturar |
| Pagos/recaudación de parking | IMPLEMENTADO Y PRODUCTIVO | estadías, movimientos y cierres | Otro dominio; no representa cuentas por cobrar B2B |
| Prefacturas | NO EXISTE | — | Construir después de aprobación |

### 3. Matriz de campos de empresa

| Campo | Existe | Ubicación | Utilizable | Observación |
|---|---:|---|---:|---|
| Empresa / ID | Sí | `companies.id` | Sí | Tenant estable |
| RUT | Sí | `rut_number`, `rut_dv` | Sí | Único compuesto |
| Razón social | Sí | `business_name` | Sí | — |
| Giro | Sí | `business_activity` | Sí | — |
| Dirección | Sí | `address` | Sí | — |
| Comuna | Sí | `district` | Sí | — |
| Ciudad | Sí | `city` | Sí | — |
| Estado | Sí | `status` | Sí | Exigir empresa activa al calcular |
| Correo | Sí | `email` | Parcial | Correo general, no necesariamente facturación |
| Contacto | Sí | `primary_contact`, `phone` | Sí | Calidad depende de carga; 5Q posee placeholders |
| Correo facturación | No | — | No | Falta explícito |
| Correo cobranza | No | — | No | Falta explícito |
| Condición de pago | Sí, contractual | `company_contracts.payment_due_days` | Sí | No debe duplicarse en empresa |
| Moneda contractual | Sí, contractual | `company_contracts.currency` | Sí | CLP, UF o USD |

### 4. Matriz maestra de cobertura

| Requerimiento | Existe | Fuente actual | Acción recomendada |
|---|---:|---|---|
| Empresa y RUT | Sí | `companies` | Reutilizar |
| Contrato, estado y vigencia | Sí | `company_contracts` | Reutilizar |
| Plan contractual | Parcial | etiqueta en empresa | Vincular contrato a versión de plan |
| Fee mensual | Parcial | `company_contracts.monthly_value` | Tratar como snapshot contractual |
| Periodicidad | Parcial | JSON `commercial_terms` | Normalizar en ítem contractual |
| Día de facturación | No | — | Agregar a términos facturables |
| Moneda | Sí | contrato | Reutilizar |
| UF | Parcial | monto/moneda UF | Falta fuente, fecha, tasa y congelación CLP |
| Condición de pago | Sí | contrato | Reutilizar |
| Descuento | Parcial | descuento anual en contrato/JSON | Normalizar vigencia y alcance |
| Estacionamientos de empresa | Sí | `parkings.company_id` | Reutilizar |
| Estacionamientos incluidos | Parcial | `contract_parking_spaces` | Hacer explícito alcance uno/varios/todos |
| Plazas contratadas | Sí, cobertura parcial | `contract_parking_spaces` | Reutilizar |
| Servicios contratados | Parcial | `commercial_terms` y precios modulares | Crear ítems contractuales versionados |
| Dispositivos reales | No | demo local | Crear inventario productivo |
| Devices incluidos/adicionales | No | — | Expresar en ítems y asignaciones contractuales |
| Conceptos facturables | No | — | Crear catálogo mínimo |
| Prefactura y detalle | No | — | Crear cabecera y líneas inmutables tras aprobación |
| Ajustes auditados | No | — | Registrar como línea y evento auditado |
| Idempotencia por período | No | — | Restricciones únicas y clave determinística |

### 5. Fuente de verdad recomendada

1. `companies`: identidad fiscal y estado del cliente.
2. `company_contracts`: contrato y condiciones generales; su `monthly_value` es snapshot, no una consulta dinámica al precio vigente.
3. Una versión de plan vinculada al contrato: plantilla comercial congelable, nunca sustituto del contrato.
4. `contract_parking_spaces`: alcance y plazas específicas.
5. Nuevos ítems contractuales: conceptos, cantidades, inclusiones, adicionales, precios y vigencias negociadas.
6. Nuevo inventario `devices`: activo físico y sus fechas/relaciones.
7. `module_pricing`: catálogo de referencia para cotizar, no fuente retroactiva de cobro.
8. Prefactura aprobada: snapshot de revisión, montos contractuales y UF provisional; la emisión futura congelará la UF definitiva del día de emisión.

En caso de conflicto prevalece el ítem contractual vigente y versionado sobre el plan genérico. Ningún dato demo ni tarifa al conductor participa del cálculo.

### 6. Modelo comercial mínimo

`Empresa → Contrato → versión de plan + ítems contractuales → estacionamientos/servicios/devices → líneas de prefactura`.

Cada ítem contractual indica concepto, cantidad incluida, modalidad de cobro, moneda, precio, objeto origen opcional, vigencia y regla de prorrateo futura. Un device adicional es facturable solo si existe en inventario, está vigente, pertenece a la misma empresa/parking y una regla contractual lo clasifica como adicional.

Los períodos usan `AAAA-MM`. Toda vigencia se evalúa por intersección `[fecha_desde, fecha_hasta]` con el período. El diseño admite prorrateo posterior, pero la Etapa 1 no define ni ejecuta fórmula de prorrateo.

### 7. Flujo exacto del motor futuro

1. Recibir período e idempotency key; validar formato y permisos.
2. Resolver contexto desde Supabase Auth; no aceptar rol ni empresa del navegador como autoridad.
3. Seleccionar empresas activas y contratos facturables cuya vigencia intersecte el período.
4. Bloquear una ejecución concurrente equivalente.
5. Resolver versión de plan e ítems contractuales vigentes.
6. Resolver estacionamientos explícitamente cubiertos; no inferir inclusión solo por `company_id`.
7. Resolver servicios y devices productivos vigentes dentro del tenant.
8. Aplicar cantidades incluidas y clasificar excedentes/adicionales.
9. Aplicar precios contractuales, descuentos autorizados y mínimo contractual, conservando explicación por línea.
10. Si la moneda es UF, obtener la tasa de una fuente administrada posteriormente y guardar monto UF, fecha, valor UF y conversión CLP. Sin tasa válida, fallar; nunca adivinar.
11. Calcular neto, impuesto estimado y total con redondeo definido por moneda.
12. Insertar una cabecera y líneas en una sola transacción, respetando restricciones únicas.
13. Registrar evento de cálculo con usuario, parámetros, versión de reglas y resultado.
14. Permitir revisión/recalcular solo estados habilitados; aprobar congela cabecera y líneas.

### 8. Objeto Prefactura

**Cabecera:** `id`, número interno, `company_id`, `contract_id`, período, moneda contractual, fecha de cálculo, vencimiento estimado, estado (`DRAFT`, `CALCULATED`, `UNDER_REVIEW`, `APPROVED`, `READY_TO_ISSUE`, `CANCELLED`), neto, impuesto, total, monto CLP, fecha/valor/fuente UF cuando aplique, versión del cálculo, timestamps y actores.

**Detalle:** concepto, descripción explicativa, cantidad, unidad, precio unitario, moneda, subtotal, descuento/impuesto, origen (`contract`, `parking`, `service`, `device`, `manual`), IDs de contrato/parking/device/ítem contractual, vigencia aplicada y `source_key` determinística.

Cada línea debe responder qué se cobró, por qué, bajo qué contrato, durante qué fechas y qué objeto lo originó. Un ajuste manual será una línea separada y un evento con usuario, fecha, motivo, valor anterior y nuevo; nunca se sobrescribe silenciosamente.

La grilla existente `ParkFacilDataGrid` se conserva con: Prefactura, Cliente, RUT, Contrato, Período, Moneda, Neto, Impuesto, Total, Estado, Fecha cálculo y Vencimiento. No se cargan filas ficticias.

### 9. Tablas mínimas propuestas (no creadas)

#### `billable_concepts`

Catálogo global controlado: `id` PK, `code` UNIQUE, nombre, descripción, unidad, categoría tributaria, estado, timestamps/actor. Índice por estado. No requiere `company_id`; no contiene precios inventados.

#### `commercial_plan_versions`

Versión inmutable de un plan: `id` PK, `commercial_plan_id` FK, versión, moneda, vigencia, estado, reglas/inclusiones JSON validadas, timestamps/actor; UNIQUE `(commercial_plan_id, version)`, índices por vigencia/estado. Requiere antes regularizar el catálogo `commercial_plans`. No lleva `company_id` por ser plantilla global.

#### `contract_billable_items`

Fuente de cobro negociada: `id` PK, `company_id` FK, `contract_id` FK, `concept_id` FK, `plan_version_id` FK nullable, `parking_id` FK nullable, `device_id` FK nullable, modalidad, cantidad/incluidos, unidad, precio, moneda, descuento, `valid_from`, `valid_to`, regla futura de prorrateo, estado, timestamps/actor. Índices `(company_id, contract_id, status, valid_from)`, objetos origen; UNIQUE contractual sobre contrato/concepto/origen/vigencia. Trigger/constraint debe impedir referencias entre tenants.

#### `devices`

Inventario productivo: `id` PK, `company_id` FK, `parking_id` FK, tipo, código/serial, nombre, ubicación, estado, alta, baja, responsable opcional, metadatos no secretos, timestamps/actor. UNIQUE `(company_id, code)` y serial cuando exista; índices por empresa, parking, tipo, estado y vigencia. Debe validar que parking y responsable pertenecen a la empresa.

#### `billing_preinvoices`

Cabecera descrita: PK UUID, `company_id` y `contract_id` FK, período, estado, moneda, vencimiento, totales, campos UF provisionales, versión del motor, idempotency key, timestamps/actores/cancelación. Índices empresa/período/estado. UNIQUE parcial `(company_id, contract_id, period)` para estados no cancelados y UNIQUE de idempotency key. Totales no negativos y transición de estados controlada.

#### `billing_preinvoice_lines`

Detalle snapshot: PK UUID, `company_id`, `preinvoice_id`, `concept_id`, `contract_item_id`, parking/device opcionales, origen, `source_key`, descripción, cantidad, unidad, moneda/precio, descuento, impuesto, subtotal/total, fechas. Índices por prefactura y objetos origen; UNIQUE `(preinvoice_id, source_key)`. Validación tenant de todas las FK.

#### `billing_audit_events`

Bitácora append-only: PK UUID, `company_id`, `preinvoice_id`, evento, actor, fecha, motivo, valores anterior/nuevo JSON sanitizados, request/correlation ID. Índices por prefactura/fecha, empresa/fecha y actor. Sin tokens, cookies ni secretos.

Estas siete estructuras son el mínimo porque cubren catálogo, versión comercial, acuerdo, inventario, snapshot, líneas e historial sin crear tablas separadas por cada tipo de cargo.

### 10. API futura

| Método y ruta | Uso | Regla esencial |
|---|---|---|
| `GET /api/billing/preinvoices` | Lista filtrada/paginada | Filtros validados; consulta tenant en BD |
| `GET /api/billing/preinvoices/[id]` | Cabecera, líneas y trazabilidad | 404 para recurso ajeno |
| `POST /api/billing/preinvoices/calculate` | `{ period, contractId? }` | Idempotency key obligatoria; empresa resuelta en servidor |
| `POST /api/billing/preinvoices/[id]/recalculate` | Recalcula borrador/calculada | Nueva revisión atómica y auditada |
| `POST /api/billing/preinvoices/[id]/approve` | Aprueba y congela | Solo permiso financiero aprobador; motivo/comentario opcional |
| `POST /api/billing/preinvoices/[id]/cancel` | Cancela sin borrar | Motivo obligatorio y auditoría |

Respuestas uniformes: `401` sin sesión, `403` sin permiso funcional, `404` recurso inexistente/ajeno, `409` período duplicado/transición inválida, `422` datos contractuales incompletos. Las respuestas incluyen `requestId`, nunca secretos ni detalles internos.

### 11. Seguridad e idempotencia

- Supabase Auth sigue siendo la única fuente de autenticación.
- Integrar permisos dedicados posteriormente en `src/lib/auth/permissions.mjs`; mientras tanto, Facturación permanece Root-only. No definir roles financieros definitivos en esta etapa.
- Obtener `company_id`, rol y membresía desde contexto central; jamás confiar en URL/body/query para autorizar.
- Filtrar por tenant directamente en Supabase; `service_role` solo es credencial técnica del servidor y no sustituye autorización.
- Aplicar RLS definitivo en una etapa autorizada y defensa adicional mediante validaciones de pertenencia en API/BD.
- La clave de cabecera impide repetir cliente + contrato + período. `source_key` representa contrato + concepto + origen; para device incorpora `device_id` + período.
- Cálculo, líneas y auditoría se escriben transaccionalmente. Reintentos con la misma clave devuelven el mismo resultado; claves diferentes contra el mismo período producen `409`.
- Tras aprobar, los valores son inmutables. Correcciones posteriores se registran como revisión/ajuste, nunca mediante edición silenciosa.
- Logs: IDs, ruta, estado, motivo, IP/correlation ID; nunca tokens, cookies, claves, cuerpos completos ni datos bancarios.

### 12. Próximos pasos propuestos

1. Aprobar esta arquitectura y resolver definiciones funcionales pendientes: día de facturación, prorrateo, tratamiento tributario/redondeo, fuente UF y alcance “todos los parkings”.
2. Corregir la divergencia entre migraciones locales y Supabase para `commercial_plans` antes de depender de él.
3. Diseñar/aprobar migraciones nuevas y RLS; no ejecutarlas sin autorización.
4. Cargar datos contractuales faltantes y un inventario real de devices.
5. Implementar motor y APIs con pruebas de aislamiento, duplicidad, vigencia, UF y trazabilidad.
6. Conservar la emisión DTE/proveedor externo fuera de esta fase.

## Etapa 2 — Fundación de Prefacturación

### Schema implementado localmente

La migración `20260810120000_billing_preinvoice_foundation.sql` implementa las siete estructuras aprobadas: `billable_concepts`, `commercial_plan_versions`, `contract_billable_items`, `billing_devices`, `billing_preinvoices`, `billing_preinvoice_lines` y `billing_audit_events`. Reutiliza `companies`, `company_contracts`, `commercial_plans`, `parkings`, `contract_parking_spaces` y `module_pricing`. Los conceptos iniciales no incluyen precios; cada precio se congela en el ítem contractual.

Se usa `billing_devices` en vez de `devices` para no confundir el inventario facturable B2B con identificadores operacionales dispersos. Todas las entidades tenant poseen `company_id`, FK, índices y guardas que rechazan relaciones entre empresas. RLS está habilitado sin políticas permisivas y el acceso directo de `anon`/`authenticated` está revocado; las APIs autorizan antes de usar el cliente técnico del servidor.

### Motor, vigencia e idempotencia

`preinvoiceCore.mjs` valida `YYYY-MM`, intersección de vigencias, moneda contractual, clasificación `INCLUDED`/`ADDITIONAL`, precio contractual, líneas y totales. No calcula impuesto si el tratamiento tributario no está aprobado. Las restricciones impiden dos cabeceras activas para empresa + contrato + período y dos líneas con el mismo `source_key`; para devices la clave incorpora device y período. Cabeceras y líneas aprobadas quedan congeladas.

### UF oficial

`UfRateService` encapsula la API BDE REST `GetSeries` del Banco Central de Chile. Requiere `BCCH_API_USER`, `BCCH_API_PASSWORD` y `BCCH_UF_SERIES_ID`; las credenciales se obtienen mediante registro/aceptación de condiciones del Banco. Sin credenciales, serie o respuesta válida el cálculo UF se bloquea explícitamente. La UF guardada durante prefacturación es provisional; la Etapa 3 reemplaza la regla temporal configurable por la regla comercial definitiva para emisión: `uf_reference_date = invoice_date`.

### API y UI

- `GET /api/billing/preinvoices`: listado real, paginado en una etapa posterior.
- `GET /api/billing/preinvoices/[id]`: cabecera, líneas y referencias de origen.
- `POST /api/billing/preinvoices/calculate`: período + `Idempotency-Key` obligatorio.

Las APIs utilizan Supabase Auth y los permisos centrales `billing:read`/`billing:manage`, actualmente exclusivos de `platform_admin` en Portal Root. La planilla existente de Prefacturación consulta datos reales, permite calcular por período y abre un detalle simple con líneas y origen. Si el contrato no posee ítems o falta UF, muestra el requisito faltante y no inventa información.

### Estado de despliegue

La migración quedó creada y validada estáticamente, pero no fue aplicada al Supabase remoto porque la contraseña de base configurada fue rechazada por el pooler. No existe fallback con `service_role` para ejecutar DDL. Antes de la demostración con persistencia real se requiere corregir `SUPABASE_DB_PASSWORD`, aplicar las migraciones pendientes (incluida `commercial_plans`) y cargar condiciones contractuales reales, sin datos demo.

## Etapa 3 — Revisión y aprobación

### Máquina de estados

`DRAFT → CALCULATED → UNDER_REVIEW → APPROVED → READY_TO_ISSUE`. Desde `DRAFT`, `CALCULATED` o `UNDER_REVIEW` se permite `CANCELLED` con motivo. El recálculo lleva `UNDER_REVIEW` a `CALCULATED`. No existe `ISSUED` ni integración DTE.

Las operaciones reciben la versión esperada y actualizan con bloqueo optimista por `id + version + estado`. Repetir una transición ya completada devuelve el estado existente sin duplicar auditoría. Una versión obsoleta produce conflicto. Las cabeceras y líneas quedan bloqueadas al aprobar.

### Observaciones, ajustes y recálculo

La migración incremental `20260810160000_billing_preinvoice_review.sql` agrega `billing_preinvoice_comments` y `billing_preinvoice_adjustments`, además de `version`, `uf_is_provisional`, referencia de ajuste y estado de línea. Una observación conserva autor y fecha. Un ajuste crea registro estructurado y línea `MANUAL`; nunca sobrescribe la línea contractual. Retirarlo exige motivo y lo marca `REMOVED`.

El recálculo elimina y regenera únicamente líneas contractuales. Los ajustes no desaparecen: quedan `REQUIRES_REVIEW` y se excluyen del nuevo total hasta una revisión posterior. Todo cambio genera un evento en `billing_audit_events`.

### Permisos y auditoría

Se separan `billing:review` y `billing:approve`; por ahora solo `platform_admin` posee ambos, exclusivamente desde Root. La separación permite que posteriormente una persona calcule/revise y otra apruebe sin cambiar el modelo.

Eventos: `REVIEW_STARTED`, `COMMENT_ADDED`, `ADJUSTMENT_ADDED`, `ADJUSTMENT_REMOVED`, `RECALCULATED`, `APPROVED`, `MARKED_READY_TO_ISSUE` y `CANCELLED` con actor, fecha, estados, motivo y metadata sanitizada.

### Regla UF

La UF de la prefactura es explícitamente provisional. La regla definitiva es `uf_reference_date = invoice_date`: durante la futura emisión deberá consultarse nuevamente al Banco Central y congelarse la UF oficial del día efectivo de emisión. No se usa automáticamente el primer o último día del período. `READY_TO_ISSUE` todavía no emite ni congela la UF definitiva.

## Etapa 4 — Emisión mediante proveedor (preparación bloqueada)

La Etapa 4 no avanzó a persistencia ni emisión porque las migraciones de Etapas 2/3 no pudieron validarse en Supabase. Los puertos 5432 y 6543 del pooler responden `28P01 password authentication failed`; la contraseña configurada no autentica para el proyecto actual. También faltan `BCCH_API_USER`, `BCCH_API_PASSWORD` y `BCCH_UF_SERIES_ID`. Deben corregirse y completarse antes de continuar.

Se preparó únicamente el límite autorizado:

- `BillingProviderAdapter`: contrato interno neutral, sin nombres ni payload de un proveedor inventado.
- `MockBillingProviderAdapter`: escenarios local/test de éxito, pendiente, rechazo, timeout, error temporal y duplicidad.
- `BillingDocumentRequest`: validación neutral de emisor, cliente, tipo, fecha, moneda, líneas, totales e idempotency key.

En el cierre de Etapa 4 no se creó `BillingService`, `billing_documents`, permiso `billing:issue`, API `/issue` ni UI de Facturas porque la autorización exigía detenerse. La Etapa 5 posterior habilitó completar localmente parte de esa arquitectura, manteniendo prohibida la declaración de persistencia real y cualquier proveedor real.

## Etapa 5 — Cuenta Corriente (implementación local pendiente de despliegue)

El documento de Etapa 5 autorizó continuar con código local verificable mientras Supabase permanezca bloqueado. Se agregaron dos migraciones independientes no aplicadas:

- `20260810190000_billing_documents.sql`: documentos neutrales del proveedor, estados de emisión, idempotencia por prefactura/tipo y RLS cerrado.
- `20260810200000_billing_account_movements.sql`: movimientos inmutables de Cuenta Corriente y asiento automático al pasar un documento a `ISSUED`.

`BillingService` valida `READY_TO_ISSUE`, datos fiscales, líneas, clasificación tributaria e idempotencia. Para UF consulta nuevamente `UfRateService.getUfByDate(invoice_date)` y construye el monto CLP definitivo. Solo se ha probado con `MockBillingProviderAdapter`; no existe proveedor real configurado ni validación de persistencia remota.

### Modelo de movimientos

`billing_account_movements` registra `INVOICE`, `DEBIT_NOTE`, `CREDIT_NOTE`, `PAYMENT` y `ADJUSTMENT`. Factura/ND generan Debe; NC/Pago generan Haber. No se almacena un saldo editable: `accountRepository` carga todo el historial autorizado y `accountCore` calcula débitos, créditos, saldo acumulado y vencimiento antes de aplicar filtros de UI.

Una factura UF ingresa a Cuenta Corriente en CLP usando `converted_amount_clp` definitivo. No se suman monedas incompatibles. La restricción única documento + tipo impide duplicar el asiento. Los movimientos no admiten update/delete; una corrección futura requiere movimiento compensatorio mediante `reversal_of`.

La API `GET /api/billing/accounts` usa `billing:read`, resuelve el alcance de empresa en servidor y no confía en un `companyId` arbitrario. La vista Cuenta Corriente reutiliza `ParkFacilDataGrid`, muestra indicadores por moneda y no contiene filas ficticias. `billing_payment_applications` queda diferida hasta Pagos/Conciliación porque no es necesaria para registrar ni reconstruir movimientos en esta etapa.
