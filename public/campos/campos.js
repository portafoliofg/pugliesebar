// =====================================================
// CAMPOS · mapa de lotes cargados desde KML/KMZ
// Lee y guarda los campos en el repositorio de GitHub (github.js),
// lee los archivos con kml.js y trae el clima de Open-Meteo.
// =====================================================
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));

  // Cultivos y su color en el mapa (se pueden agregar más)
  const CULTIVOS = [
    { nombre: 'Soja', color: '#a4c639' },
    { nombre: 'Maíz', color: '#ffc107' },
    { nombre: 'Trigo', color: '#c8962e' },
    { nombre: 'Girasol', color: '#ff9800' },
    { nombre: 'Cebada', color: '#e3c56a' },
    { nombre: 'Sorgo', color: '#b5532a' },
    { nombre: 'Pastura', color: '#3f9b5a' },
    { nombre: 'Barbecho', color: '#9c8b74' }
  ];
  const SIN_CULTIVO = '#f4eee2';
  const OTRO = '#7aa6c2';
  const colorDe = (c) => (!c ? SIN_CULTIVO : (CULTIVOS.find((x) => x.nombre === c)?.color || OTRO));

  // Campaña actual: desde julio se considera la campaña que empieza ese año
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const CAMPANA = hoy.getMonth() >= 6 ? `${anio}/${String(anio + 1).slice(2)}` : `${anio - 1}/${String(anio).slice(2)}`;

  let datos = { campos: [] };
  let mapa, capaCampos, capaNuevos, capas = {};
  let filtro = 'Todos';
  let seleccionado = null;
  const climaCache = new Map();

  // ---------- Tema (mismo que el tablero y el stock) ----------
  window.applyTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    if (capaCampos) dibujarCampos();
  };
  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}

  // ---------- Avisos ----------
  function avisar(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    a.textContent = texto;
    $('#avisos').appendChild(a);
    setTimeout(() => a.remove(), tipo === 'error' ? 8000 : 4000);
  }
  function cargando(texto) {
    const c = $('#cargando');
    if (!texto) return c.classList.add('oculto');
    $('#cargando-txt').textContent = texto;
    c.classList.remove('oculto');
  }

  // ---------- Mapa ----------
  function iniciarMapa() {
    mapa = L.map('mapa', { worldCopyJump: true, zoomControl: true, minZoom: 2 }).setView([-20, -40], 2);
    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics'
    });
    const rotulos = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    capas.satelite = L.layerGroup([satelite, rotulos]).addTo(mapa);
    L.control.layers({ 'Satélite': capas.satelite, 'Mapa': calles }, null, { position: 'topright' }).addTo(mapa);
    L.control.scale({ imperial: false }).addTo(mapa);

    capaCampos = L.featureGroup().addTo(mapa);
    capaNuevos = L.featureGroup().addTo(mapa);

    // Leyenda de cultivos
    const leyenda = L.control({ position: 'bottomleft' });
    leyenda.onAdd = () => { const d = L.DomUtil.create('div', 'leyenda'); d.id = 'leyenda'; return d; };
    leyenda.addTo(mapa);

    // Los nombres de los lotes se ven solo de cerca
    const etiquetas = () => mapa.getContainer().classList.toggle('sin-etiquetas', mapa.getZoom() < 12);
    mapa.on('zoomend', etiquetas);
    etiquetas();
  }

  function estilo(c, opciones = {}) {
    const color = colorDe(c.cultivo);
    return {
      color: opciones.sel ? '#ffffff' : color,
      weight: opciones.sel ? 3.5 : 2.5,
      fillColor: color,
      fillOpacity: opciones.sel ? 0.5 : 0.33,
      className: 'campo-poli' + (opciones.sel ? ' sel' : '')
    };
  }

  function dibujarCampos() {
    capaCampos.clearLayers();
    visibles().forEach((c) => {
      const capa = L.geoJSON(c.geometria, { style: () => estilo(c, { sel: seleccionado === c.id }) });
      capa.bindTooltip(esc(c.nombre), { permanent: true, direction: 'center', className: 'etiqueta' });
      capa.on('click', () => abrirCampo(c.id));
      capa.on('mouseover', () => { if (seleccionado !== c.id) capa.setStyle({ fillOpacity: 0.55, weight: 4 }); resaltarItem(c.id, true); });
      capa.on('mouseout', () => { if (seleccionado !== c.id) capa.setStyle(estilo(c)); resaltarItem(c.id, false); });
      capa.campoId = c.id;
      capaCampos.addLayer(capa);
    });
    pintarLeyenda();
  }

  function pintarLeyenda() {
    const usados = [...new Set(datos.campos.map((c) => c.cultivo || ''))];
    const el = $('#leyenda');
    if (!el) return;
    el.innerHTML = usados.length
      ? '<b>Cultivos</b>' + usados.map((c) => `<span><i class="muestra" style="background:${colorDe(c)}"></i>${esc(c || 'Sin asignar')}</span>`).join('')
      : '<b>Sin campos cargados</b>';
  }

  function encuadrar(animado = true) {
    const b = capaCampos.getBounds();
    if (b.isValid()) {
      if (animado) mapa.flyToBounds(b, { padding: [40, 40], maxZoom: 15, duration: 2.2 });
      else mapa.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
    } else if (animado) {
      mapa.flyTo([-34, -64], 4, { duration: 2 });
    }
  }

  // ---------- Resumen y lista ----------
  const haDe = (c) => (c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || 0);
  const visibles = () => datos.campos.filter((c) => filtro === 'Todos' || (c.cultivo || 'Sin asignar') === filtro);

  function pintarResumen() {
    const total = datos.campos.reduce((s, c) => s + haDe(c), 0);
    const porCultivo = {};
    datos.campos.forEach((c) => { const k = c.cultivo || 'Sin asignar'; porCultivo[k] = (porCultivo[k] || 0) + haDe(c); });
    $('#resumen').innerHTML =
      `<span>${datos.campos.length} ${datos.campos.length === 1 ? 'campo' : 'campos'}</span><span>${num(total, 0)} ha</span>` +
      Object.entries(porCultivo).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<span><i style="background:${colorDe(k === 'Sin asignar' ? '' : k)}"></i>${esc(k)} · ${num(v, 0)} ha</span>`).join('');
  }

  function vistaLista() {
    seleccionado = null;
    const q = ($('#buscar')?.value || '').toLowerCase();
    const cultivos = ['Todos', ...new Set(datos.campos.map((c) => c.cultivo || 'Sin asignar'))];
    if (!cultivos.includes(filtro)) filtro = 'Todos';
    const lista = visibles().filter((c) => !q || (c.nombre + ' ' + (c.cultivo || '') + ' ' + (c.notas || '')).toLowerCase().includes(q));

    $('#panel').innerHTML = `<div class="panel-in">
      ${datos.campos.length ? `
        <label class="buscar"><span aria-hidden="true">⌕</span><input id="buscar" placeholder="Buscar campo, cultivo o nota…" value="${esc(q)}"></label>
        <div class="filtros">${cultivos.map((c) => `<button class="filtro" type="button" data-filtro="${esc(c)}" aria-pressed="${c === filtro}">${c !== 'Todos' ? `<i style="background:${colorDe(c === 'Sin asignar' ? '' : c)}"></i>` : ''}${esc(c)}</button>`).join('')}</div>
        <div class="lista">${lista.map((c) => `<button class="item" type="button" data-id="${esc(c.id)}">
          <span class="franja" style="background:${colorDe(c.cultivo)}"></span>
          <span><b>${esc(c.nombre)}</b><small>${esc(c.cultivo || 'Sin cultivo asignado')}${c.campana ? ' · ' + esc(c.campana) : ''}</small></span>
          <span class="ha">${num(haDe(c), 1)} ha</span></button>`).join('') || '<p class="nota">No hay campos con ese filtro.</p>'}</div>`
      : `<div class="vacio"><div class="ico" aria-hidden="true">🌾</div><h2>Cargá tu primer campo</h2>
          <p>Subí uno o varios archivos <b>KML</b> o <b>KMZ</b> (por ejemplo, exportados de Google Earth). Cada polígono se convierte en un campo.</p>
          <button class="btn btn-1" type="button" data-accion="cargar">＋ Cargar KML/KMZ</button></div>`}
    </div>`;

    const input = $('#buscar');
    if (input) {
      input.addEventListener('input', () => { const pos = input.selectionStart; vistaLista(); const i = $('#buscar'); i.focus(); i.setSelectionRange(pos, pos); });
    }
    dibujarCampos();
  }

  function resaltarItem(id, si) {
    const el = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.toggle('resaltado', si);
  }

  // ---------- Detalle de un campo ----------
  function abrirCampo(id) {
    const c = datos.campos.find((x) => x.id === id);
    if (!c) return vistaLista();
    seleccionado = id;
    dibujarCampos();
    const capa = capaCampos.getLayers().find((l) => l.campoId === id);
    if (capa) mapa.flyToBounds(capa.getBounds(), { padding: [60, 60], maxZoom: 16, duration: 1.4 });

    const [lat, lon] = KML.centro(c.geometria);
    const esOtro = c.cultivo && !CULTIVOS.some((x) => x.nombre === c.cultivo);
    $('#panel').innerHTML = `<div class="panel-in">
      <button class="volver" type="button" data-accion="lista">← Todos los campos</button>
      <div class="cabecera-campo"><h2>${esc(c.nombre)}</h2><span class="chip"><i class="muestra" style="background:${colorDe(c.cultivo)}"></i>${esc(c.cultivo || 'Sin cultivo')}</span></div>
      <div class="datos">
        <div class="dato"><small>Superficie</small><b>${num(haDe(c), 1)} ha</b></div>
        <div class="dato"><small>Campaña</small><b>${esc(c.campana || '—')}</b></div>
      </div>
      <form class="form" id="form-campo" autocomplete="off">
        <label>Nombre<input name="nombre" required value="${esc(c.nombre)}"></label>
        <div class="fila2">
          <label>Cultivo<select name="cultivo">
            <option value="">Sin asignar</option>
            ${CULTIVOS.map((x) => `<option ${x.nombre === c.cultivo ? 'selected' : ''}>${x.nombre}</option>`).join('')}
            <option value="__otro" ${esOtro ? 'selected' : ''}>Otro…</option></select></label>
          <label>Campaña<input name="campana" placeholder="${CAMPANA}" value="${esc(c.campana || '')}"></label>
        </div>
        <label class="${esOtro ? '' : 'oculto'}" id="otro-cultivo">¿Cuál?<input name="otro" value="${esc(esOtro ? c.cultivo : '')}"></label>
        <div class="fila2">
          <label>Hectáreas del mapa<input value="${num(c.ha, 2)}" readonly></label>
          <label>Hectáreas declaradas<input name="haDeclaradas" type="number" min="0" step="0.01" placeholder="Opcional" value="${c.haDeclaradas ?? ''}"></label>
        </div>
        <label>Notas<textarea name="notas" placeholder="Lote, dueño, contratista, fecha de siembra…">${esc(c.notas || '')}</textarea></label>
        <div class="botones">
          <button class="btn btn-1" type="submit">Guardar cambios</button>
          <button class="btn btn-peligro" type="button" data-accion="borrar">Eliminar</button>
        </div>
      </form>
      <div class="seccion-t">Clima de la zona</div>
      <div class="clima" id="clima"><div class="esqueleto"></div></div>
      <div class="nota">Centro del campo: ${lat.toFixed(5)}, ${lon.toFixed(5)} · <a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lon}&t=k">Ver en Google Maps</a>${c.archivo ? ` · Archivo: ${esc(c.archivo)}` : ''}</div>
    </div>`;

    $('#form-campo').cultivo.addEventListener('change', (e) => $('#otro-cultivo').classList.toggle('oculto', e.target.value !== '__otro'));
    $('#form-campo').addEventListener('submit', (e) => { e.preventDefault(); guardarCampo(c.id, new FormData(e.target)); });
    cargarClima(c.id, lat, lon);
  }

  // ---------- Clima (Open-Meteo, últimos 30 días + próximos 7) ----------
  const EMOJI = (w) => w == null ? '·' : w === 0 ? '☀️' : w <= 2 ? '⛅' : w === 3 ? '☁️' : w <= 48 ? '🌫️' : w <= 67 ? '🌧️' : w <= 77 ? '❄️' : w <= 82 ? '🌦️' : w <= 86 ? '🌨️' : '⛈️';

  async function cargarClima(id, lat, lon) {
    let d = climaCache.get(id);
    if (!d) {
      try {
        const p = new URLSearchParams({
          latitude: lat.toFixed(4), longitude: lon.toFixed(4),
          daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max',
          past_days: '30', forecast_days: '7', timezone: 'America/Argentina/Buenos_Aires'
        });
        const r = await fetch('https://api.open-meteo.com/v1/forecast?' + p);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        d = (await r.json()).daily;
        climaCache.set(id, d);
      } catch (e) {
        if (seleccionado === id) $('#clima').innerHTML = '<p class="nota">No se pudo cargar el clima de la zona.</p>';
        return;
      }
    }
    if (seleccionado !== id) return;

    const hoyISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const iHoy = Math.max(0, d.time.indexOf(hoyISO));
    const lluvia = (desde, hasta) => d.precipitation_sum.slice(desde, hasta).reduce((s, x) => s + (x || 0), 0);
    const ult7 = lluvia(Math.max(0, iHoy - 7), iHoy);
    const ult30 = lluvia(Math.max(0, iHoy - 30), iHoy);
    const prox7 = lluvia(iHoy, iHoy + 7);
    const dias = d.time.slice(iHoy, iHoy + 7).map((f, k) => {
      const i = iHoy + k;
      return { f, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], mm: d.precipitation_sum[i], w: d.weather_code[i], helada: d.temperature_2m_min[i] != null && d.temperature_2m_min[i] < 2 };
    });
    const heladas = dias.filter((x) => x.helada);
    const nombreDia = (f, k) => k === 0 ? 'Hoy' : new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace('.', '');

    // Gráfico de barras: lluvia diaria de los últimos 30 días (azul) y pronóstico (dorado)
    const valores = d.precipitation_sum.slice(Math.max(0, iHoy - 30), iHoy + 7);
    const max = Math.max(5, ...valores.map((x) => x || 0));
    const ancho = 100 / valores.length;
    const offsetHoy = Math.min(30, iHoy);
    const barras = valores.map((v, k) => {
      const h = ((v || 0) / max) * 70;
      return `<rect class="${k < offsetHoy ? 'pasado' : 'futuro'}" x="${(k * ancho + ancho * 0.15).toFixed(2)}" y="${(76 - h).toFixed(2)}" width="${(ancho * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.8"><title>${d.time[Math.max(0, iHoy - 30) + k]}: ${num(v, 1)} mm</title></rect>`;
    }).join('');

    $('#clima').innerHTML = `
      ${heladas.length ? `<div class="alerta" role="alert">❄️ Posible helada: ${heladas.map((x) => nombreDia(x.f, dias.indexOf(x))).join(', ')} (mínima &lt; 2 °C)</div>` : ''}
      <div class="lluvias">
        <div><small>Últimos 7 días</small><b>${num(ult7, 1)} mm</b></div>
        <div><small>Últimos 30 días</small><b>${num(ult30, 1)} mm</b></div>
        <div><small>Próximos 7 días</small><b>${num(prox7, 1)} mm</b></div>
      </div>
      <svg class="barras" viewBox="0 0 100 80" preserveAspectRatio="none" role="img" aria-label="Lluvia diaria">${barras}
        <line class="hoy" x1="${(offsetHoy * ancho).toFixed(2)}" x2="${(offsetHoy * ancho).toFixed(2)}" y1="0" y2="78" vector-effect="non-scaling-stroke"/></svg>
      <div class="leyenda-barras"><span><i style="background:var(--lluvia)"></i>Lluvia registrada</span><span><i style="background:var(--dorado)"></i>Pronóstico</span></div>
      <div class="dias">${dias.map((x, k) => `<div class="dia${x.helada ? ' helada' : ''}"><b>${nombreDia(x.f, k)}</b><span class="em" aria-hidden="true">${EMOJI(x.w)}</span>
        <span><b>${num(x.max, 0)}°</b>/${num(x.min, 0)}°</span><span style="color:var(--lluvia);font-weight:800">${num(x.mm, 1)}</span></div>`).join('')}</div>
      <p class="nota">Datos de Open-Meteo para el centro del campo. Lluvia en mm.</p>`;
  }

  // ---------- Guardar, editar y borrar ----------
  async function conToken(accion) {
    if (Repo.tieneToken()) return accion();
    pedirToken(accion);
  }

  function guardarCampo(id, fd) {
    conToken(async () => {
      const cultivo = fd.get('cultivo') === '__otro' ? String(fd.get('otro') || '').trim() : fd.get('cultivo');
      const cambios = {
        nombre: String(fd.get('nombre') || '').trim() || 'Campo sin nombre',
        cultivo,
        campana: String(fd.get('campana') || '').trim(),
        haDeclaradas: fd.get('haDeclaradas') === '' ? null : Number(fd.get('haDeclaradas')),
        notas: String(fd.get('notas') || '').trim()
      };
      cargando('Guardando en GitHub…');
      try {
        datos = await Repo.guardar((actual) => {
          const c = actual.campos.find((x) => x.id === id);
          if (!c) throw new Error('El campo ya no existe (puede que lo hayan borrado).');
          Object.assign(c, cambios, { actualizado: new Date().toISOString() });
          return actual;
        }, `Campos: actualizar "${cambios.nombre}"`);
        avisar('Cambios guardados.');
        pintarResumen();
        abrirCampo(id);
      } catch (e) { manejarError(e, () => guardarCampo(id, fd)); }
      finally { cargando(null); }
    });
  }

  function borrarCampo(id) {
    const c = datos.campos.find((x) => x.id === id);
    if (!c || !confirm(`¿Eliminar "${c.nombre}"? Esta acción no se puede deshacer desde acá.`)) return;
    conToken(async () => {
      cargando('Eliminando…');
      try {
        datos = await Repo.guardar((actual) => {
          actual.campos = actual.campos.filter((x) => x.id !== id);
          return actual;
        }, `Campos: eliminar "${c.nombre}"`);
        avisar('Campo eliminado.');
        pintarResumen();
        vistaLista();
      } catch (e) { manejarError(e, () => borrarCampo(id)); }
      finally { cargando(null); }
    });
  }

  function manejarError(e, reintentar) {
    if (e.sinToken || e.status === 401) { Repo.olvidarToken(); actualizarEstadoGH(); return pedirToken(reintentar, e.status === 401 ? e.message : ''); }
    avisar(e.message || String(e), 'error');
  }

  // ---------- Importar KML / KMZ ----------
  let pendientes = [];

  async function importar(archivos) {
    if (!archivos.length) return;
    cargando('Leyendo archivos…');
    pendientes = [];
    const errores = [];
    for (const a of archivos) {
      try {
        const r = await KML.leerArchivo(a);
        if (!r.campos.length) errores.push(`${a.name}: no tiene polígonos (solo puntos o líneas).`);
        r.campos.forEach((c) => pendientes.push(Object.assign(c, { archivo: a.name, original: a, incluir: true })));
      } catch (e) {
        errores.push(`${a.name}: ${e.message}`);
      }
    }
    cargando(null);
    if (!pendientes.length) return avisar(errores.join(' ') || 'No se encontraron campos.', 'error');

    // Vista previa en el mapa
    capaNuevos.clearLayers();
    pendientes.forEach((c) => capaNuevos.addLayer(L.geoJSON(c.geometria, { style: { color: '#ffffff', weight: 2.5, fillColor: '#ffc107', fillOpacity: 0.35, className: 'campo-poli nuevo' } })));
    mapa.flyToBounds(capaNuevos.getBounds(), { padding: [40, 40], maxZoom: 15, duration: 1.8 });

    const total = pendientes.reduce((s, c) => s + c.ha, 0);
    abrirVentana(`<h2>Campos encontrados</h2>
      <p>Se encontraron <b>${pendientes.length}</b> ${pendientes.length === 1 ? 'polígono' : 'polígonos'} (${num(total, 1)} ha). Revisá los nombres y elegí cuáles guardar.</p>
      ${errores.length ? `<div class="error">${errores.map(esc).join('<br>')}</div>` : ''}
      <div class="fila2 form">
        <label>Cultivo para todos<select id="imp-cultivo"><option value="">Sin asignar</option>${CULTIVOS.map((x) => `<option>${x.nombre}</option>`).join('')}</select></label>
        <label>Campaña<input id="imp-campana" value="${CAMPANA}"></label>
      </div>
      <div style="overflow-x:auto"><table class="tabla-import"><thead><tr><th></th><th>Nombre</th><th>Superficie</th><th>Archivo</th></tr></thead><tbody>
        ${pendientes.map((c, i) => `<tr><td><input type="checkbox" data-i="${i}" checked aria-label="Incluir"></td>
          <td><input data-nombre="${i}" value="${esc(c.nombre)}"></td><td class="num">${num(c.ha, 1)} ha</td><td class="nota">${esc(c.archivo)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="nota">Se guardan en el repositorio de GitHub: los datos en <code>data/campos.json</code> y una copia del archivo original.</p>
      <div class="botones"><button class="btn btn-1" type="button" data-accion="confirmar-import">Guardar campos</button><button class="btn" type="button" data-accion="cerrar">Cancelar</button></div>`,
      () => capaNuevos.clearLayers());
  }

  function confirmarImport() {
    const v = $('.capa .ventana');
    v.querySelectorAll('input[data-i]').forEach((cb) => { pendientes[Number(cb.dataset.i)].incluir = cb.checked; });
    v.querySelectorAll('input[data-nombre]').forEach((inp) => { pendientes[Number(inp.dataset.nombre)].nombre = inp.value.trim() || pendientes[Number(inp.dataset.nombre)].nombre; });
    const cultivo = $('#imp-cultivo').value;
    const campana = $('#imp-campana').value.trim();
    const elegidos = pendientes.filter((c) => c.incluir);
    if (!elegidos.length) return avisar('No elegiste ningún campo.', 'error');
    guardarImport(elegidos, cultivo, campana);
  }

  function guardarImport(elegidos, cultivo, campana) {
    conToken(async () => {
      cargando('Guardando en GitHub…');
      try {
        // Copia de cada archivo original (una vez por archivo), con fecha para no pisar nada
        const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const originales = [...new Set(elegidos.map((c) => c.original))];
        const archivos = await Promise.all(originales.map(async (f) => ({
          nombre: `${sello}-${f.name.replace(/[^\w.\-]+/g, '_')}`,
          datos: await f.arrayBuffer()
        })));
        const nombreArchivo = new Map(originales.map((f, i) => [f, archivos[i].nombre]));
        const ahora = new Date().toISOString();
        const nuevos = elegidos.map((c) => ({
          id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
          nombre: c.nombre,
          cultivo,
          campana,
          ha: c.ha,
          haDeclaradas: null,
          notas: c.descripcion || '',
          archivo: nombreArchivo.get(c.original),
          alta: ahora,
          actualizado: ahora,
          geometria: c.geometria
        }));
        datos = await Repo.guardar((actual) => {
          actual.campos = (actual.campos || []).concat(nuevos);
          return actual;
        }, `Campos: alta de ${nuevos.length} ${nuevos.length === 1 ? 'campo' : 'campos'} (${originales.map((f) => f.name).join(', ')})`, archivos);
        cerrarVentana();
        avisar(nuevos.length === 1 ? 'Campo guardado.' : `${nuevos.length} campos guardados.`);
        pintarResumen();
        vistaLista();
        encuadrar();
      } catch (e) { manejarError(e, () => guardarImport(elegidos, cultivo, campana)); }
      finally { cargando(null); }
    });
  }

  // ---------- Token de GitHub ----------
  function pedirToken(despues, error) {
    abrirVentana(`<h2>Conectar con GitHub</h2>
      <p>Para guardar campos hace falta un token de GitHub con permiso de escritura en <b>${esc(Repo.config.repo || 'el repositorio')}</b>. Se guarda solo en este navegador.</p>
      <ol>
        <li>Abrí <a class="link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li>
        <li><b>Token name:</b> "Tablero campos". <b>Expiration:</b> la que prefieras (por ejemplo, 1 año).</li>
        <li><b>Repository access:</b> "Only select repositories" y elegí <code>${esc((Repo.config.repo || '').split('/')[1] || 'el repositorio')}</code>.</li>
        <li><b>Permissions → Repository permissions → Contents:</b> "Read and write".</li>
        <li>Tocá <b>Generate token</b>, copialo y pegalo acá abajo.</li>
      </ol>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <form class="form" id="form-token"><label>Token<input name="token" type="password" required placeholder="github_pat_…" autocomplete="off"></label>
        <div class="botones"><button class="btn btn-1" type="submit">Conectar</button><button class="btn" type="button" data-accion="cerrar">Cancelar</button></div></form>`);
    $('#form-token').addEventListener('submit', async (e) => {
      e.preventDefault();
      cargando('Comprobando el token…');
      try {
        await Repo.probarToken(e.target.token.value.trim());
        cerrarVentana();
        actualizarEstadoGH();
        avisar('Conectado con GitHub.');
        if (despues) despues();
      } catch (err) {
        cerrarVentana();
        pedirToken(despues, err.message);
      } finally { cargando(null); }
    }, { once: true });
  }

  function menuGitHub() {
    if (!Repo.tieneToken()) return pedirToken(null);
    abrirVentana(`<h2>GitHub</h2><p>Este navegador está conectado y puede guardar campos en <b>${esc(Repo.config.repo)}</b>.</p>
      <div class="botones"><button class="btn" type="button" data-accion="cambiar-token">Cambiar token</button>
      <button class="btn btn-peligro" type="button" data-accion="desconectar">Desconectar</button><button class="btn" type="button" data-accion="cerrar">Cerrar</button></div>`);
  }

  function actualizarEstadoGH() {
    $('#estado-gh').classList.toggle('ok', Repo.tieneToken());
    $('#btn-gh').title = Repo.tieneToken() ? 'Conectado con GitHub' : 'Conectar con GitHub para guardar';
  }

  // ---------- Ventanas ----------
  let alCerrar = null;
  function abrirVentana(html, cerrar) {
    cerrarVentana();
    alCerrar = cerrar || null;
    const capa = document.createElement('div');
    capa.className = 'capa';
    capa.innerHTML = `<div class="ventana" role="dialog" aria-modal="true">${html}</div>`;
    capa.addEventListener('click', (e) => { if (e.target === capa) cerrarVentana(); });
    document.body.appendChild(capa);
    setTimeout(() => capa.querySelector('input:not([type=checkbox]), button')?.focus(), 50);
  }
  function cerrarVentana() {
    const c = $('.capa');
    if (c) c.remove();
    if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarVentana(); });

  // ---------- Eventos ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion],[data-filtro],.item');
    if (!b) return;
    if (b.classList.contains('item')) return abrirCampo(b.dataset.id);
    if (b.dataset.filtro) { filtro = b.dataset.filtro; vistaLista(); encuadrar(); return; }
    const a = b.dataset.accion;
    if (a === 'lista') { vistaLista(); encuadrar(); }
    else if (a === 'cargar') $('#archivo').click();
    else if (a === 'borrar') borrarCampo(seleccionado);
    else if (a === 'confirmar-import') confirmarImport();
    else if (a === 'cerrar') cerrarVentana();
    else if (a === 'cambiar-token') { cerrarVentana(); pedirToken(null); }
    else if (a === 'desconectar') { Repo.olvidarToken(); actualizarEstadoGH(); cerrarVentana(); avisar('Desconectado de GitHub.'); }
  });
  $('#btn-cargar').addEventListener('click', () => $('#archivo').click());
  $('#btn-gh').addEventListener('click', menuGitHub);
  $('#archivo').addEventListener('change', (e) => { importar(Array.from(e.target.files)); e.target.value = ''; });

  // Arrastrar archivos sobre el mapa
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    if (ev === 'drop') importar(Array.from(e.dataTransfer.files).filter((f) => /\.(kml|kmz)$/i.test(f.name)));
  }));

  // ---------- Arranque ----------
  async function iniciar() {
    if (!window.L) {
      $('#mapa').innerHTML = '<p style="padding:20px;color:#fff">No se pudo cargar el mapa.</p>';
    } else iniciarMapa();
    actualizarEstadoGH();
    cargando('Cargando campos…');
    try {
      datos = await Repo.leer();
      datos.campos = Array.isArray(datos.campos) ? datos.campos : [];
    } catch (e) {
      avisar(e.message, 'error');
    } finally { cargando(null); }
    pintarResumen();
    vistaLista();
    if (mapa) setTimeout(() => encuadrar(true), 300);
  }
  iniciar();
})();
