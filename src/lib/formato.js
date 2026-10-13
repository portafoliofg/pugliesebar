// Utilidades de formato numérico y de fechas en convención argentina.

export const ZONA = 'America/Argentina/Buenos_Aires';

const cacheNF = new Map();
function nf(decimales) {
  if (!cacheNF.has(decimales)) {
    cacheNF.set(
      decimales,
      new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    );
  }
  return cacheNF.get(decimales);
}

/** 1234.5 -> "1.234,50" */
export function numero(valor, decimales = 2) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return nf(decimales).format(valor);
}

/** 1234.5 -> "$ 1.234,50" */
export function pesos(valor, decimales = 2) {
  return valor == null ? '—' : `$ ${numero(valor, decimales)}`;
}

/** 1234.5 -> "US$ 1.234,50" */
export function dolares(valor, decimales = 2) {
  return valor == null ? '—' : `US$ ${numero(valor, decimales)}`;
}

/**
 * Convierte un texto con formato argentino a número.
 * "$ 1.234.567,89" -> 1234567.89 ; "S/C" -> null
 */
export function parsearNumeroAR(texto) {
  if (texto == null) return null;
  const limpio = String(texto).replace(/[^\d,.-]/g, '');
  if (!/\d/.test(limpio)) return null;
  const n = Number(limpio.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Fecha ISO (AAAA-MM-DD) en hora argentina para un instante dado. */
export function fechaISOArgentina(fecha = new Date()) {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

/** "AAAA-MM-DD" -> "dd/mm/aaaa" */
export function fechaCorta(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** "AAAA-MM-DD" -> "lun 13/10" */
export function diaSemanaCorto(iso) {
  const d = new Date(`${iso}T12:00:00-03:00`);
  const dia = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short' }).format(d).replace('.', '');
  const [, m, dd] = iso.split('-');
  return `${dia} ${dd}/${m}`;
}

/** Fecha y hora larga en hora argentina: "lunes 13 de octubre de 2026, 08:55" */
export function fechaHoraLarga(fecha = new Date()) {
  const f = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(fecha);
  const h = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(fecha);
  return { fecha: f, hora: h };
}

/** Fecha y hora corta: "13/10/2026 08:55" */
export function fechaHoraCorta(fecha) {
  if (!fecha) return '—';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d).replace(',', '');
}

/** Escapa texto para insertarlo en HTML. */
export function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
