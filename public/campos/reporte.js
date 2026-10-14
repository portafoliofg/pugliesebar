// =====================================================
// REPORTE DE CAMPO
// Junta todo lo que se puede saber de un lote con fuentes gratuitas y sin clave:
//  - Open-Meteo pronóstico (últimos 92 días + próximos 16, diario y por hora, suelo)
//  - Open-Meteo archivo histórico ERA5 (últimos 13 meses y normales 1991–2020)
//  - Open-Meteo altitud
//  - ISRIC SoilGrids (textura, pH, carbono orgánico, nitrógeno, CIC, densidad)
// y arma indicadores, análisis escrito y gráficos. Se imprime o guarda como PDF.
// =====================================================
(function () {
  'use strict';

  const ZONA = 'America/Argentina/Buenos_Aires';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const signo = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v)));
  const suma = (a) => a.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  const prom = (a) => { const v = a.filter(Number.isFinite); return v.length ? suma(v) / v.length : null; };

  // ---------- Fechas (hora argentina) ----------
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
  const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const etqMes = (ym) => MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(2, 4);
  const etqDia = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const diasMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ahoraHora = (() => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
  })();

  // Temperatura base para grados-día según cultivo
  const BASE_GDD = { 'Maíz': 10, 'Soja': 10, 'Sorgo': 10, 'Girasol': 6, 'Trigo': 0, 'Cebada': 0 };

  // ---------- Tema ----------
  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function estado(t) { const e = $('#r-estado'); if (e) e.textContent = t; }
  function avisar(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.textContent = texto;
    $('#avisos').appendChild(a);
    setTimeout(() => a.remove(), 7000);
  }

  async function json(url, nombre) {
    // Copia local: pronóstico 30 min, histórico 12 h, altura y suelo 30 días (no cambian)
    const minutos = /elevation|soilgrids|start_date=1991-01-01/.test(url) ? 43200 : /archive-api|climate-api/.test(url) ? 720 : 30;
    try { return await Repo.web(url, minutos); }
    catch (e) { throw new Error(`${nombre}: ${e.message}`); }
  }

  // ---------- Descargas ----------
  function pedirPronostico(lat, lon) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: ZONA, past_days: '92', forecast_days: '16',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,et0_fao_evapotranspiration,shortwave_radiation_sum,sunshine_duration,uv_index_max',
      hourly: 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m,soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,soil_temperature_6cm'
    });
    return json('https://api.open-meteo.com/v1/forecast?' + p, 'Pronóstico');
  }
  function pedirArchivo(lat, lon, desde, hasta, diarias) {
    const p = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: ZONA, start_date: desde, end_date: hasta, daily: diarias });
    return json('https://archive-api.open-meteo.com/v1/archive?' + p, 'Histórico');
  }
  const pedirAltitud = (lat, lon) => json(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, 'Altitud');
  function pedirSuelo(lat, lon) {
    const p = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), value: 'mean' });
    ['clay', 'sand', 'silt', 'soc', 'phh2o', 'nitrogen', 'cec', 'bdod'].forEach((x) => p.append('property', x));
    ['0-5cm', '5-15cm', '15-30cm'].forEach((x) => p.append('depth', x));
    return json('https://rest.isric.org/soilgrids/v2.0/properties/query?' + p, 'Suelo');
  }

  // ---------- Geometría ----------
  function perimetroKm(g) {
    const R = 6371.0088;
    const anillos = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
    let total = 0;
    anillos.forEach((a) => {
      for (let i = 1; i < a.length; i++) {
        const [x1, y1] = a[i - 1].map((v) => v * Math.PI / 180);
        const [x2, y2] = a[i].map((v) => v * Math.PI / 180);
        const h = Math.sin((y2 - y1) / 2) ** 2 + Math.cos(y1) * Math.cos(y2) * Math.sin((x2 - x1) / 2) ** 2;
        total += 2 * R * Math.asin(Math.sqrt(h));
      }
    });
    return total;
  }

  // ---------- Suelo: clase textural USDA ----------
  function claseTextural(arena, limo, arcilla) {
    if (arena == null || limo == null || arcilla == null) return '—';
    if (arcilla >= 40 && limo < 40 && arena <= 45) return 'Arcilloso';
    if (arcilla >= 40 && limo >= 40) return 'Arcillo limoso';
    if (arcilla >= 35 && arena > 45) return 'Arcillo arenoso';
    if (arcilla >= 27 && arcilla < 40 && arena <= 20) return 'Franco arcillo limoso';
    if (arcilla >= 27 && arcilla < 40 && arena > 20 && arena <= 45) return 'Franco arcilloso';
    if (arcilla >= 20 && arcilla < 35 && limo < 28 && arena > 45) return 'Franco arcillo arenoso';
    if (limo >= 80 && arcilla < 12) return 'Limoso';
    if ((limo >= 50 && arcilla >= 12 && arcilla < 27) || (limo >= 50 && limo < 80 && arcilla < 12)) return 'Franco limoso';
    if (arcilla >= 7 && arcilla < 27 && limo >= 28 && limo < 50 && arena <= 52) return 'Franco';
    if (limo + 1.5 * arcilla < 15) return 'Arenoso';
    if (limo + 1.5 * arcilla >= 15 && limo + 2 * arcilla < 30) return 'Arenoso franco';
    return 'Franco arenoso';
  }

  function leerSuelo(r) {
    const capas = r?.properties?.layers || [];
    const out = {};
    capas.forEach((l) => {
      const f = l.unit_measure?.d_factor || 1;
      out[l.name] = (l.depths || []).map((d) => ({ prof: d.label, v: d.values?.mean == null ? null : d.values.mean / f }));
    });
    const sup = (k) => out[k]?.[0]?.v ?? null;
    const media = (k) => prom((out[k] || []).map((x) => x.v));
    if (!Object.keys(out).length || sup('clay') == null) return null;
    return {
      capas: out,
      arcilla: media('clay'), arena: media('sand'), limo: media('silt'),
      ph: sup('phh2o'), soc: sup('soc'), nitrogeno: sup('nitrogen'), cic: sup('cec'), densidad: sup('bdod'),
      mo: sup('soc') == null ? null : (sup('soc') * 1.724) / 10, // materia orgánica % (factor de van Bemmelen)
      clase: claseTextural(media('sand'), media('silt'), media('clay'))
    };
  }

  // ---------- Armado de series ----------
  function unirDiario(archivo, prono) {
    const dias = {};
    const cargar = (d, prioridad) => {
      if (!d?.time) return;
      d.time.forEach((t, i) => {
        if (prioridad === 'pron' && t > hoy) return;
        const fila = dias[t] || (dias[t] = { fecha: t });
        const poner = (k, v) => { if (fila[k] == null && v != null) fila[k] = v; };
        poner('lluvia', d.precipitation_sum?.[i]);
        poner('tmax', d.temperature_2m_max?.[i]);
        poner('tmin', d.temperature_2m_min?.[i]);
        poner('tmed', d.temperature_2m_mean?.[i]);
        poner('et0', d.et0_fao_evapotranspiration?.[i]);
        poner('rad', d.shortwave_radiation_sum?.[i]);
        poner('sol', d.sunshine_duration?.[i] == null ? null : d.sunshine_duration[i] / 3600);
        poner('viento', d.wind_speed_10m_max?.[i]);
      });
    };
    cargar(archivo, 'arch'); // el reanálisis ERA5 tiene prioridad
    cargar(prono, 'pron');   // los últimos días (que el archivo todavía no tiene) salen del pronóstico
    return Object.values(dias).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function normalesMensuales(n) {
    if (!n?.time) return null;
    const porAnioMes = {};
    n.time.forEach((t, i) => {
      const k = t.slice(0, 7);
      const x = porAnioMes[k] || (porAnioMes[k] = { lluvia: 0, temps: [], heladas: 0 });
      x.lluvia += n.precipitation_sum[i] || 0;
      if (n.temperature_2m_mean[i] != null) x.temps.push(n.temperature_2m_mean[i]);
      if (n.temperature_2m_min[i] != null && n.temperature_2m_min[i] <= 0) x.heladas++;
    });
    const meses = Array.from({ length: 12 }, () => ({ lluvia: [], temp: [], heladas: [] }));
    Object.entries(porAnioMes).forEach(([k, x]) => {
      const m = Number(k.slice(5, 7)) - 1;
      meses[m].lluvia.push(x.lluvia);
      meses[m].temp.push(prom(x.temps));
      meses[m].heladas.push(x.heladas);
    });
    return meses.map((m) => ({ lluvia: prom(m.lluvia), temp: prom(m.temp), heladas: prom(m.heladas) }));
  }
  // Lluvia normal de un día (promedio mensual repartido en los días del mes)
  const lluviaNormalDia = (normales, iso) => {
    const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7));
    return normales ? normales[m - 1].lluvia / diasMes(y, m) : null;
  };

  // ---------- Ventanas para pulverizar ----------
  function ventanasPulverizar(h, desde, hasta) {
    const v = [];
    let act = null;
    for (let i = desde; i < hasta; i++) {
      const ok = h.wind_speed_10m[i] >= 3 && h.wind_speed_10m[i] <= 15 && (h.wind_gusts_10m[i] ?? 0) <= 25 &&
        (h.precipitation[i] ?? 0) === 0 && (h.precipitation_probability[i] ?? 0) < 30 &&
        h.temperature_2m[i] >= 8 && h.temperature_2m[i] <= 30 && h.relative_humidity_2m[i] >= 45;
      if (ok && !act) act = { inicio: h.time[i], fin: h.time[i], horas: 1 };
      else if (ok) { act.fin = h.time[i]; act.horas++; }
      else if (act) { if (act.horas >= 2) v.push(act); act = null; }
    }
    if (act && act.horas >= 2) v.push(act);
    return v;
  }

  // ---------- Gráficos ----------
  const graficos = [];
  function grafico(id, config) {
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    graficos.push(new Chart(el, config));
  }
  function opciones(extra = {}) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
        tooltip: { backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: css('--ink'), borderColor: css('--line'), borderWidth: 1, padding: 10, cornerRadius: 10 } }
    }, extra);
  }
  const eje = (titulo, extra = {}) => Object.assign({ title: { display: !!titulo, text: titulo }, grid: { color: css('--line') } }, extra);
  const ejeX = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 18, maxTicksLimit: 10 } };

  // ---------- Principal ----------
  let modelo = null;

  async function iniciar() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return error('Falta indicar el campo.');
    if (!Repo.tieneToken()) return error('Tus campos son privados: abrí primero la pestaña Campos y conectá GitHub en este navegador.');

    estado('Leyendo el campo…');
    // Lo que solo depende del id se pide ya, junto con la lista de campos
    const aguaP = window.Agua ? Agua.cargar().then(async () => ({ x: Agua.de(id), serie: await Agua.serie(id), suelo: Agua.sueloDe(id),
      analisis: (await Agua.analisis().catch(() => [])).filter((a) => a.campo === id).sort((a, b) => b.fecha.localeCompare(a.fecha)),
      labores: (await Agua.labores().catch(() => [])).filter((l) => l.campos.includes(id)).sort((a, b) => b.fecha.localeCompare(a.fecha)) })).catch(() => null) : Promise.resolve(null);
    const ndviP = window.NDVI ? Promise.all([NDVI.cargarResumen(), NDVI.serie(id)]).then(async ([, serie]) => ({ x: NDVI.de(id), serie, img: await NDVI.imagen(id) })).catch(() => null) : Promise.resolve(null);
    let campo;
    try {
      const d = await Repo.leer();
      campo = (d.campos || []).find((x) => x.id === id);
    } catch (e) { return error(e.message); }
    if (!campo) return error('No se encontró el campo. Puede que lo hayan borrado.');
    document.title = `Reporte · ${campo.nombre}`;

    const [lat, lon] = KML.centro(campo.geometria);
    const fin = sumarDias(hoy, -6);
    estado('Descargando clima, suelo y datos históricos… (puede tardar unos segundos)');
    const [prono, anual, normales, alt, suelo, ndvi, agua, ens] = await Promise.allSettled([
      pedirPronostico(lat, lon),
      pedirArchivo(lat, lon, sumarDias(hoy, -400), fin, 'precipitation_sum,temperature_2m_max,temperature_2m_min,temperature_2m_mean,et0_fao_evapotranspiration,shortwave_radiation_sum,sunshine_duration,wind_speed_10m_max'),
      pedirArchivo(lat, lon, '1991-01-01', '2020-12-31', 'precipitation_sum,temperature_2m_mean,temperature_2m_min'),
      pedirAltitud(lat, lon),
      pedirSuelo(lat, lon),
      ndviP,
      aguaP,
      window.Ensamble ? Ensamble.cargar(lat, lon) : Promise.reject(new Error('sin módulo'))
    ]);
    if (prono.status !== 'fulfilled') return error('No se pudo descargar el clima del campo (Open-Meteo). Probá de nuevo en unos minutos.');

    modelo = {
      campo, lat, lon,
      prono: prono.value,
      anual: anual.status === 'fulfilled' ? anual.value.daily : null,
      normales: normales.status === 'fulfilled' ? normalesMensuales(normales.value.daily) : null,
      altitud: alt.status === 'fulfilled' ? alt.value.elevation?.[0] : null,
      suelo: suelo.status === 'fulfilled' ? leerSuelo(suelo.value) : null,
      ndvi: ndvi.status === 'fulfilled' ? ndvi.value : null,
      agua: agua.status === 'fulfilled' ? agua.value : null,
      ens: ens.status === 'fulfilled' ? ens.value : null,
      fallas: [anual, normales, alt, suelo].map((r, i) => (r.status === 'rejected' ? ['histórico anual', 'normales 1991–2020', 'altitud', 'suelo (SoilGrids)'][i] : null)).filter(Boolean)
    };
    modelo.diario = unirDiario(modelo.anual, modelo.prono.daily);
    // La lluvia de los últimos 92 días se reemplaza por la del balance: tu pluviómetro o el satélite CHIRPS
    const serieAgua = modelo.agua?.serie?.serie || [];
    const lluviaMejor = Object.fromEntries(serieAgua.filter((x) => x.fu === 'propia' || x.fu === 'satelite').map((x) => [x.f, x]));
    modelo.diario.forEach((x) => { const r = lluviaMejor[x.fecha]; if (r) { x.lluvia = r.p; x.fuente = r.fu; } });

    // Fecha de siembra: la guardada para este campo, o el inicio de la campaña (1 de julio)
    const clave = 'siembra:' + id;
    let siembra = campo.siembra || null;
    if (!siembra) try { siembra = localStorage.getItem(clave); } catch (e) {}
    if (!siembra) { const y = Number(hoy.slice(0, 4)); siembra = (Number(hoy.slice(5, 7)) >= 7 ? y : y - 1) + '-07-01'; }
    $('#siembra').value = siembra;
    $('#siembra').max = hoy;
    $('#siembra').addEventListener('change', (e) => {
      if (!e.target.value) return;
      try { localStorage.setItem(clave, e.target.value); } catch (err) {}
      dibujar(e.target.value);
      // Se guarda en el campo para que el balance de agua siga la etapa del cultivo
      if (Repo.tieneToken() && (!window.Equipo || Equipo.rol() === 'dueño')) {
        Repo.guardar((actual) => { const x = actual.campos.find((k) => k.id === id); if (x) x.siembra = e.target.value; return actual; }, `Campos: fecha de siembra de "${campo.nombre}"`)
          .then(() => avisar('Fecha de siembra guardada en el campo. El balance de agua se recalcula en unos minutos.'))
          .catch(() => avisar('La fecha quedó en este navegador, pero no se pudo guardar en el campo.', 'error'));
      }
    });
    dibujar(siembra);
    if (modelo.fallas.length) avisar('No se pudieron cargar: ' + modelo.fallas.join(', ') + '. El resto del reporte está completo.', 'error');
  }

  function error(t) {
    $('#reporte').innerHTML = `<div class="r-cargando"><div><p style="font-size:2.5rem">🌾</p><p>${esc(t)}</p><p><a class="link" href="./">Volver a Mis campos</a></p></div></div>`;
  }

  // ---------- Cálculos y dibujo ----------
  function dibujar(siembra) {
    while (graficos.length) graficos.pop().destroy();
    const m = modelo;
    const c = m.campo;
    const dd = m.prono.daily;
    const h = m.prono.hourly;
    const iHoyD = Math.max(0, dd.time.indexOf(hoy));
    const iAhora = Math.max(0, h.time.indexOf(ahoraHora));
    const pasado = m.diario.filter((x) => x.fecha < hoy);
    const desde = (n) => pasado.filter((x) => x.fecha >= sumarDias(hoy, -n));
    const ha = c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || KML.hectareas(c.geometria);
    const perim = perimetroKm(c.geometria);

    // Lluvias y balance
    const p7 = suma(desde(7).map((x) => x.lluvia));
    const p30 = suma(desde(30).map((x) => x.lluvia));
    const p90 = suma(desde(90).map((x) => x.lluvia));
    const et30 = suma(desde(30).map((x) => x.et0));
    const n30 = m.normales ? suma(desde(30).map((x) => lluviaNormalDia(m.normales, x.fecha))) : null;
    const anom30 = n30 ? ((p30 - n30) / n30) * 100 : null;
    const prox7 = suma(dd.precipitation_sum.slice(iHoyD, iHoyD + 7));
    const prox16 = suma(dd.precipitation_sum.slice(iHoyD));

    // Campaña desde la siembra
    const camp = pasado.filter((x) => x.fecha >= siembra);
    const pCamp = suma(camp.map((x) => x.lluvia));
    const nCamp = m.normales ? suma(camp.map((x) => lluviaNormalDia(m.normales, x.fecha))) : null;
    const base = BASE_GDD[c.cultivo] ?? 10;
    let gdd = 0;
    const gddSerie = camp.map((x) => { gdd += Math.max(0, ((x.tmax ?? 0) + (x.tmin ?? 0)) / 2 - base); return Math.round(gdd); });
    const datosDesde = pasado.length ? pasado[0].fecha : null;

    // Extremos
    const ult365 = desde(365);
    const heladas365 = ult365.filter((x) => x.tmin != null && x.tmin <= 0).length;
    const calor365 = ult365.filter((x) => x.tmax != null && x.tmax >= 35).length;
    let seca = 0, secaMax = 0;
    desde(90).forEach((x) => { if ((x.lluvia ?? 0) < 1) { seca++; secaMax = Math.max(secaMax, seca); } else seca = 0; });
    let secaActual = 0;
    for (let i = pasado.length - 1; i >= 0 && (pasado[i].lluvia ?? 0) < 1; i--) secaActual++;
    const heladasProx = dd.time.slice(iHoyD).map((f, k) => ({ f, min: dd.temperature_2m_min[iHoyD + k] })).filter((x) => x.min != null && x.min < 2);
    const vientoMaxProx = Math.max(...dd.wind_gusts_10m_max.slice(iHoyD, iHoyD + 7).filter(Number.isFinite));

    // Suelo (modelo)
    const hum = (k, i) => (h[k]?.[i] == null ? null : h[k][i] * 100);
    const humAhora = { s1: hum('soil_moisture_0_to_1cm', iAhora), s9: hum('soil_moisture_3_to_9cm', iAhora), s27: hum('soil_moisture_9_to_27cm', iAhora), s81: hum('soil_moisture_27_to_81cm', iAhora) };
    const humHace7 = hum('soil_moisture_9_to_27cm', Math.max(0, iAhora - 168));
    const ventanas = ventanasPulverizar(h, iAhora, Math.min(h.time.length, iAhora + 72));

    // Mensuales (últimos 13 meses)
    const porMes = {};
    pasado.forEach((x) => {
      const k = x.fecha.slice(0, 7);
      const z = porMes[k] || (porMes[k] = { lluvia: 0, et0: 0, rad: [], sol: [], heladas: 0, calor: 0, tmed: [] });
      z.lluvia += x.lluvia || 0; z.et0 += x.et0 || 0;
      if (x.rad != null) z.rad.push(x.rad); if (x.sol != null) z.sol.push(x.sol); if (x.tmed != null) z.tmed.push(x.tmed);
      if (x.tmin != null && x.tmin <= 0) z.heladas++;
      if (x.tmax != null && x.tmax >= 35) z.calor++;
    });
    const meses = Object.keys(porMes).sort().slice(-13);

    // ---------- Análisis escrito ----------
    const frases = [];
    if (n30 != null) frases.push(['🌧️', `En los últimos 30 días llovieron <b>${num(p30, 0)} mm</b>, ${Math.abs(anom30) < 10 ? 'en línea con' : anom30 > 0 ? `un <b>${num(anom30, 0)} % más</b> que` : `un <b>${num(-anom30, 0)} % menos</b> que`} lo normal para la época (${num(n30, 0)} mm, promedio 1991–2020).`]);
    else frases.push(['🌧️', `En los últimos 30 días llovieron <b>${num(p30, 0)} mm</b> (${num(p7, 0)} mm en la última semana).`]);
    frases.push([p30 - et30 >= 0 ? '💧' : '🔥', `Balance hídrico de 30 días: <b>${signo(p30 - et30, 0)} mm</b> (lluvia ${num(p30, 0)} mm − evapotranspiración ${num(et30, 0)} mm). ${p30 - et30 < -40 ? 'El cultivo está consumiendo más agua de la que entra.' : p30 - et30 > 40 ? 'Hubo excedentes de agua.' : 'Situación equilibrada.'}`]);
    if (nCamp != null && camp.length) frases.push(['📅', `Desde el ${etqDia(siembra)}/${siembra.slice(0, 4)} acumula <b>${num(pCamp, 0)} mm</b> contra ${num(nCamp, 0)} mm normales (${signo(pCamp - nCamp, 0)} mm).`]);
    if (humAhora.s27 != null && !(m.agua?.x?.pct != null)) frases.push(['🌱', `Humedad del suelo a 9–27 cm: <b>${num(humAhora.s27, 0)} %</b> en volumen${humHace7 != null ? `, ${humAhora.s27 - humHace7 > 1 ? 'en aumento' : humAhora.s27 - humHace7 < -1 ? 'en descenso' : 'estable'} respecto de hace una semana (${num(humHace7, 0)} %)` : ''}.`]);
    const E = m.ens;
    if (E) frases.push(['🎲', `Con 51 escenarios del modelo europeo: en los próximos 7 días lo más probable son <b>${num(E.acum7.q50, 0)} mm</b> (rango ${num(E.acum7.q10, 0)}–${num(E.acum7.q90, 0)} mm). Probabilidad de juntar 10 mm o más: <b>${Ensamble.pct(E.acum7.p10)}</b>; 25 mm o más: ${Ensamble.pct(E.acum7.p25)}.${E.dias.some((x) => x.helada2 >= 0.2) ? ` Helada (&lt; 2 °C): ${E.dias.filter((x) => x.helada2 >= 0.2).slice(0, 4).map((x) => `${etqDia(x.f)} ${Ensamble.pct(x.helada2)}`).join(', ')}.` : ''}`]);
    frases.push(['☔', `Próximos 7 días: <b>${num(prox7, 0)} mm</b> pronosticados (16 días: ${num(prox16, 0)} mm).${secaActual >= 7 ? ` Lleva <b>${secaActual} días seguidos</b> sin lluvias de 1 mm o más.` : ''}`]);
    // Si hay escenarios, la helada se informa con probabilidad (arriba); si no, con el pronóstico simple
    const ensHelada = E && E.dias.some((x) => x.helada2 >= 0.2);
    if (!E) {
      if (heladasProx.length) frases.push(['❄️', `Riesgo de helada en los próximos 16 días: ${heladasProx.slice(0, 5).map((x) => `${etqDia(x.f)} (${num(x.min, 0)} °C)`).join(', ')}.`]);
      else frases.push(['🌡️', 'Sin riesgo de heladas en los próximos 16 días.']);
    } else if (!ensHelada && !heladasProx.length) frases.push(['🌡️', 'Sin riesgo de heladas en los próximos 15 días (ningún escenario supera el 20 %).']);
    if (Number.isFinite(vientoMaxProx) && vientoMaxProx >= 50) frases.push(['💨', `Ojo con el viento: ráfagas de hasta <b>${num(vientoMaxProx, 0)} km/h</b> en la semana.`]);
    frases.push(['🚜', ventanas.length ? `Hay <b>${ventanas.length}</b> ${ventanas.length === 1 ? 'ventana' : 'ventanas'} para pulverizar en las próximas 72 h: ${ventanas.slice(0, 4).map((v) => `${etqDia(v.inicio.slice(0, 10))} ${v.inicio.slice(11, 16)} (${v.horas} h)`).join(', ')}.` : 'No hay ventanas aptas para pulverizar en las próximas 72 h.']);
    frases.push(['📈', `Grados-día acumulados desde la siembra (base ${base} °C${c.cultivo ? ', ' + esc(c.cultivo) : ''}): <b>${num(gdd, 0)} °C·día</b>.`]);
    const ag = m.agua?.x;
    if (ag?.pct != null) {
      const est = Agua.estado(ag.pct);
      frases.unshift(['💧', `Agua útil en el primer metro: <b>${num(ag.agua, 0)} de ${num(ag.au, 0)} mm (${num(ag.pct, 0)} %, ${est.nombre.toLowerCase()})</b>. Con el pronóstico quedaría en ${num(ag.proy7, 0)} % en 7 días y ${num(ag.proy16, 0)} % en 16.`]);
    }
    const fu = ag?.fuentes30 || {};
    if (fu.propia || fu.satelite) frases.push(['📡', `La lluvia de los últimos 30 días sale de ${fu.propia ? `<b>tu pluviómetro</b> (${fu.propia} días)` : ''}${fu.propia && fu.satelite ? ' y del ' : ''}${fu.satelite ? `<b>satélite CHIRPS</b> (${fu.satelite} días)` : ''}${fu.modelo ? `; los ${fu.modelo} días más recientes, del modelo hasta que se publique el dato satelital` : ''}.`]);
    const si = Agua.lecturaSuelo(m.agua?.suelo);
    if (si) frases.push(['🧪', `Suelo según la carta del INTA: <b>${esc(si.suelo)}</b>, textura ${esc(si.textura.toLowerCase())}, índice de productividad <b>${num(si.ip, 0)}</b> (${Agua.textoIP(si.ip)})${si.limitantes ? `, limitante ${esc(si.limitantes.toLowerCase())}` : ''}.`]);
    const anl = m.agua?.analisis?.[0];
    if (anl) frases.push(['🔬', `Último análisis de suelo (${etqDia(anl.fecha)}/${anl.fecha.slice(0, 4)}): ${[anl.ph != null ? `pH ${num(anl.ph, 1)}` : '', anl.mo != null ? `MO ${num(anl.mo, 1)} %` : '', anl.p != null ? `P ${num(anl.p, 0)} ppm` : '', anl.n != null ? `N-NO₃ ${num(anl.n, 0)} ppm` : ''].filter(Boolean).join(', ')}.`]);
    else if (m.suelo && !si) frases.push(['🧪', `Suelo (SoilGrids, 0–30 cm): textura <b>${esc(m.suelo.clase.toLowerCase())}</b>, pH ${num(m.suelo.ph, 1)} y materia orgánica estimada ${num(m.suelo.mo, 1)} % en superficie.`]);

    const ubic = [c.localidad, c.departamento, c.provincia].filter(Boolean).join(', ');
    const generado = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const kpi = (titulo, valor, detalle, color) => `<div class="r-kpi" style="--c:${color}"><small>${titulo}</small><b>${valor}</b><span>${detalle}</span></div>`;

    const s = m.suelo;
    $('#reporte').innerHTML = `
      <section class="r-portada">
        <div class="r-portada-txt">
          <span class="eyebrow">Reporte del campo · ${esc(generado)}</span>
          <h1>${esc(c.nombre)}</h1>
          <p>${ubic ? '📍 ' + esc(ubic) : ''}</p>
          <div class="r-chips">
            <span>${num(ha, 1)} ha</span>
            <span>${esc(c.cultivo || 'Sin cultivo')}</span>
            ${c.campana ? `<span>Campaña ${esc(c.campana)}</span>` : ''}
            ${m.altitud != null ? `<span>${num(m.altitud, 0)} m s. n. m.</span>` : ''}
          </div>
        </div>
        <div id="r-mapa" aria-label="Mapa satelital del campo"></div>
      </section>

      <section class="r-kpis">
        ${kpi('Lluvia 30 días', num(p30, 0) + ' mm', anom30 != null ? `<span class="${anom30 >= 0 ? 'sube' : 'baja'}">${signo(anom30, 0)} %</span> vs. normal` : `${num(p7, 0)} mm en 7 días`, css('--lluvia'))}
        ${kpi('Balance hídrico 30 d', signo(p30 - et30, 0) + ' mm', `ET0 ${num(et30, 0)} mm`, p30 - et30 >= 0 ? css('--sube') : css('--baja'))}
        ${kpi('Desde la siembra', num(pCamp, 0) + ' mm', nCamp != null ? `normal ${num(nCamp, 0)} mm` : etqDia(siembra), css('--lima'))}
        ${kpi('Próximos 7 días', num(prox7, 0) + ' mm', `16 días: ${num(prox16, 0)} mm`, css('--dorado'))}
        ${kpi('Humedad suelo 9–27 cm', num(humAhora.s27, 0) + ' %', 'volumétrica (modelo)', css('--naranja'))}
        ${kpi('Grados-día', num(gdd, 0), `base ${base} °C desde ${etqDia(siembra)}`, '#c8962e')}
        ${(() => { const mx = dd.temperature_2m_max.slice(iHoyD, iHoyD + 7).filter(Number.isFinite); const tope = mx.length ? Math.max(...mx) : null; const c35 = mx.filter((v) => v >= 35).length;
          return kpi('Máxima próximos 7 días', tope != null ? num(tope, 0) + ' °C' : '—', `${c35 ? c35 + ' ' + (c35 === 1 ? 'día' : 'días') + ' de 35 °C o más' : 'sin calor extremo'} · ${num(calor365, 0)} en 12 meses`, '#e8833a'); })()}
        ${kpi('Heladas (12 meses)', num(heladas365, 0) + ' días', `${heladasProx.length ? heladasProx.length + ' con riesgo próximos' : 'sin riesgo próximo'}`, css('--frio'))}
        ${kpi('Días sin lluvia', num(secaActual, 0), `racha máx. 90 d: ${secaMax}`, '#9c8b74')}
      </section>

      <section class="r-card r-analisis"><h3>Análisis</h3><ul>${frases.map(([i, t]) => `<li><i>${i}</i><span>${t}</span></li>`).join('')}</ul></section>

      <section class="r-sec"><h2>Lluvias</h2>
        <p class="nota">Datos de reanálisis ERA5 (Open-Meteo); los últimos días, del modelo de pronóstico. Promedios de referencia 1991–2020.</p>
        <div class="r-grid">
          <div class="r-card"><h3>Lluvia mensual vs. normal</h3><p class="nota">Últimos 13 meses (el último, parcial).</p><div class="r-graf"><canvas id="g-lluvia-mes"></canvas></div></div>
          <div class="r-card"><h3>Acumulada desde la siembra</h3><p class="nota">Comparada con lo normal para las mismas fechas.</p><div class="r-graf"><canvas id="g-acum"></canvas></div></div>
          <div class="r-card r-ancho"><h3>Lluvia diaria · últimos 92 días y próximos 16</h3><div class="r-graf"><canvas id="g-lluvia-dia"></canvas></div></div>
          <div class="r-card"><h3>Balance hídrico mensual</h3><p class="nota">Lluvia − evapotranspiración de referencia (ET0).</p><div class="r-graf"><canvas id="g-balance"></canvas></div></div>
          <div class="r-card"><h3>Anomalía de lluvia</h3><p class="nota">Diferencia con el promedio de cada mes.</p><div class="r-graf"><canvas id="g-anomalia"></canvas></div></div>
        </div>
      </section>

      <section class="r-sec"><h2>Temperaturas</h2>
        <div class="r-grid">
          <div class="r-card r-ancho"><h3>Máximas y mínimas · últimos 92 días y pronóstico</h3><p class="nota">La parte punteada es pronóstico. Línea celeste: 0 °C.</p><div class="r-graf alto"><canvas id="g-temp"></canvas></div></div>
          <div class="r-card"><h3>Heladas y días de calor por mes</h3><p class="nota">Heladas: mínima ≤ 0 °C. Calor: máxima ≥ 35 °C.</p><div class="r-graf"><canvas id="g-extremos"></canvas></div></div>
          <div class="r-card"><h3>Grados-día acumulados</h3><p class="nota">Base ${base} °C${c.cultivo ? ' (' + esc(c.cultivo) + ')' : ''}, desde la fecha de siembra.</p><div class="r-graf"><canvas id="g-gdd"></canvas></div></div>
          <div class="r-card"><h3>Temperatura media mensual vs. normal</h3><div class="r-graf"><canvas id="g-tmed"></canvas></div></div>
          <div class="r-card"><h3>Radiación solar y heliofanía</h3><p class="nota">Radiación diaria promedio (MJ/m²) y horas de sol por día.</p><div class="r-graf"><canvas id="g-rad"></canvas></div></div>
        </div>
      </section>

      <section class="r-sec"><h2>Suelo</h2>
        <div class="r-grid">
          ${aguaHTML(m.agua)}
          ${sueloIntaHTML(m.agua)}
          <div class="r-card r-ancho"><h3>Humedad del modelo por profundidad (referencia)</h3><p class="nota">Humedad volumétrica estimada por Open-Meteo (%), sin conocer tu suelo ni tus lluvias. Temperatura del suelo a 6 cm: ${num(h.soil_temperature_6cm?.[iAhora], 1)} °C.</p><div class="r-graf"><canvas id="g-humedad"></canvas></div></div>
          <div class="r-card"><h3>Propiedades estimadas (SoilGrids)</h3>
            ${s ? `<div class="r-suelo"><div class="r-graf"><canvas id="g-textura"></canvas></div>
              <div class="r-datos">
                <div><small>Textura</small><b>${esc(s.clase)}</b></div><div><small>pH (agua)</small><b>${num(s.ph, 1)}</b></div>
                <div><small>Materia orgánica</small><b>${num(s.mo, 1)} %</b></div><div><small>Carbono orgánico</small><b>${num(s.soc, 1)} g/kg</b></div>
                <div><small>Nitrógeno total</small><b>${num(s.nitrogeno, 2)} g/kg</b></div><div><small>CIC</small><b>${num(s.cic, 1)} cmol/kg</b></div>
                <div><small>Densidad aparente</small><b>${num(s.densidad, 2)} g/cm³</b></div>
              </div></div>
              <p class="nota" style="margin-top:8px">Fuente: ISRIC SoilGrids (estimación global a 250 m, 0–30 cm). Para decisiones de fertilización, usá un análisis de suelo.</p>`
              : '<p class="nota">No se pudieron obtener las propiedades del suelo (SoilGrids no respondió).</p>'}
          </div>
        </div>
      </section>

      <section class="r-sec"><h2>Viento</h2>
        <div class="r-grid">
          <div class="r-card"><h3>Rosa de los vientos · últimos 30 días</h3><p class="nota">Frecuencia de cada dirección (% de las horas).</p><div class="r-graf rosa"><canvas id="g-rosa"></canvas></div></div>
          <div class="r-card"><h3>Viento máximo y ráfagas</h3><p class="nota">Últimos 30 días y próximos 16 (km/h).</p><div class="r-graf rosa"><canvas id="g-viento"></canvas></div></div>
        </div>
      </section>

      <section class="r-sec"><h2>Pronóstico</h2>
        <div class="r-grid">
          ${m.ens ? `<div class="r-card r-ancho"><h3>Escenarios de lluvia · 15 días</h3><p class="nota">Pronóstico por conjuntos ECMWF (51 escenarios). Barras: rango entre el escenario 10 % más seco y el 10 % más lluvioso; línea: el valor más probable; punteada: probabilidad de 10 mm o más en el día. Más allá de una semana, mirá la probabilidad más que los milímetros.</p>
            <div class="r-datos" style="margin-bottom:10px">
              <div><small>7 días · probable</small><b>${num(m.ens.acum7.q50, 0)} mm</b></div><div><small>7 días · rango</small><b>${num(m.ens.acum7.q10, 0)}–${num(m.ens.acum7.q90, 0)} mm</b></div>
              <div><small>Prob. ≥ 10 mm (7 d)</small><b>${Ensamble.pct(m.ens.acum7.p10)}</b></div><div><small>Prob. ≥ 25 mm (7 d)</small><b>${Ensamble.pct(m.ens.acum7.p25)}</b></div>
              <div><small>14 días · probable</small><b>${num(m.ens.acum14.q50, 0)} mm</b></div><div><small>Semana seca (&lt; 5 mm)</small><b>${Ensamble.pct(m.ens.acum7.seco)}</b></div>
            </div><div class="r-graf"><canvas id="g-ens"></canvas></div></div>` : ''}
          <div class="r-card r-ancho"><h3>Próximas 48 horas</h3><div class="r-graf"><canvas id="g-48"></canvas></div></div>
          <div class="r-card r-ancho"><h3>Próximos 16 días</h3><div class="r-tabla-wrap"><table class="r-tabla">
            <thead><tr><th>Día</th><th class="n">Máx.</th><th class="n">Mín.</th><th class="n">Lluvia</th><th class="n">Prob.</th><th class="n">Viento / ráfaga</th><th class="n">ET0</th><th class="n">UV</th></tr></thead>
            <tbody>${dd.time.slice(iHoyD).map((f, k) => { const i = iHoyD + k; const hel = dd.temperature_2m_min[i] != null && dd.temperature_2m_min[i] < 2; return `<tr class="${hel ? 'helada' : ''}">
              <td><b>${k === 0 ? 'Hoy' : new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'))}</b></td>
              <td class="n">${num(dd.temperature_2m_max[i], 0)}°</td><td class="n">${num(dd.temperature_2m_min[i], 0)}°${hel ? ' ❄️' : ''}</td>
              <td class="n">${num(dd.precipitation_sum[i], 1)} mm</td><td class="n">${num(dd.precipitation_probability_max[i], 0)} %</td>
              <td class="n">${num(dd.wind_speed_10m_max[i], 0)} / ${num(dd.wind_gusts_10m_max[i], 0)} km/h</td><td class="n">${num(dd.et0_fao_evapotranspiration[i], 1)}</td><td class="n">${num(dd.uv_index_max[i], 0)}</td></tr>`; }).join('')}</tbody>
          </table></div></div>
        </div>
      </section>

      ${ndviHTML(m.ndvi)}

      ${laboresHTML(m.agua?.labores || [])}

      <section class="r-sec"><h2>Datos del lote</h2>
        <div class="r-card"><div class="r-datos">
          <div><small>Superficie del mapa</small><b>${num(c.ha, 2)} ha</b></div>
          ${c.haDeclaradas != null && c.haDeclaradas !== '' ? `<div><small>Declarada</small><b>${num(c.haDeclaradas, 2)} ha</b></div>` : ''}
          <div><small>Perímetro</small><b>${num(perim, 2)} km</b></div>
          <div><small>Centro</small><b style="font-size:.95rem">${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}</b></div>
          <div><small>Altitud</small><b>${m.altitud != null ? num(m.altitud, 0) + ' m' : '—'}</b></div>
          <div><small>Cultivo</small><b>${esc(c.cultivo || '—')}</b></div>
          <div><small>Campaña</small><b>${esc(c.campana || '—')}</b></div>
          <div><small>Fecha de siembra (reporte)</small><b>${etqDia(siembra)}/${siembra.slice(0, 4)}</b></div>
          <div><small>Archivo</small><b style="font-size:.9rem">${esc(c.archivoOriginal || c.archivo || '—')}</b></div>
        </div>${c.notas ? `<p class="nota" style="margin-top:10px">📝 ${esc(c.notas)}</p>` : ''}</div>
      </section>

      <footer class="r-pie">Fuentes: tu pluviómetro, CHIRPS v3 (UCSB), Open-Meteo (pronóstico y reanálisis ERA5 de Copernicus/ECMWF), Carta de Suelos INTA 1:500.000, ISRIC SoilGrids, Sentinel-2, imágenes satelitales de Esri. Datos con histórico disponible desde ${datosDesde ? etqDia(datosDesde) + '/' + datosDesde.slice(0, 4) : '—'}. Los valores son estimaciones de modelos: usalos como referencia junto con las observaciones a campo.</footer>`;

    // ---------- Mapa ----------
    if (window.L) {
      const mapa = L.map('r-mapa', { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' }).addTo(mapa);
      const capa = L.geoJSON(c.geometria, { style: { color: '#ffffff', weight: 3, fillColor: '#ffc107', fillOpacity: 0.25 } }).addTo(mapa);
      mapa.fitBounds(capa.getBounds(), { padding: [20, 20], maxZoom: 16 });
      if (m.ndvi?.img) {
        const mapaN = L.map('r-mapa-ndvi', { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri · Sentinel-2' }).addTo(mapaN);
        L.imageOverlay(m.ndvi.img.url, m.ndvi.img.bounds).addTo(mapaN);
        L.geoJSON(c.geometria, { style: { color: '#ffffff', weight: 2, fill: false } }).addTo(mapaN);
        mapaN.fitBounds(m.ndvi.img.bounds, { padding: [10, 10], maxZoom: 17 });
      }
    }

    // ---------- Gráficos ----------
    if (!window.Chart) return;
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--line');
    Chart.defaults.font.family = css('--body');
    const azul = css('--lluvia') || '#3a8fd6', lima = css('--lima'), dorado = css('--dorado'), naranja = css('--naranja'), frio = css('--frio'), rojo = css('--baja'), verde = css('--sube');

    // Agua útil
    const sa = m.agua?.serie;
    if (sa?.serie?.length) {
      const todo = sa.serie.concat(sa.proy || []);
      const corte = sa.serie.length;
      grafico('g-agua', { data: { labels: todo.map((x) => etqDia(x.f)), datasets: [
        { type: 'line', label: 'Agua útil (%)', data: todo.map((x) => x.pct), borderColor: '#2e8b57', backgroundColor: '#2e8b5722', fill: true, tension: .3, pointRadius: 0, yAxisID: 'y',
          segment: { borderDash: (ctx) => (ctx.p0DataIndex >= corte - 1 ? [6, 4] : undefined) } },
        { type: 'bar', label: 'Lluvia (mm)', data: todo.map((x) => x.p || null), backgroundColor: todo.map((x) => Agua.COLOR_FUENTE[x.fu]), yAxisID: 'y1' },
        { type: 'line', label: 'Consumo del cultivo (mm/día)', data: todo.map((x) => x.eta), borderColor: naranja, borderWidth: 1.5, pointRadius: 0, tension: .3, yAxisID: 'y1' }
      ] }, options: opciones({ scales: { x: ejeX, y: eje('% del agua útil', { min: 0, max: 100 }), y1: eje('mm', { position: 'right', beginAtZero: true, grid: { display: false } }) } }) });
    }

    // NDVI
    const sn = m.ndvi?.serie?.serie || [];
    if (sn.length) {
      grafico('g-ndvi', { type: 'line', data: { labels: sn.map((p) => etqDia(p.fecha)), datasets: [
        { label: 'NDVI promedio', data: sn.map((p) => p.ndvi), borderColor: '#1a9850', backgroundColor: '#1a985026', fill: true, tension: .3, pointRadius: 3, pointBackgroundColor: sn.map((p) => NDVI.color(p.ndvi)) },
        { label: 'Zona más baja (p10)', data: sn.map((p) => p.p10), borderColor: '#f46d43', borderDash: [5, 4], pointRadius: 0, tension: .3 },
        { label: 'Zona más alta (p90)', data: sn.map((p) => p.p90), borderColor: '#006837', borderDash: [5, 4], pointRadius: 0, tension: .3 }
      ] }, options: opciones({ scales: { x: ejeX, y: eje('NDVI', { min: 0, max: 1 }) } }) });
    }

    // Lluvia mensual vs normal
    grafico('g-lluvia-mes', { data: { labels: meses.map(etqMes), datasets: [
      { type: 'bar', label: 'Lluvia (mm)', data: meses.map((k) => Math.round(porMes[k].lluvia)), backgroundColor: azul, borderRadius: 6 },
      ...(m.normales ? [{ type: 'line', label: 'Normal 1991–2020', data: meses.map((k) => Math.round(m.normales[Number(k.slice(5, 7)) - 1].lluvia)), borderColor: naranja, backgroundColor: naranja, tension: .3, pointRadius: 3 }] : [])
    ] }, options: opciones({ scales: { x: ejeX, y: eje('mm', { beginAtZero: true }) } }) });

    // Acumulada desde la siembra
    let a = 0, an = 0;
    grafico('g-acum', { type: 'line', data: { labels: camp.map((x) => etqDia(x.fecha)), datasets: [
      { label: 'Acumulada', data: camp.map((x) => Math.round((a += x.lluvia || 0))), borderColor: azul, backgroundColor: azul + '33', fill: true, pointRadius: 0, tension: .2 },
      ...(m.normales ? [{ label: 'Normal', data: camp.map((x) => Math.round((an += lluviaNormalDia(m.normales, x.fecha)))), borderColor: naranja, borderDash: [6, 4], pointRadius: 0, tension: .2 }] : [])
    ] }, options: opciones({ scales: { x: ejeX, y: eje('mm', { beginAtZero: true }) } }) });

    // Lluvia diaria pasada + pronóstico
    const fechasDia = dd.time;
    grafico('g-lluvia-dia', { type: 'bar', data: { labels: fechasDia.map(etqDia), datasets: [
      { label: 'Registrada', data: fechasDia.map((f, i) => (f < hoy ? dd.precipitation_sum[i] : null)), backgroundColor: azul, borderRadius: 3 },
      { label: 'Pronóstico', data: fechasDia.map((f, i) => (f >= hoy ? dd.precipitation_sum[i] : null)), backgroundColor: dorado, borderRadius: 3 }
    ] }, options: opciones({ scales: { x: Object.assign({ stacked: true }, ejeX), y: eje('mm', { beginAtZero: true, stacked: true }) } }) });

    // Balance hídrico mensual
    const bal = meses.map((k) => Math.round(porMes[k].lluvia - porMes[k].et0));
    grafico('g-balance', { type: 'bar', data: { labels: meses.map(etqMes), datasets: [
      { label: 'Lluvia − ET0 (mm)', data: bal, backgroundColor: bal.map((v) => (v >= 0 ? verde : rojo)), borderRadius: 6 }
    ] }, options: opciones({ plugins: { legend: { display: false } }, scales: { x: ejeX, y: eje('mm') } }) });

    // Anomalía mensual
    if (m.normales) {
      const an2 = meses.map((k) => Math.round(porMes[k].lluvia - m.normales[Number(k.slice(5, 7)) - 1].lluvia));
      grafico('g-anomalia', { type: 'bar', data: { labels: meses.map(etqMes), datasets: [
        { label: 'Diferencia con lo normal (mm)', data: an2, backgroundColor: an2.map((v) => (v >= 0 ? azul : naranja)), borderRadius: 6 }
      ] }, options: opciones({ plugins: { legend: { display: false } }, scales: { x: ejeX, y: eje('mm') } }) });
    } else $('#g-anomalia').parentNode.innerHTML = '<p class="nota">Sin normales disponibles.</p>';

    // Temperaturas con pronóstico punteado
    const iCorte = dd.time.indexOf(hoy);
    const punteado = { borderDash: (ctx) => (ctx.p0DataIndex >= iCorte ? [6, 4] : undefined) };
    grafico('g-temp', { type: 'line', data: { labels: dd.time.map(etqDia), datasets: [
      { label: 'Máxima', data: dd.temperature_2m_max, borderColor: naranja, backgroundColor: naranja + '22', pointRadius: 0, tension: .3, segment: punteado, fill: '+1' },
      { label: 'Mínima', data: dd.temperature_2m_min, borderColor: frio, backgroundColor: frio, pointRadius: 0, tension: .3, segment: punteado },
      { label: '0 °C', data: dd.time.map(() => 0), borderColor: '#8ab8f0', borderWidth: 1, borderDash: [2, 3], pointRadius: 0 }
    ] }, options: opciones({ scales: { x: ejeX, y: eje('°C') } }) });

    // Extremos por mes
    grafico('g-extremos', { type: 'bar', data: { labels: meses.map(etqMes), datasets: [
      { label: 'Heladas', data: meses.map((k) => porMes[k].heladas), backgroundColor: frio, borderRadius: 4 },
      { label: 'Días ≥ 35 °C', data: meses.map((k) => porMes[k].calor), backgroundColor: rojo, borderRadius: 4 },
      ...(m.normales ? [{ type: 'line', label: 'Heladas normales', data: meses.map((k) => Math.round(m.normales[Number(k.slice(5, 7)) - 1].heladas * 10) / 10), borderColor: '#8ab8f0', borderDash: [5, 4], pointRadius: 2 }] : [])
    ] }, options: opciones({ scales: { x: ejeX, y: eje('días', { beginAtZero: true }) } }) });

    // Grados-día
    grafico('g-gdd', { type: 'line', data: { labels: camp.map((x) => etqDia(x.fecha)), datasets: [
      { label: 'Grados-día acumulados', data: gddSerie, borderColor: '#c8962e', backgroundColor: '#c8962e33', fill: true, pointRadius: 0, tension: .2 }
    ] }, options: opciones({ plugins: { legend: { display: false } }, scales: { x: ejeX, y: eje('°C·día', { beginAtZero: true }) } }) });

    // Temperatura media vs normal
    grafico('g-tmed', { type: 'line', data: { labels: meses.map(etqMes), datasets: [
      { label: 'Media del mes', data: meses.map((k) => { const v = prom(porMes[k].tmed); return v == null ? null : Math.round(v * 10) / 10; }), borderColor: naranja, backgroundColor: naranja, tension: .3 },
      ...(m.normales ? [{ label: 'Normal', data: meses.map((k) => Math.round(m.normales[Number(k.slice(5, 7)) - 1].temp * 10) / 10), borderColor: css('--muted'), borderDash: [5, 4], tension: .3, pointRadius: 2 }] : [])
    ] }, options: opciones({ scales: { x: ejeX, y: eje('°C') } }) });

    // Radiación
    grafico('g-rad', { data: { labels: meses.map(etqMes), datasets: [
      { type: 'bar', label: 'Radiación (MJ/m²·día)', data: meses.map((k) => { const v = prom(porMes[k].rad); return v == null ? null : Math.round(v * 10) / 10; }), backgroundColor: dorado, borderRadius: 6, yAxisID: 'y' },
      { type: 'line', label: 'Horas de sol por día', data: meses.map((k) => { const v = prom(porMes[k].sol); return v == null ? null : Math.round(v * 10) / 10; }), borderColor: naranja, backgroundColor: naranja, tension: .3, yAxisID: 'y1' }
    ] }, options: opciones({ scales: { x: ejeX, y: eje('MJ/m²', { beginAtZero: true }), y1: eje('horas', { position: 'right', beginAtZero: true, grid: { display: false } }) } }) });

    // Humedad del suelo (cada 6 h)
    const pasos = [];
    for (let i = 0; i < h.time.length; i += 6) pasos.push(i);
    const serieH = (k) => pasos.map((i) => (h[k]?.[i] == null ? null : Math.round(h[k][i] * 1000) / 10));
    const corteH = pasos.findIndex((i) => h.time[i] >= ahoraHora);
    const punteadoH = { borderDash: (ctx) => (corteH >= 0 && ctx.p0DataIndex >= corteH ? [6, 4] : undefined) };
    grafico('g-humedad', { type: 'line', data: { labels: pasos.map((i) => etqDia(h.time[i].slice(0, 10))), datasets: [
      { label: '0–1 cm', data: serieH('soil_moisture_0_to_1cm'), borderColor: naranja, pointRadius: 0, tension: .3, segment: punteadoH },
      { label: '3–9 cm', data: serieH('soil_moisture_3_to_9cm'), borderColor: lima, pointRadius: 0, tension: .3, segment: punteadoH },
      { label: '9–27 cm', data: serieH('soil_moisture_9_to_27cm'), borderColor: azul, pointRadius: 0, tension: .3, segment: punteadoH },
      { label: '27–81 cm', data: serieH('soil_moisture_27_to_81cm'), borderColor: '#5a3a12', pointRadius: 0, tension: .3, segment: punteadoH }
    ] }, options: opciones({ scales: { x: ejeX, y: eje('% vol.') } }) });

    // Textura del suelo
    if (s) grafico('g-textura', { type: 'doughnut', data: { labels: ['Arena', 'Limo', 'Arcilla'], datasets: [
      { data: [s.arena, s.limo, s.arcilla].map((v) => Math.round(v)), backgroundColor: [dorado, '#c8962e', '#8b5e34'], borderWidth: 0 }
    ] }, options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (x) => ` ${x.label}: ${x.parsed} %` } } } } });

    // Rosa de los vientos (últimas 720 horas)
    const sectores = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    const cuenta = new Array(16).fill(0);
    let totalH = 0;
    for (let i = Math.max(0, iAhora - 720); i < iAhora; i++) {
      const dir = h.wind_direction_10m[i];
      if (dir == null || (h.wind_speed_10m[i] ?? 0) < 1) continue;
      cuenta[Math.round(dir / 22.5) % 16]++; totalH++;
    }
    grafico('g-rosa', { type: 'polarArea', data: { labels: sectores, datasets: [
      { data: cuenta.map((x) => (totalH ? Math.round((x / totalH) * 1000) / 10 : 0)), backgroundColor: sectores.map((_, i) => [lima, dorado, naranja, azul][i % 4] + 'b3'), borderWidth: 1 }
    ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => ` ${x.label}: ${x.parsed.r} %` } } },
      scales: { r: { ticks: { backdropColor: 'transparent', callback: (v) => v + ' %' }, grid: { color: css('--line') }, pointLabels: { display: true, centerPointLabels: true, font: { weight: 700 } } } } } });

    // Viento diario
    const v0 = Math.max(0, iHoyD - 30);
    grafico('g-viento', { data: { labels: dd.time.slice(v0).map(etqDia), datasets: [
      { type: 'bar', label: 'Viento máximo', data: dd.wind_speed_10m_max.slice(v0), backgroundColor: dd.time.slice(v0).map((f) => (f >= hoy ? dorado : lima)), borderRadius: 3 },
      { type: 'line', label: 'Ráfagas', data: dd.wind_gusts_10m_max.slice(v0), borderColor: rojo, pointRadius: 0, tension: .3 }
    ] }, options: opciones({ scales: { x: ejeX, y: eje('km/h', { beginAtZero: true }) } }) });

    // Escenarios
    if (m.ens) {
      grafico('g-ens', { data: { labels: m.ens.dias.map((x) => etqDia(x.f)), datasets: [
        { type: 'bar', label: 'Rango 10–90 % (mm)', data: m.ens.dias.map((x) => [x.q10, x.q90]), backgroundColor: azul + '55', borderColor: azul, borderWidth: 1, yAxisID: 'y' },
        { type: 'line', label: 'Más probable (mm)', data: m.ens.dias.map((x) => x.q50), borderColor: azul, backgroundColor: azul, pointRadius: 2, tension: .3, yAxisID: 'y' },
        { type: 'line', label: 'Prob. ≥ 10 mm (%)', data: m.ens.dias.map((x) => Math.round(x.p10 * 100)), borderColor: naranja, borderDash: [4, 3], pointRadius: 0, tension: .3, yAxisID: 'y1' },
        { type: 'line', label: 'Prob. helada (%)', data: m.ens.dias.map((x) => Math.round(x.helada2 * 100)), borderColor: frio, borderDash: [2, 3], pointRadius: 0, tension: .3, yAxisID: 'y1' }
      ] }, options: opciones({ scales: { x: ejeX, y: eje('mm', { beginAtZero: true }), y1: eje('%', { position: 'right', min: 0, max: 100, grid: { display: false } }) } }) });
    }

    // 48 horas
    const f48 = Math.min(h.time.length, iAhora + 48);
    grafico('g-48', { data: { labels: h.time.slice(iAhora, f48).map((t) => (t.slice(11, 13) === '00' ? etqDia(t.slice(0, 10)) : t.slice(11, 16))), datasets: [
      { type: 'line', label: 'Temperatura (°C)', data: h.temperature_2m.slice(iAhora, f48), borderColor: naranja, backgroundColor: naranja, pointRadius: 0, tension: .35, yAxisID: 'y' },
      { type: 'line', label: 'Humedad (%)', data: h.relative_humidity_2m.slice(iAhora, f48), borderColor: frio, borderDash: [4, 3], pointRadius: 0, tension: .35, yAxisID: 'y1' },
      { type: 'line', label: 'Viento (km/h)', data: h.wind_speed_10m.slice(iAhora, f48), borderColor: lima, pointRadius: 0, tension: .35, yAxisID: 'y' },
      { type: 'bar', label: 'Lluvia (mm)', data: h.precipitation.slice(iAhora, f48), backgroundColor: azul, yAxisID: 'y2' }
    ] }, options: opciones({ scales: { x: ejeX, y: eje('°C · km/h'), y1: eje('%', { position: 'right', min: 0, max: 100, grid: { display: false } }), y2: { display: false, beginAtZero: true, suggestedMax: 10 } } }) });

    modelo.csv = { siembra };
  }

  // Cuaderno de campo del lote
  function laboresHTML(l) {
    if (!l.length) return '';
    const det = (x) => [x.cultivo, x.variedad, x.producto, x.dosis != null ? `${num(x.dosis, x.dosis % 1 ? 2 : 0)} ${x.unidad || ''}` : '', x.rinde != null ? `${num(x.rinde, 1)} qq/ha` : '', x.costo != null ? `US$ ${num(x.costo, 0)}/ha` : ''].filter(Boolean).join(' · ');
    const cos = l.filter((x) => x.tipo === 'Cosecha' && x.rinde != null);
    return `<section class="r-sec"><h2>Labores</h2>
      ${cos.length ? `<p class="nota">Último rinde cosechado: <b>${num(cos[0].rinde, 1)} qq/ha</b>${cos[0].cultivo ? ' de ' + esc(cos[0].cultivo.toLowerCase()) : ''} (${etqDia(cos[0].fecha)}/${cos[0].fecha.slice(0, 4)}).</p>` : ''}
      <div class="r-card"><div class="r-tabla-wrap"><table class="r-tabla"><thead><tr><th>Fecha</th><th>Labor</th><th>Detalle</th><th class="n">Superficie</th><th>Contratista</th><th>Notas</th></tr></thead><tbody>
        ${l.map((x) => `<tr><td>${etqDia(x.fecha)}/${x.fecha.slice(0, 4)}</td><td><b>${esc(x.tipo)}</b></td><td>${esc(det(x))}</td><td class="n">${x.superficie ? num(x.superficie, 0) + ' ha' : '—'}</td><td>${esc(x.contratista || '')}</td><td>${esc(x.nota || '')}${x.cargadoPor ? `<br><small class="nota">cargó ${esc(x.cargadoPor)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div></section>`;
  }

  // Tarjetas de agua útil y suelo INTA
  function aguaHTML(a) {
    const x = a?.x;
    if (!x || x.pct == null) return '<div class="r-card r-ancho"><h3>Agua útil del suelo</h3><p class="nota">Todavía no hay balance de agua para este lote: se calcula todos los días a la mañana.</p></div>';
    const e = Agua.estado(x.pct);
    return `<div class="r-card r-ancho"><h3>Agua útil del suelo · primer metro</h3>
      <p class="nota">Balance diario: lluvia (${Object.keys(x.fuentes30 || {}).map((k) => Agua.FUENTES[k]).join(', ')}) menos el consumo del cultivo (ET0 × coeficiente según cultivo y etapa), sobre el agua que retiene el suelo según el INTA. La línea punteada es la proyección con el pronóstico. Colores de las barras: <span style="color:${Agua.COLOR_FUENTE.propia}">■</span> pluviómetro, <span style="color:${Agua.COLOR_FUENTE.satelite}">■</span> satélite, <span style="color:${Agua.COLOR_FUENTE.modelo}">■</span> modelo, <span style="color:${Agua.COLOR_FUENTE.pronostico}">■</span> pronóstico.</p>
      <div class="r-datos" style="margin-bottom:10px">
        <div style="border-left:4px solid ${e.color}"><small>Hoy</small><b>${num(x.pct, 0)} % · ${esc(e.nombre)}</b></div>
        <div><small>Agua disponible</small><b>${num(x.agua, 0)} / ${num(x.au, 0)} mm</b></div>
        <div><small>En 7 días</small><b>${num(x.proy7, 0)} %</b></div><div><small>En 16 días</small><b>${num(x.proy16, 0)} %</b></div>
        <div><small>Etapa / Kc</small><b>${esc(x.etapa || '—')} · ${num(x.kc, 2)}</b></div>
      </div>
      <div class="r-graf alto"><canvas id="g-agua"></canvas></div></div>`;
  }
  function sueloIntaHTML(a) {
    const si = Agua.lecturaSuelo(a?.suelo);
    const an = a?.analisis || [];
    return `<div class="r-card"><h3>Suelo según el INTA</h3>${si ? `<div class="r-datos">
        <div><small>Índice de productividad</small><b>${num(si.ip, 0)} (${Agua.textoIP(si.ip)})</b></div>
        <div><small>Suelo dominante</small><b style="font-size:.95rem">${esc(si.suelo)}</b></div>
        <div><small>Textura sup. / sub.</small><b style="font-size:.95rem">${esc(si.textura)}</b></div>
        <div><small>Drenaje</small><b style="font-size:.95rem">${esc(si.drenaje || '—')}</b></div>
        <div><small>Profundidad</small><b>${num(si.profundidad, 0)} cm</b></div>
        <div><small>Alcalinidad</small><b style="font-size:.95rem">${esc(si.alcalinidad || '—')}</b></div>
        <div><small>Limitantes</small><b style="font-size:.95rem">${esc(si.limitantes || 'Ninguna')}</b></div>
        <div><small>Erosión / anegamiento</small><b style="font-size:.95rem">${esc([si.erosion, si.anegamiento].filter(Boolean).join(' · ') || 'No')}</b></div>
        <div><small>Agua útil máx. (1 m)</small><b>${num(a.suelo.au, 0)} mm</b></div>
      </div>${si.otros ? `<p class="nota" style="margin-top:8px">También en la unidad: ${esc(si.otros)}.</p>` : ''}
      <p class="nota" style="margin-top:8px">Carta de Suelos de la República Argentina 1:500.000 (INTA), unidad ${esc(si.unidad)}. Es una escala regional: el lote puede tener manchones distintos.</p>`
      : '<p class="nota">Sin dato del INTA para este lote todavía.</p>'}
      ${an.length ? `<h3 style="margin-top:14px">Tus análisis de laboratorio</h3><div class="r-tabla-wrap"><table class="r-tabla"><thead><tr><th>Fecha</th><th>Prof.</th><th class="n">pH</th><th class="n">MO %</th><th class="n">P</th><th class="n">N-NO₃</th><th class="n">S</th><th class="n">CE</th></tr></thead><tbody>
        ${an.map((x) => `<tr><td>${etqDia(x.fecha)}/${x.fecha.slice(0, 4)}</td><td>${esc(x.prof || '')}</td><td class="n">${num(x.ph, 1)}</td><td class="n">${num(x.mo, 2)}</td><td class="n">${num(x.p, 1)}</td><td class="n">${num(x.n, 1)}</td><td class="n">${num(x.s, 1)}</td><td class="n">${num(x.ce, 2)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="nota" style="margin-top:8px">Podés cargar tus análisis de laboratorio desde la ficha del campo (🧪 Suelo).</p>'}</div>`;
  }

  // Sección NDVI (vigor satelital)
  function ndviHTML(n) {
    if (!n?.x || n.x.ndvi == null) {
      return `<section class="r-sec"><h2>Vigor del cultivo (NDVI)</h2><div class="r-card"><p class="nota">Todavía no hay datos satelitales para este lote. El NDVI se calcula todos los días con imágenes Sentinel-2 (cada ~5 días, si no hay nubes).</p></div></section>`;
    }
    const x = n.x; const cl = x.clases || [];
    const sn = n.serie?.serie || [];
    const max = sn.length ? sn.reduce((a, b) => (b.ndvi > a.ndvi ? b : a)) : null;
    return `<section class="r-sec"><h2>Vigor del cultivo (NDVI)</h2>
      <p class="nota">Índice de vegetación del satélite Sentinel-2 (10 m por píxel). 0 = suelo desnudo, 1 = vegetación muy densa.</p>
      <div class="r-kpis">
        <div class="r-kpi" style="--c:${NDVI.color(x.ndvi)}"><small>NDVI actual</small><b>${num(x.ndvi, 2)}</b><span>Imagen del ${etqDia(x.fecha)}</span></div>
        <div class="r-kpi" style="--c:${x.tendencia == null ? '#9aa3a8' : x.tendencia >= 0 ? css('--sube') : css('--baja')}"><small>Cambio en 30 días</small><b>${x.tendencia == null ? '—' : signo(x.tendencia, 2)}</b><span>${x.tendencia == null ? 'Sin dato anterior' : x.tendencia >= 0.03 ? 'Creciendo' : x.tendencia <= -0.03 ? 'En baja' : 'Estable'}</span></div>
        <div class="r-kpi" style="--c:#fee08b"><small>Uniformidad</small><b>${x.cv == null ? '—' : num((1 - Math.min(1, x.cv)) * 100, 0) + ' %'}</b><span>Rango ${num(x.p10, 2)}–${num(x.p90, 2)}</span></div>
        ${max ? `<div class="r-kpi" style="--c:#1a9850"><small>Máximo de la serie</small><b>${num(max.ndvi, 2)}</b><span>${etqDia(max.fecha)}</span></div>` : ''}
      </div>
      <div class="r-card r-analisis"><ul><li><i>🛰️</i><span>${esc(NDVI.lectura(x.ndvi))}.${cl.length === 3 ? ` El ${num(cl[2] * 100, 0)} % del lote tiene vigor alto (≥ 0,6), el ${num(cl[1] * 100, 0)} % medio y el ${num(cl[0] * 100, 0)} % bajo (&lt; 0,3).` : ''}</span></li></ul></div>
      <div class="r-grid">
        <div class="r-card"><h3>Mapa de vigor</h3><p class="nota">${n.img ? 'Imagen del ' + etqDia(n.img.fecha) + '. Verde: más vigor; rojo: menos.' : 'Sin imagen disponible.'}</p>${n.img ? `<div id="r-mapa-ndvi" style="height:280px;border-radius:14px"></div>${NDVI.leyendaHTML()}` : ''}</div>
        <div class="r-card"><h3>Evolución del NDVI</h3><p class="nota">Cada punto es una pasada del satélite sin nubes.</p><div class="r-graf rosa"><canvas id="g-ndvi"></canvas></div></div>
      </div>
    </section>`;
  }

  // ---------- Exportar ----------
  $('#btn-pdf').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => graficos.forEach((g) => g.resize()));
  window.addEventListener('afterprint', () => graficos.forEach((g) => g.resize()));
  $('#btn-csv').addEventListener('click', () => {
    if (!modelo) return;
    const dd = modelo.prono.daily;
    const filas = [['fecha', 'tipo', 'lluvia_mm', 'tmax_c', 'tmin_c', 'tmedia_c', 'et0_mm', 'radiacion_mj_m2', 'horas_sol', 'viento_max_kmh']];
    modelo.diario.forEach((x) => filas.push([x.fecha, 'registrado', x.lluvia, x.tmax, x.tmin, x.tmed, x.et0, x.rad, x.sol == null ? '' : Math.round(x.sol * 10) / 10, x.viento]));
    dd.time.forEach((f, i) => { if (f >= hoy) filas.push([f, 'pronóstico', dd.precipitation_sum[i], dd.temperature_2m_max[i], dd.temperature_2m_min[i], dd.temperature_2m_mean[i], dd.et0_fao_evapotranspiration[i], dd.shortwave_radiation_sum[i], dd.sunshine_duration[i] == null ? '' : Math.round(dd.sunshine_duration[i] / 360) / 10, dd.wind_speed_10m_max[i]]); });
    const texto = '﻿' + filas.map((r) => r.map((v) => (v == null ? '' : String(v).replace('.', ','))).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = `clima_${modelo.campo.nombre.replace(/[^\p{L}\p{N}]+/gu, '_')}_${hoy}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  iniciar().catch((e) => error(e.message || String(e)));
})();
