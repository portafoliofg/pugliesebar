// Monitor del Boletín Oficial: revisa la primera sección del día y detecta normas sobre
// derechos de exportación (retenciones) de granos. No cambia los valores solo: avisa en el
// tablero (y por WhatsApp) para revisar la norma y actualizar config.json.
//
// Estado en data/boletin.json: avisos ya revisados y normas encontradas.

import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import { obtenerTexto } from '../lib/http.js';

const BASE = 'https://www.boletinoficial.gob.ar';
const DEX = /derechos?\s+de\s+exportaci[oó]n/i;
const GRANOS = /\b(soja|soya|ma[ií]z|trigo|girasol|cebada|sorgo|cereales|oleaginos[ao]s?|granos)\b|\b(1201|1005|1001|1206|1003|1007)\b/i;
const MAX_DETALLES = 80;      // avisos a leer por ejecución
const DIAS_AVISO = 365;        // cuánto se guardan las normas encontradas

const limpiar = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** Lista los avisos de la primera sección de un día (fecha AAAAMMDD; sin fecha, el de hoy). */
export async function listarAvisos(fecha, timeoutMs) {
  const html = await obtenerTexto(`${BASE}/seccion/primera${fecha ? '/' + fecha : ''}`, { timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(html);
  const avisos = [];
  $('a[href^="/detalleAviso/primera/"]').each((_, a) => {
    const href = $(a).attr('href');
    const m = href.match(/\/detalleAviso\/primera\/(\d+)\/(\d{8})/);
    if (!m || avisos.some((x) => x.id === m[1])) return;
    avisos.push({
      id: m[1], fecha: `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`, url: BASE + href,
      organismo: limpiar($(a).find('.item').text()), norma: limpiar($(a).find('.item-detalle').first().text())
    });
  });
  return avisos;
}

/** Lee un aviso y dice si trata de retenciones de granos. */
export async function revisarAviso(aviso, timeoutMs) {
  const html = await obtenerTexto(aviso.url, { timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(html);
  const titulo = limpiar($('#tituloDetalleAviso h1').text()) || aviso.organismo;
  const norma = limpiar($('#tituloDetalleAviso h2').first().text()) || aviso.norma;
  const texto = limpiar($('#cuerpoDetalleAviso').text());
  if (!DEX.test(texto + ' ' + titulo) || !GRANOS.test(texto)) return null;
  const i = Math.max(0, texto.search(DEX) - 120);
  return { id: aviso.id, fecha: aviso.fecha, url: aviso.url, titulo, norma, extracto: texto.slice(i, i + 420) + '…' };
}

/** Revisa el boletín del día y actualiza data/boletin.json. Nunca tira error: devuelve el estado. */
export async function actualizarBoletin(ruta, config, hoyISO) {
  let estado = { revisados: {}, avisos: [], ultimaRevision: null, error: null };
  try { estado = Object.assign(estado, JSON.parse(await readFile(ruta, 'utf8'))); } catch {}
  try {
    const lista = await listarAvisos(null, config.timeoutMs);
    if (!lista.length) throw new Error('el sumario de la primera sección vino vacío');
    const fecha = lista[0].fecha;
    const vistos = new Set(estado.revisados[fecha] || []);
    const pendientes = lista.filter((a) => !vistos.has(a.id)).slice(0, MAX_DETALLES);
    for (const a of pendientes) {
      try {
        const r = await revisarAviso(a, config.timeoutMs);
        if (r && !estado.avisos.some((x) => x.id === r.id)) { estado.avisos.unshift(r); console.log(`  ⚠ Boletín: ${r.norma} · ${r.titulo}`); }
        vistos.add(a.id);
      } catch { /* se reintenta en la próxima ejecución */ }
    }
    estado.revisados[fecha] = [...vistos];
    estado.ultimaRevision = { momento: new Date().toISOString(), fecha, avisos: lista.length, leidos: vistos.size };
    estado.error = null;
  } catch (e) {
    estado.error = e.message;
  }
  // Limpieza: 10 días de revisados y un año de normas encontradas
  const limite = new Date(Date.parse(hoyISO) - 10 * 864e5).toISOString().slice(0, 10);
  for (const f of Object.keys(estado.revisados)) if (f < limite) delete estado.revisados[f];
  const limiteAvisos = new Date(Date.parse(hoyISO) - DIAS_AVISO * 864e5).toISOString().slice(0, 10);
  estado.avisos = estado.avisos.filter((a) => a.fecha >= limiteAvisos);
  await writeFile(ruta, JSON.stringify(estado, null, 1) + '\n', 'utf8');
  return estado;
}

/**
 * Retenciones vigentes hoy: los valores base de config.json más los escalones del
 * cronograma oficial cuya fecha ya llegó.
 */
export function retencionesVigentes(ret, hoyISO) {
  const granos = Object.assign({}, ret.granos);
  let desde = ret.actualizado;
  for (const paso of (ret.cronograma || []).slice().sort((a, b) => a.desde.localeCompare(b.desde))) {
    if (paso.desde <= hoyISO) { Object.assign(granos, paso.granos); desde = paso.desde; }
  }
  const pendientes = (ret.pendientes || []).filter((p) => p.desde <= hoyISO);
  const proximo = (ret.cronograma || []).filter((p) => p.desde > hoyISO).sort((a, b) => a.desde.localeCompare(b.desde))[0] || null;
  return { granos, desde, pendientes, proximo };
}
