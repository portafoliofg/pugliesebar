// Agua útil, suelo INTA, lluvias propias y análisis de suelo de cada lote.
// Los calcula el workflow "Agua útil de los campos" del repositorio privado y deja:
//   data/agua/resumen.json        estado actual de cada campo
//   data/agua/campos/<id>.json    serie diaria (92 días) y proyección (16 días)
//   data/suelo/inta.json          Carta de Suelos del INTA 1:500.000 de cada campo
// Lo que cargás vos desde la página:
//   data/lluvias.json             registros de pluviómetro
//   data/suelos-analisis.json     análisis de suelo de laboratorio
(function () {
  'use strict';

  const ESTADOS = [
    { nombre: 'Seco', max: 25, color: '#c0392b' }, { nombre: 'Escaso', max: 50, color: '#f39c12' },
    { nombre: 'Adecuado', max: 75, color: '#a4c639' }, { nombre: 'Óptimo', max: 95, color: '#2e8b57' },
    { nombre: 'Perfil lleno', max: 1000, color: '#1d5fa8' }
  ];
  const estado = (pct) => (pct == null ? null : ESTADOS.find((e) => pct < e.max));
  const color = (pct) => estado(pct)?.color || '#9aa3a8';
  const FUENTES = { propia: 'Tu pluviómetro', satelite: 'Satélite CHIRPS', modelo: 'Modelo (Open-Meteo)', pronostico: 'Pronóstico' };
  const COLOR_FUENTE = { propia: '#7b4fd6', satelite: '#3a8fd6', modelo: '#9fb7cf', pronostico: '#e3c56a' };

  let resumen = null; let suelos = null;
  const series = {};
  const leer = (r) => Repo.leerRuta(r).catch(() => null);

  async function cargar(forzar) {
    if (resumen && !forzar) return resumen;
    const [r, s] = await Promise.all([leer('data/agua/resumen.json'), leer('data/suelo/inta.json')]);
    resumen = r || { campos: {} };
    suelos = (s && s.campos) || {};
    return resumen;
  }
  const de = (id) => resumen?.campos?.[id] || null;
  // Si la copia local estaba vieja, GitHub trae la nueva en segundo plano
  window.addEventListener('repo:cambio', (e) => {
    const { ruta, datos } = e.detail;
    if (ruta === 'data/agua/resumen.json') resumen = datos || { campos: {} };
    else if (ruta === 'data/suelo/inta.json') suelos = (datos && datos.campos) || {};
    else if (ruta.startsWith('data/agua/campos/')) series[ruta.slice(17, -5)] = datos;
  });
  const sueloDe = (id) => suelos?.[id] || null;
  async function serie(id) {
    if (!(id in series)) series[id] = await leer(`data/agua/campos/${id}.json`);
    return series[id];
  }

  // ---------- Registros que carga el usuario ----------
  async function lluvias() { return ((await leer('data/lluvias.json')) || {}).registros || []; }
  async function analisis() { return ((await leer('data/suelos-analisis.json')) || {}).registros || []; }

  // Lee, cambia y guarda un archivo de registros (si alguien guardó en el medio, reintenta)
  async function modificar(ruta, cambiar, mensaje) {
    for (let i = 0; i < 3; i++) {
      const actual = (await Repo.leerRuta(ruta, { fresco: true }).catch(() => null)) || { registros: [] };
      actual.registros = cambiar(actual.registros || []);
      actual.actualizado = new Date().toISOString();
      try { await Repo.guardarRuta(ruta, actual, mensaje); return actual.registros; }
      catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }
    }
    throw new Error('El archivo cambió varias veces seguidas. Probá de nuevo.');
  }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const agregarLluvia = (r) => modificar('data/lluvias.json', (l) => l.concat(Object.assign({ id: nuevoId(), alta: new Date().toISOString() }, r)), `Lluvias: ${r.mm} mm el ${r.fecha} en ${r.campos.length} ${r.campos.length === 1 ? 'campo' : 'campos'}`);
  const borrarLluvia = (id) => modificar('data/lluvias.json', (l) => l.filter((x) => x.id !== id), 'Lluvias: borrar un registro');
  const agregarAnalisis = (r) => modificar('data/suelos-analisis.json', (l) => l.concat(Object.assign({ id: nuevoId(), alta: new Date().toISOString() }, r)), `Suelo: análisis del ${r.fecha}`);
  const borrarAnalisis = (id) => modificar('data/suelos-analisis.json', (l) => l.filter((x) => x.id !== id), 'Suelo: borrar un análisis');

  // ---------- Textos ----------
  // La carta del INTA viene sin tildes: se corrigen las palabras más comunes
  const TILDES = { climatica: 'climática', erosion: 'erosión', eolica: 'eólica', hidrica: 'hídrica', sodico: 'sódico', excesivo: 'excesivo', tipico: 'típico', entico: 'éntico',
    acuico: 'ácuico', molico: 'mólico', albico: 'álbico', calcico: 'cálcico', litico: 'lítico', ocrico: 'ócrico', aquico: 'áquico', argico: 'árgico', fluvico: 'flúvico', vertico: 'vértico', udico: 'údico', ustico: 'ústico', petrocalcico: 'petrocálcico', natrico: 'nátrico', argilico: 'argílico', salinidad: 'salinidad', alcalinidad: 'alcalinidad', fluventico: 'fluvéntico', ustalfico: 'ustálfico', aridico: 'arídico', actua: 'actual' };
  const tildar = (t) => (t == null ? t : String(t).replace(/[A-Za-zÁÉÍÓÚáéíóúñÑ]+/g, (w) => {
    const r = TILDES[w.toLowerCase()];
    return r ? (w[0] === w[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r) : w;
  }));

  function lecturaSuelo(s) {
    const i0 = s?.inta;
    const i = i0 ? Object.fromEntries(Object.entries(i0).map(([k, v]) => [k, typeof v === 'string' ? tildar(v) : v])) : null;
    if (!i) return null;
    const lim = [i.limit_ppal, i.limit_secu, i.limit_terc].filter((x) => x && x !== '-');
    return {
      ip: i.ind_prod, textura: [i.text_sups1, i.text_bs1].filter(Boolean).join(' / '),
      suelo: [i.sgrup_sue1, i.porc_sue1 && i.porc_sue1 < 100 ? `(${i.porc_sue1} %)` : ''].filter(Boolean).join(' '),
      otros: [[i.sgrup_sue2, i.porc_sue2], [i.sgrup_sue3, i.porc_sue3]].filter(([n, pc]) => n && pc && !/no clasificado/i.test(n)).map(([n, pc]) => `${n} (${pc} %)`).join(', '),
      drenaje: i.drenaje_s1, profundidad: i.profund_s1, alcalinidad: i.alcalin_s1, pendiente: i.porc_pens1,
      erosion: [i.erhidr_s1 && i.erhidr_s1 !== '-' ? `hídrica ${i.erhidr_s1.toLowerCase()}` : '', i.ereoli_s1 && i.ereoli_s1 !== '-' ? `eólica ${i.ereoli_s1.toLowerCase()}` : ''].filter(Boolean).join(', '),
      anegamiento: i.anegab_s1 && i.anegab_s1 !== '-' ? i.anegab_s1 : '', limitantes: lim.join(', '), unidad: i.simbc, posicion: i.posi_sue1
    };
  }
  const textoIP = (ip) => (ip == null ? '' : ip >= 70 ? 'alto' : ip >= 50 ? 'medio' : ip >= 30 ? 'bajo' : 'muy bajo');

  // ---------- Labores (cuaderno de campo) ----------
  const TIPOS_LABOR = ['Siembra', 'Pulverización', 'Fertilización', 'Cosecha', 'Labranza', 'Otra'];
  async function labores() { return ((await leer('data/labores.json')) || {}).registros || []; }
  const agregarLabor = (r) => modificar('data/labores.json', (l) => l.concat(Object.assign({ id: nuevoId(), alta: new Date().toISOString() }, r)), `Labores: ${r.tipo.toLowerCase()} del ${r.fecha} en ${r.campos.length} ${r.campos.length === 1 ? 'lote' : 'lotes'}${r.cargadoPor ? ' (' + r.cargadoPor + ')' : ''}`);
  // Varias labores en un solo guardado (importación desde Excel o CSV)
  const agregarLabores = (lista, quien) => modificar('data/labores.json', (l) => l.concat(lista.map((r) => Object.assign({ id: nuevoId(), alta: new Date().toISOString() }, r))),
    `Labores: importar ${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}${quien ? ' (' + quien + ')' : ''}`);
  const borrarLabor = (id) => modificar('data/labores.json', (l) => l.filter((x) => x.id !== id), 'Labores: borrar un registro');

  window.Agua = {
    TIPOS_LABOR, labores, agregarLabor, agregarLabores, borrarLabor,
    ESTADOS, estado, color, FUENTES, COLOR_FUENTE, cargar, de, sueloDe, serie, lluvias, analisis,
    agregarLluvia, borrarLluvia, agregarAnalisis, borrarAnalisis, lecturaSuelo, textoIP, resumen: () => resumen
  };
})();
