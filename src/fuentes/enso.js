// El Niño / La Niña (ENSO) desde el Centro de Predicción Climática de la NOAA (CPC), gratis y sin clave:
//  - ONI (índice oficial, trimestres móviles desde 1950): oni.ascii.txt
//  - Niño 3.4 semanal: wksst9120.for
//  - Estado de alerta y síntesis del pronóstico: discusión mensual (ensodisc.shtml)
// Con el ONI se clasifica cada campaña histórica para comparar lluvias en años parecidos.

import * as cheerio from 'cheerio';
import { obtenerTexto } from '../lib/http.js';

const CPC = 'https://www.cpc.ncep.noaa.gov';

const ESTADOS = {
  'el nino advisory': { texto: 'El Niño en curso', fase: 'nino' },
  'el nino watch': { texto: 'Vigilancia de El Niño (podría formarse)', fase: 'neutral' },
  'la nina advisory': { texto: 'La Niña en curso', fase: 'nina' },
  'la nina watch': { texto: 'Vigilancia de La Niña (podría formarse)', fase: 'neutral' },
  'final el nino advisory': { texto: 'El Niño terminó', fase: 'neutral' },
  'final la nina advisory': { texto: 'La Niña terminó', fase: 'neutral' },
  'not active': { texto: 'Neutral (ni El Niño ni La Niña)', fase: 'neutral' }
};

export function intensidad(anom) {
  const a = Math.abs(anom);
  if (a < 0.5) return 'neutral';
  if (a < 1) return 'débil';
  if (a < 1.5) return 'moderado';
  if (a < 2) return 'fuerte';
  return 'muy fuerte';
}
export const faseDe = (anom) => (anom >= 0.5 ? 'nino' : anom <= -0.5 ? 'nina' : 'neutral');

async function oni(timeoutMs) {
  const txt = await obtenerTexto(`${CPC}/data/indices/oni.ascii.txt`, { timeoutMs });
  const filas = [];
  for (const l of txt.split('\n')) {
    const m = l.trim().match(/^([A-Z]{3})\s+(\d{4})\s+([\d.]+)\s+(-?[\d.]+)$/);
    if (m) filas.push({ t: m[1], anio: Number(m[2]), anom: Number(m[4]) });
  }
  if (filas.length < 100) throw new Error('ONI: formato inesperado');
  return filas;
}

async function semanal(timeoutMs) {
  const txt = await obtenerTexto(`${CPC}/data/indices/wksst9120.for`, { timeoutMs });
  const filas = txt.split('\n').map((l) => l.match(/^\s*(\d{2})([A-Z]{3})(\d{4})\s+([\d.]+)\s*(-?[\d.]+)\s+([\d.]+)\s*(-?[\d.]+)\s+([\d.]+)\s*(-?[\d.]+)/)).filter(Boolean);
  const MESES = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  return filas.slice(-12).map((m) => ({ fecha: `${m[3]}-${MESES[m[2]]}-${m[1]}`, nino34: Number(m[9]), nino12: Number(m[5]) }));
}

async function discusion(timeoutMs) {
  const html = await obtenerTexto(`${CPC}/products/analysis_monitoring/enso_advisory/ensodisc.shtml`, { timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const texto = cheerio.load(html).text().replace(/\s+/g, ' ');
  const est = (texto.match(/ENSO Alert System Status:\s*(.{3,40}?)\s*Synopsis:/i) || [])[1] || '';
  const sinopsis = ((texto.match(/Synopsis:\s*(.+?\.)(?:\s|$)/i) || [])[1] || '').trim();
  const prob = sinopsis.match(/(\d{2,3})\s*%/);
  const clave = est.toLowerCase().replace(/ñ/g, 'n').trim();
  return { alerta: est.trim(), estado: ESTADOS[clave] || { texto: est.trim() || 'Sin dato', fase: null }, sinopsis, probabilidad: prob ? Number(prob[1]) : null,
    fechaDiscusion: (texto.match(/issued by\s+CLIMATE PREDICTION CENTER.*?(\d{1,2}\s+\w+\s+\d{4})/i) || [])[1] || null };
}

/** Devuelve el estado de ENSO y la clasificación de cada campaña (oct–mar) desde 1950. */
export async function obtenerEnso(config) {
  const t = config.timeoutMs;
  const [o, s, d] = await Promise.allSettled([oni(t), semanal(t), discusion(t)]);
  if (o.status !== 'fulfilled') throw new Error('No se pudo leer el ONI de la NOAA: ' + (o.reason?.message || o.reason));
  const filas = o.value;
  const ult = filas[filas.length - 1];
  // Campaña Y = octubre de Y a marzo de Y+1: se clasifica con el ONI de OND del año Y (el pico típico de ENSO)
  const campanas = {};
  filas.filter((f) => f.t === 'OND').forEach((f) => { campanas[f.anio] = { oni: f.anom, fase: faseDe(f.anom), intensidad: intensidad(f.anom) }; });
  const sem = s.status === 'fulfilled' ? s.value : [];
  const disc = d.status === 'fulfilled' ? d.value : null;
  const nino34 = sem.length ? sem[sem.length - 1] : null;
  const anomActual = nino34 ? nino34.nino34 : ult.anom;
  return {
    oniUltimo: { temporada: `${ult.t} ${ult.anio}`, anom: ult.anom },
    oniSerie: filas.slice(-24).map((f) => ({ temporada: `${f.t} ${f.anio}`, anom: f.anom })),
    nino34Semanal: sem,
    faseActual: disc?.estado?.fase || faseDe(anomActual),
    intensidadActual: intensidad(anomActual),
    anomActual,
    alerta: disc?.alerta || null,
    estadoTexto: disc?.estado?.texto || null,
    sinopsis: disc?.sinopsis || null,
    probabilidad: disc?.probabilidad ?? null,
    campanas,
    fuente: 'NOAA Climate Prediction Center'
  };
}
