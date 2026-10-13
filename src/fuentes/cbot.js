// Chicago (CBOT): futuros continuos de la posición más cercana, desde la API de gráficos de
// Yahoo Finance (JSON público, sin clave). Los granos cotizan en centavos de dólar por bushel.

import { obtenerJSON } from '../lib/http.js';
import { fechaISOArgentina } from '../lib/formato.js';

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

async function cotizacion(simbolo, timeoutMs) {
  let ultimoError;
  // Si un host falla se prueba el otro (además del reintento de obtenerJSON)
  for (const host of HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(simbolo)}?range=5d&interval=1d`;
      const json = await obtenerJSON(url, { timeoutMs });
      const r = json?.chart?.result?.[0];
      const meta = r?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error(`Sin precio para ${simbolo}`);
      return {
        centavosBushel: meta.regularMarketPrice,
        cierreAnterior: meta.chartPreviousClose ?? meta.previousClose ?? null,
        fecha: meta.regularMarketTime ? fechaISOArgentina(new Date(meta.regularMarketTime * 1000)) : null,
        moneda: meta.currency || 'USX'
      };
    } catch (err) {
      ultimoError = err;
    }
  }
  throw ultimoError;
}

export async function obtenerCBOT(config) {
  const { simbolos, bushelsPorTonelada } = config.cbot;
  const granos = {};
  let fecha = null;
  const errores = [];

  for (const [clave, simbolo] of Object.entries(simbolos)) {
    try {
      const c = await cotizacion(simbolo, config.timeoutMs);
      // USX = centavos de dólar. Si alguna vez viene en USD, no se divide.
      const usdBushel = c.moneda === 'USX' ? c.centavosBushel / 100 : c.centavosBushel;
      granos[clave] = {
        simbolo,
        usdBushel,
        usdTonelada: usdBushel * bushelsPorTonelada[clave]
      };
      if (c.fecha && (!fecha || c.fecha > fecha)) fecha = c.fecha;
    } catch (err) {
      errores.push(`${clave}: ${err.message}`);
    }
  }

  if (!Object.keys(granos).length) throw new Error(errores.join(' | ') || 'Sin datos de CBOT');
  return { fecha, granos, errores };
}
