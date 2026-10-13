// Pronóstico por conjuntos (ensemble) de Open-Meteo con el modelo europeo ECMWF IFS:
// 51 escenarios del mismo pronóstico con condiciones iniciales levemente distintas.
// En vez de un solo valor ("llueven 20 mm") da probabilidades y rangos, que es lo honesto
// más allá de 3–5 días.
(function () {
  'use strict';

  const ZONA = 'America/Argentina/Buenos_Aires';
  const URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
  const MODELO = 'ecmwf_ifs025';
  const cache = new Map();

  const cuantil = (orden, q) => {
    if (!orden.length) return null;
    const pos = (orden.length - 1) * q;
    const a = Math.floor(pos); const b = Math.ceil(pos);
    return orden[a] + (orden[b] - orden[a]) * (pos - a);
  };
  const prob = (v, cond) => (v.length ? v.filter(cond).length / v.length : null);
  const miembros = (daily, variable) => Object.keys(daily).filter((k) => k === variable || k.startsWith(variable + '_member')).map((k) => daily[k]);

  // Estadísticas a partir de la respuesta diaria de la API
  function procesar(r) {
    const d = r.daily;
    const lluvia = miembros(d, 'precipitation_sum');
    const tmin = miembros(d, 'temperature_2m_min');
    const n = lluvia.length;
    const dias = d.time.map((f, i) => {
      const v = lluvia.map((m) => m[i]).filter(Number.isFinite).sort((a, b) => a - b);
      const t = tmin.map((m) => m[i]).filter(Number.isFinite).sort((a, b) => a - b);
      return {
        f, p1: prob(v, (x) => x >= 1), p10: prob(v, (x) => x >= 10), p25: prob(v, (x) => x >= 25),
        q10: cuantil(v, 0.1), q50: cuantil(v, 0.5), q90: cuantil(v, 0.9),
        helada0: prob(t, (x) => x <= 0), helada2: prob(t, (x) => x < 2), tminQ10: cuantil(t, 0.1), tminQ50: cuantil(t, 0.5)
      };
    });
    const acum = (nd) => {
      const v = lluvia.map((m) => m.slice(0, nd).reduce((s, x) => s + (x || 0), 0)).sort((a, b) => a - b);
      return { dias: Math.min(nd, d.time.length), q10: cuantil(v, 0.1), q50: cuantil(v, 0.5), q90: cuantil(v, 0.9),
        p10: prob(v, (x) => x >= 10), p25: prob(v, (x) => x >= 25), p50: prob(v, (x) => x >= 50), seco: prob(v, (x) => x < 5) };
    };
    return { modelo: 'ECMWF IFS (51 escenarios)', escenarios: n, dias, acum7: acum(7), acum14: acum(14) };
  }

  async function pedir(lats, lons) {
    const p = new URLSearchParams({ latitude: lats.join(','), longitude: lons.join(','), daily: 'precipitation_sum,temperature_2m_min', models: MODELO, forecast_days: '15', timezone: ZONA });
    const r = await fetch(URL + '?' + p);
    if (!r.ok) throw new Error('Pronóstico por conjuntos: HTTP ' + r.status);
    const j = await r.json();
    return Array.isArray(j) ? j : [j];
  }

  /** Probabilidades para un punto. */
  async function cargar(lat, lon) {
    const k = lat.toFixed(2) + ',' + lon.toFixed(2);
    if (!cache.has(k)) cache.set(k, pedir([lat.toFixed(3)], [lon.toFixed(3)]).then((r) => procesar(r[0])).catch((e) => { cache.delete(k); throw e; }));
    return cache.get(k);
  }

  /** Probabilidades para varios puntos [{lat, lon}] (de a 20 por pedido). */
  async function varios(puntos) {
    const out = [];
    for (let i = 0; i < puntos.length; i += 20) {
      const g = puntos.slice(i, i + 20);
      try {
        const r = await pedir(g.map((x) => x.lat.toFixed(3)), g.map((x) => x.lon.toFixed(3)));
        r.forEach((x) => out.push(procesar(x)));
      } catch (e) { g.forEach(() => out.push(null)); }
    }
    return out;
  }

  const pct = (p) => (p == null ? '—' : Math.round(p * 100) + ' %');
  window.Ensamble = { cargar, varios, procesar, pct };
})();
