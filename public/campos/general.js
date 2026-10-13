// =====================================================
// REPORTE GENERAL · todos los campos juntos
// Superficie por provincia, cultivo y campaña; lluvia pasada y prevista, heladas,
// viento, humedad del suelo y NDVI de cada lote; rankings y mapa coloreado.
// Fuentes: Open-Meteo (varias ubicaciones por pedido) y el NDVI del repositorio privado.
// =====================================================
(function () {
  'use strict';

  const ZONA = 'America/Argentina/Buenos_Aires';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const suma = (a) => a.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
  const etqDia = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
  const haDe = (c) => (c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || 0);
  const ordenar = (a, b) => String(a).localeCompare(String(b), 'es');
  const CULTIVO_COLOR = { 'Soja': '#a4c639', 'Maíz': '#ffc107', 'Trigo': '#c8962e', 'Girasol': '#ff9800', 'Cebada': '#e3c56a', 'Sorgo': '#b5532a', 'Pastura': '#3f9b5a', 'Barbecho': '#9c8b74' };
  const PALETA = ['#a4c639', '#ffc107', '#ff9800', '#3f9b5a', '#7aa6c2', '#c8962e', '#d95f7a', '#8e6bbf', '#b5532a', '#4fb3a9'];

  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const estado = (t) => { const e = $('#r-estado'); if (e) e.textContent = t; };
  function avisar(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.textContent = texto;
    $('#avisos').appendChild(a);
    setTimeout(() => a.remove(), 7000);
  }
  function error(t) {
    $('#reporte').innerHTML = `<div class="r-cargando"><div><p style="font-size:2.5rem">🌾</p><p>${esc(t)}</p><p><a class="link" href="./">Volver a Mis campos</a></p></div></div>`;
  }

  // ---------- Clima de todos los campos ----------
  // Los lotes a menos de ~10 km comparten celda: menos pedidos y mismo resultado
  async function climaDe(campos) {
    const celdas = new Map();
    campos.forEach((c) => {
      const [lat, lon] = KML.centro(c.geometria);
      const k = `${lat.toFixed(1)},${lon.toFixed(1)}`;
      if (!celdas.has(k)) celdas.set(k, { lat, lon, ids: [] });
      celdas.get(k).ids.push(c.id);
    });
    const lista = [...celdas.values()];
    const porId = {};
    estado(`Descargando clima de ${lista.length} zonas…`);
    // Todos los grupos a la vez (antes iban de a uno) y con copia local de 30 minutos
    const grupos = [];
    for (let i = 0; i < lista.length; i += 50) grupos.push(i);
    await Promise.all(grupos.map(async (i) => {
      const g = lista.slice(i, i + 50);
      const base = { latitude: g.map((x) => x.lat.toFixed(3)).join(','), longitude: g.map((x) => x.lon.toFixed(3)).join(','), timezone: ZONA };
      const [r1, r2] = await Promise.all([
        Repo.web('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams(Object.assign({}, base, {
          daily: 'precipitation_sum,temperature_2m_min,temperature_2m_max,wind_gusts_10m_max,et0_fao_evapotranspiration', past_days: '30', forecast_days: '7'
        })), 30).catch(() => null),
        Repo.web('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams(Object.assign({}, base, {
          hourly: 'soil_moisture_3_to_9cm,soil_moisture_9_to_27cm', forecast_days: '1'
        })), 30).catch(() => null)
      ]);
      const a1 = r1 ? (Array.isArray(r1) ? r1 : [r1]) : [];
      const a2 = r2 ? (Array.isArray(r2) ? r2 : [r2]) : [];
      const hora = new Date().toLocaleString('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' });
      g.forEach((celda, k) => {
        const d = a1[k]?.daily; const h = a2[k]?.hourly;
        if (!d) return;
        const iHoy = d.time.indexOf(hoy);
        const pas = (arr, n) => arr.slice(Math.max(0, iHoy - n), iHoy);
        const fut = (arr, n) => arr.slice(iHoy, iHoy + n);
        const ih = h ? Math.min(h.time.length - 1, Number(hora)) : -1;
        const m = {
          lluvia7p: suma(pas(d.precipitation_sum, 7)), lluvia30p: suma(pas(d.precipitation_sum, 30)),
          balance30: suma(pas(d.precipitation_sum, 30)) - suma(pas(d.et0_fao_evapotranspiration, 30)),
          lluvia7f: suma(fut(d.precipitation_sum, 7)),
          tmin7f: Math.min(...fut(d.temperature_2m_min, 7).filter(Number.isFinite)),
          heladas7f: fut(d.temperature_2m_min, 7).filter((v) => v != null && v <= 0).length,
          tmax7f: Math.max(...fut(d.temperature_2m_max, 7).filter(Number.isFinite)),
          rafaga3f: Math.max(...fut(d.wind_gusts_10m_max, 3).filter(Number.isFinite)),
          humedad: ih >= 0 && h.soil_moisture_9_to_27cm[ih] != null ? h.soil_moisture_9_to_27cm[ih] * 100 : null,
          humedadSup: ih >= 0 && h.soil_moisture_3_to_9cm[ih] != null ? h.soil_moisture_3_to_9cm[ih] * 100 : null,
          diario: { time: d.time, lluvia: d.precipitation_sum, tmin: d.temperature_2m_min }
        };
        celda.ids.forEach((id) => { porId[id] = m; });
      });
    }));
    return { porId, zonas: lista.length };
  }

  // Escenarios ECMWF (probabilidad de lluvia) por celda de ~0,25°
  async function escenarios(campos) {
    if (!window.Ensamble) return {};
    const celdas = new Map();
    campos.forEach((c) => {
      const [lat, lon] = KML.centro(c.geometria);
      const k = `${(Math.round(lat * 4) / 4).toFixed(2)},${(Math.round(lon * 4) / 4).toFixed(2)}`;
      if (!celdas.has(k)) celdas.set(k, { lat, lon, ids: [] });
      celdas.get(k).ids.push(c.id);
    });
    const lista = [...celdas.values()];
    const r = await Ensamble.varios(lista).catch(() => []);
    const out = {};
    lista.forEach((x, i) => x.ids.forEach((id) => { out[id] = r[i] || null; }));
    return out;
  }

  // ---------- Métricas para colorear el mapa ----------
  const METRICAS = {
    ndvi: { t: 'NDVI actual', u: '', d: 2, v: (f) => f.ndvi?.ndvi, color: (v) => NDVI.color(v), escala: [[0.1, '#f46d43'], [0.3, '#fee08b'], [0.5, '#a6d96a'], [0.7, '#1a9850']] },
    lluvia30p: { t: 'Lluvia últimos 30 días', u: 'mm', d: 0, v: (f) => f.clima?.lluvia30p, color: (v) => rampa(v, [[0, '#f6e7c1'], [20, '#cfe3f3'], [60, '#6aa9dd'], [120, '#1d5fa8'], [200, '#0b2f6b']]), escala: [[0, '#f6e7c1'], [20, '#cfe3f3'], [60, '#6aa9dd'], [120, '#1d5fa8'], [200, '#0b2f6b']] },
    p10: { t: 'Prob. de ≥ 10 mm en 7 días', u: '%', d: 0, v: (f) => (f.ens ? f.ens.acum7.p10 * 100 : null), color: (v) => rampa(v, [[0, '#f6e7c1'], [25, '#cfe3f3'], [50, '#6aa9dd'], [75, '#1d5fa8'], [100, '#0b2f6b']]), escala: [[0, '#f6e7c1'], [25, '#cfe3f3'], [50, '#6aa9dd'], [75, '#1d5fa8'], [100, '#0b2f6b']] },
    lluvia7f: { t: 'Lluvia próximos 7 días', u: 'mm', d: 0, v: (f) => f.clima?.lluvia7f, color: (v) => rampa(v, [[0, '#f6e7c1'], [10, '#cfe3f3'], [30, '#6aa9dd'], [60, '#1d5fa8'], [100, '#0b2f6b']]), escala: [[0, '#f6e7c1'], [10, '#cfe3f3'], [30, '#6aa9dd'], [60, '#1d5fa8'], [100, '#0b2f6b']] },
    tmin7f: { t: 'Mínima de los próximos 7 días', u: '°C', d: 0, v: (f) => f.clima?.tmin7f, color: (v) => rampa(v, [[-4, '#3b4cc0'], [0, '#8db0fe'], [4, '#dddddd'], [10, '#f49a7b'], [16, '#b40426']]), escala: [[-4, '#3b4cc0'], [0, '#8db0fe'], [4, '#dddddd'], [10, '#f49a7b'], [16, '#b40426']] },
    agua: { t: 'Agua útil del suelo (1 m)', u: '%', d: 0, v: (f) => f.agua?.pct, color: (v) => Agua.color(v), escala: [[0, '#c0392b'], [25, '#f39c12'], [50, '#a4c639'], [75, '#2e8b57'], [95, '#1d5fa8']] }
  };
  function rampa(v, puntos) {
    if (v == null || !Number.isFinite(v)) return '#9aa3a8';
    if (v <= puntos[0][0]) return puntos[0][1];
    for (let i = 1; i < puntos.length; i++) {
      if (v <= puntos[i][0]) {
        const [a, ca] = puntos[i - 1]; const [b, cb] = puntos[i];
        const t = (v - a) / (b - a);
        const h = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
        const x = h(ca); const y = h(cb);
        return '#' + x.map((n, j) => Math.round(n + (y[j] - n) * t).toString(16).padStart(2, '0')).join('');
      }
    }
    return puntos[puntos.length - 1][1];
  }

  // ---------- Estado ----------
  let todos = [];       // { campo, clima, ndvi }
  let filas = [];       // filtradas
  let metrica = 'ndvi';
  let orden = { k: 'nombre', asc: true };
  let mapa = null; let capa = null;
  const graficos = [];
  const grafico = (id, cfg) => { const el = document.getElementById(id); if (el && window.Chart) graficos.push(new Chart(el, cfg)); };

  async function iniciar() {
    if (!Repo.tieneToken()) return error('Tus campos son privados: abrí primero la pestaña Campos y conectá GitHub en este navegador.');
    estado('Leyendo tus campos…');
    const extras = Promise.all([NDVI.cargarResumen().catch(() => null), Agua.cargar().catch(() => null)]);
    let campos;
    try { campos = ((await Repo.leer()).campos || []).filter((c) => c.geometria); } catch (e) { return error(e.message); }
    if (!campos.length) return error('Todavía no cargaste campos.');
    estado('Descargando clima y escenarios de lluvia…');
    const [clima, ens] = await Promise.all([climaDe(campos), escenarios(campos), extras]);
    todos = campos.map((c) => {
      const k = clima.porId[c.id] ? Object.assign({}, clima.porId[c.id]) : null;
      const a = Agua.de(c.id);
      // Lluvia pasada: la del balance (tu pluviómetro o satélite CHIRPS) en lugar del modelo
      if (k && a) { k.lluvia7p = a.lluvia7; k.lluvia30p = a.lluvia30; k.fuenteLluvia = a.fuentes30; }
      return { campo: c, clima: k, ndvi: NDVI.de(c.id), agua: a, ens: ens[c.id] || null };
    });
    if (!Object.keys(clima.porId).length) avisar('No se pudo descargar el clima (Open-Meteo). Se muestran solo superficie y NDVI.', 'error');
    if (!todos.some((f) => f.ndvi)) metrica = 'lluvia30p';
    const provincias = [...new Set(campos.map((c) => c.provincia || 'Sin ubicar'))].sort(ordenar);
    $('#f-provincia').innerHTML = ['Todas', ...provincias].map((p) => `<option>${esc(p)}</option>`).join('');
    $('#f-provincia').addEventListener('change', dibujar);
    dibujar();
  }

  function dibujar() {
    const prov = $('#f-provincia').value;
    filas = todos.filter((f) => prov === 'Todas' || (f.campo.provincia || 'Sin ubicar') === prov);
    while (graficos.length) graficos.pop().destroy();
    if (mapa) { mapa.remove(); mapa = null; }

    const ha = suma(filas.map((f) => haDe(f.campo)));
    const agrupar = (clave) => {
      const o = {};
      filas.forEach((f) => { const k = clave(f.campo) || 'Sin dato'; o[k] = (o[k] || 0) + haDe(f.campo); });
      return Object.entries(o).sort((a, b) => b[1] - a[1]);
    };
    const porProv = agrupar((c) => c.provincia || 'Sin ubicar');
    const porCultivo = agrupar((c) => c.cultivo || 'Sin cultivo');
    const porCampana = agrupar((c) => c.campana || 'Sin campaña');
    const conNdvi = filas.filter((f) => f.ndvi?.ndvi != null);
    const haNdvi = suma(conNdvi.map((f) => haDe(f.campo)));
    const ndviProm = haNdvi ? suma(conNdvi.map((f) => f.ndvi.ndvi * haDe(f.campo))) / haNdvi : null;
    const conClima = filas.filter((f) => f.clima);
    const pond = (k) => { const h = suma(conClima.map((f) => haDe(f.campo))); return h ? suma(conClima.map((f) => f.clima[k] * haDe(f.campo))) / h : null; };
    const enHelada = conClima.filter((f) => f.clima.heladas7f > 0);
    const conAgua = filas.filter((f) => f.agua?.pct != null);
    const haAgua = suma(conAgua.map((f) => haDe(f.campo)));
    const aguaProm = haAgua ? suma(conAgua.map((f) => f.agua.pct * haDe(f.campo))) / haAgua : null;
    const secos = conAgua.filter((f) => f.agua.pct < 50);
    const kpi = (t, v, d, c) => `<div class="r-kpi" style="--c:${c}"><small>${t}</small><b>${v}</b><span>${d}</span></div>`;

    // Rankings
    const top = (lista, k, asc, n = 5) => lista.slice().sort((a, b) => (asc ? k(a) - k(b) : k(b) - k(a))).slice(0, n);
    const rk = (titulo, ico, lista, valor) => `<div class="r-card"><h3>${ico} ${titulo}</h3>${lista.length ? `<ol class="g-rank">${lista.map((f) => `<li><a class="link" href="reporte.html?id=${encodeURIComponent(f.campo.id)}" target="_blank" rel="noopener">${esc(f.campo.nombre)}</a><small>${esc(f.campo.localidad || f.campo.departamento || f.campo.provincia || '')}</small><b>${valor(f)}</b></li>`).join('')}</ol>` : '<p class="nota">Sin datos.</p>'}</div>`;
    const caidas = conNdvi.filter((f) => f.ndvi.tendencia != null);

    // Frases del análisis
    const frases = [];
    if (conClima.length) {
      frases.push(['🌧️', `En los últimos 30 días llovió en promedio <b>${num(pond('lluvia30p'), 0)} mm</b> en tus campos (ponderado por hectáreas), y para los próximos 7 días se esperan <b>${num(pond('lluvia7f'), 0)} mm</b>.`]);
      const conEns = filas.filter((f) => f.ens);
      if (conEns.length) {
        const hE = suma(conEns.map((f) => haDe(f.campo)));
        const pp = suma(conEns.map((f) => f.ens.acum7.p10 * haDe(f.campo))) / hE;
        frases.push(['🎲', `Según los 51 escenarios del modelo europeo, la probabilidad promedio de juntar 10 mm o más en la semana es <b>${num(pp * 100, 0)} %</b>${conEns.some((f) => f.ens.acum7.p10 >= 0.7) ? `; en ${conEns.filter((f) => f.ens.acum7.p10 >= 0.7).length} lotes supera el 70 %` : ''}.`]);
      }
      const secos = conClima.filter((f) => f.clima.balance30 < -60);
      if (secos.length) frases.push(['🏜️', `<b>${secos.length}</b> ${secos.length === 1 ? 'lote tiene' : 'lotes tienen'} un balance hídrico de 30 días muy negativo (la evapotranspiración superó a la lluvia en más de 60 mm): ${num(suma(secos.map((f) => haDe(f.campo))), 0)} ha.`]);
      if (enHelada.length) frases.push(['❄️', `Hay riesgo de <b>helada</b> en los próximos 7 días en <b>${enHelada.length}</b> ${enHelada.length === 1 ? 'lote' : 'lotes'} (${num(suma(enHelada.map((f) => haDe(f.campo))), 0)} ha). Mínima más baja: ${num(Math.min(...enHelada.map((f) => f.clima.tmin7f)), 0)} °C.`]);
      else frases.push(['✅', 'Sin heladas previstas en ningún lote para los próximos 7 días.']);
      const viento = conClima.filter((f) => f.clima.rafaga3f >= 60);
      if (viento.length) frases.push(['💨', `Ráfagas de 60 km/h o más en los próximos 3 días en ${viento.length} ${viento.length === 1 ? 'lote' : 'lotes'}: cuidado con las pulverizaciones.`]);
    }
    if (conAgua.length) {
      frases.unshift(['💧', `Agua útil promedio en el primer metro: <b>${num(aguaProm, 0)} %</b> (ponderado por hectáreas). ${secos.length ? `<b>${secos.length}</b> ${secos.length === 1 ? 'lote está' : 'lotes están'} por debajo del 50 % (${num(suma(secos.map((f) => haDe(f.campo))), 0)} ha).` : 'Ningún lote está por debajo del 50 %.'} La lluvia pasada sale de tus registros y del satélite CHIRPS.`]);
    }
    if (conNdvi.length) {
      frases.push(['🛰️', `NDVI promedio ponderado: <b>${num(ndviProm, 2)}</b> (${conNdvi.length} de ${filas.length} lotes con imagen reciente). ${NDVI.lectura(ndviProm)}.`]);
      const bajando = caidas.filter((f) => f.ndvi.tendencia <= -0.1);
      if (bajando.length) frases.push(['📉', `<b>${bajando.length}</b> ${bajando.length === 1 ? 'lote bajó' : 'lotes bajaron'} más de 0,1 de NDVI en 30 días: vale la pena recorrerlos.`]);
    }

    const m = METRICAS[metrica];
    $('#reporte').innerHTML = `
      <section class="r-portada">
        <div class="r-portada-txt">
          <span class="eyebrow">Reporte general · ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <h1>${prov === 'Todas' ? 'Todos mis campos' : esc(prov)}</h1>
          <p>${filas.length} lotes · ${num(ha, 0)} hectáreas</p>
          <div class="r-chips">${porCultivo.slice(0, 5).map(([k, v]) => `<span>${esc(k)} · ${num(v, 0)} ha</span>`).join('')}</div>
        </div>
        <div id="g-mapa-portada" style="min-height:260px"></div>
      </section>

      <section class="r-kpis">
        ${kpi('Superficie', num(ha, 0) + ' ha', `${filas.length} lotes · ${porProv.length} ${porProv.length === 1 ? 'provincia' : 'provincias'}`, css('--lima'))}
        ${kpi('NDVI promedio', num(ndviProm, 2), conNdvi.length ? `${conNdvi.length} lotes con dato` : 'Sin datos satelitales aún', NDVI.color(ndviProm))}
        ${kpi('Lluvia 30 días', num(pond('lluvia30p'), 0) + ' mm', 'Promedio ponderado', '#3a8fd6')}
        ${kpi('Lluvia próx. 7 días', num(pond('lluvia7f'), 0) + ' mm', 'Pronóstico', '#6aa9dd')}
        ${kpi('Riesgo de helada', enHelada.length + (enHelada.length === 1 ? ' lote' : ' lotes'), 'Próximos 7 días', '#8db0fe')}
        ${kpi('Agua útil del suelo', num(aguaProm, 0) + ' %', conAgua.length ? `primer metro · ${secos.length} ${secos.length === 1 ? 'lote seco o escaso' : 'lotes secos o escasos'}` : 'Sin balance todavía', Agua.color(aguaProm))}
      </section>

      ${frases.length ? `<section class="r-card r-analisis"><h3>Análisis</h3><ul>${frases.map(([i, t]) => `<li><i>${i}</i><span>${t}</span></li>`).join('')}</ul></section>` : ''}

      <section class="r-sec"><h2>Mapa</h2>
        <div class="r-card">
          <div class="g-metricas no-print">${Object.entries(METRICAS).map(([k, x]) => `<button type="button" class="btn${k === metrica ? ' btn-1' : ''}" data-metrica="${k}">${x.t}</button>`).join('')}</div>
          <p class="nota">Coloreado por: <b>${m.t}</b>. Tocá un lote para ver su reporte.</p>
          <div id="g-mapa" style="height:480px;border-radius:16px"></div>
          <div class="g-escala">${m.escala.map(([v, c]) => `<span><i style="background:${c}"></i>${num(v, m.d)}${m.u ? ' ' + m.u : ''}</span>`).join('')}<span><i style="background:#9aa3a8"></i>Sin dato</span></div>
        </div>
      </section>

      <section class="r-sec"><h2>Superficie</h2>
        <div class="r-grid">
          <div class="r-card"><h3>Hectáreas por provincia</h3><div class="r-graf"><canvas id="g-prov"></canvas></div></div>
          <div class="r-card"><h3>Hectáreas por cultivo</h3><div class="r-graf"><canvas id="g-cultivo"></canvas></div></div>
          <div class="r-card"><h3>Hectáreas por campaña</h3><div class="r-graf"><canvas id="g-campana"></canvas></div></div>
          <div class="r-card"><h3>Distribución del NDVI</h3><p class="nota">Hectáreas según el vigor del cultivo.</p><div class="r-graf"><canvas id="g-ndvi-dist"></canvas></div></div>
        </div>
      </section>

      <section class="r-sec"><h2>Clima por zona</h2>
        <div class="r-grid">
          <div class="r-card r-ancho"><h3>Lluvia por departamento</h3><p class="nota">Últimos 30 días y próximos 7 (promedio de los lotes de cada departamento).</p><div class="r-graf alto"><canvas id="g-lluvia-zona"></canvas></div></div>
          <div class="r-card r-ancho"><h3>Mínimas previstas por provincia</h3><p class="nota">La mínima más baja entre tus lotes de cada provincia, día por día.</p><div class="r-graf"><canvas id="g-tmin"></canvas></div></div>
        </div>
      </section>

      <section class="r-sec"><h2>Rankings</h2>
        <div class="r-grid g-rankings">
          ${rk('Más lluvia (30 días)', '🌧️', top(conClima, (f) => f.clima.lluvia30p, false), (f) => num(f.clima.lluvia30p, 0) + ' mm')}
          ${rk('Menos lluvia (30 días)', '☀️', top(conClima, (f) => f.clima.lluvia30p, true), (f) => num(f.clima.lluvia30p, 0) + ' mm')}
          ${rk('Mínimas más bajas (7 días)', '❄️', top(conClima, (f) => f.clima.tmin7f, true), (f) => num(f.clima.tmin7f, 0) + ' °C')}
          ${rk('Menos agua útil', '🏜️', top(conAgua, (f) => f.agua.pct, true), (f) => num(f.agua.pct, 0) + ' %')}
          ${rk('NDVI más bajo', '🟥', top(conNdvi, (f) => f.ndvi.ndvi, true), (f) => num(f.ndvi.ndvi, 2))}
          ${rk('Mayor caída de NDVI (30 días)', '📉', top(caidas, (f) => f.ndvi.tendencia, true), (f) => num(f.ndvi.tendencia, 2))}
        </div>
      </section>

      <section class="r-sec"><h2>Perspectiva de la campaña</h2>
        <div class="r-card"><div id="g-enso"><div class="esqueleto"></div></div><div class="persp-zonas" id="g-persp"></div></div>
      </section>

      <section class="r-sec"><h2>Todos los lotes</h2>
        <div class="r-card"><div class="r-tabla-wrap"><table class="r-tabla g-tabla" id="g-tabla"></table></div>
        <p class="nota">Tocá un encabezado para ordenar. ❄️ = helada prevista en 7 días.</p></div>
      </section>

      <footer class="r-pie">Fuentes: Open-Meteo (pronóstico y últimos 30 días), Sentinel-2 vía Microsoft Planetary Computer (NDVI), imágenes de Esri. Lotes a menos de ~10 km comparten el mismo dato de clima. Los valores son estimaciones de modelos y satélite.</footer>`;

    pintarTabla();
    pintarPerspectiva();
    pintarMapas();
    pintarGraficos(porProv, porCultivo, porCampana, conNdvi, conClima);
  }

  // ---------- Perspectiva de la campaña (una zona por provincia de los lotes filtrados) ----------
  let enso;
  const perspectivas = {};
  async function pintarPerspectiva() {
    const cab = $('#g-enso');
    const cont = $('#g-persp');
    if (!cab || !window.Perspectiva) return;
    if (enso === undefined) enso = await fetch('../enso.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!document.body.contains(cab)) return;
    cab.innerHTML = enso ? Perspectiva.cabecera(enso) : '<p class="nota">No se pudo leer el estado de El Niño / La Niña.</p>';
    const zonas = {};
    filas.forEach((f) => {
      const p = f.campo.provincia || 'Sin ubicar';
      const [lat, lon] = KML.centro(f.campo.geometria);
      const z = zonas[p] || (zonas[p] = { lat: 0, lon: 0, ha: 0 });
      const h = haDe(f.campo) || 1;
      z.lat += lat * h; z.lon += lon * h; z.ha += h;
    });
    cont.innerHTML = '';
    for (const [nombre, z] of Object.entries(zonas).sort((a, b) => b[1].ha - a[1].ha)) {
      const div = document.createElement('div');
      div.className = 'persp-zona';
      div.innerHTML = '<div class="esqueleto"></div>';
      cont.appendChild(div);
      const lat = z.lat / z.ha; const lon = z.lon / z.ha;
      if (!perspectivas[nombre]) perspectivas[nombre] = Perspectiva.calcular(lat, lon, enso);
      perspectivas[nombre].then((d) => { if (document.body.contains(div)) Perspectiva.render(div, d, `${nombre} (${num(z.ha, 0)} ha)`); })
        .catch(() => { div.innerHTML = `<p class="nota">No se pudo calcular la perspectiva de ${esc(nombre)}.</p>`; });
    }
  }

  // ---------- Tabla ----------
  const COLUMNAS = [
    ['nombre', 'Lote', (f) => f.campo.nombre, (f) => `<a class="link" href="reporte.html?id=${encodeURIComponent(f.campo.id)}" target="_blank" rel="noopener">${esc(f.campo.nombre)}</a>`],
    ['zona', 'Zona', (f) => [f.campo.localidad || f.campo.departamento, f.campo.provincia].filter(Boolean).join(', '), null],
    ['cultivo', 'Cultivo', (f) => f.campo.cultivo || '', null],
    ['ha', 'Ha', (f) => haDe(f.campo), (f) => num(haDe(f.campo), 1), true],
    ['ndvi', 'NDVI', (f) => f.ndvi?.ndvi ?? null, (f) => (f.ndvi?.ndvi == null ? '—' : `<span class="g-ndvi" style="--c:${NDVI.color(f.ndvi.ndvi)}">${num(f.ndvi.ndvi, 2)}</span>`), true],
    ['tend', 'Δ NDVI 30 d', (f) => f.ndvi?.tendencia ?? null, (f) => (f.ndvi?.tendencia == null ? '—' : (f.ndvi.tendencia > 0 ? '+' : '') + num(f.ndvi.tendencia, 2)), true],
    ['l7p', 'Lluvia 7 d', (f) => f.clima?.lluvia7p ?? null, (f) => num(f.clima?.lluvia7p, 0), true],
    ['l30p', 'Lluvia 30 d', (f) => f.clima?.lluvia30p ?? null, (f) => num(f.clima?.lluvia30p, 0), true],
    ['bal', 'Balance 30 d', (f) => f.clima?.balance30 ?? null, (f) => num(f.clima?.balance30, 0), true],
    ['p10', 'Prob. ≥10 mm 7 d', (f) => f.ens?.acum7.p10 ?? null, (f) => (f.ens ? Ensamble.pct(f.ens.acum7.p10) : '—'), true],
    ['l7f', 'Próx. 7 d', (f) => f.clima?.lluvia7f ?? null, (f) => num(f.clima?.lluvia7f, 0), true],
    ['tmin', 'Mín. 7 d', (f) => f.clima?.tmin7f ?? null, (f) => (f.clima ? num(f.clima.tmin7f, 0) + '°' + (f.clima.heladas7f ? ' ❄️' : '') : '—'), true],
    ['raf', 'Ráfaga 3 d', (f) => f.clima?.rafaga3f ?? null, (f) => num(f.clima?.rafaga3f, 0), true],
    ['agua', 'Agua útil', (f) => f.agua?.pct ?? null, (f) => (f.agua?.pct == null ? '—' : `<span class="g-ndvi" style="--c:${Agua.color(f.agua.pct)}">${num(f.agua.pct, 0)} %</span>`), true],
    ['proy', 'Agua en 7 d', (f) => f.agua?.proy7 ?? null, (f) => (f.agua?.proy7 == null ? '—' : num(f.agua.proy7, 0) + ' %'), true]
  ];
  function pintarTabla() {
    const col = COLUMNAS.find((c) => c[0] === orden.k);
    const lista = filas.slice().sort((a, b) => {
      const x = col[2](a); const y = col[2](b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === 'number' ? x - y : ordenar(x, y);
      return orden.asc ? r : -r;
    });
    const total = suma(filas.map((f) => haDe(f.campo)));
    $('#g-tabla').innerHTML = `<thead><tr>${COLUMNAS.map((c) => `<th class="${c[4] ? 'n' : ''}" data-orden="${c[0]}" role="button" tabindex="0">${c[1]}${orden.k === c[0] ? (orden.asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${lista.map((f) => `<tr class="${f.clima?.heladas7f ? 'helada' : ''}">${COLUMNAS.map((c) => `<td class="${c[4] ? 'n' : ''}">${c[3] ? c[3](f) : esc(c[2](f))}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Total</b></td><td></td><td></td><td class="n"><b>${num(total, 1)}</b></td>${'<td></td>'.repeat(COLUMNAS.length - 4)}</tr></tfoot>`;
  }

  // ---------- Mapas ----------
  function pintarMapas() {
    if (!window.L) return;
    const sat = () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' });
    const p = L.map('g-mapa-portada', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false });
    sat().addTo(p);
    const gp = L.featureGroup(filas.map((f) => L.geoJSON(f.campo.geometria, { style: { color: '#fff', weight: 1.5, fillColor: CULTIVO_COLOR[f.campo.cultivo] || '#ffc107', fillOpacity: 0.55 } }))).addTo(p);
    if (gp.getBounds().isValid()) p.fitBounds(gp.getBounds(), { padding: [16, 16] });

    mapa = L.map('g-mapa', { scrollWheelZoom: false });
    sat().addTo(mapa);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(mapa);
    const m = METRICAS[metrica];
    capa = L.featureGroup(filas.map((f) => {
      const v = m.v(f);
      const l = L.geoJSON(f.campo.geometria, { style: { color: '#ffffff', weight: 1.5, fillColor: m.color(v), fillOpacity: 0.8 } });
      l.bindTooltip(`<b>${esc(f.campo.nombre)}</b><br>${m.t}: ${num(v, m.d)}${m.u ? ' ' + m.u : ''}`, { sticky: true });
      l.on('click', () => window.open('reporte.html?id=' + encodeURIComponent(f.campo.id), '_blank', 'noopener'));
      // En zoom lejano los lotes son diminutos: un punto los hace visibles
      const [lat, lon] = KML.centro(f.campo.geometria);
      const punto = L.circleMarker([lat, lon], { radius: 5, color: '#fff', weight: 1, fillColor: m.color(v), fillOpacity: 1 });
      punto.bindTooltip(`<b>${esc(f.campo.nombre)}</b><br>${m.t}: ${num(v, m.d)}${m.u ? ' ' + m.u : ''}`);
      punto.on('click', () => mapa.flyTo([lat, lon], 14));
      return L.featureGroup([l, punto]);
    })).addTo(mapa);
    const ajustarPuntos = () => {
      const lejos = mapa.getZoom() < 11;
      capa.eachLayer((g) => g.eachLayer((x) => { if (x instanceof L.CircleMarker) x.setStyle({ opacity: lejos ? 1 : 0, fillOpacity: lejos ? 1 : 0 }); }));
    };
    mapa.on('zoomend', ajustarPuntos);
    if (capa.getBounds().isValid()) mapa.fitBounds(capa.getBounds(), { padding: [20, 20] });
    ajustarPuntos();
  }

  // ---------- Gráficos ----------
  function pintarGraficos(porProv, porCultivo, porCampana, conNdvi, conClima) {
    if (!window.Chart) return;
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--line');
    Chart.defaults.font.family = css('--body');
    const ejeX = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } };
    const ops = (extra = {}) => Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } }, extra);
    const barras = (id, datos, colores) => grafico(id, { type: 'bar', data: { labels: datos.map((x) => x[0]), datasets: [{ data: datos.map((x) => Math.round(x[1])), backgroundColor: colores, borderRadius: 8 }] },
      options: ops({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => ` ${num(t.parsed.x, 0)} ha` } } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'ha' } }, y: { grid: { display: false } } } }) });

    barras('g-prov', porProv, porProv.map((_, i) => PALETA[i % PALETA.length]));
    grafico('g-cultivo', { type: 'doughnut', data: { labels: porCultivo.map((x) => x[0]), datasets: [{ data: porCultivo.map((x) => Math.round(x[1])), backgroundColor: porCultivo.map((x, i) => CULTIVO_COLOR[x[0]] || ['#e9e2d0', '#7aa6c2', '#d95f7a'][i % 3]), borderWidth: 0 }] },
      options: ops({ cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (t) => ` ${t.label}: ${num(t.parsed, 0)} ha` } } } }) });
    barras('g-campana', porCampana, porCampana.map((_, i) => PALETA[(i + 3) % PALETA.length]));

    const rangos = [[-1, 0.2, 'Muy bajo (<0,2)', '#f46d43'], [0.2, 0.4, '0,2–0,4', '#fee08b'], [0.4, 0.6, '0,4–0,6', '#a6d96a'], [0.6, 0.8, '0,6–0,8', '#1a9850'], [0.8, 2, '≥ 0,8', '#006837']];
    if (conNdvi.length) {
      grafico('g-ndvi-dist', { type: 'bar', data: { labels: rangos.map((r) => r[2]), datasets: [{ data: rangos.map((r) => Math.round(suma(conNdvi.filter((f) => f.ndvi.ndvi >= r[0] && f.ndvi.ndvi < r[1]).map((f) => haDe(f.campo))))), backgroundColor: rangos.map((r) => r[3]), borderRadius: 8 }] },
        options: ops({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0 } }, y: { beginAtZero: true, title: { display: true, text: 'ha' } } } }) });
    } else $('#g-ndvi-dist').parentNode.innerHTML = '<p class="nota">Todavía no hay NDVI calculado.</p>';

    if (!conClima.length) {
      $('#g-lluvia-zona').parentNode.innerHTML = '<p class="nota">Sin datos de clima.</p>';
      $('#g-tmin').parentNode.innerHTML = '<p class="nota">Sin datos de clima.</p>';
      return;
    }
    // Lluvia por departamento
    const dep = {};
    conClima.forEach((f) => {
      const k = (f.campo.departamento || f.campo.localidad || 'Sin ubicar') + (f.campo.provincia ? ` (${f.campo.provincia.slice(0, 3)}.)` : '');
      const x = dep[k] || (dep[k] = { p: [], f: [] });
      x.p.push(f.clima.lluvia30p); x.f.push(f.clima.lluvia7f);
    });
    const deps = Object.entries(dep).map(([k, x]) => [k, suma(x.p) / x.p.length, suma(x.f) / x.f.length]).sort((a, b) => b[1] - a[1]);
    grafico('g-lluvia-zona', { type: 'bar', data: { labels: deps.map((d) => d[0]), datasets: [
      { label: 'Últimos 30 días', data: deps.map((d) => Math.round(d[1])), backgroundColor: '#3a8fd6', borderRadius: 6 },
      { label: 'Próximos 7 días', data: deps.map((d) => Math.round(d[2])), backgroundColor: '#e3c56a', borderRadius: 6 }
    ] }, options: ops({ scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 60, minRotation: 30 } }, y: { beginAtZero: true, title: { display: true, text: 'mm' } } } }) });

    // Mínimas por provincia (próximos 7 días)
    const d0 = conClima[0].clima.diario;
    const iHoy = d0.time.indexOf(hoy);
    const dias = d0.time.slice(iHoy, iHoy + 7);
    const provs = [...new Set(conClima.map((f) => f.campo.provincia || 'Sin ubicar'))].sort(ordenar);
    grafico('g-tmin', { type: 'line', data: { labels: dias.map(etqDia), datasets: [
      ...provs.map((p, i) => ({ label: p, data: dias.map((_, j) => Math.min(...conClima.filter((f) => (f.campo.provincia || 'Sin ubicar') === p).map((f) => f.clima.diario.tmin[iHoy + j]).filter(Number.isFinite))), borderColor: PALETA[i % PALETA.length], backgroundColor: PALETA[i % PALETA.length], tension: .3 })),
      { label: '0 °C', data: dias.map(() => 0), borderColor: '#8ab8f0', borderDash: [3, 3], pointRadius: 0, borderWidth: 1 }
    ] }, options: ops({ scales: { x: ejeX, y: { title: { display: true, text: '°C' } } } }) });
  }

  // ---------- Eventos ----------
  document.addEventListener('click', (e) => {
    const bm = e.target.closest('[data-metrica]');
    if (bm) { metrica = bm.dataset.metrica; dibujar(); document.getElementById('g-mapa')?.scrollIntoView({ block: 'center' }); return; }
    const th = e.target.closest('[data-orden]');
    if (th) { const k = th.dataset.orden; orden = { k, asc: orden.k === k ? !orden.asc : k === 'nombre' || k === 'zona' || k === 'cultivo' }; pintarTabla(); }
  });
  $('#btn-pdf').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => graficos.forEach((g) => g.resize()));
  $('#btn-csv').addEventListener('click', () => {
    if (!filas.length) return;
    const t = [['lote', 'provincia', 'departamento', 'localidad', 'cultivo', 'campana', 'ha', 'ndvi', 'ndvi_fecha', 'ndvi_cambio_30d', 'lluvia_7d_mm', 'lluvia_30d_mm', 'balance_30d_mm', 'lluvia_prox_7d_mm', 'prob_10mm_7d_pct', 'tmin_prox_7d_c', 'dias_helada_7d', 'rafaga_prox_3d_kmh', 'agua_util_pct', 'agua_util_mm', 'agua_util_max_mm', 'agua_util_7d_pct']];
    filas.forEach((f) => {
      const c = f.campo; const k = f.clima || {}; const n = f.ndvi || {};
      t.push([c.nombre, c.provincia, c.departamento, c.localidad, c.cultivo, c.campana, haDe(c), n.ndvi, n.fecha, n.tendencia, k.lluvia7p, k.lluvia30p, k.balance30, k.lluvia7f, f.ens ? Math.round(f.ens.acum7.p10 * 100) : null, k.tmin7f, k.heladas7f, k.rafaga3f, f.agua?.pct, f.agua?.agua, f.agua?.au, f.agua?.proy7]);
    });
    const texto = '﻿' + t.map((r) => r.map((v) => {
      if (v == null) return '';
      const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = `reporte_general_${hoy}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  iniciar().catch((e) => error(e.message || String(e)));
})();
