// Hacienda: precios de referencia del Mercado Agroganadero de Cañuelas (MAG).
// El MAG no tiene API pública; se lee la tabla de precios por categoría con cheerio.
// Para cada categoría del config se toman las filas cuyo nombre la contiene y se calcula
// el promedio ponderado por cabezas (o el promedio simple si no hay columna de cabezas).

import * as cheerio from 'cheerio';
import { obtenerTexto } from '../lib/http.js';
import { parsearNumeroAR, fechaISOArgentina } from '../lib/formato.js';

const RE_FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const normalizar = (t) =>
  String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

export async function obtenerHacienda(config) {
  const html = await obtenerTexto(config.hacienda.url, { timeoutMs: config.timeoutMs });
  const $ = cheerio.load(html);

  // Recorremos las tablas buscando una con encabezado "Promedio"
  const filas = [];
  $('table').each((_, tabla) => {
    const trs = $(tabla).find('tr').toArray();
    let idxCategoria = 0;
    let idxPromedio = -1;
    let idxCabezas = -1;
    for (const tr of trs) {
      const celdas = $(tr).find('th, td').toArray().map((c) => normalizar($(c).text()));
      if (idxPromedio === -1) {
        const p = celdas.findIndex((c) => c.startsWith('PROMEDIO'));
        if (p !== -1) {
          idxPromedio = p;
          idxCabezas = celdas.findIndex((c) => c.startsWith('CABEZA'));
          const ic = celdas.findIndex((c) => c.startsWith('CATEGOR'));
          idxCategoria = ic === -1 ? 0 : ic;
        }
        continue;
      }
      if (celdas.length <= idxPromedio) continue;
      const promedio = parsearNumeroAR(celdas[idxPromedio]);
      if (!promedio) continue;
      filas.push({
        categoria: celdas[idxCategoria],
        promedio,
        cabezas: idxCabezas !== -1 ? parsearNumeroAR(celdas[idxCabezas]) || 0 : 0
      });
    }
  });

  if (!filas.length) throw new Error('No se encontró la tabla de precios por categoría del MAG');

  const categorias = {};
  for (const [clave, palabras] of Object.entries(config.hacienda.categorias)) {
    const claves = palabras.map(normalizar);
    // Se excluyen filas de "VAQUILLONA" al buscar "VACA" (y similares) exigiendo palabra completa
    const coincidentes = filas.filter((f) =>
      claves.some((p) => new RegExp(`(^|\\s)${p}(S|ES)?(\\s|$)`).test(f.categoria))
    );
    if (!coincidentes.length) continue;
    const totalCab = coincidentes.reduce((s, f) => s + f.cabezas, 0);
    const promedio = totalCab
      ? coincidentes.reduce((s, f) => s + f.promedio * f.cabezas, 0) / totalCab
      : coincidentes.reduce((s, f) => s + f.promedio, 0) / coincidentes.length;
    categorias[clave] = { promedio, cabezas: totalCab || null, filas: coincidentes.length };
  }

  if (!Object.keys(categorias).length) throw new Error('No se encontraron las categorías configuradas en el MAG');

  // Fecha del informe: primera fecha que aparezca en la página
  const m = $('body').text().match(RE_FECHA);
  const fecha = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : fechaISOArgentina();
  return { fecha, categorias };
}
