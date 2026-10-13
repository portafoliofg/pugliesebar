// =====================================================
// ECONOMÍA DE LOS LOTES · margen bruto
// Precios: public/precios.json del tablero (Matba-Rofex a cosecha, pizarra, dólar).
// Presupuestos: data/margenes.json del repositorio privado:
//   { campanas: { "2026/27": { plantillas: { Soja: {...} }, lotes: { <id>: {...} }, precios: { Soja: 360 } } } }
// Un lote usa la plantilla de su cultivo, salvo los valores que se le cambien solo a él.
// =====================================================
(function () {
  'use strict';

  // Posición de Matba-Rofex que se toma como "precio a cosecha" de cada cultivo
  const COSECHA = { Soja: { clave: 'soja', mes: 'MAY' }, 'Maíz': { clave: 'maiz', mes: 'ABR' }, Trigo: { clave: 'trigo', mes: 'DIC' }, Cebada: { clave: 'trigo', mes: 'DIC', referencia: 'trigo' } };
  const CULTIVOS = ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo', 'Cebada'];

  // Rubros de costo directo (US$/ha)
  const RUBROS = [
    ['semilla', 'Semilla'], ['fertilizantes', 'Fertilizantes'], ['herbicidas', 'Herbicidas'], ['protectores', 'Insecticidas y fungicidas'],
    ['labores', 'Labores (siembra, aplicaciones)'], ['seguro', 'Seguro'], ['otros', 'Otros']
  ];
  const BASE = () => ({ rinde: null, semilla: 0, fertilizantes: 0, herbicidas: 0, protectores: 0, labores: 0, seguro: 0, otros: 0,
    cosechaPct: 8, cosechaUsd: null, alquilerUsd: 0, alquilerQq: 0, flete: 25, comisionPct: 3 });

  const campanaDe = (fecha) => { const y = Number(fecha.slice(0, 4)); return Number(fecha.slice(5, 7)) >= 7 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`; };
  const campanaActual = () => campanaDe(new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10));

  let precios = null;
  async function cargarPrecios() {
    if (precios) return precios;
    try { precios = await fetch('../precios.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch (e) { precios = null; }
    return precios;
  }

  /** Precio de referencia (US$/t) de un cultivo y de dónde sale. */
  function precioReferencia(cultivo) {
    const p = precios;
    if (!p) return null;
    const c = COSECHA[cultivo];
    if (c && p.matba?.granos?.[c.clave]?.length) {
      const pos = p.matba.granos[c.clave].find((x) => x.posicion.startsWith(c.mes)) || p.matba.granos[c.clave][p.matba.granos[c.clave].length - 1];
      return { usd: pos.usdTonelada, fuente: `Matba-Rofex ${pos.posicion}${c.referencia ? ' (referencia trigo)' : ''}`, fecha: pos.fecha };
    }
    const clave = { Girasol: 'girasol', Sorgo: 'maiz' }[cultivo];
    const g = clave && p.pizarra?.granos?.[clave];
    if (g) {
      const usd = g.usd ?? (g.pesos && p.dolar?.mayorista ? g.pesos / p.dolar.mayorista : null);
      if (usd) return { usd: cultivo === 'Sorgo' ? usd * 0.9 : usd, fuente: cultivo === 'Sorgo' ? 'Pizarra maíz −10 % (referencia)' : 'Pizarra Rosario (disponible)', fecha: p.pizarra.fecha };
    }
    return null;
  }

  // ---------- Presupuestos guardados ----------
  async function leer() { return (await Repo.leerRuta('data/margenes.json').catch(() => null)) || { campanas: {} }; }
  async function guardar(cambiar, mensaje) {
    for (let i = 0; i < 3; i++) {
      const actual = await leer();
      const nuevo = cambiar(actual);
      nuevo.actualizado = new Date().toISOString();
      try { await Repo.guardarRuta('data/margenes.json', nuevo, mensaje); return nuevo; }
      catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }
    }
    throw new Error('El archivo cambió varias veces seguidas. Probá de nuevo.');
  }

  /** Parámetros efectivos de un lote: plantilla del cultivo + lo propio del lote. */
  function parametros(camp, cultivo, propio) {
    return Object.assign(BASE(), camp?.plantillas?.[cultivo] || {}, propio || {});
  }

  /** Margen bruto por hectárea y por lote. `precioSoja` valúa el alquiler en quintales. */
  function calcular(par, precio, ha, precioSoja) {
    if (!precio || !par.rinde) return null;
    const t = par.rinde / 10;
    const ib = t * precio;
    const comision = ib * (par.comisionPct || 0) / 100;
    const flete = t * (par.flete || 0);
    const gc = comision + flete;
    const ineto = ib - gc;
    const cosecha = par.cosechaUsd != null && par.cosechaUsd !== '' ? Number(par.cosechaUsd) : ib * (par.cosechaPct || 0) / 100;
    const alquiler = Number(par.alquilerUsd || 0) + (Number(par.alquilerQq || 0) / 10) * ((precioSoja || precio) * (1 - (par.comisionPct || 0) / 100) - (par.flete || 0));
    const directos = RUBROS.reduce((s, [k]) => s + Number(par[k] || 0), 0);
    const cd = directos + cosecha + alquiler;
    const mb = ineto - cd;
    // Rinde de indiferencia: el que cubre todos los costos (la cosecha en % crece con el rinde)
    const pctCos = par.cosechaUsd != null && par.cosechaUsd !== '' ? 0 : (par.cosechaPct || 0) / 100;
    const fijo = directos + alquiler + (pctCos ? 0 : cosecha);
    const netoPorT = precio * (1 - (par.comisionPct || 0) / 100 - pctCos) - (par.flete || 0);
    const indif = netoPorT > 0 ? (fijo / netoPorT) * 10 : null;
    return { ib, gc, ineto, cosecha, alquiler, directos, cd, mb, mbLote: ha ? mb * ha : null, indif, retorno: cd ? (mb / cd) * 100 : null,
      precioIndif: t > 0 ? (fijo + gc - comision) / (t * (1 - (par.comisionPct || 0) / 100 - pctCos)) : null };
  }

  /** Tabla de sensibilidad: margen por ha con precio y rinde ±10 %. */
  function sensibilidad(par, precio, precioSoja) {
    const f = [0.9, 1, 1.1];
    return f.map((fr) => f.map((fp) => calcular(Object.assign({}, par, { rinde: par.rinde * fr }), precio * fp, null, precioSoja)?.mb ?? null));
  }

  window.Economia = { CULTIVOS, RUBROS, BASE, campanaDe, campanaActual, cargarPrecios, precioReferencia, leer, guardar, parametros, calcular, sensibilidad, precios: () => precios };
})();
