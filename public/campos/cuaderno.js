// =====================================================
// CUADERNO DE CAMPO
// Todas las labores (data/labores.json) por lote y por campaña: historial, rindes por
// campaña y por cultivo, insumos usados y costos cargados. Se imprime o exporta a CSV.
// =====================================================
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const ordenar = (a, b) => String(a).localeCompare(String(b), 'es');
  const fecha = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
  const haDe = (c) => (c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || 0);
  const E = Economia;
  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const ICONO = { Siembra: '🌱', 'Pulverización': '💧', 'Fertilización': '🧪', Cosecha: '🌾', Labranza: '🚜', Otra: '📝' };
  const COLORES = { Soja: '#a4c639', 'Maíz': '#ffc107', Trigo: '#c8962e', Girasol: '#ff9800', Cebada: '#e3c56a', Sorgo: '#b5532a' };

  function avisar(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.textContent = texto;
    $('#avisos').appendChild(a);
    setTimeout(() => a.remove(), 6000);
  }
  const estado = (t) => { const e = $('#r-estado'); if (e) e.textContent = t; };
  const error = (t) => { $('#reporte').innerHTML = `<div class="r-cargando"><div><p style="font-size:2.5rem">📚</p><p>${esc(t)}</p><p><a class="link" href="./">Volver a Mis campos</a></p></div></div>`; };

  let campos = []; let porId = {}; let labores = [];
  const filtro = { campana: E.campanaActual(), provincia: 'Todas', tipo: 'Todas', lote: new URLSearchParams(location.search).get('lote') || '' };
  const graficos = [];

  async function iniciar() {
    if (!Repo.tieneToken()) return error('Tus campos son privados: abrí primero la pestaña Campos y conectá GitHub en este navegador.');
    document.body.classList.toggle('rol-lectura', Equipo.rol() === 'lectura');
    document.body.classList.toggle('rol-carga', Equipo.rol() === 'carga');
    estado('Leyendo campos y labores…');
    try {
      const [d, l] = await Promise.all([Repo.leer(), Agua.labores()]);
      campos = d.campos || []; labores = l;
    } catch (e) { return error(e.message); }
    porId = Object.fromEntries(campos.map((c) => [c.id, c]));
    const camps = [...new Set([E.campanaActual(), ...labores.map((x) => E.campanaDe(x.fecha))])].sort().reverse();
    if (!labores.some((x) => E.campanaDe(x.fecha) === filtro.campana) && labores.length) filtro.campana = E.campanaDe(labores.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0].fecha);
    $('#f-campana').innerHTML = ['Todas', ...camps].map((k) => `<option ${k === filtro.campana ? 'selected' : ''}>${k}</option>`).join('');
    $('#f-provincia').innerHTML = ['Todas', ...new Set(campos.map((c) => c.provincia || 'Sin ubicar'))].sort((a, b) => (a === 'Todas' ? -1 : b === 'Todas' ? 1 : ordenar(a, b))).map((k) => `<option>${esc(k)}</option>`).join('');
    $('#f-tipo').innerHTML = ['Todas', ...Agua.TIPOS_LABOR].map((k) => `<option>${k}</option>`).join('');
    ['campana', 'provincia', 'tipo'].forEach((k) => $('#f-' + k).addEventListener('change', (e) => { filtro[k] = e.target.value; dibujar(); }));
    dibujar();
  }

  const enCampana = (l) => filtro.campana === 'Todas' || E.campanaDe(l.fecha) === filtro.campana;
  const enProvincia = (id) => filtro.provincia === 'Todas' || (porId[id]?.provincia || 'Sin ubicar') === filtro.provincia;
  const detalle = (l) => [l.cultivo, l.variedad, l.producto, l.dosis != null ? `${num(l.dosis, l.dosis % 1 ? 2 : 0)} ${l.unidad || ''}` : '', l.rinde != null ? `${num(l.rinde, 1)} qq/ha` : ''].filter(Boolean).join(' · ');

  // Rinde promedio ponderado por superficie de un conjunto de cosechas
  function rindePonderado(cosechas) {
    let s = 0; let h = 0;
    cosechas.forEach((x) => { const sup = x.superficie || x.campos.reduce((t, id) => t + haDe(porId[id] || {}), 0) || 1; s += x.rinde * sup; h += sup; });
    return h ? { rinde: s / h, ha: h } : null;
  }

  function dibujar() {
    while (graficos.length) graficos.pop().destroy();
    const lista = labores.filter((l) => enCampana(l) && (filtro.tipo === 'Todas' || l.tipo === filtro.tipo) && l.campos.some(enProvincia))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const lotesCon = [...new Set(lista.flatMap((l) => l.campos.filter(enProvincia)))].filter((id) => porId[id]);
    const supTipo = (t) => lista.filter((l) => l.tipo === t).reduce((s, l) => s + (l.superficie || 0), 0);
    const cosechas = labores.filter((l) => l.tipo === 'Cosecha' && l.rinde != null && l.campos.some(enProvincia));
    const costo = lista.filter((l) => l.costo != null).reduce((s, l) => s + l.costo * (l.superficie || 0), 0);

    // Rindes por cultivo y campaña (todas las campañas, para comparar)
    const tabla = {};
    cosechas.forEach((x) => { const k = (x.cultivo || 'Sin cultivo') + '|' + E.campanaDe(x.fecha); (tabla[k] = tabla[k] || []).push(x); });
    const camps = [...new Set(cosechas.map((x) => E.campanaDe(x.fecha)))].sort();
    const cultivos = [...new Set(cosechas.map((x) => x.cultivo || 'Sin cultivo'))].sort(ordenar);

    // Insumos aplicados (dosis × superficie)
    const insumos = {};
    lista.filter((l) => l.producto && l.dosis != null && l.superficie).forEach((l) => {
      const u = (l.unidad || '').replace('/ha', '');
      const k = l.producto.trim().toLowerCase() + '|' + u;
      const x = insumos[k] || (insumos[k] = { producto: l.producto.trim(), unidad: u, total: 0, ha: 0, veces: 0 });
      x.total += l.dosis * l.superficie; x.ha += l.superficie; x.veces++;
    });

    const kpi = (t, v, d, c) => `<div class="r-kpi" style="--c:${c}"><small>${t}</small><b>${v}</b><span>${d}</span></div>`;
    const lotesFiltrados = campos.filter((c) => enProvincia(c.id) && (!filtro.lote || c.id === filtro.lote)).sort((a, b) => ordenar(a.nombre, b.nombre));

    $('#reporte').innerHTML = `
      <section class="r-portada c-portada">
        <div class="r-portada-txt">
          <span class="eyebrow">Cuaderno de campo · ${filtro.campana === 'Todas' ? 'todas las campañas' : 'campaña ' + esc(filtro.campana)}</span>
          <h1>${lista.length} ${lista.length === 1 ? 'labor' : 'labores'}</h1>
          <p>${lotesCon.length} ${lotesCon.length === 1 ? 'lote' : 'lotes'} con registros${filtro.provincia !== 'Todas' ? ' en ' + esc(filtro.provincia) : ''}.</p>
          <div class="r-chips">${Agua.TIPOS_LABOR.map((t) => { const n = lista.filter((l) => l.tipo === t).length; return n ? `<span>${ICONO[t]} ${t} · ${n}</span>` : ''; }).join('')}</div>
        </div>
        <div class="c-linea">${lista.slice(0, 6).map((l) => `<div><b>${ICONO[l.tipo] || '•'} ${esc(l.tipo)}</b><span>${fecha(l.fecha)} · ${esc(l.campos.map((id) => porId[id]?.nombre).filter(Boolean).slice(0, 2).join(', '))}${l.campos.length > 2 ? ' +' + (l.campos.length - 2) : ''}</span></div>`).join('') || '<div><b>Sin labores</b><span>Registralas desde Mis campos → 📒 Labores.</span></div>'}</div>
      </section>

      <section class="r-kpis">
        ${kpi('Sembradas', num(supTipo('Siembra'), 0) + ' ha', 'en el período', '#a4c639')}
        ${kpi('Pulverizadas', num(supTipo('Pulverización'), 0) + ' ha', 'suma de aplicaciones', '#3a8fd6')}
        ${kpi('Fertilizadas', num(supTipo('Fertilización'), 0) + ' ha', 'suma de aplicaciones', '#8e6bbf')}
        ${kpi('Cosechadas', num(supTipo('Cosecha'), 0) + ' ha', (() => { const r = rindePonderado(lista.filter((l) => l.tipo === 'Cosecha' && l.rinde != null)); return r ? `rinde medio ${num(r.rinde, 1)} qq/ha` : 'sin rindes cargados'; })(), '#c8962e')}
        ${kpi('Costo cargado', costo ? 'US$ ' + num(costo, 0) : '—', costo ? 'labores con costo × superficie' : 'cargá el costo en cada labor', css('--naranja'))}
      </section>

      <section class="r-sec"><h2>Rindes por campaña</h2>
        ${camps.length ? `<div class="r-grid">
          <div class="r-card"><h3>Rinde promedio por cultivo (qq/ha)</h3><p class="nota">Ponderado por superficie cosechada.</p>
            <div class="r-tabla-wrap"><table class="r-tabla"><thead><tr><th>Cultivo</th>${camps.map((k) => `<th class="n">${k}</th>`).join('')}</tr></thead><tbody>
            ${cultivos.map((cu) => `<tr><td><b>${esc(cu)}</b></td>${camps.map((k) => { const r = tabla[cu + '|' + k] ? rindePonderado(tabla[cu + '|' + k]) : null; return `<td class="n">${r ? `<b>${num(r.rinde, 1)}</b><small class="nota"> ${num(r.ha, 0)} ha</small>` : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>
          <div class="r-card"><h3>Evolución del rinde</h3><div class="r-graf"><canvas id="g-rindes"></canvas></div></div>
        </div>` : '<div class="r-card"><p class="nota">Cuando registres cosechas con su rinde, acá vas a poder comparar campañas por cultivo y por lote.</p></div>'}
      </section>

      <section class="r-sec"><h2>Historial por lote</h2>
        <div class="r-card">
          <label class="buscar no-print"><span aria-hidden="true">⌕</span><select id="f-lote"><option value="">Todos los lotes con labores</option>${campos.slice().sort((a, b) => ordenar(a.nombre, b.nombre)).map((c) => `<option value="${esc(c.id)}" ${c.id === filtro.lote ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
          <div class="c-lotes">${lotesFiltrados.map((c) => tarjetaLote(c)).filter(Boolean).join('') || '<p class="nota">No hay labores con estos filtros.</p>'}</div>
        </div>
      </section>

      ${Object.keys(insumos).length ? `<section class="r-sec"><h2>Insumos aplicados</h2>
        <div class="r-card"><p class="nota">Dosis × superficie de cada labor (sirve para controlar el stock).</p><div class="r-tabla-wrap"><table class="r-tabla"><thead><tr><th>Producto</th><th class="n">Total</th><th class="n">Superficie</th><th class="n">Aplicaciones</th></tr></thead><tbody>
        ${Object.values(insumos).sort((a, b) => ordenar(a.producto, b.producto)).map((x) => `<tr><td><b>${esc(x.producto)}</b></td><td class="n">${num(x.total, x.total < 100 ? 1 : 0)} ${esc(x.unidad)}</td><td class="n">${num(x.ha, 0)} ha</td><td class="n">${x.veces}</td></tr>`).join('')}</tbody></table></div></div></section>` : ''}

      <section class="r-sec"><h2>Todas las labores</h2>
        <div class="r-card"><div class="r-tabla-wrap"><table class="r-tabla"><thead><tr><th>Fecha</th><th>Labor</th><th>Lotes</th><th>Detalle</th><th class="n">Sup.</th><th class="n">Costo</th><th>Contratista</th><th>Notas</th><th class="no-print"></th></tr></thead><tbody>
        ${lista.map((l) => `<tr><td>${fecha(l.fecha)}</td><td><b>${ICONO[l.tipo] || ''} ${esc(l.tipo)}</b></td><td>${esc(l.campos.map((id) => porId[id]?.nombre || 'campo borrado').join(', '))}</td><td>${esc(detalle(l))}</td>
          <td class="n">${l.superficie ? num(l.superficie, 0) + ' ha' : '—'}</td><td class="n">${l.costo != null ? 'US$ ' + num(l.costo, 0) + '/ha' : '—'}</td><td>${esc(l.contratista || '')}</td><td>${esc(l.nota || '')}${l.cargadoPor ? `<small class="nota">${l.nota ? ' · ' : ''}cargó ${esc(l.cargadoPor)}</small>` : ''}</td>
          <td class="no-print">${puedeBorrar(l) ? `<button type="button" class="btn" data-borrar="${esc(l.id)}" aria-label="Borrar">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="nota">Sin labores.</td></tr>'}</tbody></table></div></div>
      </section>
      <footer class="r-pie">Cuaderno de campo de Sammartino. Las labores se registran desde Mis campos (📒 Labores) y quedan guardadas en tu repositorio privado.</footer>`;

    $('#f-lote').addEventListener('change', (e) => { filtro.lote = e.target.value; dibujar(); });
    const reg = $('a[href^="./#labor"]');
    if (reg) reg.href = './#labor' + (filtro.lote ? '=' + encodeURIComponent(filtro.lote) : '');

    if (!window.Chart || !camps.length) return;
    Chart.defaults.color = css('--muted'); Chart.defaults.font.family = css('--body');
    graficos.push(new Chart($('#g-rindes'), {
      type: 'line',
      data: { labels: camps, datasets: cultivos.map((cu) => ({ label: cu, data: camps.map((k) => { const r = tabla[cu + '|' + k] ? rindePonderado(tabla[cu + '|' + k]) : null; return r ? Math.round(r.rinde * 10) / 10 : null; }), borderColor: COLORES[cu] || '#7aa6c2', backgroundColor: COLORES[cu] || '#7aa6c2', tension: .3, spanGaps: true, pointRadius: 5 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'qq/ha' }, beginAtZero: true, grid: { color: css('--line') } }, x: { grid: { display: false } } } }
    }));
  }

  const puedeBorrar = (l) => Equipo.rol() === 'dueño' || (Equipo.rol() === 'carga' && l.cargadoPor && l.cargadoPor === Equipo.yo().nombre);

  // Tarjeta de un lote: sus campañas (de la más nueva a la más vieja) con cada labor
  function tarjetaLote(c) {
    const l = labores.filter((x) => x.campos.includes(c.id) && enCampana(x) && (filtro.tipo === 'Todas' || x.tipo === filtro.tipo));
    if (!l.length && !filtro.lote) return '';
    const porCamp = {};
    l.forEach((x) => { (porCamp[E.campanaDe(x.fecha)] = porCamp[E.campanaDe(x.fecha)] || []).push(x); });
    const rindes = labores.filter((x) => x.campos.includes(c.id) && x.tipo === 'Cosecha' && x.rinde != null).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return `<article class="c-lote">
      <div class="c-lote-h"><div><h3>${esc(c.nombre)}</h3><small class="nota">${esc([c.localidad || c.departamento, c.provincia].filter(Boolean).join(', '))} · ${num(haDe(c), 0)} ha</small></div>
        ${rindes.length ? `<div class="c-rindes">${rindes.slice(-5).map((x) => `<span title="${esc(x.cultivo || '')} ${fecha(x.fecha)}"><b>${num(x.rinde, 1)}</b> qq<small>${esc((x.cultivo || '').slice(0, 4))} ${E.campanaDe(x.fecha)}</small></span>`).join('')}</div>` : ''}
        <a class="link no-print" href="reporte.html?id=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Reporte del lote ↗</a></div>
      ${Object.entries(porCamp).sort((a, b) => b[0].localeCompare(a[0])).map(([k, xs]) => `<div class="c-camp"><b class="c-camp-t">Campaña ${k}</b>
        <ol class="c-tiempo">${xs.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => `<li><span class="c-ico">${ICONO[x.tipo] || '•'}</span><div><b>${fecha(x.fecha)} · ${esc(x.tipo)}</b> ${esc(detalle(x))}${x.costo != null ? ` · US$ ${num(x.costo, 0)}/ha` : ''}<small>${esc([x.contratista, x.nota].filter(Boolean).join(' · '))}</small></div></li>`).join('')}</ol></div>`).join('') || '<p class="nota">Sin labores en este período.</p>'}
    </article>`;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-borrar]');
    if (!b || !confirm('¿Borrar esta labor? Si se cargó en varios lotes, se borra de todos.')) return;
    Agua.borrarLabor(b.dataset.borrar).then(async () => { labores = await Agua.labores(); avisar('Labor borrada.'); dibujar(); }).catch((err) => avisar(err.message, 'error'));
  });
  $('#btn-pdf').addEventListener('click', () => window.print());
  $('#btn-csv').addEventListener('click', () => {
    const filas = [['fecha', 'campana', 'labor', 'lote', 'provincia', 'cultivo', 'variedad', 'producto', 'dosis', 'unidad', 'superficie_ha', 'costo_usd_ha', 'rinde_qq_ha', 'contratista', 'notas', 'cargado_por']];
    labores.filter((l) => enCampana(l) && (filtro.tipo === 'Todas' || l.tipo === filtro.tipo)).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((l) => l.campos.filter(enProvincia).forEach((id) => {
      const c = porId[id] || {};
      filas.push([l.fecha, E.campanaDe(l.fecha), l.tipo, c.nombre, c.provincia, l.cultivo, l.variedad, l.producto, l.dosis, l.unidad, l.superficie, l.costo, l.rinde, l.contratista, l.nota, l.cargadoPor]);
    }));
    const txt = '﻿' + filas.map((r) => r.map((v) => (v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `cuaderno_de_campo_${filtro.campana.replace('/', '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  // Datos nuevos que llegan en segundo plano (se mostró primero la copia local)
  window.addEventListener('repo:cambio', (e) => {
    const { ruta, datos } = e.detail;
    if (!$('#f-lote')) return;
    if (ruta === 'data/labores.json') labores = (datos && datos.registros) || [];
    else if (ruta === Repo.config.ruta) { campos = (datos && datos.campos) || []; porId = Object.fromEntries(campos.map((c) => [c.id, c])); }
    else return;
    dibujar();
  });

  iniciar().catch((e) => error(e.message || String(e)));
})();
