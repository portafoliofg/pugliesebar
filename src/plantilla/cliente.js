// =====================================================
// TABLERO AGRO · comportamiento en el navegador
// Pestañas, animaciones, gráficos, mapa y recarga automática.
// Este archivo se incluye dentro de public/index.html al generar la página.
// Los datos llegan en window.TABLERO (los escribe generar-html.js).
// =====================================================
(function () {
  'use strict';

  var D = window.TABLERO;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nf = function (dec) { return new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); };

  // ---------- Tema claro / oscuro ----------
  var temaGuardado = null;
  try { temaGuardado = localStorage.getItem('vdr-theme'); } catch (e) {}
  if (temaGuardado) document.documentElement.setAttribute('data-theme', temaGuardado);

  function temaActual() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  $('#btn-tema').addEventListener('click', function () {
    var t = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    // La app de stock usa la misma clave, así quedan sincronizadas
    try { localStorage.setItem('vdr-theme', t); } catch (e) {}
    ['#stock-frame', '#campos-frame', '#ventas-frame'].forEach(function (sel) {
      var f = $(sel);
      try { if (f && f.contentWindow && f.contentWindow.applyTheme) f.contentWindow.applyTheme(t); } catch (e) {}
    });
    pintarGraficos();
  });

  // ---------- Saludo según la hora argentina ----------
  var hora = Number(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(new Date()));
  var saludo = hora >= 5 && hora < 13 ? 'Buen día' : hora < 20 && hora >= 13 ? 'Buenas tardes' : 'Buenas noches';
  var s = $('#saludo');
  if (s) s.textContent = saludo;

  // ---------- Partículas de grano en el inicio ----------
  var part = $('.particulas');
  if (part && !reducido) {
    var html = '';
    for (var i = 0; i < 18; i++) {
      html += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;animation-duration:' +
        (9 + Math.random() * 10).toFixed(1) + 's;animation-delay:-' + (Math.random() * 15).toFixed(1) +
        's;transform:scale(' + (0.6 + Math.random() * 0.8).toFixed(2) + ')"></i>';
    }
    part.innerHTML = html;
  }

  // ---------- Pestañas ----------
  var pestanas = $$('.pestana');
  var vistas = $$('.vista');
  var nombres = vistas.map(function (v) { return v.id; });
  var actual = null;

  function mostrar(nombre, empujar) {
    if (nombres.indexOf(nombre) === -1) nombre = 'inicio';
    if (nombre === actual) return;
    var cambiar = function () {
      vistas.forEach(function (v) { v.classList.toggle('activa', v.id === nombre); });
      pestanas.forEach(function (p) {
        var sel = p.getAttribute('data-vista') === nombre;
        p.setAttribute('aria-selected', sel ? 'true' : 'false');
        p.tabIndex = sel ? 0 : -1;
        if (sel && p.scrollIntoView) { try { p.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) {} }
      });
      actual = nombre;
      document.body.classList.toggle('completa', nombre === 'campos' || nombre === 'stock' || nombre === 'ventas');
      mostrarSubCampos();
      window.scrollTo(0, 0);
      alAbrir(nombre);
      revelarAhora();
    };
    // Transición suave entre pestañas (View Transitions API si el navegador la tiene)
    if (document.startViewTransition && !reducido && actual) document.startViewTransition(cambiar);
    else cambiar();
    if (empujar !== false) { try { history.replaceState(null, '', '#' + nombre); } catch (e) {} }
    document.title = (nombre === 'inicio' ? '' : $('[data-vista="' + nombre + '"]').textContent.trim() + ' · ') + D.titulo;
  }

  pestanas.forEach(function (p, idx) {
    p.addEventListener('click', function () { mostrar(p.getAttribute('data-vista')); });
    // Flechas del teclado para moverse entre pestañas
    p.addEventListener('keydown', function (ev) {
      var dir = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      var sig = pestanas[(idx + dir + pestanas.length) % pestanas.length];
      sig.focus();
      mostrar(sig.getAttribute('data-vista'));
    });
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ir]');
    if (b) { ev.preventDefault(); mostrar(b.getAttribute('data-ir')); }
  });
  window.addEventListener('hashchange', function () { mostrar(location.hash.slice(1), false); });

  // ---------- Animación al desplazarse ----------
  var observador = 'IntersectionObserver' in window && !reducido
    ? new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('visible'); contar(e.target); observador.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;

  function revelarAhora() {
    $$('.vista.activa .revelar:not(.visible)').forEach(function (el, i) {
      if (!el.style.getPropertyValue('--retraso')) el.style.setProperty('--retraso', Math.min(i, 6) * 0.07 + 's');
      if (observador) observador.observe(el);
      else { el.classList.add('visible'); contar(el); }
    });
  }

  // Números que "cuentan" hasta su valor al aparecer
  function contar(raiz) {
    $$('[data-contar]', raiz).forEach(function (el) {
      if (el.dataset.contado) return;
      el.dataset.contado = '1';
      var fin = Number(el.getAttribute('data-contar'));
      var dec = Number(el.getAttribute('data-dec') || 0);
      var pre = el.getAttribute('data-pre') || '';
      if (!isFinite(fin) || reducido) return;
      var f = nf(dec);
      var t0 = null;
      var dur = 1100;
      function paso(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);
        el.textContent = pre + f.format(fin * e);
        if (k < 1) requestAnimationFrame(paso);
        else el.textContent = pre + f.format(fin);
      }
      requestAnimationFrame(paso);
    });
  }

  // ---------- Menú lateral (computadora): secciones + acciones de Mis campos ----------
  var mqLateral = window.matchMedia('(min-width: 901px)');
  var subCampos = $('#lateral-campos');
  var marcoCampos = $('#campos-frame');
  try { if (localStorage.getItem('agro-colapsado') === '1') document.body.classList.add('colapsado'); } catch (e) {}
  var btnColapsar = $('#btn-colapsar');
  if (btnColapsar) {
    btnColapsar.setAttribute('aria-pressed', document.body.classList.contains('colapsado') ? 'true' : 'false');
    btnColapsar.addEventListener('click', function () {
      var si = document.body.classList.toggle('colapsado');
      btnColapsar.setAttribute('aria-pressed', si ? 'true' : 'false');
      try { localStorage.setItem('agro-colapsado', si ? '1' : '0'); } catch (e) {}
      // El mapa de Campos cambia de ancho
      setTimeout(function () { try { marcoCampos.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {} }, 320);
    });
  }
  function mostrarSubCampos() {
    if (subCampos) subCampos.hidden = actual !== 'campos' || !mqLateral.matches || !subCampos.innerHTML;
  }
  function avisarCampos() {
    if (marcoCampos && marcoCampos.getAttribute('src') && marcoCampos.contentWindow) {
      marcoCampos.contentWindow.postMessage({ sammartino: 'lateral', activo: mqLateral.matches }, location.origin);
    }
  }
  function altoCabecera() { document.documentElement.style.setProperty('--alto-cab', ($('.cab') ? $('.cab').offsetHeight : 0) + 'px'); }
  altoCabecera();
  var alCambiarAncho = function () { avisarCampos(); mostrarSubCampos(); altoCabecera(); };
  if (mqLateral.addEventListener) mqLateral.addEventListener('change', alCambiarAncho); else mqLateral.addListener(alCambiarAncho);
  window.addEventListener('resize', altoCabecera);

  function escH(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.sammartino || !marcoCampos || e.source !== marcoCampos.contentWindow) return;
    var d = e.data;
    if (d.sammartino === 'listo') return avisarCampos();
    if (d.sammartino !== 'acciones' || !subCampos) return;
    var html = '<div class="lateral-res">' + (d.rol ? '<span>' + escH(d.rol) + '</span>' : '') + (d.resumen || '') + '</div>';
    (d.grupos || []).forEach(function (g) {
      html += '<h4>' + escH(g.titulo) + '</h4>';
      g.items.forEach(function (it) {
        var dentro = '<i aria-hidden="true">' + escH(it.icono) + '</i><span>' + escH(it.texto) + '</span>';
        html += it.href
          ? '<a class="sub" href="' + escH(it.href) + '" target="_blank" rel="noopener" title="' + escH(it.texto) + '">' + dentro + '</a>'
          : '<button class="sub" type="button" data-campos="' + escH(it.id) + '"' + (it.archivo ? ' data-archivo="1"' : '') + ' title="' + escH(it.texto) + '">' + dentro + '</button>';
      });
    });
    subCampos.innerHTML = html;
    mostrarSubCampos();
  });
  if (subCampos) subCampos.addEventListener('click', function (e) {
    var b = e.target.closest('[data-campos]');
    if (!b) return;
    // El selector de archivos tiene que abrirse desde esta página (por el clic); los archivos se pasan a Campos
    if (b.getAttribute('data-archivo')) return $('#lateral-archivo').click();
    marcoCampos.contentWindow.postMessage({ sammartino: 'accion', id: b.getAttribute('data-campos') }, location.origin);
  });
  var entradaArchivo = $('#lateral-archivo');
  if (entradaArchivo) entradaArchivo.addEventListener('change', function () {
    var lista = Array.prototype.slice.call(entradaArchivo.files || []);
    if (lista.length) marcoCampos.contentWindow.postMessage({ sammartino: 'archivos', archivos: lista }, location.origin);
    entradaArchivo.value = '';
  });

  // ---------- Qué hacer al abrir cada pestaña ----------
  var abiertas = {};
  function alAbrir(nombre) {
    if (abiertas[nombre]) return;
    abiertas[nombre] = true;
    if (nombre === 'granos' || nombre === 'dolar') pintarGraficos();
    if (nombre === 'clima') { cargarMapa(); cargarPerspectiva(); }
    if (nombre === 'stock' || nombre === 'campos' || nombre === 'ventas') {
      var f = $('#' + nombre + '-frame');
      if (f && !f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-src'));
    }
  }

  // ---------- Perspectiva de la campaña (El Niño / La Niña) ----------
  function cargarPerspectiva() {
    var enso = $('#persp-enso');
    if (!enso) return;
    if (!D.enso) { enso.innerHTML = '<p class="nota">No se pudo leer el estado de El Niño / La Niña.</p>'; return; }
    var js = document.createElement('script');
    js.src = 'perspectiva.js';
    js.onload = function () {
      enso.innerHTML = window.Perspectiva.cabecera(D.enso);
      var zonas = $('#persp-zonas');
      (D.localidades || []).forEach(function (l) {
        var div = document.createElement('div');
        div.className = 'persp-zona';
        div.innerHTML = '<div class="esqueleto"></div>';
        zonas.appendChild(div);
        window.Perspectiva.calcular(l.lat, l.lon, D.enso)
          .then(function (d) { window.Perspectiva.render(div, d, l.nombre); })
          .catch(function () { div.innerHTML = '<p class="nota">No se pudo calcular la perspectiva de ' + l.nombre + '.</p>'; });
      });
    };
    js.onerror = function () { enso.innerHTML = '<p class="nota">No se pudo cargar la perspectiva.</p>'; };
    document.head.appendChild(js);
  }

  // ---------- Gráficos (Chart.js) ----------
  var graficos = {};
  function color(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function sinGrafico(id, texto) {
    var c = document.getElementById(id);
    if (c) c.parentNode.innerHTML = '<p class="nd">' + texto + '</p>';
  }
  function pintarGraficos() {
    if (!window.Chart) {
      if (document.readyState === 'complete') { sinGrafico('g-granos-dia', 'No se pudo cargar el gráfico.'); sinGrafico('g-dolar', 'No se pudo cargar el gráfico.'); }
      else window.addEventListener('load', pintarGraficos, { once: true });
      return;
    }
    var tinta = color('--muted');
    var linea = color('--line');
    Chart.defaults.color = tinta;
    Chart.defaults.borderColor = linea;
    Chart.defaults.font.family = color('--body');
    var paleta = [color('--lima'), color('--dorado'), color('--naranja'), '#8b5e34'];
    var f2 = nf(0);
    var etiquetas = function (fechas) { return fechas.map(function (f) { return f.slice(8, 10) + '/' + f.slice(5, 7); }); };
    var opciones = function (pre) {
      return {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        animation: reducido ? false : { duration: 1200, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 16 } },
          tooltip: {
            backgroundColor: color('--surface'), titleColor: color('--ink'), bodyColor: color('--ink'),
            borderColor: linea, borderWidth: 1, padding: 12, cornerRadius: 12,
            callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + pre + f2.format(c.parsed.y); } }
          }
        },
        scales: {
          y: { grid: { color: linea }, ticks: { callback: function (v) { return pre + f2.format(v); } } },
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
        }
      };
    };
    var degradado = function (ctx, c) {
      var area = ctx.chart.chartArea;
      if (!area) return c;
      var g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, c + '55');
      g.addColorStop(1, c + '00');
      return g;
    };

    var G = D.graficos;
    if (document.getElementById('g-granos-dia')) dibujarDia(ddActual, { opciones: opciones, etiquetas: etiquetas, paleta: paleta, degradado: degradado, f2: f2, linea: linea });
    if (document.getElementById('g-dolar')) {
      if (G.dolar.fechas.length < 2) sinGrafico('g-dolar', 'Todavía no hay suficiente histórico para graficar.');
      else {
        if (graficos.dolar) graficos.dolar.destroy();
        var c = paleta[0];
        graficos.dolar = new Chart(document.getElementById('g-dolar'), {
          type: 'line',
          data: {
            labels: etiquetas(G.dolar.fechas),
            datasets: [{ label: 'Oficial venta', data: G.dolar.valores, borderColor: c, fill: true, backgroundColor: function (ctx) { return degradado(ctx, c.length === 7 ? c : '#a4c639'); }, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5, tension: .35 }]
          },
          options: opciones('$ ')
        });
      }
    }
    $$('.esqueleto').forEach(function (e) { e.remove(); });
  }

  // ---------- Granos: día a día del grano elegido ----------
  var ddActual = (function () { var b = $('.dd-tab[aria-selected="true"]'); return b ? b.getAttribute('data-dd') : null; })();
  var ddAyuda = null;
  function dibujarDia(clave, ayuda) {
    if (ayuda) ddAyuda = ayuda;
    var A = ddAyuda; var x = D.graficos.granosDia && D.graficos.granosDia[clave];
    if (!A || !x || !document.getElementById('g-granos-dia')) return;
    if (graficos.dia) { graficos.dia.destroy(); graficos.dia = null; }
    var hay = function (v) { return v && v.filter(function (y) { return y != null; }).length; };
    var lienzo = document.getElementById('g-granos-dia'); var vacio = $('.dd-vacio');
    lienzo.hidden = x.fechas.length < 2; if (vacio) vacio.hidden = x.fechas.length >= 2;
    if (x.fechas.length < 2) return;
    var verde = A.paleta[0].length === 7 ? A.paleta[0] : '#a4c639';
    var sets = [{ label: 'Pizarra Rosario ($/t)', data: x.pizarra, yAxisID: 'y', borderColor: verde, fill: true,
      backgroundColor: function (ctx) { return A.degradado(ctx, verde); }, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2.5, tension: .3, spanGaps: true }];
    if (hay(x.cbot)) sets.push({ label: 'Chicago (US$/t)', data: x.cbot, yAxisID: 'y2', borderColor: '#3a8fd6', backgroundColor: '#3a8fd6', pointRadius: 2, borderWidth: 2, tension: .3, spanGaps: true });
    if (x.matba && hay(x.matba.valores)) sets.push({ label: 'Matba ' + x.matba.posicion + ' (US$/t)', data: x.matba.valores, yAxisID: 'y2', borderColor: '#e8833a', backgroundColor: '#e8833a', borderDash: [5, 4], pointRadius: 2, borderWidth: 2, tension: .3, spanGaps: true });
    var op = A.opciones('$ ');
    op.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y2' ? 'US$ ' + nf(2).format(c.parsed.y) : '$ ' + A.f2.format(c.parsed.y)); };
    if (sets.length > 1) op.scales.y2 = { position: 'right', grid: { display: false }, ticks: { callback: function (v) { return 'US$ ' + A.f2.format(v); } } };
    graficos.dia = new Chart(document.getElementById('g-granos-dia'), { type: 'line', data: { labels: A.etiquetas(x.fechas), datasets: sets }, options: op });
  }
  $$('.dd-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      ddActual = b.getAttribute('data-dd');
      $$('.dd-tab').forEach(function (o) { o.setAttribute('aria-selected', o === b ? 'true' : 'false'); });
      $$('.dd-tabla').forEach(function (t) { t.hidden = t.getAttribute('data-dd-tabla') !== ddActual; });
      dibujarDia(ddActual);
    });
  });

  // ---------- Mapa (Leaflet) ----------
  function cargarMapa() {
    var cont = $('#mapa');
    if (!cont) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    js.onload = function () {
      var L = window.L;
      var mapa = L.map(cont, { scrollWheelZoom: false, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; OpenStreetMap'
      }).addTo(mapa);
      var limites = [];
      D.mapa.forEach(function (p) {
        var icono = L.divIcon({ className: '', html: '<div class="pin ' + (p.clase || '') + '"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([p.lat, p.lon], { icon: icono, title: p.nombre }).addTo(mapa).bindPopup(p.popup);
        limites.push([p.lat, p.lon]);
      });
      if (limites.length > 1) mapa.fitBounds(limites, { padding: [50, 50], maxZoom: 9 });
      else if (limites.length) mapa.setView(limites[0], 9);
      else mapa.setView([-31.4, -64.2], 7);
      // Activar el zoom con la rueda recién cuando se hace clic en el mapa
      mapa.on('click', function () { mapa.scrollWheelZoom.enable(); });
    };
    js.onerror = function () { cont.innerHTML = '<p class="nd" style="padding:20px">No se pudo cargar el mapa.</p>'; };
    document.body.appendChild(js);
  }

  // ---------- Recarga automática (con parámetro anti-caché) ----------
  function programarRecarga() {
    setTimeout(function () {
      // En Stock o Campos no se recarga, para no perder lo que estás cargando
      if (actual === 'stock' || actual === 'campos' || actual === 'ventas' || document.hidden) return programarRecarga();
      var u = new URL(location.href);
      u.searchParams.set('t', Date.now());
      location.replace(u.toString());
    }, D.recargaMs);
  }
  programarRecarga();

  // ---------- Pronóstico: botón "i" de cada mercado ----------
  $$('[data-pr-info]').forEach(function (b) {
    b.addEventListener('click', function () {
      var fila = document.getElementById(b.getAttribute('aria-controls'));
      if (!fila) return;
      var abrir = fila.hidden;
      fila.hidden = !abrir;
      b.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    });
  });

  // ---------- Arranque ----------
  mostrar(location.hash.slice(1) || 'inicio', false);

  var splash = $('.splash');
  if (splash) {
    var visto = false;
    try { visto = sessionStorage.getItem('agro-splash') === '1'; sessionStorage.setItem('agro-splash', '1'); } catch (e) {}
    setTimeout(function () { splash.classList.add('fuera'); setTimeout(function () { splash.remove(); }, 300); }, visto || reducido ? 0 : 400);
  }
})();
