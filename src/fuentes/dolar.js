// Cotizaciones del dólar desde DolarApi (https://dolarapi.com), API pública y gratuita
// que centraliza oficial (Banco Nación), mayorista, MEP, CCL, blue, tarjeta y cripto.

import { obtenerJSON } from '../lib/http.js';
import { fechaISOArgentina } from '../lib/formato.js';

// Clave interna -> "casa" en DolarApi, en el orden en que se muestran
export const TIPOS_DOLAR = [
  { clave: 'oficial', casa: 'oficial', nombre: 'Oficial BNA' },
  { clave: 'mayorista', casa: 'mayorista', nombre: 'Mayorista' },
  { clave: 'mep', casa: 'bolsa', nombre: 'MEP' },
  { clave: 'ccl', casa: 'contadoconliqui', nombre: 'CCL' },
  { clave: 'blue', casa: 'blue', nombre: 'Blue' },
  { clave: 'tarjeta', casa: 'tarjeta', nombre: 'Tarjeta' },
  { clave: 'cripto', casa: 'cripto', nombre: 'Cripto' }
];

export async function obtenerDolar(config) {
  const lista = await obtenerJSON(config.dolar.url, { timeoutMs: config.timeoutMs });
  if (!Array.isArray(lista)) throw new Error('Formato inesperado de DolarApi');

  const tipos = {};
  let fecha = null;
  for (const t of TIPOS_DOLAR) {
    const item = lista.find((x) => x.casa === t.casa);
    if (!item) continue;
    tipos[t.clave] = {
      compra: typeof item.compra === 'number' ? item.compra : null,
      venta: typeof item.venta === 'number' ? item.venta : null,
      actualizado: item.fechaActualizacion || null
    };
    if (t.clave === 'oficial' && item.fechaActualizacion) {
      fecha = fechaISOArgentina(new Date(item.fechaActualizacion));
    }
  }
  if (!tipos.oficial) throw new Error('DolarApi no devolvió el dólar oficial');
  return { fecha: fecha || fechaISOArgentina(), tipos };
}

/**
 * Historial del dólar oficial (ArgentinaDatos) para completar el gráfico de 30 días la
 * primera vez que corre el tablero. Devuelve [{ fecha, venta }]. Si falla, devuelve [].
 */
export async function obtenerHistoricoOficial(config) {
  try {
    const lista = await obtenerJSON(config.dolar.historicoOficialUrl, { timeoutMs: config.timeoutMs });
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((x) => x.fecha && typeof x.venta === 'number')
      .slice(-60)
      .map((x) => ({ fecha: x.fecha.slice(0, 10), venta: x.venta }));
  } catch {
    return [];
  }
}
