// =====================================================
// CAMPOS · mapa de lotes cargados desde KML/KMZ
// - Guardado en un repositorio privado de GitHub (github.js)
// - Lectura de archivos (kml.js) y pronóstico detallado (pronostico.js)
// - Capas, filtros (cultivo, provincia, campaña), selección múltiple y acciones en bloque
// =====================================================
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const ordenar = (a, b) => String(a).localeCompare(String(b), 'es');

  // Cultivos y su color en el mapa
  const CULTIVOS = [
    { nombre: 'Soja', color: '#a4c639' }, { nombre: 'Maíz', color: '#ffc107' }, { nombre: 'Trigo', color: '#c8962e' },
    { nombre: 'Girasol', color: '#ff9800' }, { nombre: 'Cebada', color: '#e3c56a' }, { nombre: 'Sorgo', color: '#b5532a' },
    { nombre: 'Pastura', color: '#3f9b5a' }, { nombre: 'Barbecho', color: '#9c8b74' }
  ];
  const PALETA = ['#a4c639', '#ffc107', '#ff9800', '#3f9b5a', '#7aa6c2', '#c8962e', '#d95f7a', '#8e6bbf', '#b5532a', '#4fb3a9', '#e3c56a', '#9c8b74'];
  const SIN = { cultivo: 'Sin cultivo', campana: 'Sin campaña', provincia: 'Sin ubicar' };

  // Campaña actual: desde julio se considera la campaña que empieza ese año
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const CAMPANA = hoy.getMonth() >= 6 ? `${anio}/${String(anio + 1).slice(2)}` : `${anio - 1}/${String(anio).slice(2)}`;

  // ---------- Estado ----------
  let datos = { campos: [] };
  let bloqueado = false;
  let abierto = null;                 // campo abierto en el panel
  const seleccion = new Set();        // selección múltiple
  let modoSeleccion = false;          // en el celular: tocar = seleccionar
  const filtros = { q: '', cultivo: 'Todos', provincia: 'Todas', campana: 'Todas' };
  let pestanaClima = 'resumen';
  let mapa, capaCampos, capaNuevos;
  const capasBase = {};
  const superposiciones = {};

  const VISTA_DEF = { base: 'satelite', colorPor: 'cultivo', ocultos: [], nombres: true, limites: true, radar: false };
  let vista = Object.assign({}, VISTA_DEF);
  try { vista = Object.assign(vista, JSON.parse(localStorage.getItem('campos-vista') || '{}')); } catch (e) {}
  const guardarVista = () => { try { localStorage.setItem('campos-vista', JSON.stringify(vista)); } catch (e) {} };

  // ---------- Tema (mismo que el tablero y el stock) ----------
  window.applyTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    if (abierto) abrirCampo(abierto, false);
  };
  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}

  // ---------- Utilidades ----------
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
  const haDe = (c) => (c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || 0);
  const totalHa = (lista) => lista.reduce((s, c) => s + haDe(c), 0);
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // Grupo de un campo según "colorear por"
  const grupo = (c, por = vista.colorPor) => (por === 'cultivo' ? c.cultivo : por === 'campana' ? c.campana : c.provincia) || SIN[por];
  function colorGrupo(valor, por = vista.colorPor) {
    if (por === 'cultivo') return valor === SIN.cultivo ? '#f4eee2' : (CULTIVOS.find((x) => x.nombre === valor)?.color || '#7aa6c2');
    if (valor === SIN[por]) return '#f4eee2';
    const valores = [...new Set(datos.campos.map((c) => grupo(c, por)))].filter((v) => v !== SIN[por]).sort(ordenar);
    return PALETA[Math.max(0, valores.indexOf(valor)) % PALETA.length];
  }
  const colorCultivo = (c) => colorGrupo(c.cultivo || SIN.cultivo, 'cultivo');

  // Filtros del panel (búsqueda, cultivo, provincia, campaña)
  function filtrados() {
    const q = filtros.q.toLowerCase();
    return datos.campos.filter((c) =>
      (filtros.cultivo === 'Todos' || (c.cultivo || SIN.cultivo) === filtros.cultivo) &&
      (filtros.provincia === 'Todas' || (c.provincia || SIN.provincia) === filtros.provincia) &&
      (filtros.campana === 'Todas' || (c.campana || SIN.campana) === filtros.campana) &&
      (!q || [c.nombre, c.cultivo, c.notas, c.provincia, c.departamento, c.localidad].join(' ').toLowerCase().includes(q)));
  }
  // En el mapa además se respetan las capas ocultas
  const enMapa = () => filtrados().filter((c) => !vista.ocultos.includes(vista.colorPor + ':' + grupo(c)));

  // ---------- Ubicación (provincia, departamento, localidad) ----------
  // API Georef del Gobierno argentino; fuera de Argentina, BigDataCloud. Ambas gratis y sin clave.
  async function ubicar(c) {
    const [lat, lon] = KML.centro(c.geometria);
    try {
      const r = await fetch(`https://apis.datos.gob.ar/georef/api/ubicacion?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);
      if (r.ok) {
        const u = (await r.json()).ubicacion || {};
        if (u.provincia?.nombre) {
          return { provincia: u.provincia.nombre, departamento: u.departamento?.nombre || '', localidad: u.municipio?.nombre || '' };
        }
      }
    } catch (e) {}
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`);
      if (r.ok) {
        const u = await r.json();
        if (u.principalSubdivision) return { provincia: u.principalSubdivision, departamento: '', localidad: u.city || u.locality || '' };
      }
    } catch (e) {}
    return null;
  }

  // Ubica varios campos con un máximo de 3 consultas a la vez
  async function ubicarVarios(lista, alAvanzar) {
    let i = 0;
    let hechos = 0;
    const trabajador = async () => {
      while (i < lista.length) {
        const c = lista[i++];
        const u = await ubicar(c);
        if (u) Object.assign(c, u);
        hechos++;
        if (alAvanzar) alAvanzar(hechos, lista.length);
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
  }

  // Completa la provincia de los campos viejos que no la tienen y la guarda
  async function completarUbicaciones() {
    const faltan = datos.campos.filter((c) => !c.provincia);
    if (!faltan.length) return;
    await ubicarVarios(faltan);
    const resueltos = faltan.filter((c) => c.provincia).map((c) => ({ id: c.id, provincia: c.provincia, departamento: c.departamento, localidad: c.localidad }));
    if (!resueltos.length) return;
    refrescar();
    if (!Repo.tieneToken()) return;
    try {
      await Repo.guardar((actual) => {
        resueltos.forEach((u) => { const c = actual.campos.find((x) => x.id === u.id); if (c && !c.provincia) Object.assign(c, u); });
        return actual;
      }, `Campos: completar provincia de ${resueltos.length} ${resueltos.length === 1 ? 'campo' : 'campos'}`);
    } catch (e) { /* no es crítico: se vuelve a intentar la próxima vez */ }
  }

  // ---------- Mapa ----------
  function iniciarMapa() {
    mapa = L.map('mapa', { worldCopyJump: true, zoomControl: true, minZoom: 2, boxZoom: false }).setView([-20, -40], 2);
    capasBase.satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics' });
    capasBase.calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    capasBase.relieve = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap, SRTM · OpenTopoMap' });
    superposiciones.limites = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'overlayPane' });
    L.control.scale({ imperial: false }).addTo(mapa);

    capaCampos = L.featureGroup().addTo(mapa);
    capaNuevos = L.featureGroup().addTo(mapa);

    // Botón de capas y botón de modo selección (sobre el mapa)
    const ctrl = L.control({ position: 'topright' });
    ctrl.onAdd = () => {
      const d = L.DomUtil.create('div', 'ctrl-mapa');
      d.innerHTML = '<button type="button" class="btn-mapa" data-accion="capas" title="Capas del mapa">🗺️ Capas</button>' +
        '<button type="button" class="btn-mapa" data-accion="modo-seleccion" id="btn-modo-sel" title="Tocar los lotes para seleccionarlos">☑️ Seleccionar</button>' +
        '<div class="panel-capas oculto" id="panel-capas"></div>';
      L.DomEvent.disableClickPropagation(d);
      L.DomEvent.disableScrollPropagation(d);
      // Como los clics no salen del control, los botones se atienden acá
      d.querySelector('[data-accion="capas"]').addEventListener('click', () => { pintarCapas(); $('#panel-capas').classList.toggle('oculto'); });
      d.querySelector('[data-accion="modo-seleccion"]').addEventListener('click', (ev) => {
        modoSeleccion = !modoSeleccion;
        ev.currentTarget.classList.toggle('activo', modoSeleccion);
        avisar(modoSeleccion ? 'Modo selección: tocá los lotes para marcarlos.' : 'Modo selección desactivado.');
      });
      return d;
    };
    ctrl.addTo(mapa);

    const leyenda = L.control({ position: 'bottomleft' });
    leyenda.onAdd = () => { const d = L.DomUtil.create('div', 'leyenda'); d.id = 'leyenda'; return d; };
    leyenda.addTo(mapa);

    mapa.on('zoomend', aplicarNombres);
    aplicarVista();
  }

  function aplicarNombres() {
    mapa.getContainer().classList.toggle('sin-etiquetas', !vista.nombres || mapa.getZoom() < 12);
  }

  async function activarRadar(si) {
    if (superposiciones.radar) { mapa.removeLayer(superposiciones.radar); superposiciones.radar = null; }
    if (!si) return;
    try {
      const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const j = await r.json();
      const ultimo = j.radar?.past?.[j.radar.past.length - 1];
      if (!ultimo) throw new Error('sin datos');
      superposiciones.radar = L.tileLayer(`${j.host}${ultimo.path}/256/{z}/{x}/{y}/4/1_1.png`, {
        opacity: 0.65, maxNativeZoom: 7, maxZoom: 19, attribution: 'Radar &copy; RainViewer'
      }).addTo(mapa);
      const hora = new Date(ultimo.time * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
      avisar(`Radar de lluvia de las ${hora} h. La cobertura en zonas rurales puede ser parcial.`);
    } catch (e) {
      vista.radar = false; guardarVista(); pintarCapas();
      avisar('No se pudo cargar el radar de lluvia.', 'error');
    }
  }

  function aplicarVista() {
    Object.entries(capasBase).forEach(([k, l]) => (k === vista.base ? l.addTo(mapa) : mapa.removeLayer(l)));
    if (vista.limites) superposiciones.limites.addTo(mapa); else mapa.removeLayer(superposiciones.limites);
    aplicarNombres();
    if (vista.radar && !superposiciones.radar) activarRadar(true);
    if (!vista.radar && superposiciones.radar) activarRadar(false);
  }

  function estilo(c) {
    const color = colorGrupo(grupo(c));
    const sel = seleccion.has(c.id);
    const ab = abierto === c.id;
    return {
      color: sel || ab ? '#ffffff' : color,
      weight: sel ? 4 : ab ? 3.5 : 2.5,
      fillColor: color,
      fillOpacity: sel ? 0.6 : ab ? 0.5 : 0.33,
      className: 'campo-poli' + (ab ? ' sel' : '') + (sel ? ' marcado' : '')
    };
  }

  function dibujarCampos() {
    if (!capaCampos) return;
    capaCampos.clearLayers();
    enMapa().forEach((c) => {
      const capa = L.geoJSON(c.geometria, { style: () => estilo(c) });
      capa.bindTooltip(esc(c.nombre), { permanent: true, direction: 'center', className: 'etiqueta' });
      capa.on('click', (ev) => {
        const o = ev.originalEvent || {};
        if (modoSeleccion || o.ctrlKey || o.metaKey || o.shiftKey) alternarSeleccion(c.id);
        else abrirCampo(c.id);
      });
      capa.on('mouseover', () => { capa.setStyle({ fillOpacity: 0.6, weight: 4 }); resaltarItem(c.id, true); });
      capa.on('mouseout', () => { capa.setStyle(estilo(c)); resaltarItem(c.id, false); });
      capa.campoId = c.id;
      capaCampos.addLayer(capa);
    });
    pintarLeyenda();
  }

  function pintarLeyenda() {
    const el = $('#leyenda');
    if (!el) return;
    const grupos = [...new Set(datos.campos.map((c) => grupo(c)))].sort(ordenar);
    const titulo = { cultivo: 'Cultivo', campana: 'Campaña', provincia: 'Provincia' }[vista.colorPor];
    el.innerHTML = grupos.length
      ? `<b>${titulo}</b>` + grupos.map((g) => `<span class="${vista.ocultos.includes(vista.colorPor + ':' + g) ? 'apagado' : ''}"><i class="muestra" style="background:${colorGrupo(g)}"></i>${esc(g)}</span>`).join('')
      : '<b>Sin campos cargados</b>';
  }

  // Panel de capas
  function pintarCapas() {
    const p = $('#panel-capas');
    if (!p) return;
    const grupos = {};
    datos.campos.forEach((c) => { const g = grupo(c); grupos[g] = (grupos[g] || 0) + haDe(c); });
    const radio = (nombre, valor, actual, texto) => `<label class="opcion"><input type="radio" name="${nombre}" value="${valor}" ${valor === actual ? 'checked' : ''}> ${texto}</label>`;
    const check = (clave, si, texto) => `<label class="opcion"><input type="checkbox" data-sup="${clave}" ${si ? 'checked' : ''}> ${texto}</label>`;
    p.innerHTML = `
      <div class="capas-sec"><b>Mapa base</b>
        ${radio('base', 'satelite', vista.base, 'Satélite')}${radio('base', 'calles', vista.base, 'Calles')}${radio('base', 'relieve', vista.base, 'Relieve')}</div>
      <div class="capas-sec"><b>Colorear campos por</b>
        ${radio('colorPor', 'cultivo', vista.colorPor, 'Cultivo')}${radio('colorPor', 'campana', vista.colorPor, 'Campaña')}${radio('colorPor', 'provincia', vista.colorPor, 'Provincia')}</div>
      <div class="capas-sec"><b>Mostrar</b>
        ${Object.entries(grupos).sort((a, b) => ordenar(a[0], b[0])).map(([g, ha]) => `<label class="opcion"><input type="checkbox" data-grupo="${esc(g)}" ${vista.ocultos.includes(vista.colorPor + ':' + g) ? '' : 'checked'}>
          <i class="muestra" style="background:${colorGrupo(g)}"></i> ${esc(g)} <small>${num(ha, 0)} ha</small></label>`).join('') || '<small>Sin campos</small>'}</div>
      <div class="capas-sec"><b>Superposiciones</b>
        ${check('nombres', vista.nombres, 'Nombres de los lotes')}${check('limites', vista.limites, 'Límites y localidades')}${check('radar', vista.radar, 'Radar de lluvia (último)')}</div>`;
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('#panel-capas')) return;
    if (t.name === 'base') { vista.base = t.value; aplicarVista(); }
    if (t.name === 'colorPor') { vista.colorPor = t.value; dibujarCampos(); pintarCapas(); }
    if (t.dataset.grupo !== undefined) {
      const k = vista.colorPor + ':' + t.dataset.grupo;
      vista.ocultos = t.checked ? vista.ocultos.filter((x) => x !== k) : vista.ocultos.concat(k);
      dibujarCampos();
    }
    if (t.dataset.sup === 'nombres') { vista.nombres = t.checked; aplicarNombres(); }
    if (t.dataset.sup === 'limites') { vista.limites = t.checked; aplicarVista(); }
    if (t.dataset.sup === 'radar') { vista.radar = t.checked; activarRadar(t.checked); }
    guardarVista();
  });

  function encuadrar(animado = true) {
    if (!mapa) return;
    const b = capaCampos.getBounds();
    if (b.isValid()) {
      if (animado) mapa.flyToBounds(b, { padding: [40, 40], maxZoom: 15, duration: 2 });
      else mapa.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
    } else if (animado) mapa.flyTo([-34, -64], 4, { duration: 2 });
  }

  // ---------- Resumen y lista ----------
  function pintarResumen() {
    const porCultivo = {};
    datos.campos.forEach((c) => { const k = c.cultivo || SIN.cultivo; porCultivo[k] = (porCultivo[k] || 0) + haDe(c); });
    $('#resumen').innerHTML = bloqueado ? '<span>🔒 Privado</span>' :
      `<span>${datos.campos.length} ${datos.campos.length === 1 ? 'campo' : 'campos'}</span><span>${num(totalHa(datos.campos), 0)} ha</span>` +
      Object.entries(porCultivo).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<span><i style="background:${colorGrupo(k, 'cultivo')}"></i>${esc(k)} · ${num(v, 0)} ha</span>`).join('');
    $('#btn-borrar-todo').classList.toggle('oculto', bloqueado || !datos.campos.length);
  }

  function opciones(lista, actual, todos) {
    return [todos, ...lista].map((v) => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }

  function vistaBloqueada() {
    $('#panel').innerHTML = `<div class="panel-in"><div class="vacio"><div class="ico" aria-hidden="true">🔒</div>
      <h2>Tus campos son privados</h2>
      <p>Se guardan en tu repositorio privado <b>${esc(Repo.config.repo)}</b>. Para verlos y editarlos, conectá tu cuenta de GitHub en este navegador.</p>
      <button class="btn btn-1" type="button" data-accion="conectar">Conectar GitHub</button></div></div>`;
    pintarResumen();
    dibujarCampos();
  }

  function vistaLista() {
    if (bloqueado) return vistaBloqueada();
    abierto = null;
    Pronostico.limpiar();
    // Si un filtro quedó apuntando a un valor que ya no existe, se resetea
    const cultivos = [...new Set(datos.campos.map((c) => c.cultivo || SIN.cultivo))].sort(ordenar);
    const provincias = [...new Set(datos.campos.map((c) => c.provincia || SIN.provincia))].sort(ordenar);
    const campanas = [...new Set(datos.campos.map((c) => c.campana || SIN.campana))].sort(ordenar).reverse();
    if (filtros.cultivo !== 'Todos' && !cultivos.includes(filtros.cultivo)) filtros.cultivo = 'Todos';
    if (filtros.provincia !== 'Todas' && !provincias.includes(filtros.provincia)) filtros.provincia = 'Todas';
    if (filtros.campana !== 'Todas' && !campanas.includes(filtros.campana)) filtros.campana = 'Todas';
    const lista = filtrados();
    const todosMarcados = lista.length > 0 && lista.every((c) => seleccion.has(c.id));
    const elegidos = datos.campos.filter((c) => seleccion.has(c.id));

    $('#panel').innerHTML = `<div class="panel-in">
      ${datos.campos.length ? `
        <label class="buscar"><span aria-hidden="true">⌕</span><input id="buscar" placeholder="Buscar campo, cultivo, localidad o nota…" value="${esc(filtros.q)}"></label>
        <div class="filtros-sel">
          <label>Provincia<select data-filtro="provincia">${opciones(provincias, filtros.provincia, 'Todas')}</select></label>
          <label>Cultivo<select data-filtro="cultivo">${opciones(cultivos, filtros.cultivo, 'Todos')}</select></label>
          <label>Campaña<select data-filtro="campana">${opciones(campanas, filtros.campana, 'Todas')}</select></label>
        </div>
        ${elegidos.length ? `<div class="bloque-sel" role="region" aria-label="Acciones sobre la selección">
          <div class="bloque-sel-h"><b>${elegidos.length} ${elegidos.length === 1 ? 'seleccionado' : 'seleccionados'} · ${num(totalHa(elegidos), 1)} ha</b>
            <button type="button" class="volver" data-accion="limpiar-sel">Quitar selección</button></div>
          <div class="fila2 form">
            <label>Cultivo<select id="sel-cultivo"><option value="__igual">(no cambiar)</option><option value="">Sin cultivo</option>${CULTIVOS.map((x) => `<option>${x.nombre}</option>`).join('')}</select></label>
            <label>Campaña<input id="sel-campana" placeholder="(no cambiar)"></label>
          </div>
          <div class="botones"><button type="button" class="btn btn-1" data-accion="aplicar-sel">Aplicar a la selección</button>
            <button type="button" class="btn" data-accion="encuadrar-sel">Ver en el mapa</button>
            <button type="button" class="btn btn-peligro" data-accion="borrar-sel">Eliminar seleccionados</button></div>
        </div>` : ''}
        <div class="lista-h"><label class="opcion"><input type="checkbox" id="sel-todos" ${todosMarcados ? 'checked' : ''}> Seleccionar ${lista.length === datos.campos.length ? 'todos' : 'los filtrados'} (${lista.length})</label>
          <span class="nota">${num(totalHa(lista), 0)} ha</span></div>
        <div class="lista">${lista.map((c) => `<div class="item${seleccion.has(c.id) ? ' marcado' : ''}" data-id="${esc(c.id)}" role="button" tabindex="0">
          <input type="checkbox" class="sel" data-sel="${esc(c.id)}" ${seleccion.has(c.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(c.nombre)}">
          <span class="franja" style="background:${colorCultivo(c)}"></span>
          <span class="item-txt"><b>${esc(c.nombre)}</b><small>${esc(c.cultivo || SIN.cultivo)}${c.campana ? ' · ' + esc(c.campana) : ''}</small>
            <small>${c.provincia ? '📍 ' + esc([c.localidad || c.departamento, c.provincia].filter(Boolean).join(', ')) : '📍 Ubicando…'}</small></span>
          <span class="ha">${num(haDe(c), 1)} ha</span></div>`).join('') || '<p class="nota">No hay campos con esos filtros.</p>'}</div>
        <p class="nota">Tip: en el mapa, Ctrl + clic (o el botón "Seleccionar") marca varios lotes.</p>`
      : `<div class="vacio"><div class="ico" aria-hidden="true">🌾</div><h2>Cargá tu primer campo</h2>
          <p>Subí uno o varios archivos <b>KML</b> o <b>KMZ</b> (por ejemplo, exportados de Google Earth). Cada polígono se convierte en un campo.</p>
          <button class="btn btn-1" type="button" data-accion="cargar">＋ Cargar KML/KMZ</button></div>`}
    </div>`;

    const input = $('#buscar');
    if (input) input.addEventListener('input', () => {
      filtros.q = input.value;
      const pos = input.selectionStart;
      vistaLista(); dibujarCampos();
      const i = $('#buscar'); i.focus(); i.setSelectionRange(pos, pos);
    });
    pintarResumen();
    dibujarCampos();
    pintarCapas();
  }

  function refrescar() { if (abierto) abrirCampo(abierto, false); else vistaLista(); }

  function resaltarItem(id, si) {
    const el = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.toggle('resaltado', si);
  }

  function alternarSeleccion(id, valor) {
    const si = valor === undefined ? !seleccion.has(id) : valor;
    if (si) seleccion.add(id); else seleccion.delete(id);
    if (abierto) abierto = null;
    vistaLista();
  }

  // ---------- Detalle de un campo ----------
  function abrirCampo(id, volar = true) {
    const c = datos.campos.find((x) => x.id === id);
    if (!c) return vistaLista();
    abierto = id;
    dibujarCampos();
    const capa = capaCampos.getLayers().find((l) => l.campoId === id);
    if (capa && volar) mapa.flyToBounds(capa.getBounds(), { padding: [60, 60], maxZoom: 16, duration: 1.4 });

    const [lat, lon] = KML.centro(c.geometria);
    const esOtro = c.cultivo && !CULTIVOS.some((x) => x.nombre === c.cultivo);
    const ubic = [c.localidad, c.departamento, c.provincia].filter(Boolean).join(', ');
    $('#panel').innerHTML = `<div class="panel-in">
      <button class="volver" type="button" data-accion="lista">← Todos los campos</button>
      <div class="cabecera-campo"><div><h2>${esc(c.nombre)}</h2><small class="nota">${ubic ? '📍 ' + esc(ubic) : '📍 Ubicando…'}</small></div>
        <span class="chip"><i class="muestra" style="background:${colorCultivo(c)}"></i>${esc(c.cultivo || SIN.cultivo)}</span></div>
      <div class="datos">
        <div class="dato"><small>Superficie</small><b>${num(haDe(c), 1)} ha</b></div>
        <div class="dato"><small>Campaña</small><b>${esc(c.campana || '—')}</b></div>
      </div>
      <div class="seccion-t">Pronóstico de la zona</div>
      <div class="clima" id="clima"><div class="esqueleto"></div></div>
      ${c.notas ? `<div class="nota-campo">📝 ${esc(c.notas)}</div>` : ''}
      <details class="editar" ${c.cultivo ? '' : 'open'}><summary>✎ Editar nombre, cultivo, campaña y notas</summary>
        <form class="form" id="form-campo" autocomplete="off">
        <label>Nombre<input name="nombre" required value="${esc(c.nombre)}"></label>
        <div class="fila2">
          <label>Cultivo<select name="cultivo">
            <option value="">Sin cultivo</option>
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
      </details>
      <div class="nota">Centro: ${lat.toFixed(5)}, ${lon.toFixed(5)} · <a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lon}&t=k">Ver en Google Maps</a>${c.archivo ? ` · Archivo: ${esc(c.archivo)}` : ''}</div>
    </div>`;

    $('#form-campo').cultivo.addEventListener('change', (e) => $('#otro-cultivo').classList.toggle('oculto', e.target.value !== '__otro'));
    $('#form-campo').addEventListener('submit', (e) => { e.preventDefault(); guardarCampo(c.id, new FormData(e.target)); });
    mostrarPronostico(c.id, lat, lon);
  }

  async function mostrarPronostico(id, lat, lon) {
    try {
      const d = await Pronostico.cargar(lat, lon);
      if (abierto !== id) return;
      Pronostico.render($('#clima'), d, pestanaClima);
    } catch (e) {
      if (abierto === id) $('#clima').innerHTML = '<p class="nota">No se pudo cargar el pronóstico de la zona.</p>';
    }
  }

  // ---------- Guardar, editar y borrar ----------
  function conToken(accion) {
    if (Repo.tieneToken()) return accion();
    pedirToken(accion);
  }

  async function operar(texto, cambiar, mensaje, exito, extra = {}) {
    cargando(texto);
    try {
      datos = await Repo.guardar(cambiar, mensaje, extra.archivos || [], extra.borrar || []);
      datos.campos = datos.campos || [];
      avisar(exito);
      return true;
    } catch (e) {
      manejarError(e, () => operar(texto, cambiar, mensaje, exito, extra));
      return false;
    } finally { cargando(null); }
  }

  function guardarCampo(id, fd) {
    const cultivo = fd.get('cultivo') === '__otro' ? String(fd.get('otro') || '').trim() : fd.get('cultivo');
    const cambios = {
      nombre: String(fd.get('nombre') || '').trim() || 'Campo sin nombre',
      cultivo,
      campana: String(fd.get('campana') || '').trim(),
      haDeclaradas: fd.get('haDeclaradas') === '' ? null : Number(fd.get('haDeclaradas')),
      notas: String(fd.get('notas') || '').trim()
    };
    conToken(async () => {
      const ok = await operar('Guardando en GitHub…', (actual) => {
        const c = actual.campos.find((x) => x.id === id);
        if (!c) throw new Error('El campo ya no existe (puede que lo hayan borrado).');
        Object.assign(c, cambios, { actualizado: new Date().toISOString() });
        return actual;
      }, `Campos: actualizar "${cambios.nombre}"`, 'Cambios guardados.');
      if (ok) abrirCampo(id, false);
    });
  }

  function borrarCampos(ids, titulo) {
    conToken(async () => {
      const ok = await operar('Eliminando…', (actual) => {
        actual.campos = actual.campos.filter((x) => !ids.includes(x.id));
        return actual;
      }, `Campos: eliminar ${titulo}`, ids.length === 1 ? 'Campo eliminado.' : `${ids.length} campos eliminados.`);
      if (ok) { ids.forEach((id) => seleccion.delete(id)); vistaLista(); }
    });
  }

  function aplicarSeleccion() {
    const cultivo = $('#sel-cultivo').value;
    const campana = $('#sel-campana').value.trim();
    const ids = [...seleccion];
    if (cultivo === '__igual' && !campana) return avisar('Elegí un cultivo o escribí una campaña para aplicar.', 'error');
    conToken(async () => {
      const ok = await operar('Guardando en GitHub…', (actual) => {
        actual.campos.forEach((c) => {
          if (!ids.includes(c.id)) return;
          if (cultivo !== '__igual') c.cultivo = cultivo;
          if (campana) c.campana = campana;
          c.actualizado = new Date().toISOString();
        });
        return actual;
      }, `Campos: actualizar ${ids.length} campos en bloque`, `${ids.length} campos actualizados.`);
      if (ok) vistaLista();
    });
  }

  function confirmarBorrarTodo() {
    abrirVentana(`<h2>Eliminar todos los campos</h2>
      <p>Se van a eliminar los <b>${datos.campos.length}</b> campos (${num(totalHa(datos.campos), 0)} ha) de tu repositorio privado. Queda registrado en el historial de GitHub, pero desde acá no se puede deshacer.</p>
      <form class="form" id="form-borrar-todo">
        <label class="opcion"><input type="checkbox" name="archivos" checked> Borrar también las copias de los archivos KML/KMZ</label>
        <label>Para confirmar, escribí <b>ELIMINAR</b><input name="confirmar" autocomplete="off" required></label>
        <div class="botones"><button class="btn btn-peligro" type="submit">Eliminar todo</button><button class="btn" type="button" data-accion="cerrar">Cancelar</button></div>
      </form>`);
    $('#form-borrar-todo').addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.confirmar.value.trim().toUpperCase() !== 'ELIMINAR') return avisar('Escribí ELIMINAR para confirmar.', 'error');
      const conArchivos = e.target.archivos.checked;
      cerrarVentana();
      conToken(async () => {
        let borrar = [];
        if (conArchivos) { try { borrar = await Repo.listarArchivos(); } catch (err) { avisar('No se pudieron listar los archivos: se borran solo los campos.', 'error'); } }
        const ok = await operar('Eliminando todo…', (actual) => { actual.campos = []; return actual; },
          'Campos: eliminar todos' + (borrar.length ? ' y sus archivos' : ''), 'Se eliminaron todos los campos.', { borrar });
        if (ok) { seleccion.clear(); vistaLista(); encuadrar(); }
      });
    });
  }

  function manejarError(e, reintentar) {
    if (e.sinToken || e.status === 401) { Repo.olvidarToken(); actualizarEstadoGH(); bloquear(); return pedirToken(reintentar, e.status === 401 ? e.message : ''); }
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

    capaNuevos.clearLayers();
    pendientes.forEach((c) => capaNuevos.addLayer(L.geoJSON(c.geometria, { style: { color: '#ffffff', weight: 2.5, fillColor: '#ffc107', fillOpacity: 0.35, className: 'campo-poli nuevo' } })));
    mapa.flyToBounds(capaNuevos.getBounds(), { padding: [40, 40], maxZoom: 15, duration: 1.8 });

    abrirVentana(`<h2>Campos encontrados</h2>
      <p>Se encontraron <b>${pendientes.length}</b> ${pendientes.length === 1 ? 'polígono' : 'polígonos'} (${num(pendientes.reduce((s, c) => s + c.ha, 0), 1)} ha). Revisá los nombres y elegí cuáles guardar.</p>
      ${errores.length ? `<div class="error">${errores.map(esc).join('<br>')}</div>` : ''}
      <div class="fila2 form">
        <label>Cultivo para todos<select id="imp-cultivo"><option value="">Sin cultivo</option>${CULTIVOS.map((x) => `<option>${x.nombre}</option>`).join('')}</select></label>
        <label>Campaña<input id="imp-campana" value="${CAMPANA}"></label>
      </div>
      <label class="opcion"><input type="checkbox" id="imp-todos" checked> Marcar o desmarcar todos</label>
      <div style="overflow-x:auto"><table class="tabla-import"><thead><tr><th></th><th>Nombre</th><th>Superficie</th><th>Archivo</th></tr></thead><tbody>
        ${pendientes.map((c, i) => `<tr><td><input type="checkbox" data-i="${i}" checked aria-label="Incluir"></td>
          <td><input data-nombre="${i}" value="${esc(c.nombre)}"></td><td class="num">${num(c.ha, 1)} ha</td><td class="nota">${esc(c.archivo)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="nota">Se guardan en tu repositorio privado: los datos en <code>data/campos.json</code> y una copia del archivo original. La provincia y la localidad se detectan solas.</p>
      <div class="botones"><button class="btn btn-1" type="button" data-accion="confirmar-import">Guardar campos</button><button class="btn" type="button" data-accion="cerrar">Cancelar</button></div>`,
      () => capaNuevos.clearLayers());
    $('#imp-todos').addEventListener('change', (e) => $$('.tabla-import input[data-i]').forEach((cb) => { cb.checked = e.target.checked; }));
  }

  function confirmarImport() {
    const v = $('.capa .ventana');
    v.querySelectorAll('input[data-i]').forEach((cb) => { pendientes[Number(cb.dataset.i)].incluir = cb.checked; });
    v.querySelectorAll('input[data-nombre]').forEach((inp) => { const p = pendientes[Number(inp.dataset.nombre)]; p.nombre = inp.value.trim() || p.nombre; });
    const cultivo = $('#imp-cultivo').value;
    const campana = $('#imp-campana').value.trim();
    const elegidos = pendientes.filter((c) => c.incluir);
    if (!elegidos.length) return avisar('No elegiste ningún campo.', 'error');
    guardarImport(elegidos, cultivo, campana);
  }

  function guardarImport(elegidos, cultivo, campana) {
    conToken(async () => {
      cargando('Ubicando campos…');
      await ubicarVarios(elegidos, (n, t) => cargando(`Ubicando campos… ${n}/${t}`));
      // Copia de cada archivo original, con fecha para no pisar nada
      const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const originales = [...new Set(elegidos.map((c) => c.original))];
      const archivos = await Promise.all(originales.map(async (f) => ({ nombre: `${sello}-${f.name.replace(/[^\w.\-]+/g, '_')}`, datos: await f.arrayBuffer() })));
      const nombreArchivo = new Map(originales.map((f, i) => [f, archivos[i].nombre]));
      const ahora = new Date().toISOString();
      const nuevos = elegidos.map((c) => ({
        id: nuevoId(), nombre: c.nombre, cultivo, campana, ha: c.ha, haDeclaradas: null, notas: c.descripcion || '',
        provincia: c.provincia || '', departamento: c.departamento || '', localidad: c.localidad || '',
        archivo: nombreArchivo.get(c.original), alta: ahora, actualizado: ahora, geometria: c.geometria
      }));
      cerrarVentana();
      const ok = await operar('Guardando en GitHub…', (actual) => { actual.campos = (actual.campos || []).concat(nuevos); return actual; },
        `Campos: alta de ${nuevos.length} ${nuevos.length === 1 ? 'campo' : 'campos'} (${originales.map((f) => f.name).join(', ')})`,
        nuevos.length === 1 ? 'Campo guardado.' : `${nuevos.length} campos guardados.`, { archivos });
      if (ok) { vistaLista(); encuadrar(); }
    });
  }

  // ---------- Token de GitHub ----------
  function pedirToken(despues, error) {
    abrirVentana(`<h2>Conectar con GitHub</h2>
      <p>Tus campos se guardan en el repositorio <b>privado</b> <code>${esc(Repo.config.repo || '')}</code>. Para verlos y guardarlos hace falta un token de GitHub, que queda solo en este navegador.</p>
      <ol>
        <li>Si todavía no existe, creá el repositorio en <a class="link" href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>: nombre <code>${esc((Repo.config.repo || '').split('/')[1] || '')}</code>, visibilidad <b>Private</b>.</li>
        <li>Abrí <a class="link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li>
        <li><b>Token name:</b> "Tablero campos". <b>Expiration:</b> la que prefieras.</li>
        <li><b>Repository access:</b> "Only select repositories" y elegí <code>${esc((Repo.config.repo || '').split('/')[1] || '')}</code>.</li>
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
        if (bloqueado) await cargarDatos();
        if (despues) despues();
      } catch (err) {
        cerrarVentana();
        pedirToken(despues, err.message);
      } finally { cargando(null); }
    }, { once: true });
  }

  function menuGitHub() {
    if (!Repo.tieneToken()) return pedirToken(null);
    abrirVentana(`<h2>GitHub</h2><p>Este navegador está conectado a tu repositorio privado <b>${esc(Repo.config.repo)}</b>.</p>
      <div class="botones"><button class="btn" type="button" data-accion="cambiar-token">Cambiar token</button>
      <button class="btn btn-peligro" type="button" data-accion="desconectar">Desconectar</button><button class="btn" type="button" data-accion="cerrar">Cerrar</button></div>`);
  }

  function actualizarEstadoGH() {
    $('#estado-gh').classList.toggle('ok', Repo.tieneToken());
    $('#btn-gh').title = Repo.tieneToken() ? 'Conectado con GitHub' : 'Conectar con GitHub';
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('.capa')) cerrarVentana(); else $('#panel-capas')?.classList.add('oculto'); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('item')) { e.preventDefault(); abrirCampo(e.target.dataset.id); }
  });

  // ---------- Eventos ----------
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.sel) { alternarSeleccion(t.dataset.sel, t.checked); return; }
    if (t.id === 'sel-todos') { filtrados().forEach((c) => (t.checked ? seleccion.add(c.id) : seleccion.delete(c.id))); vistaLista(); return; }
    if (t.dataset.filtro && t.tagName === 'SELECT') { filtros[t.dataset.filtro] = t.value; vistaLista(); encuadrar(); }
  });

  document.addEventListener('click', (e) => {
    if (e.target.matches('input.sel')) return; // el checkbox lo maneja "change"
    const pc = $('#panel-capas');
    if (pc && !pc.classList.contains('oculto') && !e.target.closest('.ctrl-mapa')) pc.classList.add('oculto');
    const tab = e.target.closest('[data-pclima]');
    if (tab) {
      pestanaClima = tab.dataset.pclima;
      const c = datos.campos.find((x) => x.id === abierto);
      if (c) { const [lat, lon] = KML.centro(c.geometria); mostrarPronostico(c.id, lat, lon); }
      return;
    }
    const b = e.target.closest('[data-accion],.item');
    if (!b) return;
    if (b.classList.contains('item')) return abrirCampo(b.dataset.id);
    const a = b.dataset.accion;
    if (a === 'lista') { vistaLista(); encuadrar(); }
    else if (a === 'cargar') $('#archivo').click();
    else if (a === 'borrar') { const c = datos.campos.find((x) => x.id === abierto); if (c && confirm(`¿Eliminar "${c.nombre}"?`)) borrarCampos([c.id], `"${c.nombre}"`); }
    else if (a === 'borrar-sel') { const n = seleccion.size; if (n && confirm(`¿Eliminar los ${n} campos seleccionados?`)) borrarCampos([...seleccion], `${n} campos seleccionados`); }
    else if (a === 'aplicar-sel') aplicarSeleccion();
    else if (a === 'limpiar-sel') { seleccion.clear(); vistaLista(); }
    else if (a === 'encuadrar-sel') {
      const capas = capaCampos.getLayers().filter((l) => seleccion.has(l.campoId));
      if (capas.length) mapa.flyToBounds(L.featureGroup(capas).getBounds(), { padding: [50, 50], maxZoom: 15, duration: 1.4 });
    }
    else if (a === 'confirmar-import') confirmarImport();
    else if (a === 'cerrar') cerrarVentana();
    else if (a === 'conectar') pedirToken(null);
    else if (a === 'cambiar-token') { cerrarVentana(); pedirToken(null); }
    else if (a === 'desconectar') { Repo.olvidarToken(); actualizarEstadoGH(); cerrarVentana(); bloquear(); avisar('Desconectado de GitHub.'); }
  });
  $('#btn-cargar').addEventListener('click', () => $('#archivo').click());
  $('#btn-gh').addEventListener('click', menuGitHub);
  $('#btn-borrar-todo').addEventListener('click', () => conToken(confirmarBorrarTodo));
  $('#archivo').addEventListener('change', (e) => { importar(Array.from(e.target.files)); e.target.value = ''; });

  // Arrastrar archivos sobre la página
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    if (ev === 'drop') importar(Array.from(e.dataTransfer.files).filter((f) => /\.(kml|kmz)$/i.test(f.name)));
  }));

  // ---------- Arranque ----------
  function bloquear() {
    bloqueado = true;
    datos = { campos: [] };
    abierto = null;
    seleccion.clear();
    vistaBloqueada();
  }

  async function cargarDatos() {
    cargando('Cargando campos…');
    try {
      datos = await Repo.leer();
      datos.campos = Array.isArray(datos.campos) ? datos.campos : [];
      bloqueado = false;
    } catch (e) {
      cargando(null);
      if (e.sinToken || e.status === 401) {
        if (e.status === 401) { Repo.olvidarToken(); actualizarEstadoGH(); avisar(e.message, 'error'); }
        return bloquear();
      }
      avisar(e.message, 'error');
      bloqueado = false;
      datos = { campos: [] };
    }
    cargando(null);
    vistaLista();
    if (mapa) setTimeout(() => encuadrar(true), 300);
    completarUbicaciones();
  }

  function iniciar() {
    if (!window.L) $('#mapa').innerHTML = '<p style="padding:20px;color:#fff">No se pudo cargar el mapa.</p>';
    else iniciarMapa();
    actualizarEstadoGH();
    cargarDatos();
  }
  iniciar();
})();
