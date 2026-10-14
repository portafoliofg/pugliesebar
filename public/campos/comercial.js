// =====================================================
// COMERCIALIZACIÓN
// Ventas de granos por campaña: contratos con precio, a fijar (con sus fijaciones) y canjes.
// Las cruza con la producción esperada (margen bruto + cosechas del cuaderno) y con el
// mercado de hoy (pizarra Rosario y Matba-Rofex a cosecha del tablero).
// Se guarda en data/ventas.json del repositorio privado:
//   { registros: [ { id, campana, cultivo, fecha, tipo, toneladas, precio, moneda, tc, precioUsd,
//                    comprador, contrato, entregaDesde, entregaHasta, limiteFijacion, nota,
//                    fijaciones: [ { id, fecha, toneladas, precio, moneda, tc, precioUsd } ] } ],
//     produccion: { "2026/27": { "Soja": 1200 } } }   ← producción cargada a mano (t)
// =====================================================
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
  const usd = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + 'US$ ' + nf(d).format(Math.abs(v)));
  const fecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
  const haDe = (c) => (c.haDeclaradas != null && c.haDeclaradas !== '' ? Number(c.haDeclaradas) : Number(c.ha) || 0);
  const hoyISO = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
  const E = Economia;
  try { const t = localStorage.getItem('vdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const COLORES = { Soja: '#a4c639', 'Maíz': '#ffc107', Trigo: '#c8962e', Girasol: '#ff9800', Cebada: '#e3c56a', Sorgo: '#b5532a' };
  const TIPOS = { 'Precio hecho': 'Precio fijo acordado al vender', 'A fijar': 'Se entrega y el precio se fija después, en una o varias fijaciones', 'Canje': 'Grano entregado a cambio de insumos (valorizado en US$/t)' };
  const RUTA = 'data/ventas.json';
  const embebido = window.parent !== window;
  if (embebido) document.documentElement.classList.add('embebido');

  function avisar(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.textContent = texto;
    $('#avisos').appendChild(a);
    setTimeout(() => a.remove(), 6000);
  }
  const estado = (t) => { const e = $('#r-estado'); if (e) e.textContent = t; };
  const error = (t) => { $('#reporte').innerHTML = `<div class="r-cargando"><div><p style="font-size:2.5rem">🤝</p><p>${esc(t)}</p>${embebido ? '' : '<p><a class="link" href="./">Volver a Mis campos</a></p>'}</div></div>`; };

  // ---------- Estado ----------
  let campos = []; let labores = []; let margenes = { campanas: {} };
  let archivo = { registros: [], produccion: {} };
  let sel = E.campanaActual();
  let editable = true;
  const graficos = [];

  // ---------- Guardado (leer lo último, cambiar, guardar; si alguien guardó en el medio, reintenta) ----------
  async function guardar(cambiar, mensaje) {
    for (let i = 0; i < 3; i++) {
      const actual = (await Repo.leerRuta(RUTA, { fresco: true }).catch(() => null)) || {};
      actual.registros = actual.registros || []; actual.produccion = actual.produccion || {};
      cambiar(actual);
      actual.actualizado = new Date().toISOString();
      try { await Repo.guardarRuta(RUTA, actual, mensaje); archivo = actual; return; }
      catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }
    }
    throw new Error('El archivo cambió varias veces seguidas. Probá de nuevo.');
  }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- Cálculos ----------
  const toneladasFijadas = (v) => (v.fijaciones || []).reduce((s, f) => s + Number(f.toneladas || 0), 0);
  // Toneladas con precio y su valor en US$ (las a fijar suman solo lo fijado)
  function conPrecio(v) {
    if (v.tipo === 'A fijar') return (v.fijaciones || []).map((f) => ({ t: Number(f.toneladas || 0), p: Number(f.precioUsd) })).filter((x) => x.t && Number.isFinite(x.p));
    return Number.isFinite(Number(v.precioUsd)) ? [{ t: Number(v.toneladas || 0), p: Number(v.precioUsd) }] : [];
  }

  // Producción esperada por cultivo: cosecha real del cuaderno donde la hay; si no, rinde esperado del margen × ha
  function produccionEsperada() {
    const camp = margenes.campanas?.[sel] || { plantillas: {}, lotes: {} };
    const out = {};
    campos.forEach((c) => {
      const sembrado = labores.filter((x) => x.tipo === 'Siembra' && x.cultivo && x.campos.includes(c.id) && E.campanaDe(x.fecha) === sel).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.cultivo;
      const cul = camp.lotes?.[c.id]?.cultivo || [sembrado, c.cultivo].find((x) => E.CULTIVOS.includes(x));
      if (!cul) return;
      const cos = labores.filter((x) => x.tipo === 'Cosecha' && x.rinde != null && x.campos.includes(c.id) && E.campanaDe(x.fecha) === sel).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      const o = out[cul] || (out[cul] = { t: 0, real: 0, ha: 0 });
      if (cos) { const t = cos.rinde / 10 * haDe(c); o.t += t; o.real += t; o.ha += haDe(c); return; }
      const par = E.parametros(camp, cul, camp.lotes?.[c.id]);
      if (par.rinde) { o.t += par.rinde / 10 * haDe(c); o.ha += haDe(c); }
    });
    return out;
  }

  function resumenCultivos() {
    const ventas = archivo.registros.filter((v) => v.campana === sel);
    const esperada = produccionEsperada();
    const manual = archivo.produccion?.[sel] || {};
    const cultivos = [...new Set([...Object.keys(esperada), ...Object.keys(manual), ...ventas.map((v) => v.cultivo)])].sort((a, b) => E.CULTIVOS.indexOf(a) - E.CULTIVOS.indexOf(b));
    return cultivos.map((cul) => {
      const vs = ventas.filter((v) => v.cultivo === cul);
      const precios = vs.flatMap(conPrecio);
      const tPrecio = precios.reduce((s, x) => s + x.t, 0);
      const valor = precios.reduce((s, x) => s + x.t * x.p, 0);
      const tVendida = vs.reduce((s, v) => s + Number(v.toneladas || 0), 0);
      const tAFijar = vs.filter((v) => v.tipo === 'A fijar').reduce((s, v) => s + Math.max(0, Number(v.toneladas || 0) - toneladasFijadas(v)), 0);
      const est = esperada[cul];
      const prod = manual[cul] != null ? Number(manual[cul]) : est ? est.t : null;
      const fuente = manual[cul] != null ? 'cargada a mano' : est ? (est.real && est.real >= est.t - 0.5 ? 'cosecha real' : est.real ? 'cosecha real + rinde esperado' : 'rinde esperado del margen bruto') : null;
      const libre = prod != null ? Math.max(0, prod - tVendida) : null;
      const pizarra = precioPizarra(cul);
      const cosecha = E.precioReferencia(cul);
      return { cul, vs, prod, fuente, est, tVendida, tPrecio, tAFijar, libre, valor, promedio: tPrecio ? valor / tPrecio : null, pizarra, cosecha,
        pct: (t) => (prod ? Math.min(100, (t / prod) * 100) : null) };
    });
  }

  function precioPizarra(cultivo) {
    const p = E.precios(); const clave = { Soja: 'soja', 'Maíz': 'maiz', Trigo: 'trigo', Girasol: 'girasol', Sorgo: 'sorgo', Cebada: 'cebada' }[cultivo];
    const g = p?.pizarra?.granos?.[clave];
    if (!g) return null;
    const v = g.usd ?? (g.pesos && p.dolar?.mayorista ? g.pesos / p.dolar.mayorista : null);
    return v ? { usd: v, fecha: p.pizarra.fecha } : null;
  }

  // ---------- Carga ----------
  async function iniciar() {
    if (!Repo.tieneToken()) return error('Tus ventas son privadas: abrí primero la pestaña Campos y conectá GitHub en este navegador.');
    if (Equipo.rol() === 'carga') return error('La comercialización es información del dueño: tu acceso es solo para cargar labores.');
    editable = Equipo.rol() === 'dueño';
    document.body.classList.toggle('rol-lectura', !editable);
    estado('Leyendo ventas, campos y precios…');
    try {
      const [d, l, m, v] = await Promise.all([Repo.leer(), Agua.labores().catch(() => []), E.leer(), Repo.leerRuta(RUTA).catch(() => null), E.cargarPrecios()]);
      campos = (d.campos || []).filter((c) => c.geometria || c.ha);
      labores = l; margenes = m && m.campanas ? m : { campanas: {} };
      archivo = Object.assign({ registros: [], produccion: {} }, v || {});
    } catch (e) { return error(e.message); }
    const camps = new Set([E.campanaActual(), ...archivo.registros.map((x) => x.campana), ...Object.keys(margenes.campanas)]);
    const y = Number(E.campanaActual().slice(0, 4));
    camps.add(`${y + 1}/${String(y + 2).slice(2)}`);
    $('#f-campana').innerHTML = [...camps].sort().reverse().map((k) => `<option ${k === sel ? 'selected' : ''}>${k}</option>`).join('');
    $('#f-campana').addEventListener('change', (e) => { sel = e.target.value; dibujar(); });
    dibujar();
  }

  // ---------- Dibujo ----------
  function dibujar() {
    while (graficos.length) graficos.pop().destroy();
    const res = resumenCultivos();
    const ventas = archivo.registros.filter((v) => v.campana === sel).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const asegurado = res.reduce((s, r) => s + r.valor, 0);
    const prodTot = res.reduce((s, r) => s + (r.prod || 0), 0);
    const vendTot = res.reduce((s, r) => s + r.tVendida, 0);
    const libreValor = res.reduce((s, r) => s + (r.libre || 0) * ((r.cosecha || r.pizarra)?.usd || 0), 0);
    const aFijarValor = res.reduce((s, r) => s + r.tAFijar * ((r.cosecha || r.pizarra)?.usd || 0), 0);
    const hoy = hoyISO();
    const proximas = archivo.registros.filter((v) => {
      const lim = v.tipo === 'A fijar' && Number(v.toneladas) - toneladasFijadas(v) > 0.01 ? v.limiteFijacion : null;
      return (lim && lim >= hoy) || (v.entregaDesde && (v.entregaHasta || v.entregaDesde) >= hoy);
    }).map((v) => ({ v, cuando: [v.tipo === 'A fijar' && Number(v.toneladas) - toneladasFijadas(v) > 0.01 ? v.limiteFijacion : null, v.entregaDesde].filter((x) => x && x >= hoy).sort()[0] || v.entregaDesde }))
      .sort((a, b) => String(a.cuando).localeCompare(String(b.cuando))).slice(0, 8);
    const kpi = (t, v, d, c) => `<div class="r-kpi" style="--c:${c}"><small>${t}</small><b>${v}</b><span>${d}</span></div>`;

    $('#reporte').innerHTML = `
      <section class="r-portada v-portada">
        <div class="r-portada-txt">
          <span class="eyebrow">Comercialización · campaña ${esc(sel)}</span>
          <h1>${usd(asegurado)}</h1>
          <p>asegurados con precio${prodTot ? ` · vendiste el <b>${num(vendTot / prodTot * 100, 0)} %</b> de lo que esperás cosechar (${num(vendTot, 0)} de ${num(prodTot, 0)} t)` : vendTot ? ` · ${num(vendTot, 0)} t vendidas` : ''}.</p>
          <div class="r-chips">${res.map((r) => `<span><i style="background:${COLORES[r.cul] || '#9aa3a8'}"></i>${esc(r.cul)} · ${r.prod ? num(r.tVendida / r.prod * 100, 0) + ' %' : num(r.tVendida, 0) + ' t'}${r.prod != null && r.tVendida > r.prod + 0.5 ? ' ⚠' : ''}</span>`).join('')}</div>
        </div>
        <div class="m-precios">${E.CULTIVOS.map((c) => { const p = E.precioReferencia(c); const z = precioPizarra(c); return p || z ? `<div><small>${c}</small><b>${p ? usd(p.usd) + '/t' : usd(z.usd) + '/t'}</b><span>${p ? esc(p.fuente) : 'Pizarra Rosario'}${p && z ? ` · disp. ${usd(z.usd)}` : ''}</span></div>` : ''; }).join('')}</div>
      </section>

      <section class="r-kpis">
        ${kpi('Asegurado con precio', usd(asegurado), `${num(res.reduce((s, r) => s + r.tPrecio, 0), 0)} t con precio`, '#7fae2b')}
        ${kpi('A fijar', num(res.reduce((s, r) => s + r.tAFijar, 0), 0) + ' t', aFijarValor ? `≈ ${usd(aFijarValor)} a precio de hoy` : 'sin contratos a fijar', '#3a8fd6')}
        ${kpi('Sin vender', prodTot ? num(res.reduce((s, r) => s + (r.libre || 0), 0), 0) + ' t' : '—', libreValor ? `≈ ${usd(libreValor)} a precio de cosecha` : 'cargá la producción esperada', css('--naranja') || '#e8833a')}
        ${kpi('Sin precio (riesgo)', num(res.reduce((s, r) => s + r.tAFijar + (r.libre || 0), 0), 0) + ' t', libreValor + aFijarValor ? `±US$ 10/t = ±${usd(res.reduce((s, r) => s + r.tAFijar + (r.libre || 0), 0) * 10)}` : '—', '#d9622b')}
      </section>

      <section class="r-sec"><h2>Por cultivo</h2>
        ${res.length ? `<div class="v-cultivos">${res.map((r) => tarjetaCultivo(r)).join('')}</div>` : `<div class="r-card"><p class="nota">Todavía no hay ventas ni producción esperada para ${esc(sel)}. Cargá una venta con <b>＋ Nueva venta</b>, o el rinde esperado en el margen bruto para ver cuánto te queda por vender.</p></div>`}
      </section>

      <section class="r-sec"><h2>Ventas y contratos</h2>
        <div class="r-grid">
          <div class="r-card" style="grid-column:1/-1"><div class="r-tabla-wrap"><table class="r-tabla v-tabla"><thead><tr>
            <th>Fecha</th><th>Cultivo</th><th>Tipo</th><th>Comprador</th><th class="n">Toneladas</th><th class="n">Precio</th><th class="n">Total</th><th>Entrega</th><th>Estado</th><th class="no-print"></th></tr></thead>
            <tbody>${ventas.map((v) => filaVenta(v)).join('') || '<tr><td colspan="10" class="nota">Sin ventas en esta campaña.</td></tr>'}</tbody></table></div></div>
          ${ventas.some((v) => conPrecio(v).length) ? `<div class="r-card"><h3>Precio de cada venta vs. mercado de hoy</h3><p class="nota">Cada punto es una venta o fijación (el tamaño, las toneladas). Las líneas punteadas, el precio a cosecha de hoy.</p><div class="r-graf"><canvas id="g-precios"></canvas></div></div>` : ''}
          <div class="r-card"><h3>Próximos vencimientos y entregas</h3>${proximas.length ? `<ul class="v-agenda">${proximas.map(({ v, cuando }) => `<li><b>${fecha(cuando)}</b><span>${cuando === v.limiteFijacion ? '⏳ Límite para fijar' : '🚚 Entrega'} · ${esc(v.cultivo)} · ${num(cuando === v.limiteFijacion ? Number(v.toneladas) - toneladasFijadas(v) : v.toneladas, 0)} t${v.comprador ? ' · ' + esc(v.comprador) : ''}</span></li>`).join('')}</ul>` : '<p class="nota">Nada próximo. Cargá las fechas de entrega y el límite para fijar en cada contrato.</p>'}</div>
        </div>
      </section>
      <footer class="r-pie">Precios de referencia: Matba-Rofex (posición de cosecha) y pizarra Rosario del tablero, en US$/t. La producción esperada sale del margen bruto (rinde esperado × hectáreas) y de las cosechas registradas en el cuaderno; podés corregirla a mano en cada cultivo. Las ventas se guardan en tu repositorio privado.</footer>`;

    // Gráfico de precios
    const cnv = $('#g-precios');
    if (cnv && window.Chart) {
      Chart.defaults.color = css('--muted'); Chart.defaults.font.family = css('--body');
      const puntos = {};
      ventas.forEach((v) => {
        const lista = v.tipo === 'A fijar' ? (v.fijaciones || []).filter((f) => Number.isFinite(Number(f.precioUsd))).map((f) => ({ f: f.fecha, t: f.toneladas, p: f.precioUsd })) : conPrecio(v).map((x) => ({ f: v.fecha, t: x.t, p: x.p }));
        lista.forEach((x) => (puntos[v.cultivo] = puntos[v.cultivo] || []).push({ x: new Date(x.f + 'T12:00:00').getTime(), y: Number(x.p), r: Math.max(4, Math.min(22, Math.sqrt(Number(x.t)) * 1.2)), t: x.t }));
      });
      const xs = Object.values(puntos).flat().map((p) => p.x);
      const x0 = Math.min(...xs, Date.now()) - 5 * 864e5; const x1 = Date.now() + 5 * 864e5;
      const datasets = Object.entries(puntos).map(([cul, d]) => ({ type: 'bubble', label: cul, data: d, backgroundColor: (COLORES[cul] || '#7aa6c2') + 'bb', borderColor: COLORES[cul] || '#7aa6c2' }));
      Object.keys(puntos).forEach((cul) => { const p = (E.precioReferencia(cul) || precioPizarra(cul))?.usd; if (p) datasets.push({ type: 'line', label: `${cul} hoy`, data: [{ x: x0, y: p }, { x: x1, y: p }], borderColor: COLORES[cul] || '#7aa6c2', borderDash: [6, 5], pointRadius: 0, borderWidth: 2 }); });
      graficos.push(new Chart(cnv, { data: { datasets }, options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => c.raw.t != null ? `${c.dataset.label}: ${num(c.raw.t, 0)} t a ${usd(c.raw.y)}/t` : `${c.dataset.label}: ${usd(c.raw.y)}/t` } } },
        scales: { x: { type: 'linear', min: x0, max: x1, ticks: { callback: (v) => new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) }, grid: { display: false } },
          y: { title: { display: true, text: 'US$/t' }, grid: { color: css('--line') } } } } }));
    }
  }

  function tarjetaCultivo(r) {
    const seg = (t, cls, txt) => (r.prod && t > 0 ? `<i class="${cls}" style="width:${r.pct(t)}%" title="${txt}: ${num(t, 0)} t"></i>` : '');
    const ref = r.cosecha || r.pizarra;
    const dif = r.promedio != null && ref ? r.promedio - ref.usd : null;
    return `<article class="r-card v-cultivo" style="--c:${COLORES[r.cul] || '#9aa3a8'}">
      <div class="v-cab"><h3>${esc(r.cul)}</h3>${r.prod ? `<b>${num(r.tVendida / r.prod * 100, 0)} %</b>` : ''}</div>
      ${r.prod != null && r.tVendida > r.prod + 0.5 ? `<p class="v-alerta">⚠ Vendiste ${num(r.tVendida - r.prod, 0)} t más de lo que esperás cosechar. Revisá la producción esperada o vas a tener que comprar grano para cumplir.</p>` : ''}
      <div class="v-barra">${seg(r.tPrecio, 'v-precio', 'Con precio')}${seg(r.tAFijar, 'v-fijar', 'A fijar')}</div>
      <div class="v-ley"><span><i class="v-precio"></i>Con precio ${num(r.tPrecio, 0)} t</span><span><i class="v-fijar"></i>A fijar ${num(r.tAFijar, 0)} t</span><span><i class="v-libre"></i>Sin vender ${r.libre != null ? num(r.libre, 0) + ' t' : '—'}</span></div>
      <dl class="v-datos">
        <div><dt>Producción esperada</dt><dd>${r.prod != null ? num(r.prod, 0) + ' t' : '—'} <small>${esc(r.fuente || 'sin rinde esperado')}</small>
          <button class="link solo-dueno" type="button" data-prod="${esc(r.cul)}">✎ ${archivo.produccion?.[sel]?.[r.cul] != null ? 'corregir' : 'cargar a mano'}</button></dd></div>
        <div><dt>Precio promedio logrado</dt><dd>${r.promedio != null ? usd(r.promedio, 1) + '/t' : '—'}${dif != null ? ` <small class="${dif >= 0 ? 'pos' : 'neg'}">${dif >= 0 ? '+' : '−'}${usd(Math.abs(dif), 1).replace('US$ ', 'US$ ')} vs. hoy</small>` : ''}</dd></div>
        <div><dt>Mercado hoy</dt><dd>${r.cosecha ? `${usd(r.cosecha.usd)}/t <small>${esc(r.cosecha.fuente)}</small>` : ''}${r.pizarra ? `<br>${usd(r.pizarra.usd)}/t <small>pizarra disponible</small>` : ''}${!ref ? '—' : ''}</dd></div>
        <div><dt>Asegurado</dt><dd>${usd(r.valor)}${r.libre && ref ? `<br><small>Lo sin vender vale ≈ ${usd(r.libre * ref.usd)} hoy</small>` : ''}</dd></div>
      </dl>
    </article>`;
  }

  function filaVenta(v) {
    const fij = toneladasFijadas(v);
    const pend = v.tipo === 'A fijar' ? Math.max(0, Number(v.toneladas) - fij) : 0;
    const cp = conPrecio(v);
    const tp = cp.reduce((s, x) => s + x.t, 0);
    const prom = tp ? cp.reduce((s, x) => s + x.t * x.p, 0) / tp : null;
    const estadoTxt = v.tipo === 'A fijar' ? (pend > 0.01 ? `Fijado ${num(fij, 0)} de ${num(v.toneladas, 0)} t${v.limiteFijacion ? ` · límite ${fecha(v.limiteFijacion)}` : ''}` : 'Fijado completo') : v.tipo === 'Canje' ? 'Canje' : 'Con precio';
    return `<tr data-venta="${esc(v.id)}">
      <td>${fecha(v.fecha)}</td><td><i class="punto-c" style="background:${COLORES[v.cultivo] || '#9aa3a8'}"></i>${esc(v.cultivo)}</td><td>${esc(v.tipo)}</td>
      <td>${esc(v.comprador || '')}${v.contrato ? `<small class="nota"> · N° ${esc(v.contrato)}</small>` : ''}</td>
      <td class="n">${num(v.toneladas, 0)}</td>
      <td class="n">${prom != null ? usd(prom, 1) : '—'}${v.moneda === 'ARS' && v.tipo !== 'A fijar' ? `<small class="nota"><br>$ ${num(v.precio, 0)} / TC ${num(v.tc, 0)}</small>` : ''}</td>
      <td class="n">${tp ? usd(tp * prom) : '—'}</td>
      <td>${v.entregaDesde ? fecha(v.entregaDesde) + (v.entregaHasta && v.entregaHasta !== v.entregaDesde ? ' – ' + fecha(v.entregaHasta) : '') : '—'}</td>
      <td>${esc(estadoTxt)}${v.nota ? `<small class="nota"><br>${esc(v.nota)}</small>` : ''}</td>
      <td class="no-print v-acc solo-dueno">${v.tipo === 'A fijar' && pend > 0.01 ? '<button class="btn" type="button" data-acc="fijar">Fijar</button>' : ''}
        <button class="btn" type="button" data-acc="editar" aria-label="Editar">✎</button><button class="btn" type="button" data-acc="borrar" aria-label="Borrar">✕</button></td></tr>
      ${(v.fijaciones || []).map((f) => `<tr class="v-fij"><td>${fecha(f.fecha)}</td><td colspan="3"><small>↳ Fijación${f.moneda === 'ARS' ? ` · $ ${num(f.precio, 0)} / TC ${num(f.tc, 0)}` : ''}</small></td><td class="n">${num(f.toneladas, 0)}</td><td class="n">${usd(f.precioUsd, 1)}</td><td class="n">${usd(f.toneladas * f.precioUsd)}</td><td colspan="2"></td>
        <td class="no-print solo-dueno"><button class="btn" type="button" data-borrar-fij="${esc(f.id)}" data-de="${esc(v.id)}" aria-label="Borrar fijación">✕</button></td></tr>`).join('')}`;
  }

  // ---------- Ventanas ----------
  function abrir(html) {
    cerrar();
    const capa = document.createElement('div');
    capa.className = 'capa';
    capa.innerHTML = `<div class="ventana" role="dialog" aria-modal="true">${html}</div>`;
    capa.addEventListener('click', (e) => { if (e.target === capa || e.target.closest('[data-cerrar]')) cerrar(); });
    document.body.appendChild(capa);
    setTimeout(() => capa.querySelector('input, select')?.focus(), 50);
    return capa;
  }
  function cerrar() { $('.capa')?.remove(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

  // Precio: en US$/t, o en $/t con tipo de cambio (por defecto el mayorista del tablero)
  const campoPrecio = (pre, v = {}) => `<div class="fila3"><label>Moneda<select name="${pre}moneda"><option value="USD" ${v.moneda !== 'ARS' ? 'selected' : ''}>US$/t</option><option value="ARS" ${v.moneda === 'ARS' ? 'selected' : ''}>$/t</option></select></label>
      <label>Precio<input name="${pre}precio" type="number" min="0" step="any" value="${v.precio ?? ''}"></label>
      <label class="v-tc ${v.moneda === 'ARS' ? '' : 'oculto'}">Tipo de cambio<input name="${pre}tc" type="number" min="0" step="any" value="${v.tc ?? (Math.round(E.precios()?.dolar?.mayorista || 0) || '')}"></label></div>`;
  function leerPrecio(fd, pre) {
    const moneda = fd.get(pre + 'moneda') === 'ARS' ? 'ARS' : 'USD';
    const precio = fd.get(pre + 'precio') === '' ? null : Number(fd.get(pre + 'precio'));
    const tc = moneda === 'ARS' ? Number(fd.get(pre + 'tc')) || null : null;
    const precioUsd = precio == null ? null : moneda === 'ARS' ? (tc ? precio / tc : null) : precio;
    return { moneda, precio, tc, precioUsd: precioUsd == null ? null : Math.round(precioUsd * 100) / 100 };
  }
  function activarPrecio(f, pre) {
    const m = f.querySelector(`[name="${pre}moneda"]`);
    m.addEventListener('change', () => f.querySelector('.v-tc').classList.toggle('oculto', m.value !== 'ARS'));
  }

  function ventanaVenta(v) {
    const nueva = !v; v = v || { campana: sel, fecha: hoyISO(), tipo: 'Precio hecho', moneda: 'USD' };
    const capa = abrir(`<h2>${nueva ? '＋ Nueva venta' : '✎ Editar venta'}</h2>
      <form class="form" id="form-venta" autocomplete="off">
        <div class="fila3"><label>Campaña<select name="campana">${[...$('#f-campana').options].map((o) => `<option ${o.value === v.campana ? 'selected' : ''}>${o.value}</option>`).join('')}</select></label>
          <label>Cultivo<select name="cultivo" required>${E.CULTIVOS.map((c) => `<option ${c === v.cultivo ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label>Fecha<input name="fecha" type="date" required value="${esc(v.fecha)}"></label></div>
        <div class="fila3"><label>Tipo<select name="tipo">${Object.keys(TIPOS).map((t) => `<option ${t === v.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Toneladas<input name="toneladas" type="number" min="0" step="any" required value="${v.toneladas ?? ''}"></label>
          <label>Comprador<input name="comprador" value="${esc(v.comprador || '')}" placeholder="Acopio, cooperativa, exportador…"></label></div>
        <p class="nota v-tipo-txt">${esc(TIPOS[v.tipo])}</p>
        <div class="v-con-precio">${campoPrecio('', v)}</div>
        <label class="v-limite">Límite para fijar<input name="limiteFijacion" type="date" value="${esc(v.limiteFijacion || '')}"></label>
        <div class="fila3"><label>N° de contrato<input name="contrato" value="${esc(v.contrato || '')}"></label>
          <label>Entrega desde<input name="entregaDesde" type="date" value="${esc(v.entregaDesde || '')}"></label>
          <label>Entrega hasta<input name="entregaHasta" type="date" value="${esc(v.entregaHasta || '')}"></label></div>
        <label>Notas<input name="nota" value="${esc(v.nota || '')}" placeholder="Condiciones, calidad, insumo canjeado…"></label>
        <div class="botones"><button class="btn btn-1" type="submit">Guardar</button><button class="btn" type="button" data-cerrar>Cancelar</button></div>
      </form>`);
    const f = $('#form-venta', capa);
    const porTipo = () => {
      const t = f.tipo.value;
      $('.v-tipo-txt', f).textContent = TIPOS[t];
      $('.v-con-precio', f).classList.toggle('oculto', t === 'A fijar');
      $('.v-limite', f).classList.toggle('oculto', t !== 'A fijar');
      f.precio.required = t !== 'A fijar';
    };
    f.tipo.addEventListener('change', porTipo); porTipo(); activarPrecio(f, '');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const t = String(fd.get('tipo'));
      const r = { campana: fd.get('campana'), cultivo: fd.get('cultivo'), fecha: fd.get('fecha'), tipo: t, toneladas: Number(fd.get('toneladas')),
        comprador: String(fd.get('comprador') || '').trim() || null, contrato: String(fd.get('contrato') || '').trim() || null,
        entregaDesde: fd.get('entregaDesde') || null, entregaHasta: fd.get('entregaHasta') || null, nota: String(fd.get('nota') || '').trim() || null,
        limiteFijacion: t === 'A fijar' ? fd.get('limiteFijacion') || null : null };
      Object.assign(r, t === 'A fijar' ? { moneda: null, precio: null, tc: null, precioUsd: null } : leerPrecio(fd, ''));
      if (t !== 'A fijar' && r.precioUsd == null) return avisar('Falta el precio (y el tipo de cambio si es en pesos).', 'error');
      if (t === 'A fijar' && !nueva && toneladasFijadas(v) > r.toneladas + 0.01) return avisar('Ya hay más toneladas fijadas que las del contrato.', 'error');
      try {
        await guardar((a) => {
          if (nueva) a.registros.push(Object.assign({ id: nuevoId(), alta: new Date().toISOString(), fijaciones: [] }, r));
          else { const x = a.registros.find((z) => z.id === v.id); if (x) Object.assign(x, r, t === 'A fijar' ? {} : { fijaciones: [] }); }
        }, `Ventas: ${nueva ? 'nueva' : 'editar'} ${r.cultivo.toLowerCase()} ${num(r.toneladas, 0)} t (${r.campana})`);
        cerrar(); sel = r.campana; $('#f-campana').value = sel; dibujar(); avisar('Venta guardada.');
      } catch (err) { avisar(err.message, 'error'); }
    });
  }

  function ventanaFijar(v) {
    const pend = Math.max(0, Number(v.toneladas) - toneladasFijadas(v));
    const ref = E.precioReferencia(v.cultivo) || precioPizarra(v.cultivo);
    const capa = abrir(`<h2>Fijar precio · ${esc(v.cultivo)} ${esc(v.comprador || '')}</h2>
      <p class="nota">Quedan <b>${num(pend, 1)} t</b> sin precio de este contrato${ref ? ` · referencia hoy ${usd(ref.usd)}/t` : ''}.</p>
      <form class="form" id="form-fijar" autocomplete="off">
        <div class="fila2"><label>Fecha<input name="fecha" type="date" required value="${hoyISO()}"></label>
          <label>Toneladas<input name="toneladas" type="number" min="0" max="${pend}" step="any" required value="${Math.round(pend * 10) / 10}"></label></div>
        ${campoPrecio('', { moneda: 'USD', precio: ref ? Math.round(ref.usd) : '' })}
        <div class="botones"><button class="btn btn-1" type="submit">Guardar fijación</button><button class="btn" type="button" data-cerrar>Cancelar</button></div>
      </form>`);
    const f = $('#form-fijar', capa);
    activarPrecio(f, '');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const fij = Object.assign({ id: nuevoId(), fecha: fd.get('fecha'), toneladas: Number(fd.get('toneladas')) }, leerPrecio(fd, ''));
      if (!(fij.toneladas > 0) || fij.toneladas > pend + 0.01) return avisar(`Las toneladas tienen que ser entre 0 y ${num(pend, 1)}.`, 'error');
      if (fij.precioUsd == null) return avisar('Falta el precio.', 'error');
      try {
        await guardar((a) => { const x = a.registros.find((z) => z.id === v.id); if (x) (x.fijaciones = x.fijaciones || []).push(fij); }, `Ventas: fijación ${v.cultivo.toLowerCase()} ${num(fij.toneladas, 0)} t`);
        cerrar(); dibujar(); avisar('Fijación guardada.');
      } catch (err) { avisar(err.message, 'error'); }
    });
  }

  function ventanaProduccion(cul) {
    const r = resumenCultivos().find((x) => x.cul === cul) || {};
    const manual = archivo.produccion?.[sel]?.[cul];
    const capa = abrir(`<h2>Producción esperada · ${esc(cul)} ${esc(sel)}</h2>
      <p class="nota">${r.est ? `Según tus lotes: <b>${num(r.est.t, 0)} t</b> en ${num(r.est.ha, 0)} ha (rinde esperado del margen bruto${r.est.real ? ' y cosechas del cuaderno' : ''}).` : 'Todavía no hay rinde esperado en el margen bruto para este cultivo.'} Si cargás un valor, se usa ese.</p>
      <form class="form" id="form-prod"><label>Toneladas<input name="t" type="number" min="0" step="any" value="${manual ?? ''}" placeholder="${r.est ? Math.round(r.est.t) : ''}"></label>
        <div class="botones"><button class="btn btn-1" type="submit">Guardar</button>${manual != null ? '<button class="btn" type="button" data-quitar>Usar el cálculo de los lotes</button>' : ''}<button class="btn" type="button" data-cerrar>Cancelar</button></div></form>`);
    const f = $('#form-prod', capa);
    const grabar = async (valor) => {
      try {
        await guardar((a) => { a.produccion[sel] = a.produccion[sel] || {}; if (valor == null) delete a.produccion[sel][cul]; else a.produccion[sel][cul] = valor; }, `Ventas: producción esperada de ${cul.toLowerCase()} ${sel}`);
        cerrar(); dibujar();
      } catch (err) { avisar(err.message, 'error'); }
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); grabar(f.t.value === '' ? null : Number(f.t.value)); });
    $('[data-quitar]', capa)?.addEventListener('click', () => grabar(null));
  }

  // ---------- Eventos ----------
  document.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-prod]');
    if (p && editable) return ventanaProduccion(p.dataset.prod);
    const fb = e.target.closest('[data-borrar-fij]');
    if (fb && editable) {
      if (!confirm('¿Borrar esta fijación?')) return;
      try { await guardar((a) => { const x = a.registros.find((z) => z.id === fb.dataset.de); if (x) x.fijaciones = (x.fijaciones || []).filter((f) => f.id !== fb.dataset.borrarFij); }, 'Ventas: borrar una fijación'); dibujar(); }
      catch (err) { avisar(err.message, 'error'); }
      return;
    }
    const b = e.target.closest('[data-acc]');
    if (!b || !editable) return;
    const v = archivo.registros.find((x) => x.id === b.closest('tr')?.dataset.venta);
    if (!v) return;
    if (b.dataset.acc === 'fijar') ventanaFijar(v);
    else if (b.dataset.acc === 'editar') ventanaVenta(v);
    else if (b.dataset.acc === 'borrar' && confirm(`¿Borrar la venta de ${num(v.toneladas, 0)} t de ${v.cultivo}${v.fijaciones?.length ? ' y sus fijaciones' : ''}?`)) {
      try { await guardar((a) => { a.registros = a.registros.filter((x) => x.id !== v.id); }, `Ventas: borrar ${v.cultivo.toLowerCase()} ${num(v.toneladas, 0)} t`); dibujar(); avisar('Venta borrada.'); }
      catch (err) { avisar(err.message, 'error'); }
    }
  });
  $('#btn-nueva').addEventListener('click', () => editable && ventanaVenta(null));
  $('#btn-pdf').addEventListener('click', () => window.print());
  $('#btn-csv').addEventListener('click', () => {
    const filas = [['campana', 'fecha', 'cultivo', 'tipo', 'comprador', 'contrato', 'toneladas', 'moneda', 'precio', 'tipo_cambio', 'precio_usd_t', 'toneladas_fijadas', 'entrega_desde', 'entrega_hasta', 'limite_fijacion', 'notas']];
    archivo.registros.filter((v) => v.campana === sel).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((v) => {
      filas.push([v.campana, v.fecha, v.cultivo, v.tipo, v.comprador, v.contrato, v.toneladas, v.moneda, v.precio, v.tc, v.precioUsd, v.tipo === 'A fijar' ? toneladasFijadas(v) : null, v.entregaDesde, v.entregaHasta, v.limiteFijacion, v.nota]);
      (v.fijaciones || []).forEach((f) => filas.push([v.campana, f.fecha, v.cultivo, 'Fijación', v.comprador, v.contrato, f.toneladas, f.moneda, f.precio, f.tc, f.precioUsd, null, null, null, null, null]));
    });
    const txt = '﻿' + filas.map((r) => r.map((x) => (x == null ? '' : typeof x === 'number' ? String(x).replace('.', ',') : `"${String(x).replace(/"/g, '""')}"`)).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `ventas_${sel.replace('/', '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  // Datos nuevos que llegan en segundo plano (otra pestaña u otro dispositivo)
  window.addEventListener('repo:cambio', (e) => {
    const { ruta, datos } = e.detail;
    if (!$('.v-tabla') || $('.capa')) return;
    if (ruta === RUTA) archivo = Object.assign({ registros: [], produccion: {} }, datos || {});
    else if (ruta === 'data/labores.json') labores = (datos && datos.registros) || [];
    else if (ruta === 'data/margenes.json') margenes = datos && datos.campanas ? datos : { campanas: {} };
    else return;
    dibujar();
  });

  // El tablero cambia el tema claro/oscuro de esta página cuando está adentro
  window.applyTheme = (t) => { document.documentElement.setAttribute('data-theme', t); if ($('.v-tabla')) dibujar(); };

  iniciar().catch((e) => error(e.message || String(e)));
})();
