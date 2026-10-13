// NDVI satelital (Sentinel-2) de cada lote.
// Lo calcula el workflow "NDVI de los campos" del repositorio privado y deja:
//   data/ndvi/resumen.json        → último valor de cada campo
//   data/ndvi/campos/<id>.json    → serie de valores e imagen más reciente
//   data/ndvi/img/<id>.png        → imagen coloreada del lote
(function () {
  'use strict';

  // Escala de colores (rojo → amarillo → verde), igual a la de las imágenes
  const ESCALA = [[0, '#a50026'], [0.2, '#f46d43'], [0.4, '#fee08b'], [0.6, '#a6d96a'], [0.8, '#1a9850'], [1, '#006837']];
  function color(v) {
    if (v == null || !Number.isFinite(v)) return '#9aa3a8';
    const x = Math.max(0, Math.min(1, v));
    for (let i = 1; i < ESCALA.length; i++) {
      if (x <= ESCALA[i][0]) {
        const [a, ca] = ESCALA[i - 1]; const [b, cb] = ESCALA[i];
        const t = (x - a) / (b - a);
        const h = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
        const [r1, g1, b1] = h(ca); const [r2, g2, b2] = h(cb);
        return '#' + [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
      }
    }
    return ESCALA[ESCALA.length - 1][1];
  }

  // Grupos para colorear el mapa por NDVI
  const GRUPOS = [
    { nombre: 'NDVI alto (≥ 0,6)', min: 0.6, color: '#1a9850' },
    { nombre: 'NDVI medio (0,4–0,6)', min: 0.4, color: '#a6d96a' },
    { nombre: 'NDVI bajo (0,2–0,4)', min: 0.2, color: '#fee08b' },
    { nombre: 'NDVI muy bajo (< 0,2)', min: -1, color: '#f46d43' }
  ];
  const SIN = 'Sin NDVI';
  const grupo = (x) => (x?.ndvi == null ? SIN : GRUPOS.find((g) => x.ndvi >= g.min).nombre);
  const colorGrupo = (nombre) => GRUPOS.find((g) => g.nombre === nombre)?.color || '#f4eee2';

  // Qué significa el valor para el productor
  function lectura(v) {
    if (v == null) return '';
    if (v < 0.2) return 'Suelo desnudo, rastrojo o cultivo recién emergido';
    if (v < 0.4) return 'Vegetación escasa o cultivo en implantación';
    if (v < 0.6) return 'Cultivo en crecimiento, cobertura media';
    if (v < 0.8) return 'Cultivo vigoroso, buena cobertura';
    return 'Vegetación muy densa (máximo vigor)';
  }

  let resumen = null;
  const series = {};
  const imagenes = {};

  async function cargarResumen(forzar) {
    if (resumen && !forzar) return resumen;
    try { resumen = (await Repo.leerRuta('data/ndvi/resumen.json')) || { campos: {} }; }
    catch (e) { resumen = { campos: {} }; }
    resumen.campos = resumen.campos || {};
    return resumen;
  }
  const de = (id) => resumen?.campos?.[id] || null;
  window.addEventListener('repo:cambio', (e) => {
    const { ruta, datos } = e.detail;
    if (ruta === 'data/ndvi/resumen.json') { resumen = datos || { campos: {} }; resumen.campos = resumen.campos || {}; }
    else if (ruta.startsWith('data/ndvi/campos/')) { const id = ruta.slice(17, -5); series[id] = datos; delete imagenes[id]; }
  });

  async function serie(id) {
    if (!(id in series)) series[id] = await Repo.leerRuta(`data/ndvi/campos/${id}.json`).catch(() => null);
    return series[id];
  }

  // Devuelve { url, bounds, fecha } de la imagen más reciente del lote
  async function imagen(id) {
    if (id in imagenes) return imagenes[id];
    const x = de(id)?.imagen || (await serie(id))?.imagen;
    imagenes[id] = x?.ruta ? { url: await Repo.leerBinario(x.ruta), bounds: x.bounds, fecha: x.fecha } : null;
    if (imagenes[id] && !imagenes[id].url) imagenes[id] = null;
    return imagenes[id];
  }

  // Leyenda de colores en HTML
  const leyendaHTML = () => `<div class="ndvi-escala"><span>0</span><i style="background:linear-gradient(90deg,${ESCALA.map((e) => e[1]).join(',')})"></i><span>1</span></div>`;

  window.NDVI = { color, grupo, colorGrupo, GRUPOS, SIN, lectura, cargarResumen, de, serie, imagen, leyendaHTML, resumen: () => resumen };
})();
