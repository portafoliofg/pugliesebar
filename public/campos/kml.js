// Lectura de archivos KML y KMZ en el navegador, sin librerías externas.
// - KMZ: es un ZIP; se busca el .kml adentro y se descomprime con DecompressionStream.
// - KML: se leen los Placemark con Polygon (o MultiGeometry de polígonos).
// - Superficie: área geodésica en hectáreas (mismo método que Turf.js).
(function () {
  'use strict';

  const RADIO = 6378137; // radio ecuatorial WGS84, en metros
  const rad = (g) => (g * Math.PI) / 180;

  // ---------- ZIP (KMZ) ----------
  async function leerZip(buffer) {
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    // Fin del directorio central (firma 0x06054b50), buscando desde el final
    let fin = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin === -1) throw new Error('El archivo está dañado (no es un ZIP válido).');

    const cantidad = dv.getUint16(fin + 10, true);
    let p = dv.getUint32(fin + 16, true);
    const entradas = [];
    for (let k = 0; k < cantidad; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const tamComprimido = dv.getUint32(p + 20, true);
      const largoNombre = dv.getUint16(p + 28, true);
      const largoExtra = dv.getUint16(p + 30, true);
      const largoComentario = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));
      entradas.push({ nombre, metodo, tamComprimido, local });
      p += 46 + largoNombre + largoExtra + largoComentario;
    }

    // Texto de una entrada del ZIP
    async function texto(e) {
      const inicio = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      const datos = bytes.subarray(inicio, inicio + e.tamComprimido);
      if (e.metodo === 0) return new TextDecoder().decode(datos);
      if (e.metodo !== 8) throw new Error('El archivo usa una compresión que no se puede leer.');
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir archivos comprimidos. Actualizalo.');
      const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(flujo).arrayBuffer());
    }
    return { nombres: entradas.map((x) => x.nombre), leer: (nombre) => { const e = entradas.find((x) => x.nombre === nombre); return e ? texto(e) : Promise.resolve(null); } };
  }

  async function leerKMZ(buffer) {
    let zip;
    try { zip = await leerZip(buffer); } catch (e) { throw new Error(e.message.replace('El archivo', 'El KMZ')); }
    const kmls = zip.nombres.filter((n) => /\.kml$/i.test(n));
    if (!kmls.length) throw new Error('El KMZ no tiene ningún archivo .kml adentro.');
    return zip.leer(kmls.find((x) => /(^|\/)doc\.kml$/i.test(x)) || kmls[0]);
  }

  // ---------- KML ----------
  const hijos = (el, nombre) => Array.from(el.getElementsByTagNameNS('*', nombre));
  const hijoDirecto = (el, nombre) => Array.from(el.children).find((c) => c.localName === nombre);

  function anillo(textoCoords) {
    const pts = String(textoCoords || '').trim().split(/\s+/)
      .map((t) => t.split(',').map(Number))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map((c) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6]);
    if (pts.length < 3) return null;
    const a = pts[0];
    const z = pts[pts.length - 1];
    if (a[0] !== z[0] || a[1] !== z[1]) pts.push([a[0], a[1]]);
    return pts.length >= 4 ? pts : null;
  }

  function poligono(el) {
    const ext = hijos(el, 'outerBoundaryIs')[0];
    const exterior = ext && anillo(hijos(ext, 'coordinates')[0]?.textContent);
    if (!exterior) return null;
    const huecos = hijos(el, 'innerBoundaryIs')
      .map((ib) => anillo(hijos(ib, 'coordinates')[0]?.textContent))
      .filter(Boolean);
    return [exterior, ...huecos];
  }

  function leerKML(texto, nombreArchivo) {
    const xml = new DOMParser().parseFromString(texto, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('El archivo no es un KML válido.');

    const base = String(nombreArchivo || 'Campo').replace(/\.(kml|kmz)$/i, '');
    const campos = [];
    let sinPoligono = 0;

    hijos(xml, 'Placemark').forEach((pm) => {
      const polis = hijos(pm, 'Polygon').map(poligono).filter(Boolean);
      if (!polis.length) { sinPoligono++; return; }
      const nombreKml = (hijoDirecto(pm, 'name')?.textContent || '').trim();
      const descripcion = (hijoDirecto(pm, 'description')?.textContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const geometria = polis.length === 1
        ? { type: 'Polygon', coordinates: polis[0] }
        : { type: 'MultiPolygon', coordinates: polis };
      campos.push({ nombreKml, descripcion, geometria, ha: hectareas(geometria) });
    });

    // El campo se llama como el archivo. Si el archivo trae varios polígonos, se numeran,
    // y si el polígono tiene un nombre propio (no "Polígono sin título") se agrega al final.
    campos.forEach((c, i) => {
      const propio = c.nombreKml && !esGenerico(c.nombreKml) && c.nombreKml.toLowerCase() !== base.toLowerCase();
      if (campos.length === 1) c.nombre = base;
      else c.nombre = propio ? `${base} · ${c.nombreKml}` : `${base} ${i + 1}`;
    });

    return { campos, sinPoligono };
  }

  // Nombres que pone Google Earth (u otros programas) cuando no se le dio nombre al polígono
  const GENERICOS = /^(pol[ií]gono|polygon|untitled|sin t[ií]tulo|placemark|marca de posici[oó]n|ruta|path|shape|forma|feature)(\s*(sin t[ií]tulo|untitled|\(?\d+\)?))*$/i;
  function esGenerico(n) {
    const t = String(n || '').trim();
    return !t || GENERICOS.test(t) || /sin t[ií]tulo|untitled/i.test(t);
  }

  /** Lee un File (KML o KMZ) y devuelve { campos, sinPoligono }. */
  async function leerArchivo(archivo) {
    const buffer = await archivo.arrayBuffer();
    const b = new Uint8Array(buffer);
    const esZip = b[0] === 0x50 && b[1] === 0x4b; // "PK"
    const texto = esZip ? await leerKMZ(buffer) : new TextDecoder().decode(b);
    return leerKML(texto, archivo.name);
  }

  // ---------- Geometría ----------
  function areaAnillo(c) {
    const n = c.length;
    if (n <= 2) return 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      let a, b, d;
      if (i === n - 2) { a = n - 2; b = n - 1; d = 0; }
      else if (i === n - 1) { a = n - 1; b = 0; d = 1; }
      else { a = i; b = i + 1; d = i + 2; }
      total += (rad(c[d][0]) - rad(c[a][0])) * Math.sin(rad(c[b][1]));
    }
    return Math.abs((total * RADIO * RADIO) / 2);
  }

  function areaPoligono(anillos) {
    return Math.max(0, areaAnillo(anillos[0]) - anillos.slice(1).reduce((s, h) => s + areaAnillo(h), 0));
  }

  /** Superficie en hectáreas de un Polygon o MultiPolygon GeoJSON. */
  function hectareas(g) {
    if (!g) return 0;
    const m2 = g.type === 'Polygon' ? areaPoligono(g.coordinates) : g.coordinates.reduce((s, p) => s + areaPoligono(p), 0);
    return Math.round((m2 / 10000) * 100) / 100;
  }

  /** Centro aproximado (centro del rectángulo que encierra el campo): [lat, lon]. */
  function centro(g) {
    const pts = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap((p) => p[0]);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return [(minY + maxY) / 2, (minX + maxX) / 2];
  }

  window.KML = { leerArchivo, leerKML, leerZip, hectareas, centro, esGenerico };
})();
