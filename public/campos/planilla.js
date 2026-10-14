// =====================================================
// LECTURA DE PLANILLAS (CSV y Excel .xlsx) en el navegador, sin librerías externas.
// Devuelve la primera hoja como una lista de filas (cada fila, una lista de celdas).
// - CSV: separador ; , o tabulación (se detecta solo), comillas, UTF-8 o Windows-1252.
// - XLSX: es un ZIP con XML adentro (se abre con KML.leerZip). Las fechas de Excel
//   llegan como número de serie: las convierte quien las interpreta (Planilla.fecha).
// =====================================================
(function () {
  'use strict';

  // ---------- CSV ----------
  function decodificar(buffer) {
    const utf8 = new TextDecoder('utf-8').decode(buffer);
    // Excel en Windows suele guardar CSV en Windows-1252: si UTF-8 da caracteres rotos, se usa ese
    const t = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
    return t.replace(/^﻿/, '');
  }

  function separador(texto) {
    const linea = texto.split(/\r?\n/).find((l) => l.trim()) || '';
    const cuenta = (c) => linea.split(c).length - 1;
    return [';', '\t', ','].sort((a, b) => cuenta(b) - cuenta(a))[0];
  }

  function leerCSV(texto) {
    const sep = separador(texto);
    const filas = [];
    let fila = []; let celda = ''; let comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
        else if (c === '"') comillas = false;
        else celda += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) { fila.push(celda); celda = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(celda); filas.push(fila); fila = []; celda = '';
      } else celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas;
  }

  // ---------- XLSX ----------
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const etiquetas = (el, nombre) => Array.from(el.getElementsByTagNameNS('*', nombre));
  const columna = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  async function leerXLSX(buffer) {
    const zip = await KML.leerZip(buffer);
    // Primera hoja según el libro (y no por nombre de archivo, que puede no ser sheet1)
    let ruta = zip.nombres.find((n) => /^xl\/worksheets\/sheet1\.xml$/i.test(n));
    try {
      const libro = xml(await zip.leer('xl/workbook.xml'));
      const hoja = etiquetas(libro, 'sheet').find((h) => h.getAttribute('state') !== 'hidden') || etiquetas(libro, 'sheet')[0];
      const rid = hoja && (hoja.getAttribute('r:id') || hoja.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rels = xml(await zip.leer('xl/_rels/workbook.xml.rels'));
      const rel = etiquetas(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) { const t = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, ''); ruta = 'xl/' + t; }
    } catch (e) { /* se usa sheet1 */ }
    if (!ruta || !zip.nombres.includes(ruta)) throw new Error('No se encontró ninguna hoja en el archivo de Excel.');

    const compartidos = [];
    if (zip.nombres.includes('xl/sharedStrings.xml')) {
      etiquetas(xml(await zip.leer('xl/sharedStrings.xml')), 'si').forEach((si) => compartidos.push(etiquetas(si, 't').map((t) => t.textContent).join('')));
    }
    const filas = [];
    etiquetas(xml(await zip.leer(ruta)), 'row').forEach((r) => {
      const i = Number(r.getAttribute('r')) - 1;
      const fila = [];
      etiquetas(r, 'c').forEach((c, k) => {
        const j = c.getAttribute('r') ? columna(c.getAttribute('r')) : k;
        const tipo = c.getAttribute('t');
        const v = etiquetas(c, 'v')[0]?.textContent;
        let valor = '';
        if (tipo === 's') valor = compartidos[Number(v)] ?? '';
        else if (tipo === 'inlineStr') valor = etiquetas(c, 't').map((t) => t.textContent).join('');
        else if (tipo === 'b') valor = v === '1';
        else if (tipo === 'str' || tipo === 'e') valor = v ?? '';
        else if (v != null && v !== '') valor = Number(v);
        fila[j] = valor;
      });
      filas[Number.isFinite(i) && i >= 0 ? i : filas.length] = Array.from(fila, (x) => (x === undefined ? '' : x));
    });
    return Array.from(filas, (f) => f || []);
  }

  /** Lee un archivo .csv / .txt / .xlsx y devuelve sus filas (sin las vacías). */
  async function leer(archivo) {
    const buffer = await archivo.arrayBuffer();
    const b = new Uint8Array(buffer);
    const esZip = b[0] === 0x50 && b[1] === 0x4b;
    if (/\.xls$/i.test(archivo.name) && !esZip) throw new Error('Los .xls viejos no se pueden leer: en Excel, guardalo como .xlsx o .csv.');
    const filas = esZip ? await leerXLSX(buffer) : leerCSV(decodificar(buffer));
    return filas.filter((f) => f.some((x) => String(x).trim() !== ''));
  }

  // ---------- Ayudas para interpretar celdas ----------
  const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** Fecha (AAAA-MM-DD) desde número de serie de Excel, 13/10/2026, 13-10-26 o 2026-10-13. */
  function fecha(v) {
    const iso = (y, m, d) => {
      const f = new Date(Date.UTC(y, m - 1, d));
      return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.toISOString().slice(0, 10) : null;
    };
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v);
      if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5).toISOString().slice(0, 10);
      return null;
    }
    const t = String(v ?? '').trim();
    let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return iso(y, +m[2], +m[1]); }
    return null;
  }

  /** Número desde 1.234,5 / 1234.5 / 1,5 / "18 kg" (null si no hay). */
  function numero(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let t = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
    if (!t || t === '-') return null;
    if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (t.includes(',')) t = t.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  window.Planilla = { leer, leerCSV, fecha, numero, normal };
})();
