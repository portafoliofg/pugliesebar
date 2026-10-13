// Histórico de precios y último dato válido de cada fuente.
//
// data/historico.json guarda series por métrica, indexadas por la fecha propia del dato
// (por ejemplo, la fecha de la pizarra, no la fecha de ejecución). Así, si la pizarra de
// la mañana todavía es la del día hábil anterior, no se duplica ni se pisa nada.
//
//   { "series": { "pizarra.soja": { "2026-10-09": 450000, ... }, ... },
//     "ejecuciones": [ { "momento": "...", "estado": { "pizarra": "ok", ... } } ] }
//
// data/ultimo.json guarda el último resultado correcto de cada fuente, para mostrarlo
// marcado como "sin actualizar" cuando la fuente falla.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DIAS_A_CONSERVAR = 400;
const MAX_EJECUCIONES = 120;

async function leerJSON(ruta, porDefecto) {
  try {
    return JSON.parse(await readFile(ruta, 'utf8'));
  } catch {
    return porDefecto;
  }
}

async function escribirJSON(ruta, datos) {
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, JSON.stringify(datos, null, 2) + '\n', 'utf8');
}

export class Historico {
  constructor(rutaHistorico, rutaUltimo) {
    this.rutaHistorico = rutaHistorico;
    this.rutaUltimo = rutaUltimo;
    this.datos = { series: {}, ejecuciones: [] };
    this.ultimo = { fuentes: {} };
  }

  async cargar() {
    this.datos = await leerJSON(this.rutaHistorico, { series: {}, ejecuciones: [] });
    this.datos.series ||= {};
    this.datos.ejecuciones ||= [];
    this.ultimo = await leerJSON(this.rutaUltimo, { fuentes: {} });
    this.ultimo.fuentes ||= {};
    return this;
  }

  /** Registra un valor de una métrica para una fecha (AAAA-MM-DD). */
  registrar(clave, fecha, valor) {
    if (!fecha || valor == null || !Number.isFinite(valor)) return;
    (this.datos.series[clave] ||= {})[fecha] = Math.round(valor * 10000) / 10000;
  }

  /** Completa una serie con datos externos sin pisar los existentes. */
  completar(clave, puntos) {
    const serie = (this.datos.series[clave] ||= {});
    for (const { fecha, valor } of puntos) if (!(fecha in serie) && Number.isFinite(valor)) serie[fecha] = valor;
  }

  cantidadPuntos(clave) {
    return Object.keys(this.datos.series[clave] || {}).length;
  }

  /**
   * Variación del valor actual respecto del último registro con fecha anterior
   * (el día hábil anterior con dato). Devuelve { abs, pct, fechaAnterior } o null.
   */
  variacion(clave, fecha, valor) {
    const serie = this.datos.series[clave];
    if (!serie || valor == null || !fecha) return null;
    const anteriores = Object.keys(serie).filter((f) => f < fecha).sort();
    if (!anteriores.length) return null;
    const fechaAnterior = anteriores[anteriores.length - 1];
    const previo = serie[fechaAnterior];
    if (!previo) return null;
    const abs = valor - previo;
    return { abs, pct: (abs / previo) * 100, fechaAnterior };
  }

  /** Últimos n puntos de una serie: [{ fecha, valor }] ordenados por fecha. */
  ultimos(clave, n) {
    const serie = this.datos.series[clave] || {};
    return Object.keys(serie)
      .sort()
      .slice(-n)
      .map((fecha) => ({ fecha, valor: serie[fecha] }));
  }

  /** Último resultado correcto guardado de una fuente: { datos, obtenido } o null. */
  ultimoDe(fuente) {
    return this.ultimo.fuentes[fuente] || null;
  }

  guardarUltimo(fuente, datos, momento) {
    this.ultimo.fuentes[fuente] = { datos, obtenido: momento };
  }

  registrarEjecucion(momento, estado) {
    this.datos.ejecuciones.push({ momento, estado });
    this.datos.ejecuciones = this.datos.ejecuciones.slice(-MAX_EJECUCIONES);
  }

  /** Borra puntos más viejos que DIAS_A_CONSERVAR para que el archivo no crezca sin límite. */
  podar(hoyISO) {
    const limite = new Date(new Date(`${hoyISO}T12:00:00Z`).getTime() - DIAS_A_CONSERVAR * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const serie of Object.values(this.datos.series)) {
      for (const f of Object.keys(serie)) if (f < limite) delete serie[f];
    }
  }

  async guardar() {
    // Series ordenadas por fecha para que los diffs de git sean legibles
    for (const [k, serie] of Object.entries(this.datos.series)) {
      this.datos.series[k] = Object.fromEntries(Object.entries(serie).sort(([a], [b]) => a.localeCompare(b)));
    }
    await escribirJSON(this.rutaHistorico, this.datos);
    await escribirJSON(this.rutaUltimo, this.ultimo);
  }
}
