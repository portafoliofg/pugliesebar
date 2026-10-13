// =====================================================
// MARGEN BRUTO POR LOTE
// Plantillas por cultivo (rinde esperado y costos) + ajustes por lote, precio a cosecha
// de Matba-Rofex, rinde de indiferencia, sensibilidad ±10 % y comparación con lo real
// (rinde de las cosechas y costos cargados en el cuaderno de campo).
// =====================================================
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const usd = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + 'US$ ' + nf(d).format(Math.abs(v)));
  const ordenar = (a, b) => String(a).localeCompare(String(b), 'es');
  const haDe = (c) => (c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || 0);
  const E = Economia;
  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function avisar(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.textContent = texto;
    $('#avisos').appendChild(a);
    setTimeout(() => a.remove(), 6000);
  }
  const estado = (t) => { const e = $('#r-estado'); if (e) e.textContent = t; };
  const error = (t) => { $('#reporte').innerHTML = `<div class="r-cargando"><div><p style="font-size:2.5rem">💰</p><p>${esc(t)}</p><p><a class="link" href="./">Volver a Mis campos</a></p></div></div>`; };

  // ---------- Estado ----------
  let campos = [];
  let labores = [];
  let archivo = { campanas: {} };
  let sel = E.campanaActual();
  let cultivoTab = 'Soja';
  let sucio = false;
  let editable = true;
  const graficos = [];

  const camp = () => (archivo.campanas[sel] = archivo.campanas[sel] || { plantillas: {}, lotes: {}, precios: {} });
  const precioDe = (cultivo) => {
    const c = camp();
    if (c.precios?.[cultivo]) return { usd: Number(c.precios[cultivo]), fuente: 'Precio cargado a mano' };
    return E.precioReferencia(cultivo);
  };
  // Cultivo del lote: el elegido acá, si no el de la siembra registrada en el cuaderno para esta campaña, si no el del campo
  const sembrado = (c) => labores.filter((x) => x.tipo === 'Siembra' && x.cultivo && x.campos.includes(c.id) && E.campanaDe(x.fecha) === sel).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.cultivo;
  const cultivoLote = (c) => camp().lotes[c.id]?.cultivo || [sembrado(c), c.cultivo].find((x) => E.CULTIVOS.includes(x)) || null;
  const marcarSucio = () => { sucio = true; $('#sin-guardar').classList.remove('oculto'); };

  // Rinde y costos reales del cuaderno de campo (misma campaña)
  function real(c) {
    const l = labores.filter((x) => x.campos.includes(c.id) && E.campanaDe(x.fecha) === sel);
    const cos = l.filter((x) => x.tipo === 'Cosecha' && x.rinde != null).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const costos = l.filter((x) => x.costo != null).reduce((s, x) => s + Number(x.costo), 0);
    return { rinde: cos ? cos.rinde : null, costos: l.some((x) => x.costo != null) ? costos : null, labores: l.length };
  }

  function filaLote(c) {
    const cul = cultivoLote(c);
    if (!cul) return { c, cul: null, re: real(c) };
    const par = E.parametros(camp(), cul, camp().lotes[c.id]);
    const p = precioDe(cul);
    const ps = precioDe('Soja')?.usd;
    const r = p ? E.calcular(par, p.usd, haDe(c), ps) : null;
    const re = real(c);
    let rReal = null;
    if (re.rinde != null && p) {
      const parReal = Object.assign({}, par, { rinde: re.rinde });
      if (re.costos != null) { E.RUBROS.forEach(([k]) => { parReal[k] = 0; }); parReal.otros = re.costos; }
      rReal = E.calcular(parReal, p.usd, haDe(c), ps);
    }
    return { c, cul, par, p, r, re, rReal };
  }

  // ---------- Carga ----------
  async function iniciar() {
    if (!Repo.tieneToken()) return error('Tus campos son privados: abrí primero la pestaña Campos y conectá GitHub en este navegador.');
    if (Equipo.rol() === 'carga') return error('El margen bruto es información económica del dueño: tu acceso es solo para cargar labores.');
    editable = Equipo.rol() === 'dueño';
    document.body.classList.toggle('rol-lectura', !editable);
    estado('Leyendo campos, labores y precios…');
    try {
      const [d, l, m] = await Promise.all([Repo.leer(), Agua.labores().catch(() => []), E.leer(), E.cargarPrecios()]);
      campos = (d.campos || []).filter((c) => c.geometria || c.ha);
      labores = l;
      archivo = m && m.campanas ? m : { campanas: {} };
    } catch (e) { return error(e.message); }
    const camps = new Set([E.campanaActual(), ...Object.keys(archivo.campanas), ...labores.map((x) => E.campanaDe(x.fecha))]);
    const y = Number(E.campanaActual().slice(0, 4));
    camps.add(`${y + 1}/${String(y + 2).slice(2)}`);
    $('#f-campana').innerHTML = [...camps].sort().reverse().map((k) => `<option ${k === sel ? 'selected' : ''}>${k}</option>`).join('');
    $('#f-campana').addEventListener('change', (e) => { sel = e.target.value; dibujar(); });
    const usados = [...new Set(campos.map(cultivoLote).filter(Boolean))];
    const pedido = campos.find((c) => c.id === new URLSearchParams(location.search).get('lote'));
    cultivoTab = (pedido && cultivoLote(pedido)) || usados[0] || 'Soja';
    dibujar();
    // Desde el panel de un lote: se resalta su fila
    const fila = pedido && document.querySelector(`tr[data-lote="${CSS.escape(pedido.id)}"]`);
    if (fila) { fila.classList.add('m-resaltado'); fila.scrollIntoView({ block: 'center' }); }
  }

  // ---------- Dibujo ----------
  const campo = (k, t, v, extra = '') => `<label>${t}<input type="number" step="any" min="0" data-k="${k}" value="${v ?? ''}" ${editable ? '' : 'disabled'} ${extra}></label>`;

  // Redibuja después de que el foco pasó al campo siguiente y lo devuelve ahí (si no, se pierde lo que se tipea)
  function redibujar() {
    setTimeout(() => {
      const a = document.activeElement;
      const clave = a && a.matches('input, select') ? { k: a.dataset.k, p: a.dataset.precio, lk: a.dataset.lk, lote: a.closest('tr')?.dataset.lote } : null;
      const y = window.scrollY;
      dibujar();
      window.scrollTo(0, y);
      if (!clave) return;
      const sel2 = clave.k ? `[data-k="${clave.k}"]` : clave.p ? `[data-precio="${clave.p}"]` : clave.lk && clave.lote ? `tr[data-lote="${CSS.escape(clave.lote)}"] [data-lk="${clave.lk}"]` : null;
      const n = sel2 && document.querySelector(sel2);
      if (n) { n.focus(); if (n.select) n.select(); }
    }, 0);
  }

  function dibujar() {
    while (graficos.length) graficos.pop().destroy();
    const filas = campos.map(filaLote).sort((a, b) => ordenar(a.c.nombre, b.c.nombre));
    const con = filas.filter((f) => f.r);
    const ha = con.reduce((s, f) => s + haDe(f.c), 0);
    const tot = (k) => con.reduce((s, f) => s + f.r[k] * haDe(f.c), 0);
    const mbTot = tot('mb'); const cdTot = tot('cd'); const inTot = tot('ineto');
    const sinCultivo = filas.filter((f) => !f.cul);
    const kpi = (t, v, d, c) => `<div class="r-kpi" style="--c:${c}"><small>${t}</small><b>${v}</b><span>${d}</span></div>`;
    const porCultivo = {};
    con.forEach((f) => { const x = porCultivo[f.cul] || (porCultivo[f.cul] = { ha: 0, mb: 0 }); x.ha += haDe(f.c); x.mb += f.r.mb * haDe(f.c); });
    const pl = E.parametros(camp(), cultivoTab, null);
    const pr = precioDe(cultivoTab);
    const prSoja = precioDe('Soja')?.usd;
    const rPl = pr ? E.calcular(pl, pr.usd, 1, prSoja) : null;
    const sens = pr && pl.rinde ? E.sensibilidad(pl, pr.usd, prSoja) : null;

    $('#reporte').innerHTML = `
      <section class="r-portada m-portada">
        <div class="r-portada-txt">
          <span class="eyebrow">Margen bruto · campaña ${esc(sel)}</span>
          <h1>${con.length ? usd(mbTot) : 'Armá tu presupuesto'}</h1>
          <p>${con.length ? `${con.length} lotes presupuestados · ${num(ha, 0)} ha · ${usd(ha ? mbTot / ha : null)}/ha promedio` : 'Completá el rinde esperado y los costos de cada cultivo: el margen se calcula solo con el precio a cosecha de Matba-Rofex.'}</p>
          <div class="r-chips">${Object.entries(porCultivo).map(([k, x]) => `<span>${esc(k)} · ${usd(x.mb / x.ha)}/ha</span>`).join('')}</div>
        </div>
        <div class="m-precios">${E.CULTIVOS.map((k) => { const p = precioDe(k); return `<div><small>${k}</small><b>${p ? usd(p.usd) : '—'}<i>/t</i></b><span>${esc(p?.fuente || 'Sin precio: cargalo abajo')}</span></div>`; }).join('')}</div>
      </section>

      <section class="r-kpis">
        ${kpi('Margen bruto total', usd(mbTot), `${num(ha, 0)} ha presupuestadas`, mbTot >= 0 ? css('--sube') : css('--baja'))}
        ${kpi('Margen por hectárea', usd(ha ? mbTot / ha : null), 'Promedio ponderado', css('--lima'))}
        ${kpi('Ingreso neto', usd(inTot), 'Después de flete y comisiones', '#3a8fd6')}
        ${kpi('Costos directos', usd(cdTot), 'Insumos, labores, cosecha y alquiler', css('--naranja'))}
        ${kpi('Retorno sobre costos', cdTot ? num((mbTot / cdTot) * 100, 0) + ' %' : '—', 'Margen ÷ costos directos', css('--dorado'))}
      </section>

      <section class="r-sec"><h2>Plantillas por cultivo</h2>
        <p class="nota">Valores por hectárea en dólares. Cada lote usa la plantilla de su cultivo; abajo podés cambiar el rinde o el alquiler de un lote en particular.</p>
        <div class="r-card">
          <div class="m-tabs" role="tablist">${E.CULTIVOS.map((k) => `<button type="button" role="tab" data-cultivo="${k}" aria-selected="${k === cultivoTab}">${k}${camp().plantillas[k]?.rinde ? ' ✓' : ''}</button>`).join('')}</div>
          <div class="m-plantilla">
            <form class="form m-form" id="form-plantilla" autocomplete="off">
              <div class="m-grupo"><b>Producción y precio</b>
                ${campo('rinde', 'Rinde esperado (qq/ha)', pl.rinde)}
                <label>Precio (US$/t)<input type="number" step="any" min="0" data-precio="${cultivoTab}" value="${camp().precios?.[cultivoTab] ?? ''}" placeholder="${pr ? num(pr.usd, 0) + ' · ' + esc(pr.fuente) : 'Sin precio de referencia'}" ${editable ? '' : 'disabled'}></label>
                ${campo('flete', 'Flete (US$/t)', pl.flete)}
                ${campo('comisionPct', 'Comisiones y gastos (% del bruto)', pl.comisionPct)}
              </div>
              <div class="m-grupo"><b>Costos directos (US$/ha)</b>${E.RUBROS.map(([k, t]) => campo(k, t, pl[k])).join('')}</div>
              <div class="m-grupo"><b>Cosecha y alquiler</b>
                ${campo('cosechaPct', 'Cosecha (% del bruto)', pl.cosechaPct)}
                ${campo('cosechaUsd', 'o cosecha fija (US$/ha)', pl.cosechaUsd, 'placeholder="Opcional"')}
                ${campo('alquilerUsd', 'Alquiler (US$/ha)', pl.alquilerUsd)}
                ${campo('alquilerQq', 'o alquiler (qq de soja/ha)', pl.alquilerQq)}
              </div>
            </form>
            <div class="m-resultado">
              ${rPl ? `<div class="m-mb ${rPl.mb >= 0 ? 'pos' : 'neg'}"><small>Margen bruto ${esc(cultivoTab.toLowerCase())}</small><b>${usd(rPl.mb)}<i>/ha</i></b></div>
                <table class="m-cuenta"><tbody>
                  <tr><td>Ingreso bruto (${num(pl.rinde, 1)} qq × ${usd(pr.usd)}/t)</td><td>${usd(rPl.ib)}</td></tr>
                  <tr><td>− Flete y comisiones</td><td>${usd(-rPl.gc)}</td></tr>
                  <tr class="sub"><td>Ingreso neto</td><td>${usd(rPl.ineto)}</td></tr>
                  <tr><td>− Insumos y labores</td><td>${usd(-rPl.directos)}</td></tr>
                  <tr><td>− Cosecha</td><td>${usd(-rPl.cosecha)}</td></tr>
                  <tr><td>− Alquiler</td><td>${usd(-rPl.alquiler)}</td></tr>
                  <tr class="total"><td>Margen bruto</td><td>${usd(rPl.mb)}</td></tr>
                </tbody></table>
                <div class="r-datos">
                  <div><small>Rinde de indiferencia</small><b>${num(rPl.indif, 1)} qq/ha</b></div>
                  <div><small>Precio de indiferencia</small><b>${usd(rPl.precioIndif)}/t</b></div>
                  <div><small>Retorno</small><b>${num(rPl.retorno, 0)} %</b></div>
                </div>
                ${sens ? `<table class="m-sens"><caption>Margen por ha si cambian precio y rinde</caption><thead><tr><th>Rinde \\ Precio</th>${[0.9, 1, 1.1].map((f) => `<th>${f === 1 ? 'Actual' : f < 1 ? '−10 %' : '+10 %'}<small>${usd(pr.usd * f)}</small></th>`).join('')}</tr></thead>
                  <tbody>${sens.map((fila, i) => `<tr><th>${['−10 %', 'Esperado', '+10 %'][i]}<small>${num(pl.rinde * [0.9, 1, 1.1][i], 1)} qq</small></th>${fila.map((v, j) => `<td class="${v >= 0 ? 'pos' : 'neg'}${i === 1 && j === 1 ? ' actual' : ''}">${usd(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}`
                : `<p class="nota">${pr ? 'Cargá el rinde esperado para ver el margen.' : 'No hay precio de referencia para este cultivo: cargalo en "Precio".'}</p>`}
            </div>
          </div>
        </div>
      </section>

      <section class="r-sec"><h2>Lotes</h2>
        ${sinCultivo.length ? `<p class="nota">${sinCultivo.length} ${sinCultivo.length === 1 ? 'lote no tiene' : 'lotes no tienen'} cultivo: elegilo en la tabla para incluirlo en el presupuesto.</p>` : ''}
        <div class="r-card"><div class="r-tabla-wrap"><table class="r-tabla m-lotes"><thead><tr>
          <th>Lote</th><th>Cultivo</th><th class="n">Ha</th><th class="n">Rinde esp. (qq)</th><th class="n">Alquiler (US$/ha)</th><th class="n">MB/ha</th><th class="n">MB lote</th><th class="n">Indiferencia</th><th class="n">Rinde real</th><th class="n">MB real/ha</th></tr></thead>
          <tbody>${filas.map((f) => `<tr data-lote="${esc(f.c.id)}">
            <td><b>${esc(f.c.nombre)}</b><small class="nota">${esc([f.c.localidad || f.c.departamento, f.c.provincia].filter(Boolean).join(', '))}</small></td>
            <td><select data-lk="cultivo" ${editable ? '' : 'disabled'}><option value="">—</option>${E.CULTIVOS.map((k) => `<option ${k === f.cul ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
            <td class="n">${num(haDe(f.c), 0)}</td>
            <td class="n"><input type="number" step="any" min="0" data-lk="rinde" value="${camp().lotes[f.c.id]?.rinde ?? ''}" placeholder="${f.par?.rinde ?? ''}" ${editable && f.cul ? '' : 'disabled'}></td>
            <td class="n"><input type="number" step="any" min="0" data-lk="alquilerUsd" value="${camp().lotes[f.c.id]?.alquilerUsd ?? ''}" placeholder="${f.par?.alquilerUsd ?? ''}" ${editable && f.cul ? '' : 'disabled'}></td>
            <td class="n ${f.r ? (f.r.mb >= 0 ? 'pos' : 'neg') : ''}"><b>${f.r ? usd(f.r.mb) : '—'}</b></td>
            <td class="n">${f.r ? usd(f.r.mbLote) : '—'}</td>
            <td class="n">${f.r ? num(f.r.indif, 1) + ' qq' : '—'}</td>
            <td class="n">${f.re.rinde != null ? num(f.re.rinde, 1) + ' qq' : '<small class="nota">sin cosecha</small>'}</td>
            <td class="n ${f.rReal ? (f.rReal.mb >= 0 ? 'pos' : 'neg') : ''}">${f.rReal ? usd(f.rReal.mb) : '—'}${f.re.costos != null ? '<small class="nota">con costos del cuaderno</small>' : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td><b>Total</b></td><td></td><td class="n"><b>${num(ha, 0)}</b></td><td></td><td></td><td class="n"><b>${usd(ha ? mbTot / ha : null)}</b></td><td class="n"><b>${usd(mbTot)}</b></td><td></td><td></td><td></td></tr></tfoot>
        </table></div>
        <p class="nota">Rinde real y MB real salen de las cosechas cargadas en el cuaderno de campo para esta campaña. Si cargaste costos en las labores, el MB real usa esos costos en lugar de la plantilla.</p></div>
      </section>

      ${con.length ? `<section class="r-sec"><h2>Gráficos</h2><div class="r-grid">
        <div class="r-card"><h3>Margen bruto por cultivo (US$/ha)</h3><div class="r-graf"><canvas id="g-cultivo"></canvas></div></div>
        <div class="r-card"><h3>Margen de cada lote (US$ totales)</h3><div class="r-graf"><canvas id="g-lotes"></canvas></div></div>
      </div></section>` : ''}
      <footer class="r-pie">Precios: Matba-Rofex (posición de cosecha) y pizarra Rosario, del tablero. El margen bruto no incluye gastos de estructura, impuestos ni amortizaciones. Es una herramienta de planificación: revisá los valores con tu asesor.</footer>`;

    // Eventos de la plantilla
    $$('.m-tabs [data-cultivo]').forEach((b) => b.addEventListener('click', () => { cultivoTab = b.dataset.cultivo; dibujar(); }));
    $('#form-plantilla').addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.precio) { const v = t.value === '' ? null : Number(t.value); camp().precios[t.dataset.precio] = v; if (v == null) delete camp().precios[t.dataset.precio]; }
      else if (t.dataset.k) { const p = camp().plantillas[cultivoTab] = camp().plantillas[cultivoTab] || {}; p[t.dataset.k] = t.value === '' ? (t.dataset.k === 'cosechaUsd' || t.dataset.k === 'rinde' ? null : 0) : Number(t.value); }
      marcarSucio(); redibujar();
    });
    $('.m-lotes').addEventListener('change', (e) => {
      const t = e.target; const id = t.closest('tr')?.dataset.lote;
      if (!id || !t.dataset.lk) return;
      const l = camp().lotes[id] = camp().lotes[id] || {};
      if (t.value === '') delete l[t.dataset.lk]; else l[t.dataset.lk] = t.dataset.lk === 'cultivo' ? t.value : Number(t.value);
      if (!Object.keys(l).length) delete camp().lotes[id];
      marcarSucio(); redibujar();
    });

    // Gráficos
    if (!window.Chart || !con.length) return;
    Chart.defaults.color = css('--muted'); Chart.defaults.font.family = css('--body');
    const cul = Object.entries(porCultivo);
    graficos.push(new Chart($('#g-cultivo'), { type: 'bar', data: { labels: cul.map((x) => x[0]), datasets: [{ data: cul.map((x) => Math.round(x[1].mb / x[1].ha)), backgroundColor: cul.map((x) => (x[1].mb >= 0 ? '#7fae2b' : '#d9622b')), borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'US$/ha' }, grid: { color: css('--line') } }, x: { grid: { display: false } } } } }));
    const top = con.slice().sort((a, b) => b.r.mbLote - a.r.mbLote).slice(0, 25);
    graficos.push(new Chart($('#g-lotes'), { type: 'bar', data: { labels: top.map((f) => f.c.nombre), datasets: [{ data: top.map((f) => Math.round(f.r.mbLote)), backgroundColor: top.map((f) => (f.r.mbLote >= 0 ? '#3a8fd6' : '#d9622b')), borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'US$' }, grid: { color: css('--line') } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 10 } } } } } }));
  }

  // ---------- Guardar / exportar ----------
  $('#btn-guardar').addEventListener('click', async () => {
    if (!editable) return;
    const b = $('#btn-guardar'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      const mio = archivo.campanas[sel];
      archivo = await E.guardar((actual) => { actual.campanas = actual.campanas || {}; actual.campanas[sel] = mio; return actual; }, `Margen bruto: presupuesto ${sel}`);
      sucio = false; $('#sin-guardar').classList.add('oculto'); avisar('Presupuesto guardado.');
    } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; b.textContent = '💾 Guardar'; }
  });
  addEventListener('beforeunload', (e) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } });
  $('#btn-pdf').addEventListener('click', () => window.print());
  $('#btn-csv').addEventListener('click', () => {
    const filas = [['lote', 'provincia', 'cultivo', 'ha', 'rinde_esperado_qq', 'precio_usd_t', 'ingreso_bruto_usd_ha', 'gastos_comerciales_usd_ha', 'costos_directos_usd_ha', 'margen_usd_ha', 'margen_lote_usd', 'rinde_indiferencia_qq', 'rinde_real_qq', 'margen_real_usd_ha']];
    campos.map(filaLote).forEach((f) => { if (f.r) filas.push([f.c.nombre, f.c.provincia, f.cul, haDe(f.c), f.par.rinde, f.p?.usd, f.r.ib, f.r.gc, f.r.cd, f.r.mb, f.r.mbLote, f.r.indif, f.re.rinde, f.rReal?.mb]); });
    const txt = '﻿' + filas.map((r) => r.map((v) => (v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`)).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `margen_bruto_${sel.replace('/', '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  iniciar().catch((e) => error(e.message || String(e)));
})();
