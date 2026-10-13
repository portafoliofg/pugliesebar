// Titulares agro desde feeds RSS de medios argentinos (lista en config.json -> noticias.feeds).
// Solo se toma título, fuente, fecha y link: nunca el contenido de la nota.
// El XML se parsea con cheerio en modo XML (sin dependencias extra).

import * as cheerio from 'cheerio';
import { obtenerTexto } from '../lib/http.js';
import { fechaISOArgentina } from '../lib/formato.js';

const limpiar = (t) => String(t || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, ' ').trim();

async function leerFeed(feed, timeoutMs) {
  const xml = await obtenerTexto(feed.url, {
    timeoutMs,
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }
  });
  const $ = cheerio.load(xml, { xml: true });
  const items = [];

  // RSS 2.0
  $('item').each((_, el) => {
    const it = $(el);
    items.push({
      titulo: limpiar(it.children('title').first().text()),
      link: limpiar(it.children('link').first().text()) || limpiar(it.children('guid').first().text()),
      fecha: limpiar(it.children('pubDate').first().text()) || limpiar(it.children('dc\\:date').first().text())
    });
  });
  // Atom
  if (!items.length) {
    $('entry').each((_, el) => {
      const it = $(el);
      items.push({
        titulo: limpiar(it.children('title').first().text()),
        link: it.children('link[rel="alternate"]').attr('href') || it.children('link').first().attr('href') || '',
        fecha: limpiar(it.children('updated').first().text()) || limpiar(it.children('published').first().text())
      });
    });
  }

  return items
    .filter((i) => i.titulo && /^https?:\/\//.test(i.link))
    .map((i) => {
      const d = i.fecha ? new Date(i.fecha) : null;
      return { ...i, fuente: feed.nombre, fecha: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null };
    });
}

export async function obtenerNoticias(config) {
  const cfg = config.noticias;
  const resultados = await Promise.allSettled(cfg.feeds.map((f) => leerFeed(f, config.timeoutMs)));

  const errores = [];
  const porFuente = [];
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      // Más recientes primero dentro de cada fuente
      const ordenadas = r.value.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      porFuente.push(ordenadas.slice(0, cfg.maxPorFuente));
    } else {
      errores.push(`${cfg.feeds[i].nombre}: ${r.reason?.message || r.reason}`);
    }
  });

  // Mezclamos las fuentes y ordenamos por fecha, sin títulos repetidos
  const vistos = new Set();
  const titulares = porFuente
    .flat()
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .filter((n) => {
      const k = n.titulo.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, cfg.maxTitulares);

  if (!titulares.length) throw new Error(errores.join(' | ') || 'Sin titulares');
  return { fecha: fechaISOArgentina(), titulares, errores };
}
