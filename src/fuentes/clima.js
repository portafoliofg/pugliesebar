// Pronóstico de 7 días desde Open-Meteo (gratis, sin clave).
// Las localidades se configuran en config.json -> clima.localidades.

import { obtenerJSON } from '../lib/http.js';
import { fechaISOArgentina } from '../lib/formato.js';

async function pronostico(loc, config) {
  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code',
    timezone: 'America/Argentina/Buenos_Aires',
    forecast_days: '7'
  });
  const json = await obtenerJSON(`https://api.open-meteo.com/v1/forecast?${params}`, { timeoutMs: config.timeoutMs });
  const d = json?.daily;
  if (!d?.time?.length) throw new Error(`Open-Meteo sin datos para ${loc.nombre}`);
  const umbral = config.clima.umbralHeladaC;
  const dias = d.time.map((fecha, i) => {
    const min = d.temperature_2m_min?.[i] ?? null;
    return {
      fecha,
      min,
      max: d.temperature_2m_max?.[i] ?? null,
      lluviaMm: d.precipitation_sum?.[i] ?? null,
      probLluvia: d.precipitation_probability_max?.[i] ?? null,
      codigo: d.weather_code?.[i] ?? null,
      helada: min != null && min < umbral
    };
  });
  return {
    nombre: loc.nombre,
    provincia: loc.provincia || '',
    dias,
    lluviaTotal: dias.reduce((s, x) => s + (x.lluviaMm || 0), 0),
    hayHelada: dias.some((x) => x.helada)
  };
}

export async function obtenerClima(config) {
  const localidades = [];
  const errores = [];
  for (const loc of config.clima.localidades) {
    try {
      localidades.push(await pronostico(loc, config));
    } catch (err) {
      errores.push(err.message);
    }
  }
  if (!localidades.length) throw new Error(errores.join(' | ') || 'Sin pronóstico');
  return { fecha: fechaISOArgentina(), localidades, errores };
}
