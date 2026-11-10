import test from "node:test";
import assert from "node:assert/strict";
import { customerResponseLabel, detectFormat, fromHaulmerIssued, listRowFromBillingDocument, normalizeRut, parseDocumentDate, parseEasyDocRows, planImport, toRegistryUpdate } from "./dteRegistryCore.mjs";

// Encabezado real de «Descarga Excel» de EasyDoc (2026-11-08); datos ficticios.
const HEADER = ["FOLIO_INTERNO", "TIPODOC", "FOLIO_SII", "FECHAEMIS", "RUTEMISOR", "RZNSOCRECEP", "MNTONETO", "MNTOEXENTO", "IVA", "MNTOTOTAL", "ANULADO", "MotivoNotaAplicada", "RUTRECEP", "ESTADODTE", "ESTADODTECLIENTE", "ESTADO_ACUSE", "GLOSA_ACUSE", "ESTADO_APROBCOM", "GLOSA_APROBCOM", "CODIGOENVIO", "DYT_GLOSAERR", "TRACKID", "EMISOR_ELECTRONICO", "ESTADO_ACCIONSII", "CAB_IND_TRASLADO", "TIPO_REFERENCIA", "FOLIO_REFERENCIA", "TIPOCAMBIO", "DETALLE_RESPUESTA_SII"];
const row = (over = {}) => HEADER.map((name) => over[name] ?? ({ FOLIO_INTERNO: "100", TIPODOC: "33 ", FOLIO_SII: "288", FECHAEMIS: "01-11-2026 9:30:46", RZNSOCRECEP: "CLIENTE DE PRUEBA SPA        ", MNTONETO: "61871", MNTOEXENTO: "0", IVA: "11755", MNTOTOTAL: "73626", ANULADO: "0", RUTRECEP: "77991619-7     ", ESTADODTE: "Aceptado", ESTADODTECLIENTE: "Aceptado x Omision", ESTADO_ACCIONSII: "AXO", TRACKID: "12636484946", DYT_GLOSAERR: "Ok, DTE enviado correctamente a persona@ejemplo.cl", DETALLE_RESPUESTA_SII: "ACEPTADO" }[name] ?? ""));

test("detecta la planilla de EasyDoc por su encabezado", () => {
  assert.equal(detectFormat(HEADER), "EASYDOC");
  assert.equal(detectFormat(["Nro", "Tipo Doc", "Folio"]), null);
});

test("normaliza RUT, fechas y respuesta del cliente", () => {
  assert.equal(normalizeRut(" 76.628.230-k  "), "76628230-K");
  assert.equal(normalizeRut("776862963"), "77686296-3");
  assert.equal(normalizeRut("abc"), "");
  assert.equal(parseDocumentDate("01-11-2026 9:30:46"), "2026-11-01");
  assert.equal(parseDocumentDate("10-09-2026 0:00:00"), "2026-09-10");
  assert.equal(parseDocumentDate("31-02-2026"), "");
  assert.equal(parseDocumentDate("2026-10-02"), "2026-10-02");
  assert.equal(customerResponseLabel("Aceptado x Omision", "AXO"), "Aceptado x Omisión");
  assert.equal(customerResponseLabel("", "ERM"), "Otorga Recibo");
  assert.equal(customerResponseLabel("", "0"), "");
});

test("lee facturas y notas de crédito con referencia, sin correos", () => {
  const result = parseEasyDocRows([HEADER, row(), row({ TIPODOC: "61 ", FOLIO_SII: "27", FECHAEMIS: "10-09-2026 0:00:00", MNTONETO: "40874", IVA: "7766", MNTOTOTAL: "48640", TIPO_REFERENCIA: "33 ", FOLIO_REFERENCIA: "259", ESTADODTECLIENTE: "", ESTADO_ACCIONSII: "" })]);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.errors, []);
  const [invoice, note] = result.items;
  assert.equal(invoice.dteType, 33);
  assert.equal(invoice.folio, 288);
  assert.equal(invoice.receiverRut, "77991619-7");
  assert.equal(invoice.receiverName, "CLIENTE DE PRUEBA SPA");
  assert.equal(invoice.customerResponse, "Aceptado x Omisión");
  assert.equal(invoice.total, 73626);
  assert.equal(JSON.stringify(invoice).includes("@"), false);
  assert.equal(note.dteType, 61);
  assert.equal(note.referenceDteType, 33);
  assert.equal(note.referenceFolio, 259);
  assert.equal(note.customerResponse, null);
});

test("informa errores por fila y omite tipos que no son factura o nota", () => {
  const result = parseEasyDocRows([HEADER, row({ RUTRECEP: "13744807-9" }), row({ FOLIO_SII: "290", MNTOTOTAL: "1" }), row({ TIPODOC: "39 ", FOLIO_SII: "5" }), row(), row({ ANULADO: "1" })]);
  assert.equal(result.items.length, 1);
  assert.match(result.errors[0].message, /RUT del cliente inválido/);
  assert.equal(result.errors[0].row, 2);
  assert.match(result.errors[1].message, /no coincide con el total/);
  assert.match(result.errors[2].message, /repetido/);
  assert.equal(result.skipped.length, 1);
});

test("rechaza planillas vacías o desconocidas", () => {
  assert.throws(() => parseEasyDocRows([HEADER]), (e) => e.code === "DTE_FILE_EMPTY");
  assert.throws(() => parseEasyDocRows([["A", "B"], ["1", "2"]]), (e) => e.code === "DTE_FORMAT_UNKNOWN");
});

test("documento de Haulmer /document/issued", () => {
  const item = fromHaulmerIssued({ RUTRecep: 77991619, DV: "7", RznSocRecep: "ParkFacil Operaciones Spa", TipoDTE: 33, Folio: 600625, FchEmis: "2026-11-08", MntExe: 0, MntNeto: 1000, IVA: 190, MntTotal: 1190, Token: "abc" });
  assert.equal(item.receiverRut, "77991619-7");
  assert.equal(item.providerToken, "abc");
  assert.equal(fromHaulmerIssued({ TipoDTE: 39, Folio: 1, RUTRecep: 1, DV: "9", FchEmis: "2026-11-08" }), null);
});

test("reimportar no duplica: separa nuevos, cambiados y sin cambios; una fuente sin dato no borra", () => {
  const items = parseEasyDocRows([HEADER, row(), row({ FOLIO_SII: "289" }), row({ FOLIO_SII: "290" })]).items;
  const existing = new Map([
    ["33-288", { id: "a", issue_date: "2026-11-01", receiver_rut: "77991619-7", receiver_name: "CLIENTE DE PRUEBA SPA", net_amount: 61871, exempt_amount: 0, tax_amount: 11755, total_amount: 73626, voided: false, sii_status: "Aceptado", customer_response: "Aceptado x Omisión", sii_action: "AXO", reference_dte_type: null, reference_folio: null, track_id: "12636484946", provider_token: "tok" }],
    ["33-289", { id: "b", issue_date: "2026-11-01", receiver_rut: "77991619-7", receiver_name: "CLIENTE DE PRUEBA SPA", net_amount: 61871, exempt_amount: 0, tax_amount: 11755, total_amount: 73626, voided: false, sii_status: "Aceptado", customer_response: null, sii_action: null, track_id: "12636484946" }],
  ]);
  const plan = planImport(items, existing);
  assert.equal(plan.toInsert.length, 1);
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.toUpdate.length, 1);
  assert.deepEqual(plan.toUpdate[0].changed, ["customerResponse", "siiAction"]);
  const update = toRegistryUpdate({ ...items[0], providerToken: null }, { source: "EASYDOC" });
  assert.equal(Object.hasOwn(update, "provider_token"), false);
});

// Encabezado real de «Descargar Detalles» (pestaña VENTA) del Registro de Compras y Ventas del SII; datos ficticios.
const SII_HEADER = "Nro;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse Recibo;Fecha Reclamo;Monto Exento;Monto Neto;Monto IVA;Monto total;IVA Retenido Total;IVA Retenido Parcial;IVA no retenido;IVA propio;IVA Terceros;RUT Emisor Liquid. Factura;Neto Comision Liquid. Factura;Exento Comision Liquid. Factura;IVA Comision Liquid. Factura;IVA fuera de plazo;Tipo Docto. Referencia;Folio Docto. Referencia;Num. Ident. Receptor Extranjero;Nacionalidad Receptor Extranjero;Credito empresa constructora;Impto. Zona Franca (Ley 18211);Garantia Dep. Envases;Indicador Venta sin Costo;Indicador Servicio Periodico;Monto No facturable;Total Monto Periodo;Venta Pasajes Transporte Nacional;Venta Pasajes Transporte Internacional;Numero Interno;Codigo Sucursal;NCE o NDE sobre Fact. de Compra;Codigo Otro Imp.;Valor Otro Imp.;Tasa Otro Imp.".split(";");
const siiRow = (values) => SII_HEADER.map((name) => values[name] ?? "");

test("lee el CSV de ventas del SII: tipo desde el nombre del archivo y respuesta del cliente", async () => {
  const { parseIssuedDocumentsFile, siiDteTypeFromFileName, siiCustomerResponse } = await import("./dteRegistryCore.mjs");
  assert.equal(siiDteTypeFromFileName("RCV_VENTA_77991619-7_202610_33.csv"), 33);
  assert.equal(siiDteTypeFromFileName("ventas.csv"), null);
  const today = new Date("2026-11-08T12:00:00Z");
  assert.equal(siiCustomerResponse({ acuse: "05/10/2026 10:18:29" }, today), "Otorga Recibo");
  assert.equal(siiCustomerResponse({ reclamo: "05/10/2026 10:18:29" }, today), "Reclamado");
  assert.equal(siiCustomerResponse({ recepcion: "02/10/2026 11:11:27" }, today), "Aceptado x Omisión");
  assert.equal(siiCustomerResponse({ recepcion: "05/11/2026 11:11:27" }, today), null);
  const rows = [SII_HEADER,
    siiRow({ Nro: "1", "Tipo Venta": "Del Giro", "Rut cliente": "77991619-7", "Razon Social": "CLIENTE FICTICIO SPA", Folio: "269", "Fecha Docto": "01/10/2026", "Fecha Recepcion": "01/10/2026 10:05:32", "Fecha Acuse Recibo": "05/10/2026 10:18:29", "Monto Exento": "0", "Monto Neto": "102643", "Monto IVA": "19502", "Monto total": "122145" }),
    siiRow({ Nro: "2", "Rut cliente": "13744807-9", Folio: "270", "Fecha Docto": "02/10/2026", "Monto Neto": "1", "Monto IVA": "0", "Monto total": "1" }),
  ];
  const result = parseIssuedDocumentsFile(rows, { fileName: "RCV_VENTA_77991619-7_202610_33.csv", today });
  assert.equal(result.format, "SII_RCV");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].dteType, 33);
  assert.equal(result.items[0].issueDate, "2026-10-01");
  assert.equal(result.items[0].customerResponse, "Otorga Recibo");
  assert.equal(result.items[0].siiStatus, "Aceptado");
  assert.match(result.errors[0].message, /RUT del cliente inválido/);
  assert.throws(() => parseIssuedDocumentsFile(rows, { fileName: "ventas.csv" }), (e) => e.code === "DTE_TYPE_UNKNOWN");
  assert.throws(() => parseIssuedDocumentsFile([["Nro", "Otra"], ["1", "2"]]), (e) => e.code === "DTE_FORMAT_UNKNOWN");
});

test("SOL-2026-11-10-001: la nota de crédito propia muestra la factura que referencia", () => {
  const row = listRowFromBillingDocument({ id: "n1", company_id: "emp-001", document_type: "CREDIT_NOTE", folio: "119060", invoice_date: "2026-11-10", net_amount: 61953, tax_amount: 11771, total_amount: 73724, status: "ISSUED", customer_snapshot: { rut: "77991619-7" }, origin: { folio: "205391", document_type: "INVOICE" } });
  assert.equal(row.reference, "33 N° 205391");
  assert.equal(listRowFromBillingDocument({ id: "f1", document_type: "INVOICE", folio: "1", customer_snapshot: {} }).reference, "");
});
