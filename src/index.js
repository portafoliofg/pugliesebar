// Orquestador del tablero: consulta cada fuente por separado, actualiza el histórico
// y genera public/index.html.
//
// Uso: node src/index.js

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { obtenerPizarra } from './fuentes/pizarra.js';
import { obtenerCBOT } from './fuentes/cbot.js';
import { obtenerMatba } from './fuentes/matba.js';
import { obtenerDolar, obtenerHistoricoOficial, TIPOS_DOLAR } from './fuentes/dolar.js';
import { obtenerClima } from './fuentes/clima.js';
import { obtenerNoticias } from './fuentes/noticias.js';
import { verificarFeriado, esFinDeSemana } from './fuentes/feriados.js';
import { Historico } from './historico.js';
import { generarHTML, generarConfigStock, generarConfigCampos } from './generar-html.js';
import { fechaISOArgentina } from './lib/formato.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_HTML = join(RAIZ, 'public', 'index.html');

// Fuentes de datos: nombre interno -> función que las consulta
const FUENTES = {
  pizarra: obtenerPizarra,
  cbot: obtenerCBOT,
  matba: obtenerMatba,
  dolar: obtenerDolar,
  clima: obtenerClima,
  noticias: obtenerNoticias
};

const GRANOS_PIZARRA = [
  ['soja', 'Soja'], ['maiz', 'Maíz'], ['girasol', 'Girasol'], ['trigo', 'Trigo']
];

const existe = (ruta) => access(ruta).then(() => true, () => false);

async function main() {
  const config = JSON.parse(await readFile(join(RAIZ, 'config.json'), 'utf8'));
  const ahora = new Date();
  const momento = ahora.toISOString();
  const hoyISO = fechaISOArgentina(ahora);

  const historico = await new Historico(join(RAIZ, 'data', 'historico.json'), join(RAIZ, 'data', 'ultimo.json')).cargar();

  // Feriados y fin de semana
  const { feriado, origen: origenFeriados } = await verificarFeriado(config, hoyISO);
  const finDeSemana = esFinDeSemana(hoyISO);
  const diaHabil = !feriado && !finDeSemana;
  console.log(`Fecha argentina: ${hoyISO} · ${feriado ? `feriado (${feriado.nombre})` : finDeSemana ? 'fin de semana' : 'día hábil'}`);

  // Cada fuente se consulta en paralelo y por separado: si una falla, las demás siguen
  const nombres = Object.keys(FUENTES);
  const resultados = await Promise.allSettled(nombres.map((n) => FUENTES[n](config)));

  const fuentes = {};
  let correctas = 0;
  resultados.forEach((r, i) => {
    const nombre = nombres[i];
    if (r.status === 'fulfilled') {
      correctas++;
      historico.guardarUltimo(nombre, r.value, momento);
      fuentes[nombre] = { estado: 'ok', datos: r.value, obtenido: momento };
      console.log(`  ✔ ${nombre}`);
    } else {
      const error = r.reason?.message || String(r.reason);
      const ultimo = historico.ultimoDe(nombre);
      fuentes[nombre] = ultimo
        ? { estado: 'viejo', datos: ultimo.datos, obtenido: ultimo.obtenido, error }
        : { estado: 'sin-datos', datos: null, obtenido: null, error };
      console.log(`  ✘ ${nombre}: ${error}`);
    }
  });
  fuentes.feriados = {
    estado: origenFeriados === 'api' ? 'ok' : 'viejo',
    datos: null,
    obtenido: origenFeriados === 'api' ? momento : null,
    error: origenFeriados === 'api' ? '' : 'La API no respondió: se usó la lista de config.json'
  };

  // Si todas las fuentes fallaron, no se pisa la página anterior
  if (correctas === 0 && (await existe(RUTA_HTML))) {
    console.error('Todas las fuentes fallaron: se conserva la página anterior sin cambios.');
    return;
  }

  // ---- Histórico ----
  // Se registran solo los datos nuevos. La variación siempre compara contra la última
  // fecha estrictamente anterior a la del dato, así que el orden no la afecta.
  const pz = fuentes.pizarra.estado === 'ok' ? fuentes.pizarra.datos : null;
  if (pz) {
    for (const [g] of GRANOS_PIZARRA) historico.registrar(`pizarra.${g}`, pz.fecha, pz.granos[g]?.pesos);
  }
  // CBOT tiene su propia fecha de rueda (opera aunque acá sea feriado)
  const cb = fuentes.cbot.estado === 'ok' ? fuentes.cbot.datos : null;
  if (cb) for (const [g, x] of Object.entries(cb.granos)) historico.registrar(`cbot.${g}`, cb.fecha, x.usdTonelada);

  const mr = fuentes.matba.estado === 'ok' ? fuentes.matba.datos : null;
  if (mr) {
    for (const [g, posiciones] of Object.entries(mr.granos)) {
      for (const p of posiciones) historico.registrar(`matba.${g}.${p.posicion}`, p.fecha, p.usdTonelada);
    }
  }
  // Dólar: solo en días hábiles, para no cargar valores repetidos de feriados
  const dl = fuentes.dolar.estado === 'ok' ? fuentes.dolar.datos : null;
  if (dl && diaHabil) {
    for (const t of TIPOS_DOLAR) historico.registrar(`dolar.${t.clave}`, dl.fecha, dl.tipos[t.clave]?.venta);
  }

  // La primera vez, completamos el dólar oficial con datos históricos para que el gráfico no arranque vacío
  if (historico.cantidadPuntos('dolar.oficial') < 10) {
    const previos = await obtenerHistoricoOficial(config);
    historico.completar('dolar.oficial', previos.map((p) => ({ fecha: p.fecha, valor: p.venta })));
  }

  historico.podar(hoyISO);
  historico.registrarEjecucion(
    momento,
    Object.fromEntries(Object.entries(fuentes).map(([k, f]) => [k, f.estado]))
  );

  // ---- Variaciones (sobre los datos que se muestran, nuevos o viejos) ----
  const variaciones = {};
  const pzv = fuentes.pizarra.datos;
  if (pzv) for (const [g] of GRANOS_PIZARRA) variaciones[`pizarra.${g}`] = historico.variacion(`pizarra.${g}`, pzv.fecha, pzv.granos[g]?.pesos);
  const cbv = fuentes.cbot.datos;
  if (cbv) for (const [g, x] of Object.entries(cbv.granos)) variaciones[`cbot.${g}`] = historico.variacion(`cbot.${g}`, cbv.fecha, x.usdTonelada);
  const mrv = fuentes.matba.datos;
  if (mrv) {
    for (const [g, posiciones] of Object.entries(mrv.granos)) {
      for (const p of posiciones) variaciones[`matba.${g}.${p.posicion}`] = historico.variacion(`matba.${g}.${p.posicion}`, p.fecha, p.usdTonelada);
    }
  }
  const dlv = fuentes.dolar.datos;
  if (dlv) for (const t of TIPOS_DOLAR) variaciones[`dolar.${t.clave}`] = historico.variacion(`dolar.${t.clave}`, dlv.fecha, dlv.tipos[t.clave]?.venta);

  // ---- Datos para los gráficos (últimos N días con dato) ----
  const n = config.diasGrafico;
  const seriesGranos = GRANOS_PIZARRA.map(([g, nombre]) => ({ nombre, puntos: historico.ultimos(`pizarra.${g}`, n) }));
  const fechasGranos = [...new Set(seriesGranos.flatMap((s) => s.puntos.map((p) => p.fecha)))].sort().slice(-n);
  const dolarOficial = historico.ultimos('dolar.oficial', n);
  const graficos = {
    granos: {
      fechas: fechasGranos,
      series: seriesGranos.map((s) => {
        const mapa = Object.fromEntries(s.puntos.map((p) => [p.fecha, p.valor]));
        return { nombre: s.nombre, valores: fechasGranos.map((f) => mapa[f] ?? null) };
      })
    },
    dolar: { fechas: dolarOficial.map((p) => p.fecha), valores: dolarOficial.map((p) => p.valor) }
  };

  // Minigráficos de las tarjetas del inicio
  const sparks = {};
  for (const [g] of GRANOS_PIZARRA) sparks[`pizarra.${g}`] = historico.ultimos(`pizarra.${g}`, n).map((p) => p.valor);
  sparks['dolar.oficial'] = dolarOficial.map((p) => p.valor);

  // ---- Página ----
  const html = generarHTML({
    config, generado: ahora, hoyISO, feriado, finDeSemana, fuentes, variaciones, graficos, sparks
  });
  await mkdir(dirname(RUTA_HTML), { recursive: true });
  await writeFile(RUTA_HTML, html, 'utf8');
  // URL de la API de stock para la pestaña Stock
  await mkdir(join(RAIZ, 'public', 'stock'), { recursive: true });
  await writeFile(join(RAIZ, 'public', 'stock', 'config.js'), generarConfigStock(config), 'utf8');
  // Pestaña Campos: solo se publica el nombre del repositorio privado, nunca los datos
  await mkdir(join(RAIZ, 'public', 'campos'), { recursive: true });
  await writeFile(join(RAIZ, 'public', 'campos', 'config.js'), generarConfigCampos(config), 'utf8');
  await historico.guardar();
  console.log(`Página generada: ${RUTA_HTML} (${correctas}/${nombres.length} fuentes correctas)`);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exitCode = 1;
});
