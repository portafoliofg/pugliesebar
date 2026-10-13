// Pronóstico detallado de un campo con Open-Meteo (gratis, sin clave).
// Pestañas: Resumen · 48 horas · 16 días · Escenarios (probabilidades con 51 escenarios de ECMWF).
// Incluye ventanas para pulverizar y balance hídrico (lluvia − evapotranspiración).
(function () {
  'use strict';

  const ZONA = 'America/Argentina/Buenos_Aires';
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cache = new Map();
  const graficos = [];

  const EMOJI = (w) => w == null ? '·' : w === 0 ? '☀️' : w <= 2 ? '⛅' : w === 3 ? '☁️' : w <= 48 ? '🌫️' : w <= 57 ? '🌦️' : w <= 67 ? '🌧️' : w <= 77 ? '❄️' : w <= 82 ? '🌦️' : w <= 86 ? '🌨️' : '⛈️';
  const DESC = (w) => w == null ? '' : w === 0 ? 'Despejado' : w <= 2 ? 'Algo nublado' : w === 3 ? 'Nublado' : w <= 48 ? 'Niebla' : w <= 57 ? 'Llovizna' : w <= 67 ? 'Lluvia' : w <= 77 ? 'Nieve' : w <= 82 ? 'Chaparrones' : w <= 86 ? 'Nevadas' : 'Tormenta';
  const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const rumbo = (g) => (g == null ? '' : PUNTOS[Math.round(g / 45) % 8]);
  const flecha = (g) => (g == null ? '' : `<span class="flecha-viento" style="transform:rotate(${(g + 180) % 360}deg)" title="Viento del ${rumbo(g)}">↑</span>`);

  const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
  const ahoraISOHora = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
  };
  const diaCorto = (f) => new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace('.', '');

  async function cargar(lat, lon) {
    const k = lat.toFixed(3) + ',' + lon.toFixed(3);
    if (cache.has(k)) return cache.get(k);
    const p = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: ZONA, past_days: '30', forecast_days: '16',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,et0_fao_evapotranspiration,sunrise,sunset,uv_index_max',
      hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,soil_temperature_6cm,soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm'
    });
    const url = 'https://api.open-meteo.com/v1/forecast?' + p;
    const [d, ens] = await Promise.all([
      (window.Repo ? Repo.web(url, 30) : fetch(url).then((r) => r.json())).catch((e) => { throw new Error('Open-Meteo respondió ' + e.message); }),
      window.Ensamble ? Ensamble.cargar(lat, lon).catch(() => null) : Promise.resolve(null)
    ]);
    d.ens = ens;
    cache.set(k, d);
    return d;
  }

  // Horas aptas para pulverizar: viento 3–15 km/h, sin lluvia, prob. < 30 %, 8–30 °C y humedad > 45 %
  function ventanasPulverizar(h, desde, hasta) {
    const ventanas = [];
    let actual = null;
    for (let i = desde; i < hasta; i++) {
      const ok = h.wind_speed_10m[i] >= 3 && h.wind_speed_10m[i] <= 15 && (h.wind_gusts_10m[i] ?? 0) <= 25 &&
        (h.precipitation[i] ?? 0) === 0 && (h.precipitation_probability[i] ?? 0) < 30 &&
        h.temperature_2m[i] >= 8 && h.temperature_2m[i] <= 30 && h.relative_humidity_2m[i] >= 45;
      if (ok && !actual) actual = { inicio: h.time[i], fin: h.time[i], horas: 1 };
      else if (ok) { actual.fin = h.time[i]; actual.horas++; }
      else if (actual) { if (actual.horas >= 2) ventanas.push(actual); actual = null; }
    }
    if (actual && actual.horas >= 2) ventanas.push(actual);
    return ventanas;
  }

  function limpiarGraficos() { while (graficos.length) { try { graficos.pop().destroy(); } catch (e) {} } }

  function color(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function grafico(canvas, config) {
    if (!window.Chart || !canvas) return;
    Chart.defaults.color = color('--muted');
    Chart.defaults.borderColor = color('--line');
    Chart.defaults.font.family = color('--body');
    graficos.push(new Chart(canvas, config));
  }

  /** Dibuja el pronóstico en el contenedor. `pestana`: resumen | horas | dias | suelo. */
  function render(cont, d, pestana = 'resumen') {
    limpiarGraficos();
    const dd = d.daily;
    const h = d.hourly;
    const iHoy = Math.max(0, dd.time.indexOf(hoyISO()));
    const iAhora = Math.max(0, h.time.indexOf(ahoraISOHora()));
    const suma = (arr, a, b) => arr.slice(Math.max(0, a), b).reduce((s, x) => s + (x || 0), 0);

    const lluvia7 = suma(dd.precipitation_sum, iHoy - 7, iHoy);
    const lluvia30 = suma(dd.precipitation_sum, iHoy - 30, iHoy);
    const et030 = suma(dd.et0_fao_evapotranspiration, iHoy - 30, iHoy);
    const prox7 = suma(dd.precipitation_sum, iHoy, iHoy + 7);
    const prox16 = suma(dd.precipitation_sum, iHoy, dd.time.length);
    const heladas = dd.time.map((f, i) => ({ f, min: dd.temperature_2m_min[i] })).slice(iHoy).filter((x) => x.min != null && x.min < 2);
    const ventanas = ventanasPulverizar(h, iAhora, Math.min(h.time.length, iAhora + 72));

    const tabs = [['resumen', 'Resumen'], ['horas', '48 horas'], ['dias', '16 días'], ['escenarios', 'Escenarios']];
    if (pestana === 'suelo') pestana = 'escenarios';
    const ens = d.ens;
    const P = (x) => (window.Ensamble ? Ensamble.pct(x) : '—');
    const heladasEns = ens ? ens.dias.filter((x) => x.helada2 >= 0.2) : [];
    let cuerpo = '';

    if (pestana === 'resumen') {
      const valores = dd.precipitation_sum.slice(Math.max(0, iHoy - 30));
      const max = Math.max(5, ...valores.map((x) => x || 0));
      const ancho = 100 / valores.length;
      const corte = Math.min(30, iHoy);
      const barras = valores.map((v, k) => {
        const alto = ((v || 0) / max) * 70;
        return `<rect class="${k < corte ? 'pasado' : 'futuro'}" x="${(k * ancho + ancho * 0.15).toFixed(2)}" y="${(76 - alto).toFixed(2)}" width="${(ancho * 0.7).toFixed(2)}" height="${alto.toFixed(2)}" rx="0.8"><title>${dd.time[Math.max(0, iHoy - 30) + k]}: ${num(v, 1)} mm</title></rect>`;
      }).join('');
      const balance = lluvia30 - et030;
      cuerpo = `
        ${ens && heladasEns.length ? `<div class="alerta" role="alert">❄️ Probabilidad de helada (&lt; 2 °C): ${heladasEns.slice(0, 6).map((x) => `${diaCorto(x.f)} ${P(x.helada2)}`).join(', ')}</div>`
          : heladas.length ? `<div class="alerta" role="alert">❄️ Posible helada: ${heladas.slice(0, 6).map((x) => `${diaCorto(x.f)} (${num(x.min, 0)}°)`).join(', ')}</div>` : ''}
        <div class="lluvias">
          <div><small>Últimos 7 días</small><b>${num(lluvia7, 1)} mm</b></div>
          <div><small>Últimos 30 días</small><b>${num(lluvia30, 1)} mm</b></div>
          <div><small>Próximos 7 días</small><b>${num(prox7, 1)} mm</b>${ens ? `<small title="Entre el 10 % y el 90 % de los 51 escenarios">rango ${num(ens.acum7.q10, 0)}–${num(ens.acum7.q90, 0)} mm</small>` : ''}</div>
        </div>
        ${ens ? `<div class="prob-lluvia"><span>Probabilidad de lluvia en 7 días:</span><b>≥ 10 mm ${P(ens.acum7.p10)}</b><b>≥ 25 mm ${P(ens.acum7.p25)}</b><b>≥ 50 mm ${P(ens.acum7.p50)}</b></div>` : ''}
        <div class="lluvias">
          <div><small>Próximos 16 días</small><b>${num(prox16, 1)} mm</b></div>
          <div><small>Evapotransp. 30 días</small><b style="color:var(--naranja-tx)">${num(et030, 0)} mm</b></div>
          <div title="Lluvia de los últimos 30 días menos la evapotranspiración de referencia (ET0)"><small>Balance hídrico</small><b style="color:${balance >= 0 ? 'var(--sube)' : 'var(--baja)'}">${balance >= 0 ? '+' : '−'}${num(Math.abs(balance), 0)} mm</b></div>
        </div>
        <svg class="barras" viewBox="0 0 100 80" preserveAspectRatio="none" role="img" aria-label="Lluvia diaria">${barras}
          <line class="hoy" x1="${(corte * ancho).toFixed(2)}" x2="${(corte * ancho).toFixed(2)}" y1="0" y2="78" vector-effect="non-scaling-stroke"/></svg>
        <div class="leyenda-barras"><span><i style="background:var(--lluvia)"></i>Lluvia registrada (30 días)</span><span><i style="background:var(--dorado)"></i>Pronóstico (16 días)</span></div>
        <div class="seccion-t">Ventanas para pulverizar (próximas 72 h)</div>
        ${ventanas.length
          ? `<div class="ventanas">${ventanas.slice(0, 8).map((v) => `<span class="chip ok">${diaCorto(v.inicio.slice(0, 10))} ${v.inicio.slice(11, 16)}–${String((Number(v.fin.slice(11, 13)) + 1) % 24).padStart(2, '0')}:00 · ${v.horas} h</span>`).join('')}</div>`
          : '<p class="nota">No hay ventanas de 2 h o más con condiciones aptas.</p>'}
        <p class="nota">Criterio: viento 3–15 km/h, ráfagas ≤ 25 km/h, sin lluvia, probabilidad &lt; 30 %, 8–30 °C y humedad ≥ 45 %. Es orientativo.</p>`;
    }

    if (pestana === 'horas') {
      const fin = Math.min(h.time.length, iAhora + 48);
      const filas = [];
      for (let i = iAhora; i < fin; i += 3) {
        filas.push(`<tr><td>${diaCorto(h.time[i].slice(0, 10))} ${h.time[i].slice(11, 16)}</td><td class="em">${EMOJI(h.weather_code[i])}</td>
          <td class="n"><b>${num(h.temperature_2m[i], 0)}°</b></td><td class="n lluvia-tx">${num(h.precipitation[i], 1)}</td><td class="n">${num(h.precipitation_probability[i], 0)} %</td>
          <td class="n">${flecha(h.wind_direction_10m[i])} ${num(h.wind_speed_10m[i], 0)} / ${num(h.wind_gusts_10m[i], 0)}</td><td class="n">${num(h.relative_humidity_2m[i], 0)} %</td></tr>`);
      }
      cuerpo = `<div class="grafico-campo"><canvas id="g-horas" aria-label="Temperatura y lluvia por hora"></canvas></div>
        <p class="nota">Cada 3 horas. *Viento / ráfaga en km/h; lluvia en mm.</p><div class="tabla-scroll"><table class="tabla-clima"><thead><tr><th>Hora</th><th></th><th>Temp.</th><th>Lluvia</th><th>Prob.</th><th>Viento*</th><th>Hum.</th></tr></thead><tbody>${filas.join('')}</tbody></table></div>`;
    }

    if (pestana === 'dias') {
      cuerpo = `<div class="tabla-scroll"><table class="tabla-clima"><thead><tr><th>Día</th><th></th><th>Temp.</th><th>Lluvia</th><th>Viento*</th><th>ET0</th><th>UV</th></tr></thead><tbody>
        ${dd.time.slice(iHoy).map((f, k) => {
          const i = iHoy + k;
          const helada = dd.temperature_2m_min[i] != null && dd.temperature_2m_min[i] < 2;
          return `<tr class="${helada ? 'fila-helada' : ''}"><td><b>${k === 0 ? 'Hoy' : diaCorto(f)}</b><br><small>${esc(DESC(dd.weather_code[i]))}</small></td><td class="em">${EMOJI(dd.weather_code[i])}</td>
            <td class="n"><b>${num(dd.temperature_2m_max[i], 0)}°</b> / ${num(dd.temperature_2m_min[i], 0)}°${helada ? ' ❄️' : ''}</td>
            <td class="n lluvia-tx">${num(dd.precipitation_sum[i], 1)} mm<br><small>${num(dd.precipitation_probability_max[i], 0)} %</small></td>
            <td class="n">${flecha(dd.wind_direction_10m_dominant[i])} ${num(dd.wind_speed_10m_max[i], 0)} / ${num(dd.wind_gusts_10m_max[i], 0)}</td>
            <td class="n">${num(dd.et0_fao_evapotranspiration[i], 1)}</td><td class="n">${num(dd.uv_index_max[i], 0)}</td></tr>`;
        }).join('')}</tbody></table></div>
        <div class="grafico-campo"><canvas id="g-dias" aria-label="Temperaturas y lluvia de 16 días"></canvas></div>
        <p class="nota">*Viento máximo / ráfaga en km/h. ET0: evapotranspiración de referencia (mm/día). Más allá de 7 días el pronóstico es menos preciso.</p>`;
    }

    if (pestana === 'escenarios') {
      cuerpo = !ens ? '<p class="nota">No se pudo cargar el pronóstico por escenarios.</p>' : `
        <div class="lluvias">
          <div><small>Lluvia 7 días · probable</small><b>${num(ens.acum7.q50, 0)} mm</b><small>rango ${num(ens.acum7.q10, 0)}–${num(ens.acum7.q90, 0)}</small></div>
          <div><small>Lluvia 14 días · probable</small><b>${num(ens.acum14.q50, 0)} mm</b><small>rango ${num(ens.acum14.q10, 0)}–${num(ens.acum14.q90, 0)}</small></div>
          <div><small>Semana seca (&lt; 5 mm)</small><b>${P(ens.acum7.seco)}</b></div>
        </div>
        <div class="grafico-campo"><canvas id="g-ens" aria-label="Rango de lluvia por día"></canvas></div>
        <div class="tabla-scroll"><table class="tabla-clima"><thead><tr><th>Día</th><th>Lluvia ≥ 1</th><th>≥ 10 mm</th><th>≥ 25 mm</th><th>Rango (mm)</th><th>Helada</th></tr></thead><tbody>
          ${ens.dias.map((x, k) => `<tr class="${x.helada2 >= 0.3 ? 'fila-helada' : ''}"><td><b>${k === 0 ? 'Hoy' : diaCorto(x.f)}</b></td><td class="n">${P(x.p1)}</td><td class="n lluvia-tx">${P(x.p10)}</td><td class="n">${P(x.p25)}</td>
            <td class="n">${num(x.q10, 0)}–${num(x.q90, 0)}</td><td class="n">${x.helada2 > 0 ? P(x.helada2) + (x.helada0 > 0 ? ` <small>(≤0°: ${P(x.helada0)})</small>` : '') : '—'}</td></tr>`).join('')}</tbody></table></div>
        <p class="nota">${esc(ens.modelo)}: cada día se corre el pronóstico ${ens.escenarios} veces con pequeñas diferencias. La probabilidad es el porcentaje de escenarios en que pasa; el rango va del escenario 10 % más seco al 10 % más lluvioso. Helada: mínima &lt; 2 °C.</p>`;
    }

    cont.innerHTML = `<div class="tabs-clima" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-pclima="${k}" aria-selected="${k === pestana}">${t}</button>`).join('')}</div>
      <div class="clima-cuerpo">${cuerpo}</div>
      <p class="nota">Fuente: Open-Meteo${ens ? ' (pronóstico y escenarios ECMWF)' : ''}, para el centro del campo.</p>`;

    const lluviaC = color('--lluvia') || '#3a8fd6';
    const naranja = color('--naranja') || '#ff9800';
    const lima = color('--lima') || '#a4c639';
    const frio = color('--frio') || '#2f6db5';
    const ejes = (izq, der) => ({
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { position: 'left', title: { display: true, text: izq }, grid: { color: color('--line') } },
      ...(der ? { y1: { position: 'right', title: { display: true, text: der }, grid: { display: false }, beginAtZero: true } } : {})
    });
    const opc = (izq, der) => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } }, scales: ejes(izq, der) });

    if (pestana === 'horas') {
      const fin = Math.min(h.time.length, iAhora + 48);
      const et = h.time.slice(iAhora, fin).map((t) => t.slice(11, 13) === '00' ? diaCorto(t.slice(0, 10)) : t.slice(11, 16));
      grafico(cont.querySelector('#g-horas'), {
        data: { labels: et, datasets: [
          { type: 'line', label: 'Temperatura °C', data: h.temperature_2m.slice(iAhora, fin), borderColor: naranja, backgroundColor: naranja, pointRadius: 0, tension: .35, yAxisID: 'y' },
          { type: 'bar', label: 'Lluvia mm', data: h.precipitation.slice(iAhora, fin), backgroundColor: lluviaC, yAxisID: 'y1' }
        ] }, options: opc('°C', 'mm')
      });
    }
    if (pestana === 'dias') {
      const sl = (a) => a.slice(iHoy);
      grafico(cont.querySelector('#g-dias'), {
        data: { labels: sl(dd.time).map(diaCorto), datasets: [
          { type: 'line', label: 'Máxima', data: sl(dd.temperature_2m_max), borderColor: naranja, backgroundColor: naranja, pointRadius: 2, tension: .3, yAxisID: 'y' },
          { type: 'line', label: 'Mínima', data: sl(dd.temperature_2m_min), borderColor: frio, backgroundColor: frio, pointRadius: 2, tension: .3, yAxisID: 'y' },
          { type: 'bar', label: 'Lluvia mm', data: sl(dd.precipitation_sum), backgroundColor: lluviaC, yAxisID: 'y1' }
        ] }, options: opc('°C', 'mm')
      });
    }
    if (pestana === 'escenarios' && ens) {
      grafico(cont.querySelector('#g-ens'), {
        data: { labels: ens.dias.map((x) => diaCorto(x.f)), datasets: [
          { type: 'bar', label: 'Rango 10–90 % (mm)', data: ens.dias.map((x) => [x.q10, x.q90]), backgroundColor: lluviaC + '55', borderColor: lluviaC, borderWidth: 1, yAxisID: 'y' },
          { type: 'line', label: 'Mediana (mm)', data: ens.dias.map((x) => x.q50), borderColor: lluviaC, backgroundColor: lluviaC, pointRadius: 2, tension: .3, yAxisID: 'y' },
          { type: 'line', label: 'Prob. ≥ 10 mm (%)', data: ens.dias.map((x) => Math.round(x.p10 * 100)), borderColor: naranja, borderDash: [4, 3], pointRadius: 0, tension: .3, yAxisID: 'y1' }
        ] }, options: Object.assign(opc('mm', '%'), { scales: Object.assign(ejes('mm', '%'), { y1: { position: 'right', min: 0, max: 100, grid: { display: false }, title: { display: true, text: '%' } } }) })
      });
    }
    if (pestana === 'suelo') {
      const a = Math.max(0, iAhora - 24 * 7);
      const b = Math.min(h.time.length, iAhora + 24 * 7);
      const pasos = [];
      for (let i = a; i < b; i += 3) pasos.push(i);
      const serie = (arr) => pasos.map((i) => (arr[i] == null ? null : Math.round(arr[i] * 1000) / 10));
      grafico(cont.querySelector('#g-suelo'), {
        type: 'line',
        data: { labels: pasos.map((i) => h.time[i].slice(11, 13) === '00' ? diaCorto(h.time[i].slice(0, 10)) : ''), datasets: [
          { label: '0–1 cm', data: serie(h.soil_moisture_0_to_1cm), borderColor: naranja, pointRadius: 0, tension: .3 },
          { label: '3–9 cm', data: serie(h.soil_moisture_3_to_9cm), borderColor: lima, pointRadius: 0, tension: .3 },
          { label: '9–27 cm', data: serie(h.soil_moisture_9_to_27cm), borderColor: lluviaC, pointRadius: 0, tension: .3 }
        ] },
        options: Object.assign(opc('% vol.'), { scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: function (v, i) { return this.getLabelForValue(v) || null; } } }, y: { title: { display: true, text: '% vol.' } } } })
      });
    }
  }

  window.Pronostico = { cargar, render, limpiar: limpiarGraficos };
})();
