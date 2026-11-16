# ParkFacil 2027 — Guía práctica de tareas por rol

**Versión:** 2026-10-29 · **Registro:** SOL-2026-10-29-001 · **Fuente:** menú, páginas y permisos vigentes en `main`
(7af9f6a). Esta guía describe cómo se ejecuta cada tarea hoy; no describe funciones futuras.

## Cómo leer esta guía

| Rol | Quién es | Dónde trabaja |
|---|---|---|
| **Root** | Equipo ParkFacil (administrador de plataforma). | Portal Root: `root.parkfacilapp.cl` |
| **Administrador** | Administrador de la empresa cliente. Solo ve su empresa y los productos contratados (Off Street y/o On Street). | Portal Cliente: `cliente.parkfacilapp.cl` |
| **Operador** | Personal de caja del estacionamiento. Trabaja en el POS (equipo PRO2) y, si no es «solo POS», en la Data Entry web. | App «POS Off Street» en el PRO2 o `cliente.parkfacilapp.cl/data-entry` |
| **Inspector** (On Street) | Fiscalizador en terreno. | App de inspectores en el navegador del teléfono: `cliente.parkfacilapp.cl/inspector/login` |

- En la columna **Operación**, «Menú → A → B» indica el camino en el menú lateral del portal.
- Cuando dos roles pueden hacer la tarea, el primero es quien la ejecuta normalmente y el segundo lo hace por excepción
  o en modo consulta.
- Módulos que dependen de contratación o configuración se indican con ⚙.

---

## OFF STREET

### 1. Puesta en marcha (una vez por empresa o estacionamiento)

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Crear la empresa cliente | Menú → Administración → Empresas → crear empresa; completar razón social, RUT, giro y productos contratados (Off Street / On Street). | Root |
| Registrar el contrato y el plan comercial | Menú → Off Street → Tarifas → Planes; doble clic en la empresa → «Plan de la empresa» → asignar plan al contrato con fecha de inicio. | Root |
| Crear el administrador de la empresa | Menú → Administración → Usuarios → Administradores → Crear administrador. | Root |
| Crear el estacionamiento Off Street | Menú → Off Street → Estacionamientos → Estacionamientos → nuevo; nombre, código, dirección y capacidad. | Root (el Administrador lo consulta) |
| Definir niveles y zonas | Ficha del estacionamiento → Niveles → nuevo nivel → zonas del nivel con su capacidad. | Root / Administrador |
| Definir zonas y calles en la vía pública (Off Street en calle) | Ficha del estacionamiento → Sectores → nuevo sector → calles → tramos con «Capacidad asignada de autos estacionados». | Root / Administrador |
| Asignar operadores a una calle | Ficha de la calle → Operadores → asignar operador. | Administrador |
| Configurar la foto de patente al ingreso | Ficha del estacionamiento → Configuración → Foto de patente (desactivada, opcional u obligatoria; GPS). | Administrador |
| Configurar el aviso de deuda al ingreso | Ficha del estacionamiento → Configuración → Aviso de deuda. | Administrador |
| Crear operadores | Menú → Administración → Usuarios → Operadores → Crear operador; usuario, contraseña inicial y estacionamientos autorizados. | Administrador |
| Registrar dispositivos (PRO2, impresoras, cámaras, barreras) | Menú → Off Street → Estacionamientos → Dispositivos → registrar dispositivo y asociarlo al estacionamiento. | Administrador / Root |
| Instalar la app en el PRO2 | Se instala desde la tienda de Haulmer (Angel Watch) la app «POS Off Street». | Root (gestión con Haulmer) |

### 2. Tarifas y módulos

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Crear o editar la tarifa del estacionamiento | Menú → Off Street → Tarifas → Tarifas; modalidad (minuto efectivo o tramo), valores, días y franjas horarias con su tope; tarifa nocturna si aplica. | Administrador |
| Probar una tarifa antes de publicarla | Menú → Off Street → Tarifas → Simulador de tarifas; ingresar entrada y salida y revisar el cobro. | Administrador / Operador (consulta) |
| Mantener el catálogo de planes comerciales | Menú → Off Street → Tarifas → Planes → Nuevo plan / Editar plan / Archivar; moneda $ Pesos o UF, valores netos + IVA. | Root |
| ⚙ Configurar la boleta electrónica (Haulmer) | Menú → Off Street → Tarifas → Boleta electrónica; ingresar la API Key de producción y elegir los estacionamientos que emiten boleta en pagos en efectivo. | Administrador (Root ve el estado) |
| ⚙ Activar Pago liberado en un estacionamiento | Menú → Off Street → Pago liberado → «Activación del módulo» → activar el estacionamiento. Sin costo con ParkFacil. | Administrador |
| ⚙ Cupones de descuento | Menú → Off Street → Cupones y descuentos → Crear / Consultar / Eliminar cupones (el módulo debe estar contratado y activo). | Administrador |

### 3. Abonados y patentes autorizadas

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Crear o editar un abonado | Menú → Off Street → Abonados y Credenciales → nuevo / editar; datos, patentes, vigencia y credenciales (QR). | Administrador |
| Importar o exportar abonados | Abonados y Credenciales → Importar (Excel, con validación de errores) / Exportar. | Administrador |
| Registrar una patente liberada (Pago liberado) | Menú → Off Street → Pago liberado → «Nueva patente liberada»: patente (AAAA-11 o AA-1111), cantidad y unidad, inicio, término, modalidad (sin costo o cobro a un tercero con valor a facturar), uso (múltiple, una entrada o máximo), beneficiario (nombre, RUT, teléfono, correo) y motivo. | Administrador |
| Importar patentes liberadas desde Excel | Pago liberado → Importar desde Excel → descargar plantilla → subir archivo → revisar validación → Importar filas válidas. | Administrador |
| Editar, finalizar, eliminar o restaurar una patente liberada | Pago liberado → tabla → Editar / Finalizar ahora / Eliminar / Restaurar (con «Mostrar eliminadas»). | Administrador |
| Supervisar las patentes liberadas de una empresa | Portal Root → Off Street → Pago liberado → elegir empresa (solo lectura). | Root |

### 4. Operación diaria en el POS (PRO2)

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Iniciar sesión en el POS | App «POS Off Street» → usuario y contraseña de operador. | Operador |
| Iniciar turno | POS → INICIAR TURNO (turno programado o a pedido en el estacionamiento asignado). | Operador |
| Registrar el ingreso de un vehículo | POS → INGRESO → leer o escribir la patente → CONFIRMAR → foto si corresponde → REGISTRAR INGRESO → se imprime el ticket con QR. | Operador |
| Ingreso de una patente liberada | Igual que el ingreso; el POS muestra «LIBERADO POR …» con beneficiario y período; foto obligatoria; el ticket imprime el rótulo «LIBERADO POR …». | Operador |
| Ver vehículos dentro del estacionamiento | POS → VEHÍCULOS EN EL PARKING (lista con patente, hora y minutos; se puede imprimir). | Operador |
| Registrar la salida y cobrar en efectivo | POS → SALIDA → leer el QR del ticket o escribir la patente → revisar TOTAL A PAGAR → PAGAR en efectivo → se imprime el comprobante (y la boleta electrónica si está configurada). | Operador |
| Cobrar con tarjeta (débito o crédito) | SALIDA → PAGAR con tarjeta → se abre TUU en el PRO2 → el cliente paga → el POS registra el resultado e imprime el comprobante. | Operador |
| Aplicar un cupón de descuento | SALIDA → leer el QR del cupón o escribir su código antes de pagar; el total se recalcula. | Operador |
| Salida de una patente liberada | SALIDA → si está dentro del período: REGISTRAR SALIDA SIN COBRO ($0); si se pasó del término: se cobra solo el tiempo excedente. | Operador |
| Registrar un vehículo que se fue sin pagar | SALIDA → «Se retiró sin pagar» con nota; queda como deuda de la patente. | Operador |
| Reimprimir un ticket o comprobante | POS → REIMPRIMIR TICKET / REINTENTAR IMPRESIÓN. | Operador |
| Revisar los pagos del turno | POS → PAGOS DEL DÍA. | Operador |
| Cerrar el turno | POS → cierre de turno → contar el efectivo → confirmar → imprimir cierre (REIMPRIMIR CIERRE si hace falta). | Operador |
| Registrar ingresos y salidas desde el computador | Menú → Data Entry (portal cliente). | Operador (no «solo POS») / Administrador |

### 5. Supervisión y control

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Ver el estado del día | Menú → Off Street → Dashboard (ocupación, ingresos, recaudación). | Administrador / Root |
| Revisar la operación en curso | Menú → Off Street → Operación → Operación (estadías abiertas y su detalle). | Administrador |
| Programar y revisar turnos | Menú → Off Street → Operación → Turnos; ficha del estacionamiento → Turnos para programarlos. | Administrador |
| Cerrar un turno pendiente desde la web | Turnos → turno abierto → Cerrar. | Administrador |
| Revisar pagos y medios de pago | Menú → Off Street → Recaudación → Pagos / Medios de Pago. | Administrador |
| Gestionar deudas de vehículos que se fueron sin pagar | Menú → Off Street → Recaudación → Deudas pendientes; revertir una marca errónea o cobrarla en el próximo ingreso. | Administrador (el Operador ve el aviso al ingresar) |
| Revisar y regularizar pagos con tarjeta inciertos | Menú → Off Street → Recaudación → Pagos con tarjeta. | Administrador |
| Controlar accesos | Menú → Off Street → Estacionamientos → Accesos. | Administrador |
| Monitorear dispositivos | Menú → Off Street → Monitoreo / Dispositivos (estado de PRO2, impresoras, cámaras). | Administrador / Root |

### 6. Reportes

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Reportes operativos y de recaudación | Menú → Off Street → Reportes → pestañas Recaudación, Entradas y salidas, Vehículos estacionados, Cierres de caja, Operadores y turnos, Ocupación, Calles y tramos; exportar Excel, CSV o PDF. | Administrador / Root |
| Reportes de Pago liberado | Menú → Off Street → Reportes Pago liberado → elegir el reporte (listado, gratuitas, terceros, vigentes, programadas, próximos vencimientos, vencidas, finalizadas y eliminadas, historial, por organización, uso del beneficio) → filtros → Exportar Excel. | Administrador (Root en solo lectura por empresa) |

### 7. Administración comercial (ParkFacil)

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Activar o desactivar módulos de una empresa | Menú → Administración → Gestión de módulos. | Root |
| Facturar a las empresas cliente | Menú → Administración → Facturación (prefacturación, facturas, notas de crédito y débito, cuenta corriente, pagos, cobranza, conciliación). | Root |
| Mantener datos de la propia empresa | Ficha de su empresa (solo lectura para el Administrador); Mi Cuenta para los datos personales. | Administrador (cambios: Root) |
| Mantener los datos de la cuenta y el correo de recuperación | Menú → Administración → Mi Cuenta. | Root / Administrador |
| Recuperar la contraseña | Pantalla de inicio de sesión → «Recuperar contraseña» (llega un enlace al correo de recuperación). | Todos |

---

## ON STREET

### 1. Puesta en marcha

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Habilitar On Street en la empresa | Menú → Administración → Empresas → ficha → productos contratados: On Street. | Root |
| Crear el proyecto On Street | Menú → On Street → Proyectos On Street → Nuevo proyecto (equivale a un estacionamiento On Street). | Root / Administrador |
| Crear áreas, calles y tramos | Menú → On Street → Estructura → Áreas / Calles / Tramos → nuevo (capacidad del tramo). | Root |
| Asociar estructura al proyecto | Proyectos On Street → Proyectos actuales → ficha del proyecto → agregar áreas, calles y tramos. | Root / Administrador |
| Generar los QR y letreros de cada ubicación | Ficha del proyecto o de la ubicación → QR / Letrero → descargar e imprimir. | Administrador / Root |
| Configurar la tarifa On Street | Menú → On Street → Configuración → Tarifas. | Administrador |
| Crear inspectores | Menú → On Street → Fiscalización → Inspectores → nuevo inspector (correo y contraseña inicial) → entregar los datos de acceso y la URL `cliente.parkfacilapp.cl/inspector/login` al inspector. | Root (el Administrador los consulta) |

### 2. Uso por el conductor (sin rol interno)

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Iniciar una sesión de estacionamiento | Escanear el QR del letrero → patente, tiempo y pago (Webpay) en `/estacionar/<código>`. | Conductor |
| Extender la sesión | Desde el enlace de la sesión (`/estacionar/sesion/<token>`) → extender tiempo y pagar. | Conductor |
| Descargar el comprobante | Enlace del comprobante (`/estacionar/comprobante/<token>`). | Conductor |
| Recibir avisos por SMS | Automático antes del vencimiento (si la empresa tiene SMS habilitado). | Sistema |

### 3. Fiscalización en terreno

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Iniciar sesión en la app de inspectores | Navegador del teléfono → `cliente.parkfacilapp.cl/inspector/login` (también funciona en `root.parkfacilapp.cl/inspector/login`) → correo y contraseña entregados por Root. Si abre `/inspector` sin sesión, lo envía al inicio de sesión. | Inspector |
| Consultar una patente | App → Consulta → patente → estado de la sesión (vigente, vencida o sin sesión). | Inspector |
| Registrar una fiscalización | App → Fiscalización → patente, ubicación y evidencia (foto) → guardar. | Inspector |
| Emitir un ticket de cortesía | Desde la fiscalización → imprimir el ticket de cortesía (reimpresión disponible). | Inspector |
| Revisar las fiscalizaciones propias | App → Fiscalizaciones / Historial. | Inspector |

### 4. Supervisión y control

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Ver el estado del día | Menú → On Street → Dashboard (sesiones, ocupación y recaudación). | Administrador / Root |
| Revisar sesiones | Menú → On Street → Operación → Sesiones → detalle de la sesión. | Administrador |
| Revisar pagos | Menú → On Street → Operación → Pagos. | Administrador |
| Revisar fiscalizaciones | Menú → On Street → Fiscalización → Fiscalizaciones. | Administrador |
| Gestionar inspectores (editar, desactivar) | Menú → On Street → Fiscalización → Inspectores → ficha del inspector. | Root (el Administrador los consulta) |

### 5. Reportes

| Tarea | Operación | Quién la ejecuta |
|---|---|---|
| Reportes On Street | Menú → On Street → Reportes → Reportes (tablas exportables) y Gráficos. | Administrador / Root |

---

## Notas

- **Operador:** no ve reportes, recaudación, deudas, pagos con tarjeta, Pago liberado, cupones ni usuarios; solo aplica
  las reglas en el POS.
- **Inspector:** solo accede a la app de inspectores (`/inspector`); si intenta entrar al portal Cliente o Root recibe
  «Esta cuenta solo puede acceder al portal de Inspectores». No está ligado a una empresa: consulta patentes de todas.
  La app Android propia («ParkFacil Inspector») aún no está configurada para producción; hoy se usa el navegador.
- **Root** no opera el POS: «Data Entry» lo lleva al inicio de sesión de operador.
- ⚙ Boleta electrónica: sin API Key de producción la boleta sale como «documento de prueba».
- ⚙ Cupones: oculto en producción hasta su activación comercial.
- Pago liberado: el ticket imprime «LIBERADO POR …»; la línea «Entre … y …» requiere una APK nueva (en espera).
