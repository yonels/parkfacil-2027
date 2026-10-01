# Pago liberado — Diseño de responsabilidades y fases B–E

Estado: diseño acordado con el usuario (2026-10-01). Fase A implementada (catálogo Root + cotización CRM).
Fases B–E **no implementadas**. Este documento reemplaza las decisiones anteriores que reservaban a Root la
configuración de beneficios y preveían para el cliente solo una vista de lectura.

## 1. Dos precios distintos (no mezclar)

| Precio | Quién lo define | Quién paga | Dónde |
|---|---|---|---|
| Módulo ParkFacil (Mensual/Semestral/Anual y cargos que se definan) | **Root** | Dueño del estacionamiento → ParkFacil | Catálogo `released_payment_catalog` (Fase A), cotización, contrato |
| Estacionamiento liberado para beneficiarios | **Administrador del estacionamiento** | Beneficiario → estacionamiento | Autorizaciones (Fase C) |

- Todos los precios del módulo son editables por Root; la migración solo siembra valores iniciales. Nada fijo en código.
- Cada cotización y contratación guarda copia de los precios acordados; cambiar el catálogo no altera propuestas ni contratos.
- La duración del beneficio de un vehículo es independiente de la modalidad comercial contratada.
- **Pendiente:** modelo de cobro del módulo por cupo unitario vs. precio por modalidad. No se autorizan paquetes y no se
  deriva ningún precio por cupo o patente de los valores anteriores.

## 2. Responsabilidades y permisos

| Acción | Root | Admin. del estacionamiento | Operador POS |
|---|---|---|---|
| Catálogo y precios del módulo, cargos adicionales | ✅ | ❌ | ❌ |
| Cotizar y enviar propuestas (aprobación/rechazo) | ✅ (CRM) | ❌ | ❌ |
| Contratar/activar/suspender el módulo y fijar cupos contratados | ✅ | ❌ (solo ve) | ❌ |
| Beneficiarios (empresas, personas), vehículos/patentes | ❌ (supervisa) | ✅ | ❌ |
| Autorizaciones: vigencia, continua/recurrente, días/franjas, regla de excedentes, valor al beneficiario | ❌ (supervisa) | ✅ | ❌ |
| Aplicar reglas en ingreso/salida (foto, ticket, cupo, cobro de excedente) | ❌ | ❌ | ✅ |
| Historial de cambios | ✅ todos | ✅ su ámbito | ❌ |

- Aislamiento: el administrador solo ve y gestiona estacionamientos de su ámbito; validado en servidor (HTTP), no solo en UI.
- Permisos nuevos propuestos: `RELEASED_PAYMENT_COMMERCIAL` (Root, incluido en `PLATFORM_GLOBAL`) y
  `RELEASED_PAYMENT_MANAGE` (administrador, acotado a sus estacionamientos). El operador usa `OPERATIONS_USE` y no
  recibe permisos de escritura del módulo.
- Todo cambio de autorización o valor queda en historial (quién, cuándo, antes/después, motivo).

## 3. Modelo operativo

- **Autorización unitaria** por patente + estacionamiento: vigencia desde/hasta; tipo continuo (inicio→término) o
  recurrente (días de la semana + franjas, dentro de la vigencia); regla de cobro fuera del período; valor que cobra el
  estacionamiento al beneficiario.
- Franjas pueden cruzar medianoche (lunes 22:00–02:00 = lunes 22:00 → martes 02:00), en la zona horaria del estacionamiento.
- Festivos = días normales según el horario semanal (sin calendario especial en esta etapa).
- Se cobran solo los intervalos fuera de la autorización, sin duplicar; la franja es de reloj (no se reinicia por ingreso).
- Varios ingresos por franja; cada ingreso exige foto nueva, ticket y cupo; nunca dos estadías activas por patente.
- **Cupos contratados** = solo límite de ocupación simultánea; no crean autorizaciones ni asignan beneficios.
  El administrador no puede superar la capacidad contratada.
- Carga masiva: solo facilita crear autorizaciones individuales; no hay grupos ni paquetes de vehículos.

## 4. Fases

- **B — Contratación y activación (Root):** contrato por empresa/estacionamiento con copia de precios acordados,
  modalidad, cupos contratados y vigencia; activación independiente de aceptar la propuesta; suspensión/reactivación
  con historial.
- **C — Gestión del administrador:** entrada **"Pago liberado" en el sidebar del administrador** (reemplaza la vista de
  solo lectura): beneficiarios, vehículos, autorizaciones (individual y carga masiva), valores al beneficiario,
  validación de capacidad contratada, historial.
- **D — POS:** detección de la patente, validación de vigencia/franja/cupo/estadía activa/reingreso, foto nueva
  obligatoria, ticket "PAGO LIBERADO", salida $0 o cobro del excedente con la tarifa del estacionamiento. El operador
  no modifica precios ni autorizaciones.
- **E — Reportes y QA:** reportes de gestión para el administrador (no solo lectura) y supervisión Root; QA integral.

## 5. Hallazgo: tope diario

El motor tarifario (`src/lib/parkingRates.mjs`, Ley 20.967) **no aplica tope diario**: estadías < 24 h solo minuto
efectivo o tramo vencido; ≥ 24 h se marcan `requiresDailyPolicy` (revisión manual). `parking_rates.daily_flat_amount`
existe pero no se usa. No se introduce acumulación entre visitas sin definición.

## 6. Decisiones pendientes (no inventar)

1. ¿"Administrador del estacionamiento" es el `company_admin` (toda su empresa) o un miembro con
   `company_member_parkings.access_level = 'ADMIN'` (solo ciertos estacionamientos), o ambos?
2. "No superar la capacidad contratada": ¿solo ocupación simultánea, o también un máximo de autorizaciones vigentes?
   ¿Los cupos se contratan por estacionamiento o por empresa y el administrador los reparte?
3. Valor al beneficiario: ¿solo se registra, o la plataforma lo cobra/factura? (el alcance original excluye facturación automática).
4. Regla de cobro de excedentes: además de "tarifa del estacionamiento", ¿qué otras reglas puede elegir el administrador?
5. Tope diario (no existe hoy) y cómo se combina la liberación anual del vehículo con franjas restringidas.
6. Regularizaciones de estadías liberadas: ¿Root, administrador o ambos?
7. Modelo de cobro del módulo (cupo unitario vs. modalidad) y cargos adicionales que Root podrá definir.
