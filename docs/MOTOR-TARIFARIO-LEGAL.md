# Motor Tarifario Legal — ParkFacil

Fuente de verdad técnica del motor de cobro por estacionamiento transitorio (estadías
inferiores a 24 horas). No cubre mensualidades, abonados, contratos ni planes comerciales.

## 1. Fuente normativa

Para estadías inferiores a 24 horas, ParkFacil solo admite una de dos modalidades de
cobro, nunca combinadas. Está prohibido redondear o aproximar el cobro al alza. El
proveedor puede definir un período sin cobro. Ante pérdida del comprobante, se cobra
exactamente el tiempo efectivo determinado por el registro real — nunca una tarifa
prefijada, multa o recargo. La seguridad, daños, robos o hurtos pertenecen al ámbito
contractual/operacional y no forman parte de este motor.

## 2. Modalidades permitidas

- **`EFFECTIVE_MINUTE`** ("Minuto efectivo"): cobra el tiempo efectivamente usado, sin
  rangos, bloques ni tramos.
- **`EXPIRED_BLOCKS`** ("Tramo vencido"): cobra por tramos de tiempo completamente
  cumplidos — nunca uno que aún no ha vencido.

Una tarifa tiene exactamente una modalidad. La base de datos lo impone con un `check`
en `parking_rates` (`billing_mode='EFFECTIVE_MINUTE' and minute_amount is not null` o
`billing_mode='EXPIRED_BLOCKS' and minute_amount is null`), y el dominio lo reafirma en
`validateOperationalRate()` rechazando bloques en minuto efectivo y `minuteAmount` en
tramo vencido.

## 3. Minuto efectivo

- Valor por minuto (`minuteAmount`), obligatorio y mayor que cero.
- El motor trabaja en segundos: `chargeableSeconds = floor(elapsedSeconds) - freePeriodSeconds`.
- El monto es `floor(chargeableSeconds * minuteAmount / 60)` — el minuto efectivo se
  paga proporcionalmente al segundo, nunca se infla al minuto completo siguiente.
- Prohibido: tramos, bloques, redondeo, cobro mínimo por duración.

## 4. Tramo vencido

- **Tramo inicial**: duración mínima 1800 segundos (30 min), obligatorio.
- **Tramo siguiente**: duración mínima 600 segundos (10 min), repetible.
- Un tramo solo se cobra si está **completamente cumplido**. El algoritmo cuenta con un
  `while (remaining >= block.durationSeconds)` — nunca `Math.ceil` — así que 31 minutos
  jamás se convierten en "30 + 10 minutos cobrados": el segundo tramo aún no venció.
- La base de datos refuerza los mínimos con un `check` en `parking_rate_blocks`
  (`sequence=1 and duration_seconds>=1800` / `sequence>1 and duration_seconds>=600`), y
  la UI limita la creación a exactamente estos dos tramos (sin lista abierta de N
  tramos), reflejando literalmente el modelo legal.

## 5. Período gratuito

Opcional, en segundos, `>= 0`. Se descuenta **antes** de calcular en ambas modalidades,
en un único lugar (`calculateParkingCharge`): `chargeableSeconds = elapsed - freePeriodSeconds`.
No existe una segunda interpretación en otra pantalla. Un período declarado gratuito
nunca se cobra retroactivamente.

## 6. Prohibición de redondeo al alza

- Tiempo transcurrido: `Math.floor((exit - entry) / 1000)`.
- Monto de minuto efectivo y de tramos: `Math.floor(...)`.
- Conteo de tramos vencidos: comparación `>=` en un bucle, nunca `Math.ceil`.
- `Math.round` fue eliminado de la ruta de cobro de Data Entry (`subtotal`/`discount` ya
  llegan enteros desde el motor; envolverlos en `Math.round` era innecesario y se retiró
  para no dejar ambigüedad).
- El campo informativo "minutos consumidos" del ticket usa `Math.floor`, no `Math.ceil`
  (antes inflaba artificialmente el tiempo mostrado al cliente).
- El impuesto (IVA, `calculateChileTax`) sí usa redondeo estándar de centavos — es una
  obligación tributaria distinta a la tarifa de estacionamiento y no forma parte de este
  motor ni de la Ley 20.967.

## 7. Ticket perdido

No existe ni existía una pantalla de "ticket perdido" en el proyecto. El modelo no tiene
soporte para tarifa prefijada, multa o recargo por pérdida de comprobante
(`LAW_20967_RULES.lostTicketSurchargeAllowed = false`). Si en el futuro se construye esa
funcionalidad, debe identificar el ingreso real (patente, QR, registro) y cobrar con
este mismo motor — nunca una tarifa especial.

> Nota: `equipment_penalty_value` ("multa por equipo") en `company_contracts` es un
> término contractual entre ParkFacil y la empresa cliente por daño/pérdida de equipos
> (lectores, credenciales), no una multa al conductor por ticket perdido. Son dominios
> distintos y no se mezclan.

## 8. Arquitectura del motor (una sola fuente de verdad)

```
parking_rates + parking_rate_blocks          (persistencia)
        ↓
parkingRatesRepository.js                    (lectura/escritura + compliance)
        ↓
parkingRateInput.mjs (sanitize/validate)      (entrada API)
        ↓
/api/estacionamientos/[id]/tarifas            (API)
        ↓
parkingRates.mjs                              (ÚNICO motor de cálculo)
   - validateOperationalRate()                (única regla de dominio)
   - classifyRateCompliance()                 (VALID | REQUIRES_REVIEW)
   - calculateParkingCharge()                 (cálculo central por segundos)
   - calculateScheduledParkingCharge()        (envoltorio por timestamps)
   - selectActiveRate()                       (tarifa vigente: ACTIVE + vigente + VALID)
        ↓                                              ↓
ParkingRatesManager.js (UI Tarifas)     Data Entry (/api/data-entry: QUOTE, EXIT)
        ↓                                              ↓
EstacionamientoDetalleAdmin.js ("Tarifa vigente")   Ticket / cobro real
```

No existe una segunda función de cálculo. `/simulador-tarifas` es un asistente
consultivo de **proyección de ingresos** con datos de ejemplo (elasticidad de demanda),
no calcula el cargo de una estadía individual — no hay fórmula paralela que unificar ahí.

## 9. Validaciones (defensa en profundidad)

| Capa | Dónde |
|---|---|
| Interfaz | `ParkingRatesManager.js` no muestra tramos en minuto efectivo, exige tramo inicial ≥30 min y siguiente ≥10 min |
| API | `parkingRateInput.mjs` (`sanitizeRateInput`/`validateRateInput`) rechaza con 400 antes de tocar la base |
| Dominio | `parkingRates.mjs` (`validateOperationalRate`) — única regla, reutilizada por API y por `classifyRateCompliance` |
| Persistencia | `parkingRatesRepository.js` nunca activa (`status=ACTIVE`) una tarifa `REQUIRES_REVIEW` |
| Base de datos | `check` en `parking_rates`/`parking_rate_blocks` (modalidad exclusiva, mínimos de tramo) + `check (overnight_flat_amount is null or =0)` agregado en `20260807120000_parking_rate_legal_engine.sql` |

## 10. Tarifas heredadas incompatibles

Se encontró un mecanismo heredado de "estadía nocturna" (`overnight_flat_amount`,
`regular_start_time`, `regular_end_time`, `overnight_end_time`, agregado en
`20260802183000_parking_rate_schedules_and_overnight.sql`) que aplicaba un **valor fijo**
por período nocturno — una tercera modalidad no permitida para estadías <24h, ajena a
minuto efectivo y a tramo vencido. Al momento de esta corrección la tabla `parking_rates`
está vacía en el entorno de desarrollo, por lo que no hay tarifas reales afectadas hoy.

Resolución (sin borrar historial, sin migrar migraciones históricas):
- El motor de cálculo (`calculateScheduledParkingCharge`) ya no aplica ningún cargo por
  este concepto.
- `validateOperationalRate` rechaza cualquier tarifa nueva con `overnightFlatAmount > 0`.
- `classifyRateCompliance` marca `REQUIRES_REVIEW` cualquier tarifa existente que aún lo
  tenga, con el motivo exacto en `reasons`.
- `selectActiveRate` nunca selecciona una tarifa `REQUIRES_REVIEW` como vigente, aunque
  su `status` en la base siga `ACTIVE`.
- La migración `20260807120000_parking_rate_legal_engine.sql` agrega el `check` que
  impide volver a fijar un valor nocturno positivo, y suspende (no elimina) cualquier
  tarifa que ya esté `ACTIVE` con ese valor, dejándola para revisión administrativa.
- Las columnas heredadas se conservan (no se destruyen) para no perder historial.

## 11. Ejemplos de cálculo

**Minuto efectivo**, $100/min, sin período gratuito:
- 1 minuto → $100. 59 segundos → $98 (nunca $100). 61 segundos → $101.

**Tramo vencido**, inicial 30 min/$1.000, siguiente 10 min/$300 repetible:
- 29 min → $0 (tramo inicial no vencido). 30 min → $1.000. 39 min → $1.000 (el segundo
  tramo aún no vence). 40 min → $1.300. 90 min → $1.000 + 6×$300 = $2.800.

## 12. Archivos principales

- `src/lib/parkingRates.mjs` — motor central (única fuente de verdad).
- `src/lib/parkingRateInput.mjs` — sanitización/validación de entrada de la API.
- `src/lib/parkingRatesRepository.js` — persistencia y clasificación de cumplimiento.
- `src/app/api/estacionamientos/[id]/tarifas/route.js` — API de tarifas.
- `src/components/estacionamientos/ParkingRatesManager.js` — UI de administración.
- `src/components/estacionamientos/EstacionamientoDetalleAdmin.js` — indicador "Tarifa vigente".
- `src/app/api/data-entry/route.js` — consumo del motor en cotización (`QUOTE`) y salida (`EXIT`).
- `supabase/migrations/20260807120000_parking_rate_legal_engine.sql` — defensa a nivel de base de datos.
- Pruebas: `src/lib/parkingRates.test.mjs`, `src/lib/parkingRateInput.test.mjs`.
