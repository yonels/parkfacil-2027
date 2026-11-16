// Auditoria de referencia suministrada: DOM simulado, nunca integracion real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { ({ JSDOM, VirtualConsole } = createRequire(new URL('../../../.worktrees/crm-papelera-leads/package.json', import.meta.url))('jsdom')); }
const html = await readFile(new URL('../referencia-v2.1/ParkFacil_V21.html', import.meta.url), 'utf8');
function open() {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', e => { if (e.type === 'unhandled exception') errors.push(e); });
  const dom = new JSDOM(html, { url: 'https://smart-reports.invalid/', runScripts: 'dangerously', virtualConsole: console,
    beforeParse(w) {
      w.structuredClone = structuredClone;
      w.HTMLElement.prototype.scrollIntoView = () => {};
      const blocked = () => { throw new Error('Network prohibited in reference audit'); };
      w.fetch = blocked; w.XMLHttpRequest = blocked; w.WebSocket = blocked;
    },
  });
  return { dom, d: dom.window.document, errors };
}
function drag(w, source, target) {
  const transfer = { setData() {}, effectAllowed: '', dropEffect: '' };
  for (const [element, type] of [[source, 'dragstart'], [target, 'drop']]) {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    element.dispatchEvent(event);
  }
}
test('V2.1 referencia autonoma con demo visible, 7 bloques y 18 elementos de biblioteca', () => {
  const { dom, d, errors } = open();
  try {
    assert.match(d.querySelector('.demo-pill').textContent, /DEMOSTRACIÓN/);
    assert.equal(d.querySelectorAll('.widget').length, 7);
    assert.equal(d.querySelectorAll('.add-card').length, 18);
    assert.equal(d.querySelectorAll('script[src],link[href^="http"],iframe').length, 0);
    assert.equal(errors.length, 0);
  } finally { dom.window.close(); }
});
test('biblioteca permite soltar en lienzo vacio e insertar antes de otro bloque (eventos sinteticos)', () => {
  const { dom, d } = open();
  try {
    d.querySelector('[data-template="empty"]').click(); d.getElementById('confirmModal').click();
    drag(dom.window, d.querySelector('.add-card'), d.getElementById('canvas'));
    assert.equal(d.querySelectorAll('.widget').length, 1);
    drag(dom.window, d.querySelectorAll('.add-card')[1], d.querySelector('.widget'));
    assert.equal(d.querySelectorAll('.widget').length, 2);
    assert.match(d.querySelector('.wtitle strong').textContent, /Ingresos/);
  } finally { dom.window.close(); }
});
test('configuracion de titulo/metrica/ancho y botones de reordenamiento disponibles', () => {
  const { dom, d } = open();
  try {
    d.getElementById('editBtn').click();
    d.querySelector('[data-action="config"]').click();
    assert.equal(d.getElementById('cMetric').options.length, 19);
    d.getElementById('cTitle').value = 'Referencia auditada';
    d.getElementById('cMetric').value = 'revenue'; d.getElementById('cSize').value = '12';
    d.getElementById('confirmModal').click();
    const id = d.querySelector('.widget').dataset.id;
    assert.ok(d.querySelector('.widget').classList.contains('w12'));
    assert.equal(d.querySelector('.wtitle strong').textContent, 'Referencia auditada');
    d.querySelector('[data-action="right"]').click();
    assert.equal(d.querySelectorAll('.widget')[1].dataset.id, id);
    d.querySelectorAll('.widget')[1].querySelector('[data-action="resize"]').click();
    assert.ok(d.querySelectorAll('.widget')[1].classList.contains('w4'));
  } finally { dom.window.close(); }
});
test('guardado existe solo en localStorage del prototipo, no persistencia multiempresa', () => {
  const { dom, d } = open();
  try {
    d.getElementById('save').click(); d.getElementById('boardName').value = 'QA referencia';
    d.getElementById('confirmModal').click();
    const value = JSON.parse(dom.window.localStorage.getItem('parkfacil-smart-reports-v2'));
    assert.ok(value.saved['QA referencia']);
  } finally { dom.window.close(); }
});
test('ocupacion, peak, heatmap y pronostico declaran datos sinteticos/no validados', () => {
  const { dom, d } = open();
  try {
    assert.ok(d.querySelectorAll('[data-heat]').length > 0);
    assert.match(d.body.textContent, /no intervalo estadístico validado/);
    assert.match(d.body.textContent, /simulada|simulados/);
    assert.match(html, /function occDemo/);
    assert.match(html, /Math\.sin/);
  } finally { dom.window.close(); }
});
