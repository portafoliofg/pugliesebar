// Genera public/index.html: un solo archivo con el CSS y el JS incluidos.
// Recibe el "modelo" armado por index.js y devuelve el HTML como texto.
// Los estilos y el script del navegador están en src/plantilla/.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  esc, numero, pesos, dolares, fechaCorta, fechaHoraCorta, fechaHoraLarga, diaSemanaCorto
} from './lib/formato.js';
import { TIPOS_DOLAR } from './fuentes/dolar.js';

const DIR_PLANTILLA = join(dirname(fileURLToPath(import.meta.url)), 'plantilla');
const leerPlantilla = (archivo) => readFileSync(join(DIR_PLANTILLA, archivo), 'utf8');

export const NOMBRES_FUENTES = {
  pizarra: 'Pizarra Rosario (CAC-BCR)',
  cbot: 'Chicago CBOT (Yahoo Finance / CME)',
  matba: 'Matba-Rofex',
  dolar: 'Dólar (DolarApi)',
  clima: 'Clima (Open-Meteo)',
  noticias: 'Noticias (RSS)',
  feriados: 'Feriados (ArgentinaDatos)'
};

// Color de cada grano (se usa en bordes, íconos y gráficos)
const GRANOS = [
  { clave: 'soja', nombre: 'Soja', color: '#a4c639' },
  { clave: 'maiz', nombre: 'Maíz', color: '#ffc107' },
  { clave: 'girasol', nombre: 'Girasol', color: '#ff9800' },
  { clave: 'trigo', nombre: 'Trigo', color: '#c8962e' }
];

// ---------- Íconos (SVG en línea, sin dependencias) ----------
const ICONOS = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  granos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8"/><path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 13c3 0 5-2 5-5-3 0-5 2-5 5zM12 8c-2 0-3.5-1.5-3.5-4C10.5 4 12 5.5 12 8zM12 8c2 0 3.5-1.5 3.5-4C13.5 4 12 5.5 12 8zM12 18c-3 0-5-2-5-5 3 0 5 2 5 5zM12 18c3 0 5-2 5-5-3 0-5 2-5 5z"/></svg>',
  dolar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3.2 6 1.8 6 5 0 1.4-1.3 2.7-3 2.7s-3-1.1-3-2.5M12 5.5v13"/></svg>',
  clima: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3.5"/><path d="M8 2.5v1.5M2.5 9H4M3.9 4.9l1 1M12.1 4.9l-1 1"/><path d="M9 20h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.5A3 3 0 0 0 9 20z"/></svg>',
  noticias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5M8 16h3"/></svg>',
  campos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/></svg>',
  stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  externo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  tema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  copo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/></svg>'
};

// Ilustraciones de cada grano
const ILUSTRACION = {
  soja: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M8 26C5 23 5 17 9 12s10-7 14-5c3 2 3 8-1 13s-11 9-14 6z" opacity=".35"/><circle cx="12" cy="20" r="3.2"/><circle cx="16.5" cy="15.5" r="3.2"/><circle cx="21" cy="11" r="3.2"/></svg>',
  maiz: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 3c4 0 6 5 6 11s-2 12-6 12-6-6-6-12 2-11 6-11z"/><path d="M10 16c-4 2-5 8-3 13 3-2 6-5 7-9M22 16c4 2 5 8 3 13-3-2-6-5-7-9" opacity=".45"/><path d="M13 9h6M12.5 13h7M12.5 17h7M13 21h6" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/></svg>',
  girasol: '<svg viewBox="0 0 32 32" fill="currentColor"><g opacity=".55">' +
    Array.from({ length: 12 }, (_, i) => `<ellipse cx="16" cy="6" rx="2.6" ry="5" transform="rotate(${i * 30} 16 16)"/>`).join('') +
    '</g><circle cx="16" cy="16" r="6.5"/><circle cx="16" cy="16" r="4" fill="#5a3a12" opacity=".55"/></svg>',
  trigo: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 30V10" stroke="currentColor" stroke-width="1.8"/>' +
    [8, 13, 18, 23].map((y) => `<ellipse cx="12.5" cy="${y}" rx="2.4" ry="4" transform="rotate(-30 12.5 ${y})"/><ellipse cx="19.5" cy="${y}" rx="2.4" ry="4" transform="rotate(30 19.5 ${y})"/>`).join('') +
    '<ellipse cx="16" cy="5" rx="2.2" ry="4"/></svg>'
};

const LOGO = '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 30V11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  [10, 15, 20].map((y) => `<ellipse cx="12" cy="${y}" rx="2.6" ry="4.4" transform="rotate(-32 12 ${y})"/><ellipse cx="20" cy="${y}" rx="2.6" ry="4.4" transform="rotate(32 20 ${y})"/>`).join('') +
  '<ellipse cx="16" cy="6" rx="2.4" ry="4.4"/></svg>';

// Ícono del clima según código WMO de Open-Meteo
function iconoClima(codigo) {
  const sol = '<g class="sol"><circle cx="16" cy="16" r="6" fill="#ffc107"/><g stroke="#ffc107" stroke-width="2.2" stroke-linecap="round"><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.1 2.1M23.1 23.1l2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1"/></g></g>';
  const nube = (x = 0, gris = '#cfc6b4') => `<path class="nube" transform="translate(${x} 0)" d="M10 25h13a5 5 0 0 0 0-10 7 7 0 0 0-13.4 2A4 4 0 0 0 10 25z" fill="${gris}"/>`;
  const gotas = '<g stroke="#3a8fd6" stroke-width="2" stroke-linecap="round"><path d="M12 27l-1 3M17 27l-1 3M22 27l-1 3"/></g>';
  let cuerpo;
  if (codigo == null) cuerpo = nube();
  else if (codigo === 0) cuerpo = sol;
  else if (codigo <= 2) cuerpo = `<g transform="translate(-4 -4) scale(.8)">${sol}</g>${nube(2)}`;
  else if (codigo <= 48) cuerpo = nube(0, '#b9b09e');
  else if (codigo <= 67 || (codigo >= 80 && codigo <= 82)) cuerpo = `<g transform="translate(0 -3)">${nube(0, '#a9a08e')}</g>${gotas}`;
  else if (codigo <= 86) cuerpo = `<g transform="translate(0 -3)">${nube(0, '#c9c3b8')}</g><g fill="#8ab8f0"><circle cx="12" cy="28" r="1.4"/><circle cx="17" cy="29" r="1.4"/><circle cx="22" cy="28" r="1.4"/></g>`;
  else cuerpo = `<g transform="translate(0 -3)">${nube(0, '#8f8676')}</g><path d="M17 23l-3 5h3l-2 4" stroke="#ff9800" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg class="ic" viewBox="0 0 32 32" aria-hidden="true">${cuerpo}</svg>`;
}

function descripcionClima(codigo) {
  if (codigo == null) return '';
  if (codigo === 0) return 'Despejado';
  if (codigo <= 2) return 'Algo nublado';
  if (codigo === 3) return 'Nublado';
  if (codigo <= 48) return 'Niebla';
  if (codigo <= 57) return 'Llovizna';
  if (codigo <= 67) return 'Lluvia';
  if (codigo <= 77) return 'Nieve';
  if (codigo <= 82) return 'Chaparrones';
  if (codigo <= 86) return 'Nevadas';
  return 'Tormenta';
}

// ---------- Piezas reutilizables ----------

/** Variación con flecha y color: "↑ $ 1.500 (+0,35 %)". */
function htmlVariacion(v, formateador) {
  if (!v) return '<span class="var neutra">sin dato anterior</span>';
  const titulo = `Respecto del ${fechaCorta(v.fechaAnterior)}`;
  if (Math.abs(v.abs) < 1e-9) return `<span class="var neutra" title="${esc(titulo)}">= sin cambio</span>`;
  const sube = v.abs > 0;
  return `<span class="var ${sube ? 'sube' : 'baja'}" title="${esc(titulo)}"><span class="flecha">${sube ? '↑' : '↓'}</span> ${esc(
    formateador(Math.abs(v.abs))
  )} (${sube ? '+' : '−'}${numero(Math.abs(v.pct), 2)} %)</span>`;
}

/** Variación corta para la cinta: "↑ 0,35 %". */
function varCorta(v) {
  if (!v || Math.abs(v.abs) < 1e-9) return '<em class="neutra">=</em>';
  const sube = v.abs > 0;
  return `<em class="${sube ? 'sube' : 'baja'}">${sube ? '↑' : '↓'} ${numero(Math.abs(v.pct), 2)} %</em>`;
}

function chipEstado(fuente) {
  if (!fuente || fuente.estado !== 'viejo') return '';
  return `<span class="chip viejo" title="${esc(fuente.error || '')}">Sin actualizar · ${esc(fechaHoraCorta(fuente.obtenido))}</span>`;
}

const noDisponible = (texto = 'Dato no disponible') => `<p class="nd">${esc(texto)}</p>`;

/** Número que se anima al aparecer (el texto inicial ya es el valor final, por si no hay JS). */
function contador(valor, decimales, prefijo = '') {
  if (valor == null) return '—';
  return `<span data-contar="${valor}" data-dec="${decimales}" data-pre="${esc(prefijo)}">${esc(prefijo + numero(valor, decimales))}</span>`;
}

/** Minigráfico SVG a partir de una lista de valores. */
function sparkline(valores) {
  const v = (valores || []).filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const min = Math.min(...v);
  const max = Math.max(...v);
  const rango = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * 100, 38 - ((y - min) / rango) * 32]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
    <path class="area" d="${d} L100 40 L0 40 Z"/><path class="linea" d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}

const pestana = (id, texto) =>
  `<button class="pestana" role="tab" id="tab-${id}" aria-controls="${id}" data-vista="${id}" aria-selected="false" tabindex="-1">${ICONOS[id]}<span>${texto}</span></button>`;

// ---------- Vistas ----------

function vistaInicio(m) {
  const pz = m.fuentes.pizarra.datos;
  const dl = m.fuentes.dolar.datos;
  const cb = m.fuentes.cbot.datos;
  const { fecha } = fechaHoraLarga(m.generado);

  // Cinta de precios
  const items = [];
  for (const g of GRANOS) {
    const x = pz?.granos?.[g.clave];
    if (x?.pesos != null) items.push(`<span class="cinta-item"><span>${esc(g.nombre)} Rosario</span><b>${esc(pesos(x.pesos, 0))}</b>${varCorta(m.variaciones[`pizarra.${g.clave}`])}</span>`);
  }
  if (dl?.tipos?.oficial) items.push(`<span class="cinta-item"><span>Dólar oficial</span><b>${esc(pesos(dl.tipos.oficial.venta))}</b>${varCorta(m.variaciones['dolar.oficial'])}</span>`);
  if (dl?.tipos?.mep) items.push(`<span class="cinta-item"><span>Dólar MEP</span><b>${esc(pesos(dl.tipos.mep.venta))}</b>${varCorta(m.variaciones['dolar.mep'])}</span>`);
  for (const g of GRANOS) {
    const x = cb?.granos?.[g.clave];
    if (x) items.push(`<span class="cinta-item"><span>${esc(g.nombre)} Chicago</span><b>${esc(dolares(x.usdTonelada))}/t</b>${varCorta(m.variaciones[`cbot.${g.clave}`])}</span>`);
  }
  const cinta = items.length
    ? `<div class="cinta" aria-label="Resumen de precios"><div class="cinta-pista">${items.join('')}${items.join('').replace(/class="cinta-item"/g, 'class="cinta-item" aria-hidden="true"')}</div></div>`
    : '';

  const fotos = (m.config.diseno?.fotos || []).slice(0, 3)
    .map((f) => `<div role="img" aria-label="${esc(f.alt || '')}" style="background-image:url('${esc(f.url)}')"></div>`).join('');

  let aviso = '';
  if (m.feriado) aviso = `<div class="aviso revelar" role="status">${ICONOS.calendario}<div><strong>Hoy es feriado nacional: ${esc(m.feriado.nombre)}.</strong> No hay mercado; se muestran los últimos datos disponibles.</div></div>`;
  else if (m.finDeSemana) aviso = `<div class="aviso revelar" role="status">${ICONOS.calendario}<div><strong>Fin de semana:</strong> no hay mercado; se muestran los últimos datos disponibles.</div></div>`;

  // KPIs de granos
  const kpis = GRANOS.map((g) => {
    const x = pz?.granos?.[g.clave];
    const cuerpo = x?.pesos != null
      ? `<div class="valor">${contador(x.pesos, 0, '$ ')} <small>/t</small></div>${htmlVariacion(m.variaciones[`pizarra.${g.clave}`], (v) => pesos(v, 0))}${sparkline(m.sparks[`pizarra.${g.clave}`])}`
      : noDisponible(x?.sinCotizacion ? 'Sin cotización (S/C)' : 'Dato no disponible');
    return `<article class="card hover kpi revelar" style="--c:${g.color}">
      <div class="kpi-top"><div><div class="card-t">Pizarra Rosario</div><h3>${esc(g.nombre)}</h3></div><div class="kpi-ico">${ILUSTRACION[g.clave]}</div></div>
      ${cuerpo}</article>`;
  }).join('');

  // Dólar oficial
  const of = dl?.tipos?.oficial;
  const kpiDolar = `<article class="card hover kpi revelar" style="--c:#ff9800">
    <div class="kpi-top"><div><div class="card-t">Dólar oficial BNA</div><h3>Venta</h3></div><div class="kpi-ico">${ICONOS.dolar}</div></div>
    ${of ? `<div class="valor">${contador(of.venta, 2, '$ ')}</div>${htmlVariacion(m.variaciones['dolar.oficial'], (v) => pesos(v))}${sparkline(m.sparks['dolar.oficial'])}` : noDisponible()}
  </article>`;

  // Clima de hoy (primera localidad)
  const loc = m.fuentes.clima.datos?.localidades?.[0];
  const hoy = loc?.dias?.[0];
  const kpiClima = `<article class="card hover kpi revelar" style="--c:#3a8fd6">
    <div class="kpi-top"><div><div class="card-t">Clima hoy</div><h3>${esc(loc?.nombre || 'Clima')}</h3></div>${hoy ? iconoClima(hoy.codigo) : ''}</div>
    ${hoy ? `<div class="valor">${esc(numero(hoy.max, 0))}° <small>/ ${esc(numero(hoy.min, 0))}°</small></div>
      <div class="sub">${esc(descripcionClima(hoy.codigo))} · lluvia ${esc(numero(hoy.lluviaMm, 1))} mm</div>
      <div class="sub">Próximos 7 días: <b>${esc(numero(loc.lluviaTotal, 1))} mm</b></div>
      ${loc.hayHelada ? '<span class="chip frio">Alerta de helada esta semana</span>' : ''}
      <button class="link-tab" data-ir="clima">Ver pronóstico ${ICONOS.flecha}</button>` : noDisponible()}
  </article>`;

  // Noticias destacadas
  const nt = m.fuentes.noticias.datos?.titulares || [];
  const noticias = nt.length
    ? `<ul class="lista-noticias">${nt.slice(0, 4).map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.titulo)}</a><small>${esc(n.fuente)}</small></li>`).join('')}</ul>`
    : noDisponible();

  return `<section class="vista" id="inicio" role="tabpanel" aria-labelledby="tab-inicio">
    <div class="heroe">
      <div class="heroe-fotos">${fotos}</div>
      <div class="particulas" aria-hidden="true"></div>
      <div class="heroe-in">
        <span class="eyebrow">${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</span>
        <h1><span id="saludo">Hola</span>. Así está <em>el campo</em> hoy.</h1>
        <p>Pizarra, Chicago, Matba-Rofex, dólar y clima en un solo lugar, actualizados de lunes a viernes cuatro veces por día.</p>
        <div class="ctas">
          <button class="btn btn-1" data-ir="granos">Ver mercados ${ICONOS.flecha}</button>
          <button class="btn btn-2" data-ir="stock">Abrir stock ${ICONOS.flecha}</button>
        </div>
      </div>
      ${cinta}
    </div>
    ${aviso}
    <div class="bloque">
      <div class="bloque-h"><h2>Granos del día</h2><button class="link-tab" data-ir="granos">Todos los mercados ${ICONOS.flecha}</button></div>
      <div class="grid g-kpi">${kpis}</div>
      ${pz ? `<p class="nota" style="margin-top:10px">Pizarra del ${esc(fechaCorta(pz.fecha))}. Se publica por la tarde: a la mañana vas a ver la del día hábil anterior.</p>` : ''}
    </div>
    <div class="bloque">
      <div class="grid g-2">${kpiDolar}${kpiClima}
        <article class="card revelar"><div class="card-h"><h3>Titulares</h3><button class="link-tab" data-ir="noticias">Ver todas ${ICONOS.flecha}</button></div>${noticias}</article>
      </div>
    </div>
  </section>`;
}

function vistaGranos(m) {
  const { pizarra, cbot, matba } = m.fuentes;
  const pz = pizarra.datos;
  const cb = cbot.datos;
  const mr = matba.datos;
  const retenciones = m.config.retenciones;
  const mayorista = m.fuentes.dolar.datos?.tipos?.mayorista?.venta ?? null;

  const tarjetas = GRANOS.map((g) => {
    const gp = pz?.granos?.[g.clave];
    let bPizarra;
    if (gp?.pesos != null) {
      let usd = '';
      if (gp.usd != null) usd = `<div class="sub">${esc(dolares(gp.usd))} /t</div>`;
      else if (mayorista) usd = `<div class="sub" title="Conversión al dólar mayorista, solo como referencia">≈ ${esc(dolares(gp.pesos / mayorista))} /t al mayorista</div>`;
      bPizarra = `<div class="valor">${contador(gp.pesos, 0, '$ ')} <small>/t</small></div>${usd}${htmlVariacion(m.variaciones[`pizarra.${g.clave}`], (x) => pesos(x, 0))}`;
    } else bPizarra = noDisponible(gp?.sinCotizacion ? 'Sin cotización (S/C)' : 'Dato no disponible');

    let bCbot;
    if (g.clave === 'girasol') bCbot = '<p class="nd">El girasol no cotiza en Chicago.</p>';
    else if (cb?.granos?.[g.clave]) {
      const c = cb.granos[g.clave];
      bCbot = `<div class="valor-m">${esc(dolares(c.usdTonelada))} <small>/t</small></div>
        <div class="sub">${esc(dolares(c.usdBushel, 4))} /bushel</div>${htmlVariacion(m.variaciones[`cbot.${g.clave}`], (x) => dolares(x))}`;
    } else bCbot = noDisponible();

    let bMatba;
    if (g.clave === 'girasol') bMatba = '<p class="nd">Sin posiciones seguidas para girasol.</p>';
    else if (mr?.granos?.[g.clave]?.length) {
      bMatba = `<div class="posiciones">${mr.granos[g.clave].map((p) => `<div class="posicion"><span>${esc(p.posicion)}</span><b>${esc(dolares(p.usdTonelada))}</b>${htmlVariacion(m.variaciones[`matba.${g.clave}.${p.posicion}`], (x) => dolares(x))}</div>`).join('')}</div>`;
    } else bMatba = noDisponible();

    const ret = retenciones.granos[g.clave];
    return `<article class="card hover grano revelar" style="--c:${g.color}">
      <div class="card-h"><div class="grano-tit"><div class="kpi-ico">${ILUSTRACION[g.clave]}</div><h3>${esc(g.nombre)}</h3></div>
        ${ret != null ? `<span class="chip" title="Derecho de exportación">Retención ${esc(numero(ret, ret % 1 ? 1 : 0))} %</span>` : ''}</div>
      <div class="fila"><span class="card-t">Pizarra Rosario</span>${bPizarra}</div>
      <div class="fila"><span class="card-t">Chicago · posición cercana</span>${bCbot}</div>
      <div class="fila"><span class="card-t">Matba-Rofex · ajuste</span>${bMatba}</div>
    </article>`;
  }).join('');

  const meta = [
    pz ? `Pizarra del <b>${esc(fechaCorta(pz.fecha))}</b>` : 'Pizarra: dato no disponible',
    cb ? `Chicago al ${esc(fechaCorta(cb.fecha))}` : null,
    mr ? `Matba-Rofex al ${esc(fechaCorta(mr.fecha))}` : null
  ].filter(Boolean).join(' · ');

  const nombres = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol', cebada: 'Cebada', sorgo: 'Sorgo' };
  const maxRet = Math.max(...Object.values(retenciones.granos), 1);
  const listaRet = Object.entries(retenciones.granos)
    .map(([k, v]) => `<li><span>${esc(nombres[k] || k)}</span><div class="ret-barra"><i style="--w:${((v / maxRet) * 100).toFixed(1)}%"></i></div><b>${esc(numero(v, v % 1 ? 1 : 0))} %</b></li>`)
    .join('');

  return `<section class="vista" id="granos" role="tabpanel" aria-labelledby="tab-granos">
    <div class="titulo-vista"><div><span class="eyebrow">Mercados</span><h2>Granos</h2></div>
      <div><p>${meta}</p><div class="estados">${chipEstado(pizarra)}${chipEstado(cbot)}${chipEstado(matba)}</div></div></div>
    <div class="grid g-granos">${tarjetas}</div>
    <p class="nota" style="margin-top:12px">La pizarra se publica por la tarde: en las actualizaciones de la mañana vas a ver la del día hábil anterior.</p>
    <div class="bloque grid g-2">
      <article class="card revelar"><div class="card-h"><h3>Pizarra Rosario · ${esc(String(m.config.diasGrafico))} días</h3><span class="chip verde">$/t</span></div>
        <div class="grafico"><div class="esqueleto"></div><canvas id="g-granos" aria-label="Evolución de la pizarra de Rosario"></canvas></div></article>
      <article class="card revelar"><div class="card-h"><h3>Retenciones vigentes</h3></div>
        <ul class="ret-lista">${listaRet}</ul>
        <p class="nota" style="margin-top:14px">Cargadas a mano el ${esc(fechaCorta(retenciones.actualizado))}. ${esc(retenciones.fuente || '')}</p></article>
    </div>
  </section>`;
}

function vistaDolar(m) {
  const f = m.fuentes.dolar;
  const d = f.datos;
  const tarjetas = d
    ? TIPOS_DOLAR.map((t) => {
        const x = d.tipos[t.clave];
        if (!x) return `<article class="card dolar revelar"><div class="card-t">${esc(t.nombre)}</div>${noDisponible()}</article>`;
        return `<article class="card hover dolar revelar${t.clave === 'oficial' ? ' destacado' : ''}">
          <div class="card-h"><h3>${esc(t.nombre)}</h3></div>
          <div class="cv"><div><small>Compra</small><b>${esc(x.compra != null ? pesos(x.compra) : '—')}</b></div>
            <div><small>Venta</small><b class="valor-m">${contador(x.venta, 2, '$ ')}</b></div></div>
          ${htmlVariacion(m.variaciones[`dolar.${t.clave}`], (v) => pesos(v))}
        </article>`;
      }).join('')
    : noDisponible();
  return `<section class="vista" id="dolar" role="tabpanel" aria-labelledby="tab-dolar">
    <div class="titulo-vista"><div><span class="eyebrow">Cotizaciones</span><h2>Dólar</h2></div>
      <div><p>${d ? `Al ${esc(fechaHoraCorta(d.tipos.oficial?.actualizado || f.obtenido))}` : ''}</p><div class="estados">${chipEstado(f)}</div></div></div>
    <div class="grid g-dolar">${tarjetas}</div>
    <div class="bloque"><article class="card revelar"><div class="card-h"><h3>Dólar oficial BNA · venta</h3><span class="chip verde">${esc(String(m.config.diasGrafico))} días</span></div>
      <div class="grafico"><div class="esqueleto"></div><canvas id="g-dolar" aria-label="Evolución del dólar oficial"></canvas></div></article></div>
  </section>`;
}

function vistaClima(m) {
  const f = m.fuentes.clima;
  const d = f.datos;
  const umbral = m.config.clima.umbralHeladaC;
  const locs = d
    ? d.localidades.map((loc) => {
        const maxLluvia = Math.max(10, ...loc.dias.map((x) => x.lluviaMm || 0));
        const heladas = loc.dias.filter((x) => x.helada).map((x) => diaSemanaCorto(x.fecha));
        return `<article class="card clima-loc revelar">
          <div class="card-h"><h3>${esc(loc.nombre)}${loc.provincia && loc.provincia !== loc.nombre ? `, ${esc(loc.provincia)}` : ''}</h3>
            <span class="chip verde">Lluvia 7 días: ${esc(numero(loc.lluviaTotal, 1))} mm</span></div>
          ${heladas.length ? `<p class="alerta" role="alert">${ICONOS.copo} Alerta de helada: mínima por debajo de ${esc(numero(umbral, 0))} °C el ${esc(heladas.join(', '))}.</p>` : ''}
          <div class="dias">${loc.dias.map((x, i) => `<div class="dia${i === 0 ? ' hoy' : ''}${x.helada ? ' es-helada' : ''}">
            <span class="d">${i === 0 ? 'Hoy' : esc(diaSemanaCorto(x.fecha))}</span>
            ${iconoClima(x.codigo)}
            <span class="desc">${esc(descripcionClima(x.codigo))}</span>
            <span class="t"><b>${esc(numero(x.max, 0))}°</b> / ${esc(numero(x.min, 0))}°</span>
            <span class="lluvia" title="Probabilidad: ${x.probLluvia ?? '—'} %"><i style="--h:${Math.round(((x.lluviaMm || 0) / maxLluvia) * 100)}%"></i>${esc(numero(x.lluviaMm, 1))} mm</span>
            ${x.helada ? '<span class="chip frio">Helada</span>' : ''}
          </div>`).join('')}</div>
        </article>`;
      }).join('')
    : noDisponible();

  return `<section class="vista" id="clima" role="tabpanel" aria-labelledby="tab-clima">
    <div class="titulo-vista"><div><span class="eyebrow">Pronóstico y campos</span><h2>Clima</h2></div>
      <div><p>Próximos 7 días · Open-Meteo</p><div class="estados">${chipEstado(f)}</div></div></div>
    <article class="card mapa-card revelar"><div id="mapa" role="region" aria-label="Mapa de localidades y campos"></div></article>
    <p class="nota" style="margin-top:10px">Hacé clic en los puntos para ver el detalle. Las localidades y los campos se editan en <code>config.json</code>.</p>
    ${locs}
  </section>`;
}

function vistaNoticias(m) {
  const f = m.fuentes.noticias;
  const d = f.datos;
  const cuerpo = d
    ? `<div class="grid g-noticias">${d.titulares.map((n) => `<a class="card hover noticia revelar" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">
        <div class="n-top"><span class="chip verde">${esc(n.fuente)}</span><span class="sub">${n.fecha ? esc(fechaHoraCorta(n.fecha)) : ''}</span></div>
        <h3>${esc(n.titulo)}</h3><span class="ir">Leer en ${esc(n.fuente)} ${ICONOS.externo}</span></a>`).join('')}</div>`
    : noDisponible();
  return `<section class="vista" id="noticias" role="tabpanel" aria-labelledby="tab-noticias">
    <div class="titulo-vista"><div><span class="eyebrow">Medios agro</span><h2>Noticias</h2></div>
      <div><p>Titulares del día con link a la nota original.</p><div class="estados">${chipEstado(f)}</div></div></div>
    ${cuerpo}
  </section>`;
}

function vistaCampos() {
  return `<section class="vista" id="campos" role="tabpanel" aria-labelledby="tab-campos">
    <div class="stock-marco"><iframe id="campos-frame" data-src="campos/" title="Mis campos" loading="lazy"></iframe></div>
  </section>`;
}

function vistaStock() {
  return `<section class="vista" id="stock" role="tabpanel" aria-labelledby="tab-stock">
    <div class="stock-marco"><iframe id="stock-frame" data-src="stock/" title="Control de stock" loading="lazy"></iframe></div>
  </section>`;
}

function piePagina(m) {
  const filas = Object.entries(m.fuentes)
    .map(([k, f]) => {
      const estado = f.estado === 'ok'
        ? '<span class="ok">● Respondió bien</span>'
        : f.estado === 'viejo' ? '<span class="warn">● Falló · se muestra el último dato</span>' : '<span class="err">● Falló · sin datos</span>';
      return `<tr><td>${esc(NOMBRES_FUENTES[k] || k)}</td><td>${estado}</td><td class="tnum">${esc(f.obtenido ? fechaHoraCorta(f.obtenido) : '—')}</td>
        <td class="err-txt">${esc(f.estado === 'ok' ? '' : (f.error || '').slice(0, 700))}</td></tr>`;
    })
    .join('');
  const fallas = Object.values(m.fuentes).filter((f) => f.estado !== 'ok').length;
  return `<footer class="pie">
    <details><summary>Estado de las fuentes en la última ejecución ${fallas ? `<span class="chip viejo">${fallas} con problemas</span>` : '<span class="chip verde">Todas OK</span>'}</summary>
      <div class="tabla"><table><thead><tr><th>Fuente</th><th>Estado</th><th>Último dato correcto</th><th>Detalle</th></tr></thead><tbody>${filas}</tbody></table></div>
    </details>
    <p>Información de referencia, sin valor contractual. Verificá los valores en la fuente original antes de operar. La página se recarga sola cada ${esc(String(m.config.recargaMinutos))} minutos.</p>
  </footer>`;
}

// Puntos del mapa: localidades del clima (con su pronóstico) y puntos propios del config
function puntosMapa(m) {
  const puntos = [];
  const umbral = m.config.clima.umbralHeladaC;
  for (const loc of m.config.clima.localidades) {
    const p = m.fuentes.clima.datos?.localidades?.find((x) => x.nombre === loc.nombre);
    const hoy = p?.dias?.[0];
    puntos.push({
      nombre: loc.nombre,
      lat: loc.lat,
      lon: loc.lon,
      clase: p?.hayHelada ? 'helada' : '',
      popup: `<div class="popup"><b>${esc(loc.nombre)}</b><br>${
        hoy ? `Hoy ${esc(numero(hoy.max, 0))}° / ${esc(numero(hoy.min, 0))}° · ${esc(descripcionClima(hoy.codigo))}<br>Lluvia 7 días: <b>${esc(numero(p.lluviaTotal, 1))} mm</b>${p.hayHelada ? `<br><span style="color:#2f6db5;font-weight:700">Helada: mínima &lt; ${esc(numero(umbral, 0))} °C</span>` : ''}` : 'Sin pronóstico'
      }</div>`
    });
  }
  for (const pt of m.config.mapa?.puntos || []) {
    puntos.push({
      nombre: pt.nombre,
      lat: pt.lat,
      lon: pt.lon,
      clase: pt.tipo === 'deposito' ? 'deposito' : '',
      popup: `<div class="popup"><b>${esc(pt.nombre)}</b><br>${esc(pt.tipo === 'deposito' ? 'Depósito' : pt.tipo || 'Campo')}</div>`
    });
  }
  return puntos;
}

// ---------- Página ----------

export function generarHTML(m) {
  const { fecha, hora } = fechaHoraLarga(m.generado);
  const t = esc(m.config.titulo);
  const descripcion = 'Pizarra Rosario, Chicago, Matba-Rofex, dólar, clima y noticias del agro argentino, actualizados de lunes a viernes.';
  const datos = {
    titulo: m.config.titulo,
    recargaMs: m.config.recargaMinutos * 60 * 1000,
    graficos: m.graficos,
    mapa: puntosMapa(m)
  };
  const json = JSON.stringify(datos).replace(/</g, '\\u003c');
  const foto0 = m.config.diseno?.fotos?.[0]?.url || '';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', name: m.config.titulo, description: descripcion, inLanguage: 'es-AR'
  });

  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${t} · ${esc(fechaCorta(m.hoyISO))}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="theme-color" content="#a4c639">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${esc(descripcion)}">
${foto0 ? `<meta property="og:image" content="${esc(foto0)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd}</script>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='9' fill='#a4c639'/><g fill='#2b2118' transform='translate(4 3) scale(.75)'>${LOGO.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://images.unsplash.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,600&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
${leerPlantilla('estilos.css')}
</style>
</head>
<body>
<div class="splash" aria-hidden="true">
  <svg viewBox="0 0 64 64"><path class="tallo" d="M32 60V18" stroke="#a4c639" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    ${[22, 32, 42].map((y) => `<ellipse class="grano" cx="25" cy="${y}" rx="5" ry="8.5" fill="#ffc107" transform="rotate(-32 25 ${y})"/><ellipse class="grano" cx="39" cy="${y}" rx="5" ry="8.5" fill="#ff9800" transform="rotate(32 39 ${y})"/>`).join('')}
    <ellipse class="grano" cx="32" cy="11" rx="4.5" ry="8" fill="#a4c639"/></svg>
</div>

<header class="cab">
  <div class="cab-in">
    <a class="marca" href="#inicio" data-ir="inicio" aria-label="${t}, inicio"><span class="marca-logo">${LOGO}</span><b>${t}</b></a>
    <nav class="pestanas" role="tablist" aria-label="Secciones">
      ${pestana('inicio', 'Inicio')}${pestana('granos', 'Granos')}${pestana('dolar', 'Dólar')}${pestana('clima', 'Clima')}${pestana('campos', 'Campos')}${pestana('noticias', 'Noticias')}${pestana('stock', 'Stock')}
    </nav>
    <div class="cab-der">
      <span class="act" title="Última actualización: ${esc(fecha)} ${esc(hora)} h (hora argentina)"><span class="punto"></span><span class="txt-largo">Actualizado</span> <b>${esc(hora)} h</b></span>
      <button class="boton-icono" id="btn-tema" type="button" aria-label="Cambiar entre modo claro y oscuro">${ICONOS.tema}</button>
    </div>
  </div>
</header>

<main>
${vistaInicio(m)}
${vistaGranos(m)}
${vistaDolar(m)}
${vistaClima(m)}
${vistaCampos()}
${vistaNoticias(m)}
${vistaStock()}
${piePagina(m)}
</main>

<script>window.TABLERO = ${json};</script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js" defer></script>
<script>
${leerPlantilla('cliente.js')}
</script>
</body>
</html>
`;
}

/** Contenido de public/stock/config.js (URL de la API de Apps Script desde config.json). */
export function generarConfigStock(config) {
  return `// Generado automáticamente desde config.json (stock.apiUrl). No editar a mano.\nwindow.STOCK_API_URL = ${JSON.stringify(config.stock?.apiUrl || '')};\n`;
}

/** Contenido de public/campos/config.js (repositorio donde se guardan los campos). */
export function generarConfigCampos(config) {
  const repo = config.campos?.repo || process.env.GITHUB_REPOSITORY || '';
  const datos = { repo, rama: config.campos?.rama || 'main' };
  return `// Generado automáticamente desde config.json (campos). No editar a mano.\nwindow.CAMPOS_CONFIG = ${JSON.stringify(datos)};\n`;
}
