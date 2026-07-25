import test from "node:test";
import assert from "node:assert/strict";
import {
  getConveniosDemo,
  getConvenioById,
  getConvenioByCodigo,
  searchConvenios,
  filterConveniosByEstado,
  filterConveniosByTipo,
  filterConveniosByModalidad,
  filterConveniosByEmpresa,
  filterConveniosByEstacionamiento,
  filterConveniosByResponsable,
  filterConveniosByVigencia,
  filterConveniosAplicacionAutomatica,
  filterConveniosRequiereAprobacion,
  filterConveniosConTope,
  filterConveniosProximosAVencer,
  getBeneficiarios,
  filterBeneficiarios,
  resolveEmpresaPrincipal,
  resolveUsuarioResponsable,
  resolveEstacionamientos,
  resolveAccesos,
  resolveContrato,
  resolveTarifa,
  resolveAbonado,
  resolveVisita,
  resolveOperacion,
  calcularVigencia,
  calcularDiasRestantes,
  validarDiaPermitido,
  validarHorarioPermitido,
  describirBeneficio,
  simularBeneficio,
  calcularUtilizacion,
  calcularConsumoRestante,
  detectarTopeAlcanzado,
  detectarAltaUtilizacion,
  ordenarConveniosPorPrioridad,
  calcularResumenGeneral,
  getTipoConvenioLabel,
  getEstadoConvenioLabel,
  getModalidadBeneficioLabel,
  getTipoBeneficiarioLabel,
  formatDate,
  formatHour,
  formatValorDemostrativo,
  tiposConvenioPermitidos,
  estadosConvenioPermitidos,
  modalidadesBeneficioPermitidas,
  tiposBeneficiarioPermitidos,
  diasPermitidos,
  politicasFeriadoPermitidas,
} from "./convenios.mjs";

const REFERENCE_DATE = "2026-07-25T10:15:00";

test("ids and codes are unique", () => {
  const convenios = getConveniosDemo();
  assert.equal(new Set(convenios.map((item) => item.id)).size, convenios.length);
  assert.equal(new Set(convenios.map((item) => item.codigo)).size, convenios.length);
});

test("allowed types, states, modalities, beneficiary types, days and holiday policy", () => {
  const convenios = getConveniosDemo();
  assert.ok(convenios.every((item) => tiposConvenioPermitidos.includes(item.tipo)));
  assert.ok(convenios.every((item) => estadosConvenioPermitidos.includes(item.estado)));
  assert.ok(convenios.every((item) => modalidadesBeneficioPermitidas.includes(item.modalidadBeneficio)));
  assert.ok(convenios.every((item) => (item.vigencia.allowedDays || []).every((day) => diasPermitidos.includes(day))));
  assert.ok(convenios.every((item) => politicasFeriadoPermitidas.includes(item.vigencia.holidayPolicy)));
  assert.ok(convenios.every((item) => (item.beneficiarios || []).every((beneficiario) => tiposBeneficiarioPermitidos.includes(beneficiario.type))));
});

test("resolves by id and code", () => {
  assert.ok(getConvenioById("cv-001"));
  assert.equal(getConvenioById("cv-999"), null);
  assert.ok(getConvenioByCodigo("CV-2026-003"));
  assert.equal(getConvenioByCodigo("CV-2026-999"), null);
});

test("text search and core filters", () => {
  assert.ok(searchConvenios("Corporativo").length >= 1);
  assert.ok(searchConvenios("DEM-130").length >= 1);
  assert.ok(filterConveniosByEstado("active").length >= 1);
  assert.ok(filterConveniosByTipo("resident").length >= 1);
  assert.ok(filterConveniosByModalidad("free_minutes").length >= 1);
  assert.ok(filterConveniosByEmpresa("e-001").length >= 1);
  assert.ok(filterConveniosByEstacionamiento("p-001").length >= 1);
  assert.ok(filterConveniosByResponsable("u-001").length >= 1);
  assert.ok(filterConveniosByVigencia("Vigente", REFERENCE_DATE).length >= 1);
  assert.ok(filterConveniosAplicacionAutomatica(true).length >= 1);
  assert.ok(filterConveniosRequiereAprobacion(true).length >= 1);
  assert.ok(filterConveniosConTope().length >= 1);
});

test("active, future, expired and near-expiration detection", () => {
  const active = getConvenioById("cv-001");
  const future = getConvenioById("cv-002");
  const expired = getConvenioById("cv-004");
  const near = getConvenioById("cv-003");

  assert.equal(calcularVigencia(active, REFERENCE_DATE).isActivo, true);
  assert.equal(calcularVigencia(future, REFERENCE_DATE).isFuturo, true);
  assert.equal(calcularVigencia(expired, REFERENCE_DATE).isVencido, true);
  assert.equal(calcularVigencia(near, REFERENCE_DATE).isProximoAVencer, true);
  assert.ok(filterConveniosProximosAVencer(REFERENCE_DATE).length >= 1);
});

test("days remaining, day and hour validation", () => {
  const convenio = getConvenioById("cv-001");
  assert.ok(calcularDiasRestantes(convenio, REFERENCE_DATE) > 0);
  assert.equal(validarDiaPermitido(convenio, REFERENCE_DATE), true);
  assert.equal(validarHorarioPermitido(convenio, REFERENCE_DATE), true);
});

test("benefit description and simulation", () => {
  const convenio = getConvenioById("cv-001");
  const descripcion = describirBeneficio(convenio);
  const simulacion = simularBeneficio(convenio, 12000, REFERENCE_DATE);

  assert.ok(descripcion.toLowerCase().includes("descuento"));
  assert.equal(simulacion.etiqueta, "Simulacion demostrativa");
  assert.ok(typeof simulacion.descuentoEstimado === "number");
  assert.ok(Array.isArray(simulacion.reglasEvaluadas));
});

test("caps and consumption", () => {
  const convenio = getConvenioById("cv-001");
  const topes = detectarTopeAlcanzado(convenio);
  const restante = calcularConsumoRestante(convenio);
  const uso = calcularUtilizacion(convenio);

  assert.equal(topes.algunTope, false);
  assert.ok(restante.usosRestantes >= 0);
  assert.ok(uso.total > 0);
  assert.equal(detectarAltaUtilizacion(convenio), false);
});

test("priority ordering", () => {
  const ordenados = ordenarConveniosPorPrioridad(getConveniosDemo());
  assert.equal(ordenados[0].prioridad, 1);
});

test("safe resolution for valid and missing references", () => {
  const valid = getConvenioById("cv-001");
  const invalid = getConvenioById("cv-005");

  assert.ok(resolveEmpresaPrincipal(valid));
  assert.ok(resolveUsuarioResponsable(valid));
  assert.ok(resolveEstacionamientos(valid).length >= 1);
  assert.ok(resolveAccesos(valid).length >= 1);
  assert.ok(resolveContrato(valid));
  assert.ok(resolveTarifa(valid));

  assert.equal(resolveEmpresaPrincipal(invalid), null);
  assert.equal(resolveUsuarioResponsable(invalid), null);
  assert.deepEqual(resolveEstacionamientos(invalid), []);
  assert.deepEqual(resolveAccesos(invalid), []);
  assert.equal(resolveContrato(invalid), null);
  assert.equal(resolveTarifa(invalid), null);

  const beneficiarioValido = getBeneficiarios(valid)[0];
  const beneficiarioInvalido = getBeneficiarios(invalid)[0];
  assert.equal(resolveAbonado(valid, beneficiarioValido), null);
  assert.equal(resolveVisita(valid, beneficiarioValido), null);
  assert.equal(resolveOperacion(valid), null);
  assert.equal(resolveAbonado(invalid, beneficiarioInvalido), null);
  assert.equal(resolveVisita(invalid, beneficiarioInvalido), null);
  assert.equal(resolveOperacion(invalid), null);
});

test("beneficiaries and labels", () => {
  const convenio = getConvenioById("cv-003");
  assert.ok(getBeneficiarios(convenio).length >= 1);
  assert.ok(filterBeneficiarios(convenio, "subscriber").length >= 1);

  assert.equal(getTipoConvenioLabel("corporate"), "Corporativo");
  assert.equal(getEstadoConvenioLabel("scheduled"), "Programado");
  assert.equal(getModalidadBeneficioLabel("preferred_rate"), "Tarifa preferencial");
  assert.equal(getTipoBeneficiarioLabel("company"), "Empresa");
});

test("summary and formatting", () => {
  const resumen = calcularResumenGeneral(REFERENCE_DATE);
  assert.equal(resumen.total, getConveniosDemo().length);
  assert.ok(resumen.activos >= 1);
  assert.ok(resumen.empresasBeneficiarias >= 1);
  assert.ok(resumen.beneficiariosRegistrados >= 1);

  assert.equal(formatDate("2026-07-25"), "25/07/2026");
  assert.equal(formatHour("18:45"), "18:45");
  assert.ok(formatValorDemostrativo(10000).includes("$"));
});
