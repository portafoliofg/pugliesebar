// Genera el index.html del tablero (un solo archivo con el CSS incluido).
// Recibe el "modelo" armado por index.js y devuelve el HTML como texto.

import {
  esc, numero, pesos, dolares, fechaCorta, fechaHoraCorta, fechaHoraLarga, diaSemanaCorto
} from './lib/formato.js';
import { TIPOS_DOLAR } from './fuentes/dolar.js';

const GRANOS = [
  { clave: 'soja', nombre: 'Soja' },
  { clave: 'maiz', nombre: 'Maíz' },
  { clave: 'girasol', nombre: 'Girasol' },
  { clave: 'trigo', nombre: 'Trigo' }
];

const CATEGORIAS_HACIENDA = [
  { clave: 'novillo', nombre: 'Novillo' },
  { clave: 'vaquillona', nombre: 'Vaquillona' },
  { clave: 'ternero', nombre: 'Ternero' },
  { clave: 'vaca', nombre: 'Vaca' }
];

export const NOMBRES_FUENTES = {
  pizarra: 'Pizarra Rosario (CAC-BCR)',
  cbot: 'Chicago CBOT (Yahoo Finance / CME)',
  matba: 'Matba-Rofex',
  dolar: 'Dólar (DolarApi)',
  clima: 'Clima (Open-Meteo)',
  hacienda: 'Hacienda (MAG Cañuelas)',
  noticias: 'Noticias (RSS)',
  feriados: 'Feriados (ArgentinaDatos)'
};

// Códigos WMO de Open-Meteo -> descripción corta
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

/** Flecha y color de variación: "↑ $ 1.500,00 (+0,35 %)". */
function htmlVariacion(v, formateador) {
  if (!v) return '<span class="var neutra">sin dato anterior</span>';
  const titulo = `Respecto del ${fechaCorta(v.fechaAnterior)}`;
  if (Math.abs(v.abs) < 1e-9) {
    return `<span class="var neutra" title="${esc(titulo)}">= sin cambio</span>`;
  }
  const sube = v.abs > 0;
  const signo = sube ? '+' : '−';
  return `<span class="var ${sube ? 'sube' : 'baja'}" title="${esc(titulo)}">${sube ? '↑' : '↓'} ${esc(
    formateador(Math.abs(v.abs))
  )} (${signo}${numero(Math.abs(v.pct), 2)} %)</span>`;
}

/** Etiqueta de estado de una fuente para mostrar junto al dato. */
function htmlEstado(fuente) {
  if (!fuente) return '';
  if (fuente.estado === 'viejo') {
    return `<span class="badge viejo" title="${esc(fuente.error || '')}">Sin actualizar · dato del ${esc(
      fechaHoraCorta(fuente.obtenido)
    )}</span>`;
  }
  return '';
}

const noDisponible = (texto = 'Dato no disponible') => `<p class="nd">${esc(texto)}</p>`;

// ---------- Secciones ----------

function seccionGranos(m) {
  const { pizarra, cbot, matba } = m.fuentes;
  const pz = pizarra.datos;
  const cb = cbot.datos;
  const mr = matba.datos;
  const retenciones = m.config.retenciones.granos;
  const mayorista = m.fuentes.dolar.datos?.tipos?.mayorista?.venta ?? null;

  const tarjetas = GRANOS.map((g) => {
    // Pizarra Rosario
    let bloquePizarra;
    const gp = pz?.granos?.[g.clave];
    if (gp && gp.pesos != null) {
      let usd = '';
      if (gp.usd != null) usd = `<div class="sub">${esc(dolares(gp.usd))} /t</div>`;
      else if (mayorista) usd = `<div class="sub" title="Conversión al dólar mayorista, solo como referencia">≈ ${esc(dolares(gp.pesos / mayorista))} /t al mayorista</div>`;
      bloquePizarra = `<div class="valor">${esc(pesos(gp.pesos, 0))} <small>/t</small></div>${usd}
        ${htmlVariacion(m.variaciones[`pizarra.${g.clave}`], (x) => pesos(x, 0))}`;
    } else if (gp && gp.sinCotizacion) {
      bloquePizarra = noDisponible('Sin cotización (S/C)');
    } else {
      bloquePizarra = noDisponible();
    }

    // Chicago
    let bloqueCbot;
    if (g.clave === 'girasol') {
      bloqueCbot = '<p class="nd">El girasol no cotiza en Chicago.</p>';
    } else if (cb?.granos?.[g.clave]) {
      const c = cb.granos[g.clave];
      bloqueCbot = `<div class="valor chico">${esc(dolares(c.usdTonelada))} <small>/t</small></div>
        <div class="sub">${esc(dolares(c.usdBushel, 4))} /bushel</div>
        ${htmlVariacion(m.variaciones[`cbot.${g.clave}`], (x) => dolares(x))}`;
    } else {
      bloqueCbot = noDisponible();
    }

    // Matba-Rofex
    let bloqueMatba;
    if (g.clave === 'girasol') {
      bloqueMatba = '<p class="nd">Sin posiciones seguidas para girasol.</p>';
    } else if (mr?.granos?.[g.clave]?.length) {
      bloqueMatba = `<ul class="posiciones">${mr.granos[g.clave]
        .map(
          (p) => `<li><span>${esc(p.posicion)}</span><strong>${esc(dolares(p.usdTonelada))}</strong>
          ${htmlVariacion(m.variaciones[`matba.${g.clave}.${p.posicion}`], (x) => dolares(x))}</li>`
        )
        .join('')}</ul>`;
    } else {
      bloqueMatba = noDisponible();
    }

    const ret = retenciones[g.clave];
    return `<article class="card grano">
      <header class="card-h"><h3>${esc(g.nombre)}</h3>${
        ret != null ? `<span class="chip" title="Derecho de exportación">Retención ${esc(numero(ret, ret % 1 ? 1 : 0))} %</span>` : ''
      }</header>
      <div class="fila"><span class="etq">Pizarra Rosario</span>${bloquePizarra}</div>
      <div class="fila"><span class="etq">Chicago · posición cercana</span>${bloqueCbot}</div>
      <div class="fila"><span class="etq">Matba-Rofex · ajuste</span>${bloqueMatba}</div>
    </article>`;
  }).join('');

  const meta = [
    pz ? `Pizarra del <strong>${esc(fechaCorta(pz.fecha))}</strong>` : 'Pizarra: dato no disponible',
    cb ? `Chicago al ${esc(fechaCorta(cb.fecha))}` : null,
    mr ? `Matba-Rofex al ${esc(fechaCorta(mr.fecha))}` : null
  ].filter(Boolean).join(' · ');

  return `<section aria-labelledby="t-granos">
    <div class="sec-h"><h2 id="t-granos">Granos</h2><p class="meta">${meta}</p>
      <div class="estados">${htmlEstado(pizarra)}${htmlEstado(cbot)}${htmlEstado(matba)}</div></div>
    <p class="nota">La pizarra se publica por la tarde: en las actualizaciones de la mañana vas a ver la del día hábil anterior.</p>
    <div class="grid granos">${tarjetas}</div>
  </section>`;
}

function seccionGraficos(m) {
  return `<section aria-labelledby="t-evol">
    <div class="sec-h"><h2 id="t-evol">Evolución ${esc(String(m.config.diasGrafico))} días</h2></div>
    <div class="grid graficos">
      <article class="card"><h3 class="card-t">Pizarra Rosario ($/t)</h3><div class="chart"><canvas id="g-granos" aria-label="Evolución de la pizarra de Rosario"></canvas></div></article>
      <article class="card"><h3 class="card-t">Dólar oficial BNA (venta)</h3><div class="chart"><canvas id="g-dolar" aria-label="Evolución del dólar oficial"></canvas></div></article>
    </div>
  </section>`;
}

function seccionDolar(m) {
  const f = m.fuentes.dolar;
  const d = f.datos;
  let cuerpo;
  if (!d) {
    cuerpo = noDisponible();
  } else {
    cuerpo = `<div class="grid dolares">${TIPOS_DOLAR.map((t) => {
      const x = d.tipos[t.clave];
      if (!x) return `<article class="card dolar"><h3 class="card-t">${esc(t.nombre)}</h3>${noDisponible()}</article>`;
      return `<article class="card dolar">
        <h3 class="card-t">${esc(t.nombre)}</h3>
        <div class="cv">
          <div><span class="etq">Compra</span><strong>${esc(x.compra != null ? pesos(x.compra) : '—')}</strong></div>
          <div><span class="etq">Venta</span><strong class="valor chico">${esc(pesos(x.venta))}</strong></div>
        </div>
        ${htmlVariacion(m.variaciones[`dolar.${t.clave}`], (v) => pesos(v))}
      </article>`;
    }).join('')}</div>`;
  }
  return `<section aria-labelledby="t-dolar">
    <div class="sec-h"><h2 id="t-dolar">Dólar</h2>
      <p class="meta">${d ? `Cotizaciones al ${esc(fechaHoraCorta(d.tipos.oficial?.actualizado || f.obtenido))}` : ''}</p>
      <div class="estados">${htmlEstado(f)}</div></div>
    ${cuerpo}
  </section>`;
}

function seccionClima(m) {
  const f = m.fuentes.clima;
  const d = f.datos;
  let cuerpo;
  if (!d) {
    cuerpo = noDisponible();
  } else {
    cuerpo = d.localidades.map((loc) => {
      const maxLluvia = Math.max(10, ...loc.dias.map((x) => x.lluviaMm || 0));
      const alerta = loc.hayHelada
        ? `<p class="alerta helada" role="alert">Alerta de helada: mínima por debajo de ${esc(
            numero(m.config.clima.umbralHeladaC, 0)
          )} °C el ${loc.dias.filter((x) => x.helada).map((x) => esc(diaSemanaCorto(x.fecha))).join(', ')}.</p>`
        : '';
      return `<article class="card clima">
        <header class="card-h"><h3>${esc(loc.nombre)}${loc.provincia && loc.provincia !== loc.nombre ? `, ${esc(loc.provincia)}` : ''}</h3>
          <span class="chip">Lluvia 7 días: ${esc(numero(loc.lluviaTotal, 1))} mm</span></header>
        ${alerta}
        <div class="dias">${loc.dias.map((x) => `<div class="dia${x.helada ? ' es-helada' : ''}">
            <span class="d">${esc(diaSemanaCorto(x.fecha))}</span>
            <span class="desc">${esc(descripcionClima(x.codigo))}</span>
            <span class="temps"><b>${esc(numero(x.max, 0))}°</b> / ${esc(numero(x.min, 0))}°</span>
            <span class="lluvia" title="Probabilidad: ${x.probLluvia ?? '—'} %">
              <i style="--h:${Math.round(((x.lluviaMm || 0) / maxLluvia) * 100)}%"></i>${esc(numero(x.lluviaMm, 1))} mm</span>
            ${x.helada ? '<span class="badge helada">Helada</span>' : ''}
          </div>`).join('')}</div>
      </article>`;
    }).join('');
  }
  return `<section aria-labelledby="t-clima">
    <div class="sec-h"><h2 id="t-clima">Clima · próximos 7 días</h2><div class="estados">${htmlEstado(f)}</div></div>
    ${cuerpo}
  </section>`;
}

function seccionHaciendaYRetenciones(m) {
  const f = m.fuentes.hacienda;
  const d = f.datos;
  const hacienda = d
    ? `<ul class="lista-valores">${CATEGORIAS_HACIENDA.map((c) => {
        const x = d.categorias[c.clave];
        return `<li><span>${esc(c.nombre)}</span>${
          x
            ? `<strong>${esc(pesos(x.promedio))} <small>/kg</small></strong>${htmlVariacion(
                m.variaciones[`hacienda.${c.clave}`],
                (v) => pesos(v)
              )}`
            : '<em class="nd">Dato no disponible</em>'
        }</li>`;
      }).join('')}</ul>
      <p class="nota">Promedio ponderado por cabezas de las subcategorías del día, en $/kg vivo. Informe del ${esc(fechaCorta(d.fecha))}.</p>`
    : noDisponible();

  const r = m.config.retenciones;
  const nombres = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol', cebada: 'Cebada', sorgo: 'Sorgo' };
  const retenciones = `<ul class="lista-valores">${Object.entries(r.granos)
    .map(([k, v]) => `<li><span>${esc(nombres[k] || k)}</span><strong>${esc(numero(v, v % 1 ? 1 : 0))} %</strong></li>`)
    .join('')}</ul><p class="nota">Actualizado a mano el ${esc(fechaCorta(r.actualizado))}. ${esc(r.fuente || '')}</p>`;

  return `<div class="grid dos">
    <section aria-labelledby="t-hacienda" class="card">
      <div class="card-h"><h2 id="t-hacienda">Hacienda · MAG Cañuelas</h2>${htmlEstado(f)}</div>
      ${hacienda}
    </section>
    <section aria-labelledby="t-ret" class="card">
      <div class="card-h"><h2 id="t-ret">Retenciones vigentes</h2></div>
      ${retenciones}
    </section>
  </div>`;
}

function seccionNoticias(m) {
  const f = m.fuentes.noticias;
  const d = f.datos;
  const cuerpo = d
    ? `<ol class="noticias">${d.titulares
        .map(
          (n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.titulo)}</a>
          <span class="fuente">${esc(n.fuente)}${n.fecha ? ` · ${esc(fechaHoraCorta(n.fecha))}` : ''}</span></li>`
        )
        .join('')}</ol>`
    : noDisponible();
  return `<section aria-labelledby="t-noticias" class="card">
    <div class="card-h"><h2 id="t-noticias">Noticias del agro</h2>${htmlEstado(f)}</div>
    ${cuerpo}
  </section>`;
}

function piePagina(m) {
  const filas = Object.entries(m.fuentes)
    .map(([k, f]) => {
      const estado =
        f.estado === 'ok'
          ? '<span class="ok">● Respondió bien</span>'
          : f.estado === 'viejo'
            ? '<span class="warn">● Falló · se muestra el último dato</span>'
            : '<span class="err">● Falló · sin datos</span>';
      return `<tr><td>${esc(NOMBRES_FUENTES[k] || k)}</td><td>${estado}</td><td>${esc(
        f.obtenido ? fechaHoraCorta(f.obtenido) : '—'
      )}</td><td class="err-txt">${esc(f.estado === 'ok' ? '' : (f.error || '').slice(0, 700))}</td></tr>`;
    })
    .join('');
  return `<footer class="pie">
    <h2>Estado de las fuentes en la última ejecución</h2>
    <div class="tabla"><table>
      <thead><tr><th>Fuente</th><th>Estado</th><th>Último dato correcto</th><th>Detalle</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <p class="nota">Información de referencia, sin valor contractual. Verificá los valores en la fuente original antes de operar.
    La página se recarga sola cada ${esc(String(m.config.recargaMinutos))} minutos.</p>
  </footer>`;
}

// ---------- Página ----------

export function generarHTML(m) {
  const { fecha, hora } = fechaHoraLarga(m.generado);
  let aviso = '';
  if (m.feriado) {
    aviso = `<div class="aviso" role="status"><strong>Hoy es feriado nacional: ${esc(m.feriado.nombre)}.</strong>
      No hay mercado. Se muestran los últimos datos disponibles.</div>`;
  } else if (m.finDeSemana) {
    aviso = `<div class="aviso" role="status"><strong>Fin de semana:</strong> no hay mercado. Se muestran los últimos datos disponibles.</div>`;
  }

  const datosGraficos = JSON.stringify(m.graficos).replace(/</g, '\\u003c');
  const recargaMs = m.config.recargaMinutos * 60 * 1000;

  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="color-scheme" content="light dark">
<title>${esc(m.config.titulo)} · ${esc(fechaCorta(m.hoyISO))}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%233d6b45'/%3E%3Cpath d='M16 7v18M16 12l-5-3M16 12l5-3M16 17l-5-3M16 17l5-3M16 22l-5-3M16 22l5-3' stroke='%23f4e6c6' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<style>
:root{
  --bg:#f4f5f1;--surface:#fff;--surface-2:#eef0ea;--ink:#1b241d;--muted:#5d6a60;--line:#d6dcd1;
  --accent:#3d6b45;--accent-soft:#dde9d9;--gold:#a8740f;--gold-soft:#f6ecd3;
  --up:#1e7a3c;--down:#b3261e;--flat:#6b7280;--warn:#9a5b00;--warn-soft:#fdf0d5;
  --frost:#1f5fa8;--frost-soft:#dbe8f7;--rain:#3b82c4;
  --font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#111613;--surface:#19201b;--surface-2:#212a24;--ink:#e6ebe4;--muted:#9aa69c;--line:#2f3a32;
  --accent:#8cc391;--accent-soft:#1f3323;--gold:#e2b04a;--gold-soft:#3a2f16;
  --up:#5fd38a;--down:#ff8a80;--flat:#9ca3af;--warn:#f5b84a;--warn-soft:#3a2c10;
  --frost:#8ab8f0;--frost-soft:#1b2c42;--rain:#6fb0ea;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 var(--font);-webkit-font-smoothing:antialiased}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px 48px}
h1,h2,h3{margin:0;line-height:1.2}
a{color:var(--accent)}
.top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px 24px;padding:24px 0 18px;border-bottom:1px solid var(--line)}
.top h1{font-size:clamp(1.6rem,4vw,2.2rem);letter-spacing:-.01em}
.top .marca{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.top .marca span{color:var(--muted);font-size:.95rem}
.act{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:8px 14px}
.act .etq{display:block}
.act strong{font-size:clamp(1.05rem,2.6vw,1.3rem);font-variant-numeric:tabular-nums}
.act .fecha{display:block;color:var(--muted);font-size:.9rem}
.aviso{margin:16px 0 0;padding:12px 16px;border-radius:8px;background:var(--warn-soft);color:var(--ink);border-left:4px solid var(--warn)}
section{margin-top:28px}
.sec-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;margin-bottom:12px}
.sec-h h2,.card-h h2{font-size:1.25rem}
.meta{margin:0;color:var(--muted);font-size:.92rem}
.estados{display:flex;gap:8px;flex-wrap:wrap}
.nota{color:var(--muted);font-size:.85rem;margin:6px 0 12px}
.grid{display:grid;gap:14px}
.granos{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.graficos{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.dolares{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.dos{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:28px}
.dos>section{margin-top:0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0}
.card-h{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.card-h h3{font-size:1.2rem}
.card-t{font-size:.95rem;font-weight:600;color:var(--muted);margin-bottom:8px}
.chip{font-size:.78rem;font-weight:600;background:var(--gold-soft);color:var(--gold);padding:3px 9px;border-radius:999px;white-space:nowrap}
.badge{font-size:.75rem;font-weight:600;padding:3px 8px;border-radius:4px;white-space:nowrap}
.badge.viejo{background:var(--warn-soft);color:var(--warn)}
.badge.helada{background:var(--frost-soft);color:var(--frost)}
.etq{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
.fila{padding:10px 0;border-top:1px solid var(--line)}
.fila:first-of-type{border-top:0;padding-top:0}
.valor{font-size:1.55rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.valor.chico{font-size:1.2rem}
.valor small,.lista-valores small{font-size:.8rem;font-weight:500;color:var(--muted)}
.sub{color:var(--muted);font-size:.88rem;font-variant-numeric:tabular-nums}
.var{display:inline-block;font-size:.85rem;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
.var.sube{color:var(--up)}.var.baja{color:var(--down)}.var.neutra{color:var(--flat);font-weight:500}
.nd{color:var(--muted);font-style:italic;margin:4px 0;font-size:.92rem}
.posiciones{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.posiciones li{display:grid;grid-template-columns:auto 1fr;gap:0 10px;align-items:baseline;font-variant-numeric:tabular-nums}
.posiciones li>span:first-child{font-family:var(--mono);font-size:.82rem;color:var(--muted)}
.posiciones li .var{grid-column:2}
.dolar .cv{display:flex;gap:16px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.chart{position:relative;height:220px}
.clima{margin-bottom:14px}
.alerta.helada{margin:0 0 10px;padding:8px 12px;border-radius:6px;background:var(--frost-soft);color:var(--frost);font-weight:600}
.dias{display:grid;grid-template-columns:repeat(7,minmax(96px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px}
.dia{background:var(--surface-2);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:3px;font-size:.88rem;font-variant-numeric:tabular-nums}
.dia.es-helada{outline:2px solid var(--frost)}
.dia .d{font-weight:700;text-transform:capitalize}
.dia .desc{color:var(--muted);font-size:.8rem}
.dia .temps b{font-size:1.05rem}
.dia .lluvia{display:flex;align-items:flex-end;gap:6px;color:var(--rain);font-weight:600}
.dia .lluvia i{display:inline-block;width:8px;height:28px;border-radius:2px;background:linear-gradient(to top,var(--rain) var(--h),var(--line) var(--h))}
.lista-valores{list-style:none;margin:0;padding:0}
.lista-valores li{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;padding:9px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.lista-valores li:first-child{border-top:0}
.lista-valores li .var{flex-basis:100%;text-align:right;margin:0}
.noticias{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:10px}
.noticias a{font-weight:600;text-decoration:none;color:var(--ink)}
.noticias a:hover{text-decoration:underline;color:var(--accent)}
.noticias .fuente{display:block;color:var(--muted);font-size:.82rem}
.pie{margin-top:36px;padding-top:18px;border-top:1px solid var(--line)}
.pie h2{font-size:1rem;margin-bottom:10px}
.tabla{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.86rem;min-width:560px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:.76rem;text-transform:uppercase;letter-spacing:.05em}
.ok{color:var(--up)}.warn{color:var(--warn)}.err{color:var(--down)}
.err-txt{color:var(--muted);font-family:var(--mono);font-size:.76rem;word-break:break-word}
@media (max-width:560px){
  .top{padding-top:16px}
  .valor{font-size:1.35rem}
  .dias{grid-template-columns:repeat(7,104px)}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="marca"><h1>${esc(m.config.titulo)}</h1><span>Mercados, clima y noticias del campo</span></div>
    <div class="act" aria-live="polite">
      <span class="etq">Última actualización</span>
      <strong>${esc(hora)} h</strong>
      <span class="fecha">${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))} · hora argentina</span>
    </div>
  </header>
  ${aviso}
  ${seccionGranos(m)}
  ${seccionGraficos(m)}
  ${seccionDolar(m)}
  ${seccionClima(m)}
  ${seccionHaciendaYRetenciones(m)}
  <div style="margin-top:28px">${seccionNoticias(m)}</div>
  ${piePagina(m)}
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js" defer></script>
<script>
// Recarga automática con parámetro anti-caché
setTimeout(function () {
  var u = new URL(location.href);
  u.searchParams.set('t', Date.now());
  location.replace(u.toString());
}, ${recargaMs});

// Gráficos (Chart.js desde CDN). Si el CDN no carga, la página sigue funcionando.
var DATOS = ${datosGraficos};
window.addEventListener('load', function () {
  var vacio = function (id, texto) {
    var c = document.getElementById(id);
    c.parentNode.innerHTML = '<p class="nd">' + texto + '</p>';
  };
  if (!window.Chart) {
    vacio('g-granos', 'No se pudo cargar el gráfico.');
    vacio('g-dolar', 'No se pudo cargar el gráfico.');
    return;
  }
  var css = getComputedStyle(document.documentElement);
  var color = function (v) { return css.getPropertyValue(v).trim(); };
  var nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
  Chart.defaults.color = color('--muted');
  Chart.defaults.borderColor = color('--line');
  Chart.defaults.font.family = color('--font');
  var paleta = [color('--accent'), color('--gold'), color('--down'), color('--frost')];
  var opciones = function (prefijo) {
    return {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + prefijo + nf.format(c.parsed.y); } } }
      },
      scales: { y: { ticks: { callback: function (v) { return prefijo + nf.format(v); } } }, x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } } }
    };
  };
  var etiquetas = function (fechas) { return fechas.map(function (f) { return f.slice(8, 10) + '/' + f.slice(5, 7); }); };
  var SIN_HISTORICO = 'Todavía no hay suficiente histórico para graficar.';
  if (DATOS.granos.fechas.length >= 2) {
    new Chart(document.getElementById('g-granos'), {
      type: 'line',
      data: { labels: etiquetas(DATOS.granos.fechas), datasets: DATOS.granos.series.map(function (s, i) {
        return { label: s.nombre, data: s.valores, borderColor: paleta[i % paleta.length], backgroundColor: paleta[i % paleta.length], spanGaps: true, pointRadius: 2, tension: .25 };
      }) },
      options: opciones('$ ')
    });
  } else vacio('g-granos', SIN_HISTORICO);
  if (DATOS.dolar.fechas.length >= 2) {
    new Chart(document.getElementById('g-dolar'), {
      type: 'line',
      data: { labels: etiquetas(DATOS.dolar.fechas), datasets: [{ label: 'Oficial venta', data: DATOS.dolar.valores, borderColor: paleta[0], backgroundColor: paleta[0], pointRadius: 2, tension: .25 }] },
      options: opciones('$ ')
    });
  } else vacio('g-dolar', SIN_HISTORICO);
});
</script>
</body>
</html>
`;
}
