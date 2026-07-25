# Stage 13 - Convenios y Beneficios

## Objetivo

Implementar la base visual, estructural y demostrativa del modulo Convenios y Beneficios de ParkFacil 2027 para representar convenios comerciales y reglas de beneficios sin integraciones productivas.

## Alcance

- Crear la ruta principal /convenios con resumen, busqueda, filtros y listado.
- Crear la ruta dinamica /convenios/[id] con detalle comercial, vigencia, beneficiarios, utilizacion y simulacion demostrativa.
- Registrar el documento en /documentos/stage-13-convenios.
- Reutilizar catalogos existentes mediante identificadores y manejo seguro de referencias inexistentes.

## Rutas

- /convenios
- /convenios/[id]
- /documentos/stage-13-convenios

## Modelo demostrativo

Se incorporaron convenios de ejemplo con:

- tipos comerciales variados;
- modalidades de beneficio;
- topes de uso y montos;
- vigencia, dias y horarios;
- empresas, estacionamientos y accesos asociados;
- beneficiarios por empresa, patente, visitante y abonado;
- utilizacion acumulada y estado operacional;
- simulacion de aplicacion claramente marcada como demostrativa.

## Tipos de convenio

- corporate
- commercial
- employee
- resident
- supplier
- courtesy
- event
- promotional
- institutional
- temporary
- parking_partner
- other

## Estados

- draft
- scheduled
- active
- suspended
- expired
- cancelled
- archived

## Modalidades de beneficio

- percentage_discount
- fixed_discount
- free_minutes
- free_hours
- preferred_rate
- full_exemption
- partial_exemption
- flat_rate
- daily_cap
- monthly_cap
- courtesy_ticket
- validation
- custom

## Reglas y topes

Cada convenio modela reglas como:

- porcentaje o descuento fijo;
- minutos u horas gratuitas;
- tarifa preferencial;
- tope por operacion, diario y mensual;
- maximo de usos total, diario y mensual;
- aplicacion automatica o con aprobacion;
- acumulacion, entradas multiples y tolerancia.

## Beneficiarios

Tipos soportados:

- company
- user
- subscriber
- visitor
- employee
- supplier
- resident
- vehicle
- license_plate
- group
- public

Cada beneficiario incluye datos demostrativos de vigencia, uso y consumo acumulado.

## Vigencia

Se implementaron utilidades para:

- detectar convenio vigente, futuro o vencido;
- detectar proximos a vencer (<= 30 dias);
- calcular dias restantes;
- validar dia permitido;
- validar horario permitido;
- generar etiqueta legible.

## Estacionamientos y empresas

Se consideran escenarios de:

- convenio global o especifico;
- estacionamiento y acceso validos;
- referencias inexistentes con salida visual No disponible;
- empresa principal, beneficiaria y responsable.

## Utilizacion

Se modelan indicadores demostrativos de:

- usos totales, diarios y mensuales;
- beneficiarios unicos;
- consumo acumulado;
- consumo restante;
- topes alcanzados;
- alta utilizacion.

## Simulacion demostrativa

Se incorporo un bloque de simulacion con:

- monto base demostrativo;
- beneficio aplicable;
- descuento estimado;
- monto final estimado;
- reglas evaluadas;
- motivo de aceptacion o rechazo.

Incluye la leyenda:

- Esta simulacion no genera cobros ni descuentos reales.

## Relaciones

Se reutilizaron catalogos de:

- src/data/empresas.mjs
- src/data/estacionamientos.mjs
- src/data/usuarios.mjs
- src/data/contratos.mjs
- src/data/tarifas.mjs
- src/data/abonados.mjs
- src/data/visitas.mjs
- src/data/controlAccesos.mjs
- src/data/operacion.mjs

## Componentes

- src/components/convenios/ConveniosClient.js
- src/components/convenios/ConveniosGrid.js
- src/components/convenios/ConvenioCard.js
- src/components/convenios/ConveniosResumen.js
- src/components/convenios/EstadoConvenioBadge.js
- src/components/convenios/TipoConvenioBadge.js
- src/components/convenios/ModalidadBeneficioBadge.js
- src/components/convenios/VigenciaConvenioBadge.js
- src/components/convenios/BeneficiariosConvenioCard.js
- src/components/convenios/ReglasConvenioCard.js
- src/components/convenios/UtilizacionConvenioCard.js
- src/components/convenios/SimuladorConvenio.js

## Arquitectura Server/Client

- src/app/convenios/page.js mantiene metadata en Server Component.
- La logica interactiva de busqueda y filtros reside en src/components/convenios/ConveniosClient.js con use client.
- src/app/convenios/[id]/page.js mantiene metadata y no usa hooks cliente.
- No se mezcla use client con export const metadata en el mismo archivo.

## Archivos creados

- src/app/convenios/page.js
- src/app/convenios/[id]/page.js
- src/components/convenios/ConveniosClient.js
- src/components/convenios/ConveniosGrid.js
- src/components/convenios/ConvenioCard.js
- src/components/convenios/ConveniosResumen.js
- src/components/convenios/EstadoConvenioBadge.js
- src/components/convenios/TipoConvenioBadge.js
- src/components/convenios/ModalidadBeneficioBadge.js
- src/components/convenios/VigenciaConvenioBadge.js
- src/components/convenios/BeneficiariosConvenioCard.js
- src/components/convenios/ReglasConvenioCard.js
- src/components/convenios/UtilizacionConvenioCard.js
- src/components/convenios/SimuladorConvenio.js
- src/data/convenios.mjs
- src/data/convenios.test.mjs
- docs/Stage13-Convenios.md

## Archivos modificados

- src/config/navigation.js
- src/lib/documentos.js
- src/data/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas

- node --test src/data/convenios.test.mjs

## Limitaciones

- No se aplican descuentos productivos.
- No se ejecutan cobros, pagos ni facturacion.
- No se integra POS, APIs, Supabase ni base de datos.
- No se habilitan LPR, QR funcional, barreras ni validacion real de tickets.

## Pendientes futuros

- Integrar motor real de reglas comerciales.
- Conectar eventos operacionales en tiempo real.
- Incorporar canales reales de aprobacion y comunicaciones.
- Integrar validacion transaccional con sistemas externos.
