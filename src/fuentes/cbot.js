// Chicago (CBOT): futuros continuos de la posición más cercana (USD por bushel).
// Fuente principal: API de gráficos de Yahoo Finance (JSON público, sin clave).
// Respaldo: Stooq (CSV público, sin clave), porque Yahoo suele responder HTTP 429
// a los servidores de GitHub Actions.

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

async function cotizacion(simbolo, timeoutMs) {
  try {
    return await desdeYahoo(simbolo, timeoutMs);
  } catch (errYahoo) {
    try {
      return await desdeStooq(simbolo, timeoutMs);
    } catch (errStooq) {
      throw new Error(`Yahoo: ${errYahoo.message} · Stooq: ${errStooq.message}`);
    }
  }
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
