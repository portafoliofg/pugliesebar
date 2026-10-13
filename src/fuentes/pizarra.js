// Pizarra Rosario (Cámara Arbitral de Cereales de la Bolsa de Comercio de Rosario).
// No hay una API pública gratuita, así que se lee la página de precios de pizarra con cheerio.
// El parser busca por texto (nombre del grano y "$") en lugar de depender de clases CSS
// exactas, para tolerar cambios menores de diseño del sitio.

import * as cheerio from 'cheerio';
import { obtenerTexto } from '../lib/http.js';
import { parsearNumeroAR } from '../lib/formato.js';

const RE_FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const RE_PESOS = /\$\s*[\d.]+(?:,\d+)?/;
const RE_USD = /U\$S\s*[\d.]+(?:,\d+)?|US\$\s*[\d.]+(?:,\d+)?/i;

const normalizar = (t) =>
  String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Busca la fecha de la pizarra ("Precios Pizarra del día 10/10/2026"). */
function buscarFecha($) {
  const candidatos = [];
  $('h1, h2, h3, h4, h5, p, span, div, strong, time').each((_, el) => {
    const propio = $(el).clone().children().remove().end().text();
    if (/pizarra|del d[ií]a|fecha/i.test(propio) && RE_FECHA.test(propio)) candidatos.push(propio);
  });
  // Si no hay un encabezado explícito, se usa la primera fecha de la página
  if (!candidatos.length) {
    const m = $('body').text().match(RE_FECHA);
    if (m) candidatos.push(m[0]);
  }
  if (!candidatos.length) return null;
  const [, d, m, a] = candidatos[0].match(RE_FECHA);
  return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Para un grano, busca el elemento cuyo texto propio es el nombre del grano y sube por
 * sus contenedores hasta encontrar un precio en pesos. Devuelve { pesos, usd, sinCotizacion }.
 */
function buscarGrano($, nombres) {
  const buscados = nombres.map(normalizar);
  let resultado = null;

  $('body *').each((_, el) => {
    if (resultado) return false;
    const propio = normalizar($(el).clone().children().remove().end().text());
    if (!buscados.includes(propio)) return;

    // Subimos hasta 4 niveles buscando el contenedor de la tarjeta del grano
    let cont = $(el);
    for (let nivel = 0; nivel < 4; nivel++) {
      cont = cont.parent();
      if (!cont.length) break;
      const texto = cont.text().replace(/\s+/g, ' ');
      // Si el contenedor ya incluye otros granos, nos pasamos de nivel
      const nombresEnTexto = ['soja', 'maiz', 'girasol', 'trigo', 'sorgo'].filter((g) =>
        normalizar(texto).includes(g)
      );
      if (nombresEnTexto.length > 1) break;
      const mPesos = texto.match(RE_PESOS);
      if (mPesos) {
        const mUsd = texto.match(RE_USD);
        resultado = {
          pesos: parsearNumeroAR(mPesos[0]),
          usd: mUsd ? parsearNumeroAR(mUsd[0].replace(/U\$S|US\$/i, '')) : null,
          sinCotizacion: false
        };
        return false;
      }
      if (/\bS\/?C\b/i.test(texto)) {
        resultado = { pesos: null, usd: null, sinCotizacion: true };
        return false;
      }
    }
  });
  return resultado;
}

export async function obtenerPizarra(config) {
  const html = await obtenerTexto(config.pizarra.url, { timeoutMs: config.timeoutMs });
  const $ = cheerio.load(html);

  const fecha = buscarFecha($);
  const granos = {};
  for (const [clave, nombres] of Object.entries(config.pizarra.granos)) {
    granos[clave] = buscarGrano($, nombres) || { pesos: null, usd: null, sinCotizacion: true };
  }

  const conPrecio = Object.values(granos).filter((g) => g.pesos != null).length;
  if (!conPrecio) throw new Error('No se encontraron precios en la página de pizarra (¿cambió el formato?)');

  return { fecha, granos };
}
