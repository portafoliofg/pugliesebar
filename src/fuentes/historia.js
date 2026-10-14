// Historia diaria de precios para completar el "día a día" de la pestaña Granos.
// Se usa una sola vez (cuando la serie tiene pocos días); después el tablero suma un dato por día.
// - Pizarra Rosario: consultas de la Cámara Arbitral (10 días por página).
// - Chicago: Yahoo Finance (cierres diarios de los últimos 3 meses).
// - Matba-Rofex: ajustes diarios de cada posición (API pública, paginada).

import * as cheerio from 'cheerio';
import { obtenerTexto, obtenerJSON } from '../lib/http.js';
import { parsearNumeroAR, fechaISOArgentina } from '../lib/formato.js';
import { parsearSimbolo } from './matba.js';

// Códigos de producto del formulario de consultas de la Cámara Arbitral
const PRODUCTOS_CAC = { trigo: 8, maiz: 3, girasol: 9, soja: 13, sorgo: 6 };
const CONSULTAS = 'https://www.cac.bcr.com.ar/es/precios-de-pizarra/consultas';

async function pizarraDeUnGrano(producto, tipo, desde, hasta, timeoutMs) {
  const puntos = new Map();
  for (let pagina = 0; pagina < 12; pagina++) {
    const url = `${CONSULTAS}?product=${producto}&type=${tipo}&date_start=${desde}&date_end=${hasta}${pagina ? `&page=${pagina}` : ''}`;
    const $ = cheerio.load(await obtenerTexto(url, { timeoutMs }));
    let nuevos = 0;
    $('table tr').each((_, tr) => {
      const t = $(tr).text().replace(/\s+/g, ' ').trim();
      const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+\$\s*([\d.]+(?:,\d+)?)/);
      if (!m) return;
      const fecha = `${m[3]}-${m[2]}-${m[1]}`;
      const valor = parsearNumeroAR(m[4]);
      if (!puntos.has(fecha) && Number.isFinite(valor) && valor > 0) { puntos.set(fecha, valor); nuevos++; }
    });
    if (!nuevos) break;   // página vacía o repetida: no hay más
  }
  return [...puntos].map(([fecha, valor]) => ({ fecha, valor }));
}

/** { soja: [{fecha, valor}], … } en $/t, de `dias` días para atrás. */
export async function historiaPizarra(granos, dias, config) {
  const hasta = fechaISOArgentina();
  const desde = fechaISOArgentina(new Date(Date.now() - dias * 864e5));
  const out = {};
  for (const g of granos) {
    if (!PRODUCTOS_CAC[g]) continue;
    try {
      let p = await pizarraDeUnGrano(PRODUCTOS_CAC[g], 'pizarra', desde, hasta, config.timeoutMs);
      // Girasol y sorgo muchas veces no tienen pizarra (S/C): se completa con el precio estimativo
      if (p.length < 5) {
        const est = await pizarraDeUnGrano(PRODUCTOS_CAC[g], 'estimativo', desde, hasta, config.timeoutMs).catch(() => []);
        const ya = new Set(p.map((x) => x.fecha));
        p = p.concat(est.filter((x) => !ya.has(x.fecha)));
      }
      out[g] = p;
    } catch (e) { out[g] = []; }
  }
  return out;
}

/** { soja: [{fecha, valor}], … } en US$/t (cierre diario del contrato continuo). */
export async function historiaCbot(config) {
  const out = {};
  for (const [g, simbolo] of Object.entries(config.cbot.simbolos)) {
    for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
      try {
        const j = await obtenerJSON(`${host}/v8/finance/chart/${encodeURIComponent(simbolo)}?range=3mo&interval=1d`, { timeoutMs: config.timeoutMs, reintentos: 0 });
        const r = j?.chart?.result?.[0];
        const ts = r?.timestamp || []; const cierres = r?.indicators?.quote?.[0]?.close || [];
        const factor = (r?.meta?.currency || 'USX') === 'USX' ? 0.01 : 1;
        const bpt = config.cbot.bushelsPorTonelada[g];
        out[g] = ts.map((t, i) => ({ fecha: fechaISOArgentina(new Date(t * 1000)), valor: cierres[i] != null ? Math.round(cierres[i] * factor * bpt * 100) / 100 : null }))
          .filter((p) => Number.isFinite(p.valor));
        break;
      } catch (e) { out[g] = out[g] || []; }
    }
  }
  return out;
}

/** { 'soja.NOV26': [{fecha, valor}], … } en US$/t (ajuste diario de cada posición). */
export async function historiaMatba(config, dias) {
  const cfg = config.matbaRofex;
  const hasta = fechaISOArgentina();
  const desde = fechaISOArgentina(new Date(Date.now() - dias * 864e5));
  const productos = Object.fromEntries(Object.entries(cfg.productos).map(([g, p]) => [p, g]));
  const out = {};
  for (let pagina = 1; pagina <= 12; pagina++) {
    const url = `${cfg.url}?product=&segment=Agropecuario&type=FUT&excludeEmptyVol=false&from=${desde}&to=${hasta}&page=${pagina}&pageSize=500&sortDir=DESC&market=ROFX`;
    const json = await obtenerJSON(url, { timeoutMs: config.timeoutMs });
    const filas = json?.data || [];
    for (const f of filas) {
      const info = f.symbol && parsearSimbolo(f.symbol);
      const g = info && productos[info.producto];
      const valor = Number(f.settlement);
      if (!g || !Number.isFinite(valor) || valor <= 0) continue;
      (out[`${g}.${info.etiqueta}`] ||= []).push({ fecha: String(f.dateTime).slice(0, 10), valor });
    }
    if (filas.length < 500 || pagina * 500 >= (json?.totalEntries || 0)) break;
  }
  return out;
}
