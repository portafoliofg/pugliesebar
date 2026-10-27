// Pronóstico experimental de granos: ¿sube o baja?
//
// Cada ejecución:
//   1. Evalúa los pronósticos cuyo plazo ya se cumplió contra el precio real (acertó / falló).
//   2. Emite pronósticos nuevos a 1 y 5 ruedas para Chicago y la pizarra Rosario.
//   3. Corre una "prueba con el pasado" sobre el histórico (solo como referencia).
//
// Regla para no hacer trampa: solo se usan precios "cerrados". Un dato es cerrado si su fecha
// es anterior a hoy, o si es de hoy y la ejecución es de la noche (después de las 20 h, cuando
// ya cerraron Chicago y la pizarra). Los pronósticos se guardan antes de conocer el resultado.
//
// Se guarda en data/pronosticos.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { obtenerJSON } from './lib/http.js';
import { ZONA } from './lib/formato.js';

export const SERIES_PRONOSTICO = [
  { clave: 'cbot.soja', grano: 'soja', nombre: 'Soja · Chicago', unidad: 'usd', zonas: ['iowa', 'mato_grosso', 'rosario'] },
  { clave: 'cbot.maiz', grano: 'maiz', nombre: 'Maíz · Chicago', unidad: 'usd', zonas: ['iowa', 'mato_grosso', 'rosario'] },
  { clave: 'cbot.trigo', grano: 'trigo', nombre: 'Trigo · Chicago', unidad: 'usd', zonas: ['kansas', 'rosario'] },
  { clave: 'pizarra.soja', grano: 'soja', nombre: 'Soja · Rosario', unidad: 'ars', zonas: ['rosario', 'cordoba'] },
  { clave: 'pizarra.maiz', grano: 'maiz', nombre: 'Maíz · Rosario', unidad: 'ars', zonas: ['rosario', 'cordoba'] },
  { clave: 'pizarra.girasol', grano: 'girasol', nombre: 'Girasol · Rosario', unidad: 'ars', zonas: ['rosario', 'cordoba'] },
  { clave: 'pizarra.trigo', grano: 'trigo', nombre: 'Trigo · Rosario', unidad: 'ars', zonas: ['rosario', 'cordoba'] }
];

export const ZONAS_CLIMA = {
  iowa: { nombre: 'Iowa (EE.UU.)', lat: 41.59, lon: -93.62 },
  kansas: { nombre: 'Kansas (EE.UU.)', lat: 37.69, lon: -97.34 },
  mato_grosso: { nombre: 'Mato Grosso (Brasil)', lat: -12.55, lon: -55.72 },
  rosario: { nombre: 'Rosario', lat: -32.95, lon: -60.65 },
  cordoba: { nombre: 'Villa del Rosario', lat: -31.55, lon: -63.53 }
};

// Modelos que opinan, y modelos de referencia (la vara contra la que se miden)
export const MODELOS = [
  { clave: 'tendencia', nombre: 'Tendencia', ref: false, desc: 'Si subió en las últimas 5 ruedas, dice que sigue subiendo (y al revés).' },
  { clave: 'reversion', nombre: 'Vuelta al promedio', ref: false, desc: 'Si está por encima de su promedio de 20 ruedas, dice que baja (y al revés).' },
  { clave: 'clima', nombre: 'Clima', ref: false, desc: 'Si en las zonas productoras se viene una semana más seca que el último mes, dice que sube (y al revés).' },
  { clave: 'azar', nombre: 'Moneda', ref: true, desc: 'Tira una moneda. Es la vara mínima: un modelo que no le gana a esto no sirve.' },
  { clave: 'sube', nombre: 'Siempre sube', ref: true, desc: 'Dice siempre que sube. En pesos importa mucho: con la devaluación, la pizarra tiende a subir sola.' }
];

export const HORIZONTES = [1, 5];
export const MINIMO = 30; // pronósticos evaluados antes de sacar conclusiones
const HORA_CIERRE = 20; // desde esta hora (Argentina) el dato del día se considera cerrado
const MIN_HISTORIA = 21; // ruedas necesarias antes de emitir

// ---------- Archivo ----------

async function leer(ruta) {
  try {
    const d = JSON.parse(await readFile(ruta, 'utf8'));
    return { predicciones: d.predicciones || [], clima: d.clima || null };
  } catch {
    return { predicciones: [], clima: null };
  }
}

async function guardar(ruta, datos) {
  await mkdir(dirname(ruta), { recursive: true });
  // Una predicción por línea: el archivo queda chico y los cambios de git se leen bien
  const lineas = datos.predicciones.map((p) => '    ' + JSON.stringify(p)).join(',\n');
  const texto = `{\n  "clima": ${JSON.stringify(datos.clima)},\n  "predicciones": [\n${lineas}\n  ]\n}\n`;
  await writeFile(ruta, texto, 'utf8');
}

// ---------- Datos ----------

function horaArgentina(ahora) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(ahora));
}

/** Serie con solo los datos cerrados: [{ fecha, valor }] ordenada. */
function serieCerrada(historico, clave, hoyISO, nocturna) {
  const serie = historico.datos.series[clave] || {};
  return Object.keys(serie)
    .filter((f) => f < hoyISO || (f === hoyISO && nocturna))
    .sort()
    .map((fecha) => ({ fecha, valor: serie[fecha] }))
    .filter((p) => Number.isFinite(p.valor) && p.valor > 0);
}

/** Lluvia: próximos 7 días y promedio semanal del último mes, por zona (Open-Meteo). */
async function bajarClima(config) {
  const zonas = {};
  for (const [clave, z] of Object.entries(ZONAS_CLIMA)) {
    try {
      const params = new URLSearchParams({
        latitude: z.lat, longitude: z.lon, daily: 'precipitation_sum',
        past_days: '30', forecast_days: '7', timezone: 'UTC'
      });
      const json = await obtenerJSON(`https://api.open-meteo.com/v1/forecast?${params}`, { timeoutMs: config.timeoutMs });
      const ll = (json?.daily?.precipitation_sum || []).map((x) => x ?? 0);
      if (ll.length < 37) throw new Error('respuesta incompleta');
      const pasado = ll.slice(0, 30).reduce((a, b) => a + b, 0);
      const futuro = ll.slice(30, 37).reduce((a, b) => a + b, 0);
      zonas[clave] = { proximos7: Math.round(futuro * 10) / 10, normal7: Math.round((pasado / 30) * 7 * 10) / 10 };
    } catch (err) {
      console.log(`  ✘ pronóstico: clima de ${z.nombre}: ${err.message}`);
    }
  }
  return zonas;
}

// ---------- Modelos ----------

function azar(fecha, clave, h) {
  const b = createHash('sha256').update(`${fecha}|${clave}|${h}`).digest()[0];
  return b % 2 === 0 ? 'sube' : 'baja';
}

function predecir(modelo, valores, fecha, serie, h, clima) {
  const n = valores.length;
  switch (modelo) {
    case 'tendencia':
      return n >= 6 ? (valores[n - 1] > valores[n - 6] ? 'sube' : 'baja') : null;
    case 'reversion': {
      if (n < 20) return null;
      const prom = valores.slice(-20).reduce((a, b) => a + b, 0) / 20;
      return valores[n - 1] > prom ? 'baja' : 'sube';
    }
    case 'clima': {
      if (!clima) return null;
      const zs = serie.zonas.filter((z) => clima[z]);
      if (!zs.length) return null;
      const prox = zs.reduce((s, z) => s + clima[z].proximos7, 0);
      const normal = zs.reduce((s, z) => s + clima[z].normal7, 0);
      if (Math.abs(prox - normal) < 2 * zs.length) return null; // diferencia chica: no opina
      return prox < normal ? 'sube' : 'baja';
    }
    case 'azar':
      return azar(fecha, serie.clave, h);
    case 'sube':
      return 'sube';
    default:
      return null;
  }
}

// ---------- Estadística ----------

/** Probabilidad de acertar al menos k de n tirando una moneda (binomial exacta, en logaritmos). */
export function pValor(k, n) {
  if (n === 0 || k <= 0) return 1;
  let lp = -n * Math.LN2; // log P(X = 0)
  const logs = [];
  for (let i = 0; i <= n; i++) {
    if (i >= k) logs.push(lp);
    lp += Math.log(n - i) - Math.log(i + 1);
  }
  const max = Math.max(...logs);
  return Math.min(1, Math.exp(max) * logs.reduce((s, l) => s + Math.exp(l - max), 0));
}

/** Agrupa resultados [{ serie, modelo, h, acierto }] y pone un veredicto honesto. */
function resumir(resultados, modelosEvaluados) {
  const conteo = {};
  for (const r of resultados) {
    if (r.acierto !== true && r.acierto !== false) continue;
    const k = `${r.serie}|${r.modelo}|${r.h}`;
    const c = (conteo[k] ||= { a: 0, t: 0 });
    c.t++;
    if (r.acierto) c.a++;
  }
  const pruebas = SERIES_PRONOSTICO.length * modelosEvaluados.filter((m) => !m.ref).length * HORIZONTES.length;
  const umbral = 0.05 / pruebas; // corrección por probar muchas combinaciones a la vez
  const filas = [];
  for (const s of SERIES_PRONOSTICO) {
    for (const m of modelosEvaluados) {
      const celdas = {};
      for (const h of HORIZONTES) {
        const { a, t } = conteo[`${s.clave}|${m.clave}|${h}`] || { a: 0, t: 0 };
        const ref = conteo[`${s.clave}|sube|${h}`];
        const pctSube = ref?.t ? ref.a / ref.t : null;
        const pv = pValor(a, t);
        let veredicto, tono;
        if (m.ref) [veredicto, tono] = ['Referencia', 'gris'];
        else if (t < MINIMO) [veredicto, tono] = [`Pocos datos (${t} de ${MINIMO})`, ''];
        else if (pctSube != null && a / t <= pctSube) [veredicto, tono] = ['No supera a «siempre sube»', 'rojo'];
        else if (pv < umbral) [veredicto, tono] = ['Le gana al azar', 'verde'];
        else if (pv < 0.05) [veredicto, tono] = ['Posible señal, puede ser suerte', 'viejo'];
        else [veredicto, tono] = ['No le gana al azar', 'rojo'];
        celdas[h] = { aciertos: a, total: t, pct: t ? (100 * a) / t : null, p: pv, veredicto, tono };
      }
      filas.push({ serie: s.clave, nombreSerie: s.nombre, modelo: m.clave, nombreModelo: m.nombre, ref: m.ref, celdas });
    }
  }
  return { filas, pruebas };
}

// ---------- Prueba con el pasado ----------

function pruebaPasado(cerradas) {
  const modelos = MODELOS.filter((m) => m.clave !== 'clima'); // no hay pronósticos de lluvia viejos
  const resultados = [];
  let desde = null;
  let hasta = null;
  for (const s of SERIES_PRONOSTICO) {
    const pts = cerradas[s.clave];
    const vals = pts.map((p) => p.valor);
    for (let t = MIN_HISTORIA - 1; t < pts.length; t++) {
      for (const h of HORIZONTES) {
        if (t + h >= pts.length) continue;
        const real = vals[t + h] > vals[t] ? 'sube' : vals[t + h] < vals[t] ? 'baja' : 'igual';
        if (real === 'igual') continue;
        for (const m of modelos) {
          const pred = predecir(m.clave, vals.slice(0, t + 1), pts[t].fecha, s, h, null);
          if (!pred) continue;
          resultados.push({ serie: s.clave, modelo: m.clave, h, acierto: pred === real });
        }
        if (!desde || pts[t].fecha < desde) desde = pts[t].fecha;
        if (!hasta || pts[t + h].fecha > hasta) hasta = pts[t + h].fecha;
      }
    }
  }
  return { ...resumir(resultados, modelos), desde, hasta };
}

// ---------- En qué se basa cada pronóstico (para el botón "i" de la pestaña) ----------

function fundamentos(serie, pts, fecha, clima, nocturna, hoyISO) {
  if (!fecha) return null;
  const hasta = pts.filter((p) => p.fecha <= fecha);
  const n = hasta.length;
  const actual = hasta[n - 1];
  if (!actual || actual.fecha !== fecha) return null; // solo con los números del día del pronóstico
  const pct = (a, b) => ((a - b) / b) * 100;
  const salida = { actual };

  if (n >= 6) {
    const antes = hasta[n - 6];
    salida.tendencia = { antes, pct: pct(actual.valor, antes.valor) };
  }
  if (n >= 20) {
    const ult20 = hasta.slice(-20);
    const promedio = ult20.reduce((s, p) => s + p.valor, 0) / 20;
    salida.reversion = { promedio, desde: ult20[0].fecha, pct: pct(actual.valor, promedio) };
  }
  // Clima: solo cuenta si el pronóstico de lluvia es del mismo día del precio
  if (clima?.fecha === fecha) {
    const zonas = serie.zonas.filter((z) => clima.zonas[z]).map((z) => ({ clave: z, ...clima.zonas[z] }));
    const prox = zonas.reduce((s, z) => s + z.proximos7, 0);
    const normal = zonas.reduce((s, z) => s + z.normal7, 0);
    salida.clima = { zonas, prox, normal, margen: 2 * zonas.length, fechaLluvia: clima.fecha };
  } else {
    salida.clima = { motivo: fecha < hoyISO || !nocturna ? 'manana' : 'sinDatos' };
  }
  return salida;
}

// ---------- Ciclo ----------

export async function actualizarPronosticos({ historico, config, ahora, hoyISO, ruta }) {
  const datos = await leer(ruta);
  const nocturna = horaArgentina(ahora) >= HORA_CIERRE;
  const cerradas = Object.fromEntries(SERIES_PRONOSTICO.map((s) => [s.clave, serieCerrada(historico, s.clave, hoyISO, nocturna)]));

  // 1. Evaluar los pendientes cuyo plazo ya se cumplió
  let evaluados = 0;
  for (const p of datos.predicciones) {
    if (p.real) continue;
    const pts = cerradas[p.serie] || [];
    const i = pts.findIndex((x) => x.fecha === p.fecha);
    if (i === -1 || i + p.h >= pts.length) continue;
    const base = pts[i].valor; // valor de cierre definitivo del día del pronóstico
    const fin = pts[i + p.h];
    p.base = base;
    p.fechaReal = fin.fecha;
    p.valorReal = fin.valor;
    p.real = fin.valor > base ? 'sube' : fin.valor < base ? 'baja' : 'igual';
    p.acierto = p.real === 'igual' ? null : p.real === p.pred;
    evaluados++;
  }

  // 2. Emitir pronósticos para el último dato cerrado de cada serie
  const hechos = new Set(datos.predicciones.map((p) => `${p.fecha}|${p.serie}|${p.modelo}|${p.h}`));
  const pendientesHoy = SERIES_PRONOSTICO.some((s) => {
    const ult = cerradas[s.clave].at(-1);
    return ult && ult.fecha === hoyISO && HORIZONTES.some((h) => !hechos.has(`${ult.fecha}|${s.clave}|clima|${h}`));
  });
  // El clima solo se usa en la corrida de la noche, para el dato de ese mismo día: un pronóstico
  // de lluvia bajado al día siguiente ya sería información posterior al cierre.
  if (pendientesHoy && nocturna) {
    const zonas = await bajarClima(config);
    if (Object.keys(zonas).length) datos.clima = { fecha: hoyISO, zonas };
  }
  const climaHoy = datos.clima?.fecha === hoyISO ? datos.clima.zonas : null;

  let emitidos = 0;
  for (const s of SERIES_PRONOSTICO) {
    const pts = cerradas[s.clave];
    if (pts.length < MIN_HISTORIA) continue;
    const ult = pts.at(-1);
    const vals = pts.map((p) => p.valor);
    for (const m of MODELOS) {
      if (m.clave === 'clima' && ult.fecha !== hoyISO) continue;
      for (const h of HORIZONTES) {
        const k = `${ult.fecha}|${s.clave}|${m.clave}|${h}`;
        if (hechos.has(k)) continue;
        const pred = predecir(m.clave, vals, ult.fecha, s, h, climaHoy);
        if (!pred) continue;
        datos.predicciones.push({ fecha: ult.fecha, serie: s.clave, modelo: m.clave, h, base: ult.valor, pred, emitido: ahora.toISOString() });
        hechos.add(k);
        emitidos++;
      }
    }
  }

  await guardar(ruta, datos);

  // 3. Armar lo que muestra la pestaña
  const vivo = resumir(datos.predicciones.map((p) => ({ serie: p.serie, modelo: p.modelo, h: p.h, acierto: p.acierto })), MODELOS);
  const ultimaFecha = {};
  for (const p of datos.predicciones) if (!ultimaFecha[p.serie] || p.fecha > ultimaFecha[p.serie]) ultimaFecha[p.serie] = p.fecha;
  const vigentes = SERIES_PRONOSTICO.map((s) => {
    const f = ultimaFecha[s.clave];
    const preds = {};
    let base = null;
    for (const p of datos.predicciones) {
      if (p.serie !== s.clave || p.fecha !== f) continue;
      preds[`${p.modelo}|${p.h}`] = p.pred;
      base = p.base;
    }
    return { serie: s.clave, nombre: s.nombre, unidad: s.unidad, fecha: f || null, base, preds, fundamentos: fundamentos(s, cerradas[s.clave], f, datos.clima, nocturna, hoyISO) };
  });
  const ultimos = datos.predicciones
    .filter((p) => p.real && !MODELOS.find((m) => m.clave === p.modelo)?.ref)
    .sort((a, b) => (b.fechaReal + b.serie).localeCompare(a.fechaReal + a.serie))
    .slice(0, 40);
  const totalEvaluados = datos.predicciones.filter((p) => p.real).length;

  console.log(`  ✔ pronóstico: ${evaluados} evaluados, ${emitidos} emitidos${nocturna ? ' (corrida de la noche)' : ''}`);
  return {
    vivo, vigentes, ultimos, totalEvaluados, minimo: MINIMO,
    totalEmitidos: datos.predicciones.length,
    pasado: pruebaPasado(cerradas),
    clima: datos.clima
  };
}
