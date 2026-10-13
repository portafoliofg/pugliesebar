// =====================================================
// PERSPECTIVA DE LA CAMPAÑA para un punto (localidad o zona de campos)
//  1. Historia: lluvia mensual desde 1981 (reanálisis ERA5, Open-Meteo archive).
//  2. Años parecidos: cada campaña (oct–mar) clasificada por El Niño / La Niña con el ONI de la NOAA
//     → cuánto llovió en tu zona en las campañas con la misma fase que la actual.
//  3. Próximos 3 meses: pronóstico estacional por escenarios (Open-Meteo seasonal),
//     comparado con lo normal (1991–2020) de la misma zona.
// Uso: Perspectiva.calcular(lat, lon, enso) → datos; Perspectiva.render(contenedor, datos, nombre)
// =====================================================
(function () {
  'use strict';

  const ZONA = 'America/Argentina/Buenos_Aires';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CAMPANA = [10, 11, 12, 1, 2, 3];   // octubre a marzo
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const prom = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const cuantil = (orden, q) => { if (!orden.length) return null; const p = (orden.length - 1) * q; const a = Math.floor(p); const b = Math.ceil(p); return orden[a] + (orden[b] - orden[a]) * (p - a); };
  const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

  const FASES = {
    nino_fuerte: { nombre: 'El Niño fuerte', corto: 'Niño fuerte', color: '#d9622b' },
    nino: { nombre: 'El Niño débil o moderado', corto: 'Niño', color: '#f0a04b' },
    neutral: { nombre: 'Neutral', corto: 'Neutral', color: '#9aa3a8' },
    nina: { nombre: 'La Niña', corto: 'Niña', color: '#3a8fd6' }
  };
  const claseDe = (fase, intensidad) => (fase === 'nino' ? (intensidad === 'fuerte' || intensidad === 'muy fuerte' ? 'nino_fuerte' : 'nino') : fase === 'nina' ? 'nina' : 'neutral');

  // ---------- Datos ----------
  async function historico(lat, lon) {
    const fin = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    const clave = `persp:${lat.toFixed(2)},${lon.toFixed(2)}:${fin.slice(0, 7)}`;
    try { const c = localStorage.getItem(clave); if (c) return JSON.parse(c); } catch (e) {}
    const p = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), start_date: '1981-01-01', end_date: fin, daily: 'precipitation_sum', timezone: ZONA });
    const r = await fetch('https://archive-api.open-meteo.com/v1/archive?' + p);
    if (!r.ok) throw new Error('Histórico de lluvias: HTTP ' + r.status);
    const d = (await r.json()).daily;
    const mensual = {};
    d.time.forEach((f, i) => { const k = f.slice(0, 7); mensual[k] = (mensual[k] || 0) + (d.precipitation_sum[i] || 0); });
    const ultimo = fin.slice(0, 7);
    delete mensual[ultimo];   // el mes en curso está incompleto
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(`persp:${lat.toFixed(2)},${lon.toFixed(2)}:`)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(clave, JSON.stringify(mensual));
    } catch (e) {}
    return mensual;
  }

  async function estacional(lat, lon) {
    const p = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), daily: 'precipitation_sum', forecast_days: '130', timezone: ZONA });
    const r = await fetch('https://seasonal-api.open-meteo.com/v1/seasonal?' + p);
    if (!r.ok) throw new Error('Pronóstico estacional: HTTP ' + r.status);
    const d = (await r.json()).daily;
    const miembros = Object.keys(d).filter((k) => k.startsWith('precipitation_sum')).map((k) => d[k]);
    return { time: d.time, miembros };
  }

  // ---------- Cálculos ----------
  function normales(mensual) {
    const out = {};
    for (let m = 1; m <= 12; m++) {
      const v = Object.entries(mensual).filter(([k]) => Number(k.slice(5, 7)) === m && k >= '1991' && k < '2021').map(([, x]) => x).sort((a, b) => a - b);
      out[m] = { media: prom(v), t1: cuantil(v, 1 / 3), t2: cuantil(v, 2 / 3) };
    }
    return out;
  }

  function campanas(mensual, ensoCampanas) {
    const lista = [];
    const anios = [...new Set(Object.keys(mensual).map((k) => Number(k.slice(0, 4))))];
    for (const y of anios) {
      const meses = CAMPANA.map((m) => `${m >= 10 ? y : y + 1}-${String(m).padStart(2, '0')}`);
      if (!meses.every((k) => mensual[k] != null)) continue;
      const e = ensoCampanas?.[y];
      lista.push({ anio: y, total: meses.reduce((s, k) => s + mensual[k], 0), porMes: meses.map((k) => mensual[k]), oni: e?.oni ?? null, clase: e ? claseDe(e.fase, e.intensidad) : null });
    }
    const ref = lista.filter((c) => c.anio >= 1991 && c.anio <= 2020).map((c) => c.total).sort((a, b) => a - b);
    const normal = prom(ref);
    const t1 = cuantil(ref, 1 / 3); const t2 = cuantil(ref, 2 / 3);
    lista.forEach((c) => { c.anom = normal ? ((c.total - normal) / normal) * 100 : null; c.categoria = c.total > t2 ? 'arriba' : c.total < t1 ? 'abajo' : 'normal'; });
    return { lista, normal, t1, t2 };
  }

  function porClase(camp, normalesMes) {
    const out = {};
    Object.keys(FASES).forEach((k) => {
      const l = camp.lista.filter((c) => c.clase === k);
      if (!l.length) return;
      out[k] = {
        n: l.length, anom: prom(l.map((c) => c.anom)), arriba: l.filter((c) => c.categoria === 'arriba').length, abajo: l.filter((c) => c.categoria === 'abajo').length,
        anios: l.map((c) => ({ anio: c.anio, anom: c.anom, total: c.total, oni: c.oni })),
        meses: CAMPANA.map((m, i) => { const nm = normalesMes[m].media; return nm ? prom(l.map((c) => ((c.porMes[i] - nm) / nm) * 100)) : null; })
      };
    });
    return out;
  }

  function pronostico(est, normalesMes) {
    const out = [];
    const desde = hoy().slice(0, 7);
    const meses = [...new Set(est.time.map((f) => f.slice(0, 7)))].filter((k) => k > desde);
    for (const k of meses.slice(0, 3)) {
      const idx = est.time.map((f, i) => (f.startsWith(k) ? i : -1)).filter((i) => i >= 0);
      const diasMes = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
      if (idx.length < diasMes - 1) continue;   // mes incompleto en el pronóstico
      const tot = est.miembros.map((m) => idx.reduce((s, i) => s + (m[i] || 0), 0)).sort((a, b) => a - b);
      const nm = normalesMes[Number(k.slice(5, 7))];
      out.push({ mes: k, mediana: cuantil(tot, 0.5), q10: cuantil(tot, 0.1), q90: cuantil(tot, 0.9), normal: nm.media,
        arriba: tot.filter((x) => x > nm.t2).length / tot.length, abajo: tot.filter((x) => x < nm.t1).length / tot.length, escenarios: tot.length });
    }
    return out;
  }

  /** Calcula todo para un punto. `enso` es el objeto que publica el tablero (enso.json). */
  async function calcular(lat, lon, enso) {
    const [h, e] = await Promise.allSettled([historico(lat, lon), estacional(lat, lon)]);
    if (h.status !== 'fulfilled') throw h.reason;
    const nm = normales(h.value);
    const camp = campanas(h.value, enso?.campanas);
    const clases = porClase(camp, nm);
    const actual = enso ? claseDe(enso.faseActual, enso.intensidadActual) : null;
    return { normalesMes: nm, campanas: camp, clases, actual, pronostico: e.status === 'fulfilled' ? pronostico(e.value, nm) : null, errorPronostico: e.status === 'rejected' ? e.reason?.message : null };
  }

  // ---------- Dibujo ----------
  const signo = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 0) + ' %');
  const graficos = new WeakMap();

  function render(cont, d, nombre) {
    const c = d.actual && d.clases[d.actual];
    const f = d.actual ? FASES[d.actual] : null;
    const con = { nino_fuerte: 'El Niño fuerte', nino: 'El Niño débil o moderado', neutral: 'condiciones neutrales', nina: 'La Niña' }[d.actual];
    const frase = c ? (Math.abs(c.anom) < 8
      ? `En las <b>${c.n}</b> campañas con ${con} desde 1981, la lluvia de octubre a marzo en ${esc(nombre)} fue <b>parecida a lo normal</b> (${signo(c.anom)} en promedio).`
      : `En las <b>${c.n}</b> campañas con ${con} desde 1981, la lluvia de octubre a marzo en ${esc(nombre)} fue en promedio <b>un ${num(Math.abs(c.anom), 0)} % ${c.anom > 0 ? 'mayor' : 'menor'} que lo normal</b>.`)
      + ` Superó lo normal en ${c.arriba} de ${c.n} y quedó por debajo en ${c.abajo}.` : '';
    const mesFuerte = c ? c.meses.map((v, i) => ({ v, m: CAMPANA[i] })).filter((x) => x.v != null).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0] : null;
    cont.innerHTML = `<div class="persp">
      <div class="persp-cab"><h4>${esc(nombre)}</h4><span class="persp-normal">Normal oct–mar: <b>${num(d.campanas.normal, 0)} mm</b></span></div>
      ${c ? `<p class="persp-frase">${frase}${mesFuerte && Math.abs(mesFuerte.v) >= 15 ? ` El mes con más diferencia suele ser <b>${MESES_L[mesFuerte.m - 1]}</b> (${signo(mesFuerte.v)}).` : ''}</p>` : '<p class="nota">Sin datos de El Niño / La Niña para comparar.</p>'}
      <div class="persp-graf"><canvas aria-label="Lluvia de cada campaña con la misma fase"></canvas></div>
      <div class="persp-fases">${Object.entries(FASES).filter(([k]) => d.clases[k]).map(([k, x]) => `<div class="${k === d.actual ? 'activa' : ''}" style="--c:${x.color}"><small>${x.corto} (${d.clases[k].n})</small><b>${signo(d.clases[k].anom)}</b></div>`).join('')}</div>
      ${d.pronostico?.length ? `<div class="persp-prono"><b>Próximos meses · pronóstico estacional</b>
        <table><thead><tr><th>Mes</th><th>Probable</th><th>Normal</th><th>Chance de más lluvia</th><th>De menos lluvia</th></tr></thead><tbody>
        ${d.pronostico.map((p) => `<tr><td>${MESES_L[Number(p.mes.slice(5, 7)) - 1]}</td><td>${num(p.mediana, 0)} mm <small>(${num(p.q10, 0)}–${num(p.q90, 0)})</small></td><td>${num(p.normal, 0)} mm</td>
          <td><span class="persp-barra" style="--p:${Math.round(p.arriba * 100)}%;--c:#3a8fd6">${Math.round(p.arriba * 100)} %</span></td><td><span class="persp-barra" style="--p:${Math.round(p.abajo * 100)}%;--c:#d9622b">${Math.round(p.abajo * 100)} %</span></td></tr>`).join('')}</tbody></table>
        <small class="nota">Lo normal es un tercio de chance para cada lado. Pronóstico estacional de Open-Meteo (${d.pronostico[0].escenarios} escenarios); a esta escala es orientativo.</small></div>`
        : d.errorPronostico ? '<p class="nota">No se pudo cargar el pronóstico estacional.</p>' : ''}
    </div>`;
    if (!window.Chart || !c) return;
    const lista = d.campanas.lista.filter((x) => x.clase === d.actual);
    const canvas = cont.querySelector('canvas');
    const css = getComputedStyle(document.documentElement);
    if (graficos.get(cont)) graficos.get(cont).destroy();
    graficos.set(cont, new Chart(canvas, {
      type: 'bar',
      data: { labels: lista.map((x) => `${x.anio}/${String(x.anio + 1).slice(2)}`), datasets: [{ label: 'Lluvia oct–mar vs. normal (%)', data: lista.map((x) => Math.round(x.anom)), backgroundColor: lista.map((x) => (x.anom >= 0 ? '#3a8fd6' : '#d9622b')), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => { const x = lista[t.dataIndex]; return ` ${signo(x.anom)} · ${num(x.total, 0)} mm · ONI ${num(x.oni, 1)}`; } } } },
        scales: { y: { title: { display: true, text: '% vs. normal' }, grid: { color: css.getPropertyValue('--line') } }, x: { grid: { display: false } } } }
    }));
  }

  // Cabecera con el estado actual de ENSO (para usar arriba de una o varias zonas)
  function cabecera(enso) {
    if (!enso) return '';
    const f = FASES[claseDe(enso.faseActual, enso.intensidadActual)];
    const serie = enso.nino34Semanal || [];
    const fase = enso.faseActual === 'nino' ? `El Niño ${enso.intensidadActual}` : enso.faseActual === 'nina' ? `La Niña ${enso.intensidadActual}` : 'Neutral';
    return `<div class="persp-enso" style="--c:${f.color}">
      <div class="persp-enso-fase"><small>Pacífico ecuatorial · ${esc(enso.fuente || 'NOAA')}</small><b>${esc(fase)}</b><span>${esc(enso.estadoTexto || '')}</span></div>
      <div><small>Niño 3.4 (semanal)</small><b>${num(enso.anomActual, 1)} °C</b><span>${serie.length ? 'al ' + serie[serie.length - 1].fecha.split('-').reverse().join('/') : ''}</span></div>
      <div><small>ONI ${esc(enso.oniUltimo?.temporada || '')}</small><b>${num(enso.oniUltimo?.anom, 2)}</b><span>índice oficial</span></div>
      ${enso.probabilidad != null ? `<div><small>Probabilidad</small><b>${enso.probabilidad} %</b><span>según la NOAA</span></div>` : ''}
    </div>
    ${enso.faseActual === 'nino' ? `<p class="nota">Con El Niño suele llover más de lo normal en buena parte de la región pampeana y el NEA en primavera y verano: menos riesgo de sequía, pero más riesgo de excesos hídricos, anegamientos, enfermedades y demoras en siembra y cosecha. Hacia el oeste la señal es más débil. Abajo, lo que pasó en cada zona en campañas parecidas.</p>`
      : enso.faseActual === 'nina' ? `<p class="nota">Con La Niña suele llover menos de lo normal en buena parte de la región pampeana en primavera y verano, con más riesgo de sequía y golpes de calor. Abajo, lo que pasó en cada zona en campañas parecidas.</p>`
        : '<p class="nota">Sin El Niño ni La Niña, el clima de la campaña depende más de otros factores. Abajo, el comportamiento histórico de cada zona y el pronóstico estacional.</p>'}`;
  }

  // Estilos propios (se agregan una sola vez)
  if (!document.getElementById('persp-css')) {
    const st = document.createElement('style');
    st.id = 'persp-css';
    st.textContent = `
      .persp-enso { display: grid; grid-template-columns: 1.6fr repeat(3, 1fr); gap: 10px; margin-bottom: 10px; }
      .persp-enso > div { padding: 12px 14px; border-radius: 16px; background: var(--surface-2); display: flex; flex-direction: column; gap: 2px; }
      .persp-enso small { color: var(--muted); font-size: .68rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      .persp-enso b { font: 700 1.35rem var(--display, Georgia); }
      .persp-enso span { color: var(--muted); font-size: .8rem; }
      .persp-enso-fase { background: color-mix(in srgb, var(--c) 18%, var(--surface-2)) !important; border-left: 5px solid var(--c); }
      .persp-enso-fase b { font-size: 1.6rem; text-transform: none; }
      .persp { display: flex; flex-direction: column; gap: 10px; }
      .persp-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .persp-cab h4 { font-size: 1.15rem; }
      .persp-normal { color: var(--muted); font-size: .85rem; }
      .persp-frase { line-height: 1.55; }
      .persp-graf { position: relative; height: 190px; }
      .persp-fases { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .persp-fases div { padding: 8px 10px; border-radius: 12px; background: var(--surface-2); border-top: 3px solid var(--c); display: flex; flex-direction: column; }
      .persp-fases div.activa { background: color-mix(in srgb, var(--c) 18%, var(--surface-2)); box-shadow: 0 0 0 2px var(--c) inset; }
      .persp-fases small { color: var(--muted); font-size: .72rem; font-weight: 700; } .persp-fases b { font-variant-numeric: tabular-nums; }
      .persp-prono table { width: 100%; border-collapse: collapse; font-size: .86rem; margin: 6px 0; font-variant-numeric: tabular-nums; }
      .persp-prono th { text-align: left; font-size: .7rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; padding: 6px; }
      .persp-prono td { padding: 6px; border-top: 1px solid var(--line); }
      .persp-barra { display: inline-block; min-width: 90px; padding: 2px 8px; border-radius: 8px; font-weight: 800; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 40%, transparent) var(--p), transparent var(--p)); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); }
      @media (max-width: 760px) { .persp-enso { grid-template-columns: 1fr 1fr; } .persp-enso-fase { grid-column: 1 / -1; } .persp-fases { grid-template-columns: 1fr 1fr; } .persp-prono th:nth-child(3), .persp-prono td:nth-child(3) { display: none; } }`;
    document.head.appendChild(st);
  }

  window.Perspectiva = { calcular, render, cabecera, FASES, claseDe };
})();
