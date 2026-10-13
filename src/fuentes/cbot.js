// Chicago (CBOT): futuros continuos de la posición más cercana (USD por bushel).
// Se prueban varias fuentes públicas sin clave, en orden, hasta que una responda:
//   1. Yahoo Finance (JSON). Suele responder HTTP 429 a los servidores de GitHub Actions.
//   2. Yahoo Finance con cookie y "crumb" de sesión (como hace un navegador).
//   3. CME Group (JSON que usa su propia web).
//   4. Stooq (CSV).

import { obtenerJSON, obtenerTexto } from '../lib/http.js';
import { fechaISOArgentina } from '../lib/formato.js';

const HOSTS_YAHOO = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

/** Yahoo: devuelve { usdBushel, fecha }. Los granos vienen en centavos (moneda "USX"). */
async function desdeYahoo(simbolo, timeoutMs) {
  let ultimoError;
  for (const host of HOSTS_YAHOO) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(simbolo)}?range=5d&interval=1d`;
      const json = await obtenerJSON(url, { timeoutMs, reintentos: 0 });
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error(`Sin precio para ${simbolo}`);
      const moneda = meta.currency || 'USX';
      return {
        usdBushel: moneda === 'USX' ? meta.regularMarketPrice / 100 : meta.regularMarketPrice,
        fecha: meta.regularMarketTime ? fechaISOArgentina(new Date(meta.regularMarketTime * 1000)) : null,
        origen: 'Yahoo Finance'
      };
    } catch (err) {
      ultimoError = err;
    }
  }
  throw ultimoError;
}

// Sesión de Yahoo (cookie + crumb), se pide una sola vez por ejecución
let sesionYahoo = null;
async function obtenerSesionYahoo(timeoutMs) {
  if (sesionYahoo) return sesionYahoo;
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  const r1 = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': ua }, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  const cookie = (r1.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Yahoo no entregó cookie de sesión');
  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': ua, Cookie: cookie }, signal: AbortSignal.timeout(timeoutMs)
  });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40) throw new Error(`Yahoo no entregó crumb (HTTP ${r2.status})`);
  sesionYahoo = { ua, cookie, crumb };
  return sesionYahoo;
}

async function desdeYahooConSesion(simbolo, timeoutMs) {
  const { ua, cookie, crumb } = await obtenerSesionYahoo(timeoutMs);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=5d&interval=1d&crumb=${encodeURIComponent(crumb)}`;
  const json = await obtenerJSON(url, { timeoutMs, reintentos: 0, headers: { 'User-Agent': ua, Cookie: cookie } });
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error(`Sin precio para ${simbolo}`);
  return {
    usdBushel: (meta.currency || 'USX') === 'USX' ? meta.regularMarketPrice / 100 : meta.regularMarketPrice,
    fecha: meta.regularMarketTime ? fechaISOArgentina(new Date(meta.regularMarketTime * 1000)) : null,
    origen: 'Yahoo Finance'
  };
}

// Código de producto de CME Group para cada símbolo
const PRODUCTOS_CME = { 'ZS=F': 320, 'ZC=F': 300, 'ZW=F': 323 };

/** CME expresa los granos en centavos y octavos: "1052'2" = 1052 + 2/8 centavos. */
function parsearPrecioCME(texto) {
  const m = String(texto || '').trim().match(/^(\d+)(?:'(\d))?/);
  if (!m) return null;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 8 : 0);
}

async function desdeCME(simbolo, timeoutMs) {
  const id = PRODUCTOS_CME[simbolo];
  if (!id) throw new Error(`Sin código CME para ${simbolo}`);
  const json = await obtenerJSON(`https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/${id}/G`, {
    timeoutMs, reintentos: 0, headers: { Referer: 'https://www.cmegroup.com/' }
  });
  // La primera cotización con precio es la posición más cercana
  for (const q of json?.quotes || []) {
    const centavos = parsearPrecioCME(q.last) ?? parsearPrecioCME(q.priorSettle);
    if (centavos) {
      const fecha = String(q.updated || q.tradeDate || '').match(/(\d{4})(\d{2})(\d{2})/);
      return {
        usdBushel: centavos / 100,
        fecha: fecha ? `${fecha[1]}-${fecha[2]}-${fecha[3]}` : null,
        origen: 'CME Group'
      };
    }
  }
  throw new Error(`CME sin precio para ${simbolo}`);
}

/**
 * Stooq: CSV con encabezado "Symbol,Date,Time,Open,High,Low,Close,Volume".
 * Los futuros de granos (ZS.F, ZC.F, ZW.F) cotizan en centavos por bushel.
 */
async function desdeStooq(simbolo, timeoutMs) {
  const s = simbolo.replace('=F', '.F').toLowerCase();
  const csv = await obtenerTexto(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=csv`, { timeoutMs });
  const [encabezado, fila] = csv.trim().split(/\r?\n/);
  if (!encabezado || !fila) throw new Error(`Stooq sin datos para ${s}`);
  const cols = encabezado.split(',').map((c) => c.trim().toLowerCase());
  const vals = fila.split(',').map((v) => v.trim());
  const cierre = Number(vals[cols.indexOf('close')]);
  const fecha = vals[cols.indexOf('date')];
  if (!Number.isFinite(cierre) || cierre <= 0) throw new Error(`Stooq sin precio para ${s}`);
  return {
    // Si algún día Stooq lo diera en dólares (valor chico), no se divide
    usdBushel: cierre > 100 ? cierre / 100 : cierre,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    origen: 'Stooq'
  };
}

const PROVEEDORES = [
  ['Yahoo', desdeYahoo],
  ['Yahoo con sesión', desdeYahooConSesion],
  ['CME', desdeCME],
  ['Stooq', desdeStooq]
];

async function cotizacion(simbolo, timeoutMs) {
  const errores = [];
  for (const [nombre, fn] of PROVEEDORES) {
    try {
      return await fn(simbolo, timeoutMs);
    } catch (err) {
      errores.push(`${nombre}: ${err.message}`);
    }
  }
  throw new Error(errores.join(' · '));
}

export async function obtenerCBOT(config) {
  const { simbolos, bushelsPorTonelada } = config.cbot;
  const granos = {};
  let fecha = null;
  const errores = [];
  const origenes = new Set();

  for (const [clave, simbolo] of Object.entries(simbolos)) {
    try {
      const c = await cotizacion(simbolo, config.timeoutMs);
      granos[clave] = {
        simbolo,
        usdBushel: c.usdBushel,
        usdTonelada: c.usdBushel * bushelsPorTonelada[clave]
      };
      origenes.add(c.origen);
      if (c.fecha && (!fecha || c.fecha > fecha)) fecha = c.fecha;
    } catch (err) {
      errores.push(`${clave}: ${err.message}`);
    }
  }

  if (!Object.keys(granos).length) throw new Error(errores.join(' | ') || 'Sin datos de CBOT');
  return { fecha, granos, errores, origen: [...origenes].join(' y ') };
}
