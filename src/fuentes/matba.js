// Matba-Rofex: precios de ajuste de futuros agrícolas (USD por tonelada).
// Se usa el endpoint JSON que consume la web pública de Matba-Rofex. No está documentado
// oficialmente, por eso el parser es tolerante y, si falla, la tarjeta muestra
// "dato no disponible" sin afectar al resto de la página.

import { obtenerJSON } from '../lib/http.js';
import { fechaISOArgentina } from '../lib/formato.js';

const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };

/** "SOJ.ROS/MAY27" -> { producto: "SOJ.ROS", mes: 5, anio: 2027, etiqueta: "MAY27" } */
function parsearSimbolo(simbolo) {
  const m = String(simbolo).toUpperCase().match(/^([A-Z]+\.[A-Z]+)\/([A-Z]{3})(\d{2})$/);
  if (!m || !MESES[m[2]]) return null;
  return { producto: m[1], mes: MESES[m[2]], anio: 2000 + Number(m[3]), etiqueta: `${m[2]}${m[3]}` };
}

const primero = (obj, claves) => {
  for (const k of claves) if (obj[k] != null && obj[k] !== '') return obj[k];
  return null;
};

export async function obtenerMatba(config) {
  const cfg = config.matbaRofex;
  if (!cfg.habilitado) throw new Error('Fuente deshabilitada en config.json');

  const hoy = new Date();
  const desde = fechaISOArgentina(new Date(hoy.getTime() - 10 * 86400000));
  const hasta = fechaISOArgentina(hoy);
  const url = `${cfg.url}?product=&segment=Agropecuario&type=FUT&excludeEmptyVol=false&from=${desde}&to=${hasta}&page=1&pageSize=500&sortDir=DESC&market=ROFX`;

  const json = await obtenerJSON(url, { timeoutMs: config.timeoutMs });
  const filas = Array.isArray(json) ? json : json?.data || json?.content || json?.items || [];
  if (!Array.isArray(filas) || !filas.length) throw new Error('Respuesta vacía de Matba-Rofex');

  // Nos quedamos con el último ajuste de cada contrato
  const porSimbolo = new Map();
  for (const f of filas) {
    const simbolo = primero(f, ['symbol', 'simbolo', 'instrument', 'ticker']);
    const info = simbolo && parsearSimbolo(simbolo);
    if (!info) continue;
    const ajuste = Number(primero(f, ['settlement', 'settlementPrice', 'ajuste', 'close', 'closingPrice']));
    if (!Number.isFinite(ajuste) || ajuste <= 0) continue;
    const fechaRaw = primero(f, ['dateTime', 'date', 'fecha', 'tradeDate']);
    const fecha = fechaRaw ? String(fechaRaw).slice(0, 10) : hasta;
    const previo = porSimbolo.get(simbolo);
    if (!previo || fecha > previo.fecha) porSimbolo.set(simbolo, { ...info, ajuste, fecha });
  }

  // Se descartan los contratos que vencen este mes (ya casi sin operaciones) y, si hay
  // meses de cosecha configurados, se priorizan esas posiciones.
  const [anioHoy, mesHoy] = hasta.split('-').map(Number);
  const vigente = (c) => c.anio > anioHoy || (c.anio === anioHoy && c.mes > mesHoy);

  const granos = {};
  let fechaMax = null;
  for (const [clave, producto] of Object.entries(cfg.productos)) {
    const todos = [...porSimbolo.values()]
      .filter((c) => c.producto === producto && vigente(c))
      .sort((a, b) => a.anio - b.anio || a.mes - b.mes);
    const meses = (cfg.mesesCosecha?.[clave] || []).map((m) => MESES[m]).filter(Boolean);
    const preferidos = meses.length ? todos.filter((c) => meses.includes(c.mes)) : [];
    const contratos = (preferidos.length ? preferidos : todos).slice(0, cfg.maxPosiciones);
    if (contratos.length) {
      granos[clave] = contratos.map((c) => ({ posicion: c.etiqueta, usdTonelada: c.ajuste, fecha: c.fecha }));
      for (const c of contratos) if (!fechaMax || c.fecha > fechaMax) fechaMax = c.fecha;
    }
  }

  if (!Object.keys(granos).length) throw new Error('No se encontraron contratos de soja, maíz o trigo');
  return { fecha: fechaMax, granos };
}
