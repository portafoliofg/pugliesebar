// Feriados nacionales de Argentina.
// Primero se consulta la API pública de ArgentinaDatos; si no responde, se usa la lista
// de config.json -> feriados.lista. Los días con feriado no hay mercado.

import { obtenerJSON } from '../lib/http.js';

/**
 * Devuelve { feriado: {fecha, nombre} | null, origen: 'api' | 'config' }
 * para la fecha ISO indicada (en hora argentina).
 */
export async function verificarFeriado(config, fechaISO) {
  const anio = fechaISO.slice(0, 4);
  try {
    const url = config.feriados.apiUrl.replace('{anio}', anio);
    const lista = await obtenerJSON(url, { timeoutMs: config.timeoutMs });
    if (!Array.isArray(lista)) throw new Error('Formato inesperado');
    const f = lista.find((x) => String(x.fecha).slice(0, 10) === fechaISO);
    return { feriado: f ? { fecha: fechaISO, nombre: f.nombre || 'Feriado nacional' } : null, origen: 'api' };
  } catch {
    const f = (config.feriados.lista || []).find((x) => x.fecha === fechaISO);
    return { feriado: f ? { fecha: fechaISO, nombre: f.nombre } : null, origen: 'config' };
  }
}

/** true si es sábado o domingo (fecha ISO en hora argentina). */
export function esFinDeSemana(fechaISO) {
  const dia = new Date(`${fechaISO}T12:00:00-03:00`).getUTCDay();
  return dia === 0 || dia === 6;
}
