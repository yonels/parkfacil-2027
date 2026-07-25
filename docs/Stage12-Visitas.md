# Stage 12 - Visitas y Reservas

## Objetivo

Implementar la base visual y estructural del modulo Visitas y Reservas de ParkFacil 2027 con datos exclusivamente demostrativos para representar invitados, autorizaciones temporales y ventanas de acceso.

## Alcance

- Crear la ruta principal /visitas con resumen, busqueda, filtros y listado visual.
- Crear la ruta dinamica /visitas/[id] con detalle integral de la visita.
- Representar visitantes peatonales y vehiculares, anfitriones, reservas, permisos y actividad demostrativa.
- Reutilizar catalogos existentes sin duplicar informacion base.

## Rutas

- /visitas
- /visitas/[id]
- /documentos/stage-12-visitas

## Modelo demostrativo

Se incorporaron visitas de ejemplo con:

- codigo unico de visita;
- visitante con identificador demostrativo;
- empresa de origen y empresa anfitriona;
- anfitrion y responsable alternativo;
- reserva temporal con ventana de acceso;
- permisos por estacionamiento y acceso;
- vehiculo opcional;
- acompanantes opcionales;
- actividad, incidencias, historial y auditoria de referencia.

## Tipos de visita

- business
- supplier
- delivery
- contractor
- personal
- interview
- event
- maintenance
- emergency
- courtesy
- temporary
- other

## Estados de visita

- scheduled
- pending_approval
- approved
- checked_in
- in_progress
- checked_out
- completed
- cancelled
- rejected
- expired
- no_show

## Aprobacion

Estados soportados:

- not_required
- pending
- approved
- rejected
- revoked

## Medios de identificacion

- license_plate
- qr_code
- temporary_card
- document
- pin
- mobile
- manual
- reception
- other

## Vehiculos

Se modelan visitantes con o sin vehiculo utilizando campos demostrativos:

- id
- licensePlate
- brand
- model
- color
- vehicleType
- parkingSpace
- notes

## Acompanantes

Cada visita puede incluir acompanantes con datos demostrativos:

- id
- name
- identifier
- email
- phone
- notes

## Ventanas de acceso

Cada visita utiliza:

- visitDate
- validFrom
- validUntil
- entryFrom
- entryUntil
- exitUntil
- allDay
- multipleEntry
- maximumEntries
- gracePeriodMinutes
- timezone
- accessNotes

## Vigencia

Se implementaron funciones para:

- determinar visita vigente;
- detectar visita futura;
- detectar visita en curso;
- detectar visita vencida;
- calcular minutos restantes;
- calcular duracion autorizada;
- detectar reservas proximas a vencer (<= 60 minutos);
- generar etiqueta legible de vigencia.

## Permisos

La base visual contempla:

- estacionamientos autorizados;
- accesos autorizados;
- acceso peatonal y vehicular;
- autorizacion general y especifica;
- ingreso unico y multiples ingresos;
- referencias faltantes visualizadas como No disponible.

## Relaciones

Se reutilizaron catálogos existentes mediante identificadores:

- src/data/empresas.mjs
- src/data/estacionamientos.mjs
- src/data/usuarios.mjs
- src/data/controlAccesos.mjs
- src/data/operacion.mjs
- src/data/abonados.mjs

## Componentes

- src/components/visitas/VisitasClient.js
- src/components/visitas/VisitasGrid.js
- src/components/visitas/VisitaCard.js
- src/components/visitas/VisitaResumen.js
- src/components/visitas/EstadoVisitaBadge.js
- src/components/visitas/TipoVisitaBadge.js
- src/components/visitas/AprobacionVisitaBadge.js
- src/components/visitas/VigenciaVisitaBadge.js
- src/components/visitas/VehiculoVisitaCard.js
- src/components/visitas/PermisosVisitaCard.js

## Arquitectura Server/Client

- src/app/visitas/page.js mantiene metadata y renderiza un Server Component.
- La logica interactiva con useState y filtros vive en src/components/visitas/VisitasClient.js.
- src/app/visitas/[id]/page.js mantiene metadata sin usar hooks de cliente.
- No existe combinacion de metadata con use client en el mismo archivo.

## Archivos creados

- src/app/visitas/page.js
- src/app/visitas/[id]/page.js
- src/components/visitas/VisitasClient.js
- src/components/visitas/VisitasGrid.js
- src/components/visitas/VisitaCard.js
- src/components/visitas/VisitaResumen.js
- src/components/visitas/EstadoVisitaBadge.js
- src/components/visitas/TipoVisitaBadge.js
- src/components/visitas/AprobacionVisitaBadge.js
- src/components/visitas/VigenciaVisitaBadge.js
- src/components/visitas/VehiculoVisitaCard.js
- src/components/visitas/PermisosVisitaCard.js
- src/data/visitas.mjs
- src/data/visitas.test.mjs
- docs/Stage12-Visitas.md

## Archivos modificados

- src/config/navigation.js
- src/lib/documentos.js
- CHANGELOG.md
- docs/Stage00-Foundation.md

## Pruebas

- node --test src/data/visitas.test.mjs

## Limitaciones

- No se implementan flujos reales de aprobacion o rechazo.
- No se conectan barreras, dispositivos ni hardware.
- No se generan QR funcionales ni credenciales reales.
- No se integran APIs, base de datos ni Supabase.

## Pendientes futuros

- Integracion con procesos reales de invitacion y autorizacion.
- Trazabilidad operacional en tiempo real.
- Integracion con canales de notificacion productivos.
- Vinculacion con validaciones de identidad y hardware operativo.
